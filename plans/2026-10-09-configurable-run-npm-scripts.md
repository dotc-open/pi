# Configure `run_npm_script` from Pi settings

## Context

`packages/pi-core/src/extensions/run-npm-script.ts` currently embeds the permitted `pnpm` commands in `VALID_SCRIPTS`. The desired outcome is to configure the allowlist through Pi's `settings.json` while retaining explicit allowlist enforcement and useful tool guidance.

## Approach

Read the namespaced `runNpmScript.validScripts` setting from Pi's effective settings via `pi.getSettings()` at extension initialization, so Pi applies global/project precedence and project trust. If the setting is absent, use an empty allowlist; if it exists but is not an array (or has non-string/empty entries), throw during extension initialization so Pi reports a load error and fails startup. Derive the tool description and exact-match runtime allowlist from the validated strings; account for an empty list in the description. Each configured string specifies the **entire** permitted `pnpm` invocation after the executable, including any pre-supplied arguments (e.g. `--filter=@repo/db db:sync`). The tool accepts only the `script` field, whose value must exactly equal a configured string: no separately supplied or appended arguments. Parse configured strings as simple whitespace-delimited argv tokens, reject unsupported shell/quoting syntax at initialization, and invoke `pnpm` with separate arguments and `shell: false`. Do not interpolate configured strings into a shell command or spawn anything for an unlisted request.

## Files to modify

- `packages/pi-core/src/extensions/run-npm-script.ts` — load/validate configured scripts and use them for tool guidance and execution.
- `.pi/settings.json` — move the current script list into a top-level `runNpmScript.validScripts` array.
- `packages/pi-core/README.md` — document the settings schema, absence/error behavior, and execution constraints.
- Do **not** modify `.pi/extensions/run-npm-script.ts`; it is a separate, currently loaded copy and will remain unchanged.

## Reuse

- `pi.getSettings()` (Pi extension API) provides merged, trust-aware settings.
- Existing `run_npm_script` registration, result formatting, and permission controls in `.pi/settings.json`.
- Existing `spawn` with `shell: false` in `packages/pi-core/src/extensions/subagent.ts` as a process-execution reference.

## Steps

After **EACH STEP**, run applicable code-quality checks and commit the changes, including any plan-file updates (such as checking off completed steps).

- [x] Replace the hard-coded list in package source with validated `pi.getSettings()` lookup of `runNpmScript.validScripts`; enforce missing = `[]`, malformed = initialization error, and derive tool guidance from the list.
- [ ] Keep exact-match authorization of the full configured string and a single `script` tool parameter; pre-parse each configured command into shell-free `pnpm` argv at initialization, reject unsupported syntax, and preserve filtered database scripts and existing success/error/abort behavior. Never accept free-form arguments from tool calls.
- [ ] Move the existing entries to `.pi/settings.json`, update `packages/pi-core/README.md`, and add focused verification coverage as feasible without assuming a test runner exists. Do not change the `.pi` extension copy.

## Verification

- After each implementation step, run applicable `pnpm --filter @dotc/pi-core check-types`, `lint`, `build`, and formatting checks; root `test` is a failing placeholder, so use focused tests/manual checks if no runner is added.
- Verify absent setting denies all scripts; wrong-type, non-string, empty, or unsupported-syntax entries fail initialization; a project-configured command (including one with pre-supplied arguments) succeeds; unlisted commands and variants with extra caller-supplied arguments are rejected without execution; filtered DB commands form the intended argv without shell interpretation; and failing/aborted commands retain appropriate tool results.
- Pause and hand over control for the user to reload Pi before direct tool verification. **The current project's `.pi/extensions/run-npm-script.ts` takes precedence over the package source and is not being changed**: a direct call to this session's tool after an ordinary reload would test the old implementation. For direct tool calls against the changed source, use a clean Pi session launched from the repo with `pi --no-extensions -e ./packages/pi-core/src/extensions/run-npm-script.ts`, then reload that isolated session and verify its loaded extension path before calling `run_npm_script`. Do not claim a call to the ordinary project tool verifies the new code.
