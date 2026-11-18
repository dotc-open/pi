/**
 * Git tools: `git_inspect`, `git_stage_unstage`, and `git_commit`.
 *
 * These are the preferred git tools. They complement (and supersede) the
 * legacy `git_changes` and `commit_changes` tools:
 *  - `git_inspect`         — bounded read-only inspections.
 *  - `git_stage_unstage`   — stage/unstage named repo-relative files.
 *  - `git_commit`          — commit already-staged files with a Conventional
 *                            Commit message (does not stage anything itself).
 *
 * All commands run with `cwd = ctx.cwd` (the session working directory).
 */
import { lstat } from 'node:fs/promises'
import { resolve } from 'node:path'

import { StringEnum } from '@earendil-works/pi-ai'
import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  type ExtensionAPI,
  formatSize,
  truncateHead,
} from '@earendil-works/pi-coding-agent'
import { Type } from 'typebox'

const stageCommands = ['stage', 'unstage'] as const
const inspections = {
  log: ['log', '-5', '--oneline', '--decorate'],
  show: ['show', '--no-ext-diff'],
  status: ['status', '--short', '--branch'],
  diff: ['diff'],
  'diff --cached': ['diff', '--cached'],
  'worktree list': ['worktree', 'list'],
  branch: ['branch', '--list', '-vv'],
  remote: ['remote', '-v'],
} as const

function checkPaths(paths: string[]): string | undefined {
  if (paths.length === 0) return 'Specify at least one file.'
  for (const path of paths) {
    const segments = path.split('/')
    if (
      !path ||
      path.startsWith('/') ||
      path.includes('\\') ||
      path.includes('\0') ||
      segments.some((segment) => !segment || segment === '.' || segment === '..')
    ) {
      return `Use a repository-relative file path without . or ..: ${path}`
    }
  }
}

