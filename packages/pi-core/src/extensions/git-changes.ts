/**
 * Git Changes Extension
 *
 * Registers a custom tool `git_changes` that the LLM can call to read the
 * line-by-line staged, unstaged, and untracked git changes in the repository
 * (a superset of `git_staged_changes`, which is left untouched).
 */

import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'
import { Type } from 'typebox'

// Bound every model-facing section, including filename lists and git errors.
// Three sections plus separators fit under 50,000 characters in total.
const MAX_SECTION_LINES = 2000
const MAX_SECTION_CHARS = 16_000

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: 'git_changes',
    label: 'Git Changes',
    description:
      'Read the line-by-line staged, unstaged, and untracked git changes. Returns a single text blob with ' +
      '=== STAGED ===, === UNSTAGED ===, and === UNTRACKED === sections: staged and unstaged show unified diffs ' +
      '(git diff --staged / git diff), untracked lists file paths only. Empty sections say so. Sections larger ' +
      'than 2000 lines or 16000 characters are summarized by affected filenames. Every section, including ' +
      'untracked paths, is capped at 16000 characters with a command for retrieving truncated output.',
    promptSnippet: 'Read staged, unstaged, and untracked git changes',
    promptGuidelines: [
      'Use git_changes to review everything in the working tree that differs from HEAD in one call: ' +
        'staged diffs, unstaged diffs, and untracked file paths.',
    ],
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      const run = (args: string[]) => pi.exec('git', args, ctx.signal ? { signal: ctx.signal } : {})

      // Probe git availability (handles subdir launches & missing git).
      const { code: gitCode } = await run(['rev-parse', '--git-dir'])
      if (gitCode !== 0) {
        return {
          content: [{ type: 'text', text: 'Not a git repository (or git is not installed).' }],
          details: {},
        }
      }

      const limitSection = (header: string, body: string, command: string): string => {
        const section = `${header}\n${body}`
        if (section.length <= MAX_SECTION_CHARS) return section

        const notice = `\n[Output truncated at ${MAX_SECTION_CHARS} characters — run ${command} for the full output]`
        return `${section.slice(0, MAX_SECTION_CHARS - notice.length)}${notice}`
      }

      // Oversized diffs are replaced with affected filenames plus a remark.
      const diffSection = async (
        title: string,
        res: { code: number; stdout: string; stderr: string },
        fullCommand: string,
        nameOnlyArgs: string[],
      ): Promise<string> => {
        const header = `=== ${title} ===`
        if (res.code !== 0) {
          return limitSection(header, res.stderr.trim() || `${fullCommand} failed (exit ${res.code}).`, fullCommand)
        }
        const diff = res.stdout.trim()
        if (!diff) {
          return limitSection(header, `No ${title.toLowerCase()} changes.`, fullCommand)
        }
        const lineCount = diff.split('\n').length
        if (lineCount > MAX_SECTION_LINES || `${header}\n${diff}`.length > MAX_SECTION_CHARS) {
          const names = await run(nameOnlyArgs)
          const nameList =
            names.code === 0
              ? names.stdout
                  .split('\n')
                  .map((line) => line.trim())
                  .filter((line) => line.length > 0)
                  .join('\n')
              : `(could not list filenames: ${names.stderr.trim()})`
          const reason =
            lineCount > MAX_SECTION_LINES
              ? `${lineCount} lines exceeds the ${MAX_SECTION_LINES}-line limit`
              : `diff exceeds the ${MAX_SECTION_CHARS}-character limit`
          return limitSection(
            header,
            `[Section omitted: ${reason}; filenames only — run ${fullCommand} for the full diff]\n${nameList}`,
            fullCommand,
          )
        }
        return limitSection(header, diff, fullCommand)
      }

      const parts: string[] = []

      // STAGED: diff of the index vs HEAD.
      const staged = await run(['diff', '--staged', '--color=never'])
      parts.push(
        await diffSection('STAGED', staged, 'git diff --staged --color=never', [
          'diff',
          '--staged',
          '--name-only',
          '--color=never',
        ]),
      )

      // UNSTAGED: diff of the working tree vs the index.
      const unstaged = await run(['diff', '--color=never'])
      parts.push(
        await diffSection('UNSTAGED', unstaged, 'git diff --color=never', ['diff', '--name-only', '--color=never']),
      )

      // UNTRACKED: paths only, never contents.
      const untrackedCommand = 'git ls-files --others --exclude-standard'
      const untracked = await run(['ls-files', '--others', '--exclude-standard'])
      if (untracked.code !== 0) {
        parts.push(
          limitSection(
            '=== UNTRACKED ===',
            untracked.stderr.trim() || `${untrackedCommand} failed (exit ${untracked.code}).`,
            untrackedCommand,
          ),
        )
      } else {
        const paths = untracked.stdout.trim()
        if (!paths) {
          parts.push(limitSection('=== UNTRACKED ===', 'No untracked files.', untrackedCommand))
        } else {
          const pathLines = paths.split('\n')
          const notice =
            pathLines.length > MAX_SECTION_LINES
              ? `[Showing first ${MAX_SECTION_LINES} of ${pathLines.length} lines — run ${untrackedCommand} for the full list]\n`
              : ''
          parts.push(
            limitSection(
              '=== UNTRACKED ===',
              `${notice}${pathLines.slice(0, MAX_SECTION_LINES).join('\n')}`,
              untrackedCommand,
            ),
          )
        }
      }

      return {
        content: [{ type: 'text', text: parts.join('\n\n') }],
        details: {},
      }
    },
  })
}
