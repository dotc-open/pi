/**
 * Registers a custom tool `git_worktree_add` that creates a new branch and
 * worktree for it, following the repo's bare-repo + worktree layout
 * (a.k.a. the "gw" workflow).
 *
 *   (bare repo)/(prefix)/(name-without-prefix)
 *   e.g. .../full-stack-template/feat/add-new-endpoint
 *
 * The tool discovers the bare repo from anywhere (bare repo dir, any worktree,
 * or deep subdirectory), then always runs `git worktree add` with cwd = the
 * bare repo dir, so the worktree path argument is uniformly "../<branch>".
 * This mirrors the user's shell alias `gw` (= `git worktree`), which is NOT
 * available in the non-interactive shells an extension spawns.
 *
 * Modes:
 *  - "new":    git fetch origin develop
 *              git worktree add -b <branch> ../<branch> origin/develop
 *              (new branches always start from the latest fetched state of develop)
 *  - "remote": git worktree add -b <branch> ../<branch> origin/<branch>
 *              (uses the locally-known origin ref; does not fetch)
 */
import * as path from 'node:path'

import { StringEnum } from '@earendil-works/pi-ai'
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'
import { Type } from 'typebox'

// Repo commit-message guideline types (docs/general/commit-messages.md).
// The worktree folder prefix must be one of these.
const PREFIXES = ['build', 'ci', 'chore', 'docs', 'feat', 'fix', 'perf', 'refactor', 'revert', 'style', 'test']

