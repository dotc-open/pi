# Lockdown: "Allow for this session" from the permission prompt

## Context

Today a new-mode file call that matches no allow (or a winning read deny) stops and shows a two-way prompt (`Yes` / `No`, `packages/pi-lockdown/src/index.ts:42`). `Yes` allows that one call only, so an agent working through a folder — or re-reading the same unlisted path — makes the user answer the same prompt repeatedly. The only way to stop the repetition is to leave the agent, run `/lockdown:session-permissions` (or `/lockdown:reset` to undo), and pick the list by hand.

This plan adds a third choice to the prompt: allow this call **and** add the requested path to the matching session list, reusing the existing session editor mechanism (`applyListEdits` in `packages/pi-lockdown/src/session-editor.ts`, the same in-memory arrays the command edits). Outcome: one answer covers the rest of the session for that path, while `denyWrite`/`denyRead` hard rules and headless fail-closed behaviour stay untouched.

**Scope: new mode only.** Legacy `warn` slots and custom-tool prompts have no path list to add to, so they keep two options. Old PRD/RFC/plan docs are left as-is; only the README (current behaviour) is updated.

## Approach

1. Extend the new-mode prompt only (`promptForPath`, `index.ts:33-49`) with the third option:
   - Options: `Allow once` / `Allow for this session` / `Block`, in that order, so the Enter default stays the one-off allow.
   - Title and detail unchanged (`[LOCKDOWN] ⚠️ Allow agent to perform action?`, `tool: path`, `Matched rule: "…"`).
   - Headless branch unchanged: fails closed, no session grant offered.
   - The legacy/custom-tool prompt at `index.ts:175-192` keeps its `Yes`/`No` copy and is not refactored.
2. Choosing the session option mutates the same in-memory settings the command edits: `settings[key] = applyListEdits(settings[key], { added: [entry], removed: [] })`, then `ctx.ui.notify` (same copy shape as the command's notifications) and allow the call.
3. Key/entry mapping (new mode, file tools only):
   - read / grep / find / ls → `allowRead`
   - edit / write → `allowWrite` (also grants reads, so both actions are covered)
   - entry = the exact requested path: `path.relative(cwd, requested)` when inside the project, else the absolute requested path; `@` prefix stripped. When the requested path **is** the project root the relative form is empty, so use `.`.
   - A requested path may be a folder (`ls src`, or `inputPath` defaulting to `.`): `compileRule` then classifies the entry as a directory rule and it covers `src` and everything under it. That is the intended outcome — the folder was the thing the user approved.
   - A session grant only covers the requested path. If the prompt was raised by the resolved target (symlink), the same call prompts again next time; accepted, so the resolved target is never added and the prompt keeps its current detail copy.
4. All of this lives in the new-mode branch; the legacy/custom-tool prompt keeps its two options and current copy.

## Files to modify

- `packages/pi-lockdown/src/index.ts` — new-mode prompt options, session-list mutation on the new option, entry passed from the new-mode branch. Legacy prompt untouched.
- `packages/pi-lockdown/src/session-editor.ts` — reuse `applyListEdits` (already exported); no change expected.
- `packages/pi-lockdown/src/__tests__/tool-flow.test.ts` — harness `select` default is `'Yes'` (`:62`): new-mode prompt assertions move to `Allow once`, legacy/custom ones stay `Yes`. Add session-grant cases.
- `packages/pi-lockdown/README.md` — prompt options, session-grant behaviour, `:268` headless note, `:147` walkthrough.

## Reuse

- `applyListEdits(entries, result)` — `session-editor.ts:21` (removals, then additions, dedup).
- `configureNewModeSession` notifications — `session-editor.ts:338` (`[LOCKDOWN] Added "x" to allowWrite.`).
- `evaluateFilePath` / `PathEvaluation` (`requested`, `target`, `rule`) — `path-policy.ts:163`.
- `PathPolicyKey`, `PathEntrySchema`, `PATH_POLICY_KEYS` — `schema.ts`.
- `ctx.ui.select` and `ctx.ui.notify` — already used for both prompt styles.

## Steps

After **each step**, run code quality checks (lint:fix, format:fix, check-types) via the `code-quality-checker` subagent and commit, including plan-file updates marking steps done.

- [x] Update the new-mode prompt (`promptForPath`) to `Allow once` / `Allow for this session` / `Block`; on the session option, add the entry to `allowRead`/`allowWrite` via `applyListEdits`, notify, and allow the call. Leave the legacy/custom prompt and the headless branch untouched.
- [ ] Tests: new-mode prompt labels; session grant stops the repeat prompt; entry lands in the right list (`allowRead` vs `allowWrite`) with the right shape (relative for internal, `.` for the project root, absolute for external); folder path grants the subtree; `Block` still blocks; legacy/custom/headless unchanged (`Yes`/`No`, no third option).
- [ ] Docs: README only. PRD, RFC and historical plans are not back-filled.

## Verification

- `pnpm --filter @dotc/pi-lockdown test`.
- Interactive: reload Pi, call a file tool at an unlisted path, pick **Allow for this session**, then repeat the call and confirm no second prompt; run `/lockdown:session-permissions` and confirm the entry is in the expected list; `/lockdown:reset` and confirm it is gone. Check a `denyWrite` path still hard-blocks with no session option, and a headless/subagent prompt still fails closed.
- Rebuild `dist` (`pnpm build`) before reloading — the extension loads from `dist/`, not `src/`.

## Decisions

- New-mode file prompts only; legacy and custom-tool prompts keep their current `Yes`/`No` copy and are not touched.
- Exact requested path. Folder paths are allowed as-is and cover the whole subtree via the existing directory rule; project root becomes `.`.
- A prompt raised by a symlinked target may repeat; the resolved target is never added.
- README is the only doc updated.
- A session grant always adds to an _allow_ list, so approving a read that a winning `denyRead` prompted (e.g. `**/.env*`) leaves an exact entry that outranks the deny for the rest of the session. That is the documented most-specific-wins rule and only ever happens by explicit user choice.
- Option labels `Allow once` / `Allow for this session` / `Block` (agreed).
