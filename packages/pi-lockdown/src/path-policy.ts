import { realpathSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'

import { isInside } from './utils'

export type PathAction = 'read' | 'write'
export type PathOutcome = 'allow' | 'prompt' | 'block'

export interface PathPolicy {
  denyRead: string[]
  allowRead: string[]
  allowWrite: string[]
  denyWrite: string[]
}

export interface PathEvaluation {
  /** What the caller should do with the tool call. */
  outcome: PathOutcome
  /** The rule that produced the decision, when one matched. */
  rule: string | undefined
  /** The requested path, normalized against the project cwd. */
  requested: string
  /** The canonical target (symlinks and nearest existing parent resolved). */
  target: string
}

const GLOB_META = /[*?[\]{}]/

type CompiledRule =
  | { kind: 'all'; rule: string }
  | { kind: 'external'; rule: string }
  | { kind: 'exact'; file: string; rule: string }
  | { kind: 'dir'; dir: string; rule: string }
  | { kind: 'glob'; pattern: string; weight: number; rule: string }

const KIND_RANK: Record<CompiledRule['kind'], number> = {
  exact: 4,
  glob: 3,
  dir: 2,
  external: 1,
  all: 1,
}

const OUTCOME_RANK: Record<PathOutcome, number> = { allow: 0, prompt: 1, block: 2 }

export function expandHome(value: string): string {
  if (value === '~') return homedir()
  if (value.startsWith('~/') || value.startsWith('~\\')) return path.join(homedir(), value.slice(2))
  return value
}

/** Normalizes a tool path against the project cwd, stripping Pi's `@` prefix. */
export function normalizeToolPath(cwd: string, inputPath: string): string {
  const requested = inputPath.startsWith('@') ? inputPath.slice(1) : inputPath
  return path.resolve(cwd, expandHome(requested))
}

/**
 * Resolves a path to its canonical form, walking up to the nearest existing
 * parent for paths that do not exist yet. Returns `null` when no ancestor can
 * be resolved.
 */
export function resolveTarget(absPath: string): string | null {
  try {
    return realpathSync(absPath)
  } catch {
    // Fall through to nearest-existing-parent resolution.
  }

  const segments = [path.basename(absPath)]
  let dir = path.dirname(absPath)
  while (true) {
    try {
      return path.join(realpathSync(dir), ...segments)
    } catch {
      const parent = path.dirname(dir)
      if (parent === dir) return null
      segments.unshift(path.basename(dir))
      dir = parent
    }
  }
}

function stripTrailingSeparator(value: string): string {
  return value.length > 1 ? value.replace(/[/\\]+$/, '') : value
}

function literalCount(pattern: string): number {
  let count = 0
  for (const char of pattern) {
    if (!GLOB_META.test(char)) count += 1
  }
  return count
}

function isExistingDirectory(absPath: string): boolean {
  try {
    return statSync(absPath).isDirectory()
  } catch {
    return false
  }
}

function compileRule(entry: string, cwd: string): CompiledRule {
  if (entry === '*') return { kind: 'all', rule: entry }
  if (entry === ':external') return { kind: 'external', rule: entry }

  const abs = path.resolve(cwd, expandHome(entry))
  if (GLOB_META.test(abs)) {
    return { kind: 'glob', pattern: abs, weight: literalCount(abs), rule: entry }
  }
  if (/[/\\]$/.test(entry) || isExistingDirectory(abs)) {
    return { kind: 'dir', dir: stripTrailingSeparator(abs), rule: entry }
  }
  return { kind: 'exact', file: abs, rule: entry }
}

function scoreRule(rule: CompiledRule): number {
  const secondary = rule.kind === 'glob' ? rule.weight : rule.kind === 'dir' ? rule.dir.length : 0
  return KIND_RANK[rule.kind] * 1_000_000 + secondary
}

function ruleMatches(rule: CompiledRule, absPath: string, cwd: string): boolean {
  switch (rule.kind) {
    case 'all':
      return true
    case 'external':
      return !isInside(cwd, absPath)
    case 'exact':
      return absPath === rule.file
    case 'dir':
      return absPath === rule.dir || absPath.startsWith(rule.dir + path.sep)
    case 'glob':
      return path.matchesGlob(absPath, rule.pattern)
  }
}

export interface PathMatch {
  outcome: 'allow' | 'deny' | 'prompt'
  rule?: string
}

/** Picks the most-specific matching rule; deny wins an exact tie. */
export function matchPathPolicy(policy: PathPolicy, cwd: string, absPath: string, action: PathAction): PathMatch {
  const allows = action === 'read' ? [...policy.allowRead, ...policy.allowWrite] : policy.allowWrite
  const denies = action === 'read' ? policy.denyRead : policy.denyWrite

  let best: { rule: CompiledRule; allow: boolean; score: number } | undefined

  const consider = (entry: string, allow: boolean): void => {
    const rule = compileRule(entry, cwd)
    if (!ruleMatches(rule, absPath, cwd)) return
    const score = scoreRule(rule)
    if (!best || score > best.score || (score === best.score && !allow && best.allow)) {
      best = { rule, allow, score }
    }
  }

  for (const entry of allows) consider(entry, true)
  for (const entry of denies) consider(entry, false)

  if (!best) return { outcome: 'prompt' }
  return best.allow ? { outcome: 'allow', rule: best.rule.rule } : { outcome: 'deny', rule: best.rule.rule }
}

function evaluateSingle(
  policy: PathPolicy,
  cwd: string,
  absPath: string,
  action: PathAction,
  requested: string,
  target: string,
): PathEvaluation {
  const match = matchPathPolicy(policy, cwd, absPath, action)
  if (match.outcome === 'allow') return { outcome: 'allow', rule: match.rule, requested, target }
  if (match.outcome === 'deny') {
    return { outcome: action === 'write' ? 'block' : 'prompt', rule: match.rule, requested, target }
  }
  return { outcome: 'prompt', rule: match.rule, requested, target }
}

/**
 * Evaluates a tool path for the given action against both the requested path
 * and its canonical target. A write denied on either path is hard-blocked; if
 * neither is denied, the most restrictive outcome wins. Resolution failure
 * hard-blocks (fail closed).
 */
export function evaluateFilePath(
  policy: PathPolicy,
  cwd: string,
  inputPath: string,
  action: PathAction,
): PathEvaluation {
  const requested = normalizeToolPath(cwd, inputPath)
  const target = resolveTarget(requested)
  if (target === null) {
    return { outcome: 'block', rule: undefined, requested, target: requested }
  }

  const requestedEvaluation = evaluateSingle(policy, cwd, requested, action, requested, target)
  if (target === requested) return requestedEvaluation

  const targetEvaluation = evaluateSingle(policy, cwd, target, action, requested, target)
  return OUTCOME_RANK[targetEvaluation.outcome] > OUTCOME_RANK[requestedEvaluation.outcome]
    ? targetEvaluation
    : requestedEvaluation
}