// <prefix>/<name> where <prefix> is letters-only (validated against PREFIXES)
// and <name> is strict lowercase kebab-case: one or more lowercase letters,
// optionally split by "-" + letters (add-new-endpoint, logic-for-xyz, add).
// Rejects digits, uppercase, dots, underscores, consecutive/trailing dashes.
const BRANCH_RE = /^([a-z]+)\/([a-z]+(-[a-z]+)*)$/

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: 'git_worktree_add',
    label: 'Git Worktree Add',
    description:
      'Creates a new git branch and a worktree for it, following the repo layout ' +
      '"(bare repo)/(prefix)/(name-without-prefix)", e.g. .../full-stack-template/feat/add-new-endpoint. ' +
      `The branch name is <prefix>/<name>; <prefix> must be one of: ${PREFIXES.join(', ')}; <name> is strict ` +
      'lowercase kebab-case (no digits, uppercase, dots, underscores, or edge dashes). ' +
      'mode "new" fetches `origin develop`, then runs `git worktree add -b <branch> ../<branch> origin/develop` ' +
      'so the new branch always starts from the latest fetched state of develop; mode "remote" runs ' +
      '`git worktree add -b <branch> ../<branch> origin/<branch>` to track an existing origin branch (no fetch). ' +
      'Runs git directly (no shell aliases), from inside the bare repo, so it works from any location.',
    promptSnippet: 'Create a git branch and worktree (gw workflow)',
    promptGuidelines: [
      'Use git_worktree_add when the user asks for a new branch/worktree (their "gw" workflow): the tool creates ' +
        'the branch and worktree at (root)/(prefix)/(name). Solicit the branch name from the user first (e.g. ' +
        'feat/add-new-endpoint); the tool rejects prefixes not in the repo commit-message types and ' +
        'malformed names (digits, uppercase, dots, underscores, consecutive/trailing dashes). ' +
        'Pass mode "new" for work that should start from the latest develop (the tool fetches `origin develop` ' +
        'first, then starts the branch from `origin/develop`); pass mode "remote" only when the user explicitly ' +
        'wants to work on an already-pushed origin branch (no fetch in that mode; if origin/<branch> is not ' +
        'known, suggest `git fetch origin` first).',
    ],
    parameters: Type.Object({
      branch: Type.String({
        description:
          `Full branch name, e.g. "feat/add-new-endpoint". Must start with one of: ${PREFIXES.join(', ')}; ` +
          'the part after the prefix is strict lowercase kebab-case (lowercase letters only, optionally split ' +
          'by "-" + letters — no digits, uppercase, dots, underscores, consecutive or trailing dashes).',
      }),
      mode: StringEnum(['new', 'remote'] as const, {
        description:
          '"new" = fetch `origin develop`, then create the branch from it (' +
          '`git worktree add -b <branch> <path> origin/develop`); ' +
          '"remote" = track an existing origin branch (`git worktree add -b <branch> <path> origin/<branch>`, no fetch).',
      }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const cwd = ctx.cwd

      // 1. Locate the bare repo's common dir (absolute) from any location:
      //    inside .bare → commondir=.bare; inside a worktree → commondir=../.bare.
      let commondir: string
      try {
        const probe = await pi.exec('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
          ...(ctx.signal ? { signal: ctx.signal } : {}),
          cwd,
        })
        if (probe.code !== 0) {
          return {
            content: [{ type: 'text', text: 'Not a git repository (or git is not installed).' }],
            details: { mode: params.mode, branch: params.branch, success: false, code: probe.code },
          }
        }
        commondir = probe.stdout.trim()
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Could not run git: ${err}` }],
          details: { mode: params.mode, branch: params.branch, success: false, code: undefined },
        }
      }

      // Worktree container root (assumes the bare repo dir is a direct child).
      const root = path.dirname(commondir)
      // cwd-relative path argument; the command runs with cwd=commondir (inside
      // the bare repo), so "../<branch>" always resolves to root/<branch>.
      const worktreePath = `../${params.branch}`
      const targetPath = path.join(root, params.branch)

      // 2. Location probe — only for reporting (not used for path computation).
      let location = 'worktree'
      try {
        const bare = await pi.exec('git', ['rev-parse', '--is-bare-repository'], {
          cwd,
          ...(ctx.signal ? { signal: ctx.signal } : {}),
        })
        if (bare.code === 0 && bare.stdout.trim() === 'true') location = 'bare-repo'
      } catch {
        // Non-fatal: leave location as "worktree".
      }

      // 3. Validate branch name (prefix against the guideline types, name kebab-case).
      const match = BRANCH_RE.exec(params.branch)
      let prefix: string
      if (match && match[1]) {
        prefix = match[1]
        if (!PREFIXES.includes(prefix)) {
          return {
            content: [
              {
                type: 'text',
                text:
                  `Unknown prefix "${prefix}" in branch "${params.branch}". ` +
                  `Valid prefixes (repo commit-message types): ${PREFIXES.join(', ')}.`,
              },
            ],
            details: {
              mode: params.mode,
              branch: params.branch,
              prefix,
              location,
              cwd,
              root,
              targetPath,
              worktreePath,
              argv: [],
              code: undefined,
              success: false,
            },
          }
        }
      } else {
        return {
          content: [
            {
              type: 'text',
              text:
                `Invalid branch name "${params.branch}". Expected <prefix>/<name> where <prefix> is one of ` +
                `${PREFIXES.join(', ')} and <name> is strict lowercase kebab-case (lowercase letters only, ` +
                'optionally split by "-" + letters — no digits, uppercase, dots, underscores, consecutive or trailing dashes).',
            },
          ],
          details: {
            mode: params.mode,
            branch: params.branch,
            prefix: undefined,
            location,
            cwd,
            root,
            targetPath,
            worktreePath,
            argv: [],
            code: undefined,
            success: false,
          },
        }
      }

      // 4. Build the worktree-add command. It runs from inside the bare repo,
      //    so the worktree path argument is uniformly "../<branch>".
      //    - "new":    start from origin/develop — fetch it first so the new
      //                branch is off the latest fetched state of develop.
      //    - "remote": use the locally known origin/<branch> (no fetch).
      const args = ['worktree', 'add', '-b', params.branch, worktreePath]
      if (params.mode === 'new') {
        args.push('origin/develop')
      } else {
        args.push(`origin/${params.branch}`)
      }
      const fetchArgv = params.mode === 'new' ? ['git', 'fetch', 'origin', 'develop'] : undefined

      const detailBase = {
        mode: params.mode,
        branch: params.branch,
        prefix,
        location,
        cwd,
        root,
        targetPath,
        worktreePath,
        argv: ['git', ...args],
        fetchArgv,
      }

      // 4a. "new" mode: fetch origin develop first — the new branch must start
      //     from the latest fetched state of develop.
      let fetchCode: number | undefined
      if (params.mode === 'new') {
        let fetch
        try {
          fetch = await pi.exec('git', ['fetch', 'origin', 'develop'], {
            cwd: commondir,
            ...(ctx.signal ? { signal: ctx.signal } : {}),
          })
        } catch (err) {
          return {
            content: [{ type: 'text', text: `Could not run git: ${err}` }],
            details: { ...detailBase, fetchCode: undefined, code: undefined, success: false },
          }
        }
        fetchCode = fetch.code
        if (fetchCode !== 0) {
          const stderr = fetch.stderr.trim()
          const hint = stderr.includes("couldn't find remote ref develop")
            ? "\nHint: the remote's main branch is not named `develop` — check `git remote show origin`."
            : stderr.includes('does not appear to be a git repository') ||
                stderr.includes('Could not read from remote repository')
              ? '\nHint: `origin` is not a reachable remote — check `git remote -v` and your network, then call again.'
              : '\nHint: the fetch failed — check the error above, then call again.'
          return {
            content: [{ type: 'text', text: `git fetch origin develop failed (exit ${fetchCode}):\n${stderr}${hint}` }],
            details: { ...detailBase, fetchCode, code: undefined, success: false },
          }
        }
      }

      // 4b. Run the worktree add.
      let res
      try {
        res = await pi.exec('git', args, { cwd: commondir, ...(ctx.signal ? { signal: ctx.signal } : {}) })
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Could not run git: ${err}` }],
          details: { ...detailBase, fetchCode, code: undefined, success: false },
        }
      }

      const stderr = res.stderr.trim()
      const success = res.code === 0
      const startPoint = params.mode === 'new' ? 'origin/develop' : `origin/${params.branch}`
      const text = success
        ? `Created worktree for branch ${params.branch} (start: ${startPoint}).\n\n${res.stdout.trim()}${stderr ? `\n${stderr}` : ''}\n\nWorktree: ${targetPath}`
        : `git worktree add failed (exit ${res.code}):\n${stderr || res.stdout.trim()}` +
          (stderr.includes('did not match any file(s)')
            ? '\nHint: origin/<branch> is not known locally — run `git fetch origin` first, then call again.'
            : stderr.includes('already exists')
              ? '\nHint: a worktree at that path, or a branch with that name, already exists — pick a different branch name.'
              : stderr.includes('is already checked out')
                ? '\nHint: that branch is already checked out in another worktree — pick a different branch name.'
                : '')

      return {
        content: [{ type: 'text', text }],
        details: { ...detailBase, fetchCode, code: res.code, success },
      }
    },
  })
}
