# Lockdown path-list policy implementation

## Context

The [PRD](../prd/2026-11-03-lockdown-sandbox-config-prd.md) and [RFC](../rfc/2026-11-03-rfc-lockdown-path-list-policy.md) call for a four-array read/write policy that can allow writes to `e2e/` without granting unrelated access. Existing `fileAccess` + `protectedPatterns` configs must behave unchanged. The current extension handles settings in `schema.ts`/`utils.ts`, tool decisions and commands in `index.ts`, and documents only legacy mode in the README.

## Approach

Keep explicit legacy and new-mode settings and dispatch rather than translating the matrix. Detect mode on raw selected settings before applying defaults; keep legacy default parsing unchanged when no new keys exist. Use a shared path evaluator for new-mode read/write decisions. For each file call, evaluate both the requested path and its resolved target (including resolution through the nearest existing parent for new files). Allow only if both are allowed; a denied write on either path blocks; otherwise prompt if either path prompts. Fail closed when resolving a symlink or parent is unsafe or impossible. This prevents `allowWrite: ["e2e/"]` from authorizing writes through an `e2e/` symlink into another region. New-mode session commands can use Pi's built-in `ctx.ui.select()`/`input()` rather than inventing a custom text editor; keep the existing SettingsList for legacy mode.

## Files to modify

- `packages/pi-lockdown/src/schema.ts` — legacy/new settings shapes, entry validation and per-array defaults.
- `packages/pi-lockdown/src/utils.ts` — settings loading and existing legacy UI list; path resolution reuse as appropriate.
- `packages/pi-lockdown/src/index.ts` — per-mode tool handling, prompt results and session command dispatch.
- `packages/pi-lockdown/src/constants.ts` — only if shared rule names/constants are warranted.
- `packages/pi-lockdown/src/path-policy.ts` (new) — deterministic path matching and specificity, if separating from settings utilities keeps concerns clear.
- `packages/pi-lockdown/src/__tests__/*.test.ts` (new) — focused settings, matching, tool flow and session-state tests (there are currently no package tests).
- `packages/pi-lockdown/README.md` — new-mode guide, mode switch and legacy compatibility.

## Reuse

- `loadSettings`, `isInside`, `isPiReadablePath` and `constructSettingsList` in `packages/pi-lockdown/src/utils.ts`.
- `LockdownLevelSchema` and legacy schema in `packages/pi-lockdown/src/schema.ts`.
- Existing `tool_call`, `session_start`, `/lockdown:reset`, `/lockdown:session-permissions` handlers in `packages/pi-lockdown/src/index.ts`.
- Node `path`/`fs` APIs (`path.matchesGlob`, `realpathSync` and nearest-existing-parent resolution) and the existing Vitest script; avoid an additional glob dependency if Node matching meets required semantics. Use built-in `ctx.ui.select()`/`input()` for new-mode session list editing, and guard TUI-only behavior.

## Steps

After **each step**, run code quality checks (`lint:fix`, `format:fix`, `check-types`) via the `code-quality-checker` subagent and commit the changes, including plan-file updates marking completed steps.

- [x] Define/validate legacy and new-mode settings with raw-key detection before Zod defaults; test presence including `[]`, per-array defaults, named mixing errors, invalid entries, and project/global/subagent selection. Preserve legacy defaults exactly.
- [x] Implement and test new-mode path evaluator (see Existing vs new for what is reused). Rule matching, specificity/tie ranking, symlink/target resolution and `~` expansion are new; `@` prefix stripping and `path.matchesGlob` glob semantics are reused. Test requested vs canonical target checks including symlink parents and new files. Assert no symlink outside an allowed area inherits the original path's allow.
- [x] Route built-in read/grep/find/ls and edit/write through the selected engine, preserving bash/empty-write blocks, Pi package read exemption, custom tools and one-shot/headless prompts; test per-mode calls, deny-rule explanations and unsafe path-resolution failure.
- [x] Add session-only path-list add/remove using select/input in new mode; validate entries before mutating arrays, preserve legacy SettingsList, and reset by reloading selected settings. Test mutations, cancellation and reset; non-interactive command should report that UI is required.
- [ ] Document example policies, mode switch, defaults, tokens, precedence (including pi-sandbox difference), symlinks and legacy migration in README; run package/full tests and build, then prepare interactive verification.

## Verification

- Run `pnpm --filter @dotc/pi-lockdown test` and the mandated code quality checks after each implementation step; run build/full tests at the end.
- Test paths at project root and nested directories, glob precedence and ties, `*`/`:external`, omitted versus empty arrays, invalid mixed keys, headless denies and legacy outcomes. Include a symlink from `e2e/` to an external directory, a symlink to a denied internal directory, and a new file under a symlink parent: the requested path must not grant an otherwise denied target.
- Pause and hand over to the user to reload the Pi session to pick up the changed extension. After reload, verify by **directly calling** the available `read`, `write`, and `edit` tools against allowed `e2e/`, unmatched `src/`, denied `.env`, and an external path; exercise `/lockdown:session-permissions` add/remove and `/lockdown:reset`. Use disposable fixture files only and confirm prompts do not persist.
- After implementation, pause again for user-led interactive testing before declaring the extension finished.

## Existing vs new

| Behaviour                                                            | Status                                                 |
| -------------------------------------------------------------------- | ------------------------------------------------------ |
| Project-vs-external classification (`isInside`)                      | Existing, reused by `:external`                        |
| `@` path-prefix stripping                                            | Existing (`isPiReadablePath`), reused by the evaluator |
| Native glob semantics via `path.matchesGlob`                         | Existing (used by `protectedPatterns`)                 |
| `~` expansion in entries                                             | New (rules currently resolve against cwd only)         |
| `.` (project), `:external`, standalone `*` tokens                    | New                                                    |
| Directory / file / glob classification and specificity + tie ranking | New                                                    |
| Resolved-target and symlink-parent checks                            | New                                                    |
| Per-array defaults, new-mode selection, mixed-key error              | New                                                    |
| New-mode session list editing                                        | New (legacy SettingsList kept)                         |

## Tests to write

Planned files under `packages/pi-lockdown/src/__tests__/`:

- `schema.test.ts` — new-mode selection on raw keys (including `[]`), per-array defaults, explicit `[]` disabling defaults, mixed legacy/new keys error naming offending keys, invalid entry rejection, legacy parsing unchanged.
- `settings.test.ts` — project/global and subagent-profile selection order, no merging, invalid selected config returns `null`.
- `path-policy.test.ts` — `~`/`.`/`:external`/`*`, directory vs file vs glob matching, specificity ordering, deny-wins-on-tie, segment-scoped `*` vs `**`, root and nested glob matches, unmatched returns prompt.
- `resolution.test.ts` — `@` prefix, `..`/separator normalization, sibling-prefix rejection, requested-vs-canonical target checks, `e2e/` symlink to external and to a denied internal dir, new file under a symlink parent, unresolvable parent fails closed.
- `tool-flow.test.ts` — read/grep/find/ls vs edit/write dispatch, bash and empty-write blocks, Pi package read exemption, custom tools, warn allow/deny one-shot, headless warn blocks, deny reason includes path and rule.
- `session-commands.test.ts` — add/remove entries in each new-mode list, entry validation before mutation, reset reloads selected settings, legacy editor retained, non-interactive mode reports UI required.