export default function (pi: ExtensionAPI) {
  async function stageFiles(command: 'stage' | 'unstage', files: string[], cwd: string, signal?: AbortSignal) {
    const invalid = checkPaths(files)
    if (invalid) throw new Error(invalid)
    const opts = { cwd, ...(signal ? { signal } : {}) }

    if (command === 'stage') {
      for (const path of files) {
        try {
          if ((await lstat(resolve(cwd, path))).isDirectory()) {
            throw new Error(`Stage individual files, not directories: ${path}`)
          }
        } catch (error) {
          if ((error as { code?: string }).code !== 'ENOENT') throw error
          const tracked = await pi.exec('git', ['--literal-pathspecs', 'ls-files', '-z', '--', path], opts)
          if (tracked.code !== 0 || !tracked.stdout.split('\0').includes(path)) {
            throw new Error(`Not a tracked file or a file on disk: ${path}`, { cause: error })
          }
        }
      }
    } else {
      for (const path of files) {
        const staged = await pi.exec(
          'git',
          ['--literal-pathspecs', 'diff', '--cached', '--name-only', '-z', '--', path],
          opts,
        )
        if (staged.code !== 0 || !staged.stdout.split('\0').includes(path)) {
          throw new Error(`Not a staged file: ${path}`)
        }
      }
    }

    const args =
      command === 'stage'
        ? ['--literal-pathspecs', 'add', '-A', '--', ...files]
        : ['--literal-pathspecs', 'restore', '--staged', '--', ...files]
    const result = await pi.exec('git', args, opts)
    if (result.code !== 0 || result.killed) {
      throw new Error(result.stderr || `git ${command} failed (${result.code}).`)
    }
    return {
      content: [
        {
          type: 'text' as const,
          text: `${command === 'stage' ? 'Staged' : 'Unstaged'}: ${files.join(
            ', ',
          )}. Review the staged diff separately.`,
        },
      ],
      details: { command, paths: files },
    }
  }

  async function commitStaged(message: string, cwd: string, signal: AbortSignal | undefined) {
    if (!/^(build|ci|chore|docs|feat|fix|perf|refactor|revert|style|test)(\([^)]+\))?!?: \S[^\r\n]*$/.test(message)) {
      throw new Error('Provide a one-line Conventional Commit message.')
    }
    const opts = { cwd, ...(signal ? { signal } : {}) }
    const staged = await pi.exec('git', ['diff', '--cached', '--name-only', '-z'], opts)
    if (staged.code !== 0) throw new Error(staged.stderr || 'Unable to read staged files.')
    const files = staged.stdout.split('\0').filter(Boolean)
    if (files.length === 0) throw new Error('Nothing is staged.')
    const result = await pi.exec('git', ['commit', '-m', message], opts)
    return {
      content: [
        {
          type: 'text' as const,
          text:
            [result.stdout, result.stderr].filter(Boolean).join('\n').trim() || `(no output; exit code ${result.code})`,
        },
      ],
      details: {
        command: 'commit',
        exitCode: result.code,
        killed: result.killed,
      },
      isError: result.code !== 0 || result.killed,
    }
  }

  async function inspect(
    command: keyof typeof inspections,
    cwd: string,
    ref?: string,
    paths?: string[],
    signal?: AbortSignal,
  ) {
    if (ref && command !== 'show') throw new Error('A ref is only supported for show.')
    if (paths) {
      if (command !== 'diff' && command !== 'diff --cached' && command !== 'show')
        throw new Error('Paths are only supported for diff and show.')
      const invalid = checkPaths(paths)
      if (invalid) throw new Error(invalid)
    }
    const result = await pi.exec(
      'git',
      [
        '--no-pager',
        ...(paths ? ['--literal-pathspecs'] : []),
        ...inspections[command],
        ...(command === 'show' ? ['--end-of-options', ref || 'HEAD'] : []),
        ...(paths ? ['--', ...paths] : []),
      ],
      { cwd, ...(signal ? { signal } : {}) },
    )
    const output = truncateHead([result.stdout, result.stderr].filter(Boolean).join('\n') || '(no output)', {
      maxBytes: DEFAULT_MAX_BYTES,
      maxLines: DEFAULT_MAX_LINES,
    })
    return {
      content: [
        {
          type: 'text' as const,
          text: output.content + (output.truncated ? '\n[Output truncated.]' : ''),
        },
      ],
      details: {
        command,
        ref,
        paths,
        exitCode: result.code,
        truncated: output.truncated,
      },
      isError: result.code !== 0 || result.killed,
    }
  }

  pi.registerTool({
    name: 'git_inspect',
    label: 'Git inspect',
    description: 'Read-only Git inspections in this repository.',
    promptSnippet: 'Inspect Git history, status, diffs, branches, remotes, and worktrees',
    promptGuidelines: [
      `Prefer git_inspect over the legacy git_changes tool: it covers history, status, diffs, branches, remotes, and worktrees.`,
      `Delegate large patch reviews to a scout subagent instead of loading them in the main agent.`,
      `git_inspect output is truncated to ${formatSize(
        DEFAULT_MAX_BYTES,
      )} / ${DEFAULT_MAX_LINES} lines. Prefer paths with diff, diff --cached, and show to limit output`,
    ],
    annotations: { readOnlyHint: true },
    parameters: Type.Object({
      command: StringEnum(Object.keys(inspections) as (keyof typeof inspections)[]),
      ref: Type.Optional(
        Type.String({
          description: 'Commit or ref to show (default: HEAD); only valid for show.',
        }),
      ),
      paths: Type.Optional(
        Type.Array(Type.String(), {
          minItems: 1,
          description:
            'Repository-relative paths to limit diff, diff --cached, or show. Literal pathspecs; directories allowed.',
        }),
      ),
    }),
    async execute(_id, { command, ref, paths }, signal, _update, ctx) {
      if (!(command in inspections)) throw new Error(`Unsupported Git inspection: ${command}`)
      return inspect(command, ctx.cwd, ref, paths, signal)
    },
  })

  pi.registerTool({
    name: 'git_stage_unstage',
    label: 'Git stage/unstage',
    description: 'Stage or unstage named files (paths required, no directories or globs).',
    promptSnippet: 'Stage or unstage named files',
    promptGuidelines: [
      'Prefer git_stage_unstage to stage or unstage specific files; commit_changes stages everything in one step.',
      'Stage .pi/plans/ only when explicitly requested.',
    ],
    parameters: Type.Object({
      command: StringEnum(stageCommands),
      paths: Type.Array(Type.String(), { minItems: 1 }),
    }),
    async execute(_id, { command, paths }, signal, _update, ctx) {
      if (!stageCommands.includes(command)) throw new Error(`Unsupported Git operation: ${command}`)
      return stageFiles(command, paths, ctx.cwd, signal)
    },
  })

  pi.registerTool({
    name: 'git_commit',
    label: 'Git commit',
    description: 'Commit staged files with a Conventional Commit message.',
    promptSnippet: 'Commit staged changes',
    promptGuidelines: [
      'Prefer git_commit over the legacy commit_changes tool: git_commit commits only the files already staged (use git_stage_unstage to stage them first), while commit_changes runs `git add .` and commits everything.',
      'Review the staged diff with git_inspect and propose a Conventional Commit message before committing.',
    ],
    parameters: Type.Object({
      message: Type.String(),
    }),
    async execute(_id, { message }, signal, _update, ctx) {
      return commitStaged(message, ctx.cwd, signal)
    },
  })
}
