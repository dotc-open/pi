# Multiple Platform AI API keys in `@dotc/pi-platform-ai-provider`

RFC: [`rfc/2026-10-31-rfc-multiple-platformai-api-keys.md`](../rfc/2026-10-31-rfc-multiple-platformai-api-keys.md)
PRD: [`prd/2026-10-31-multiple-platformai-api-keys.md`](../prd/2026-10-31-multiple-platformai-api-keys.md)

## Context

`@dotc/pi-platform-ai-provider` registers the `platform-ai` provider with one key from `PLATFORM_AI_API_KEY`. Developers with more than one Platform AI account must edit their environment and restart Pi to switch accounts, which discards session context, and nothing visible says which account is in use.

The RFC settles the approach: keep one provider, discover named keys from the environment by convention, pick a starting key from settings, switch in-session, and inject the active key per request through the existing `before_provider_headers` handler. No provider re-registration, no `process.env` mutation, and no key material ever written to config, logs, notices, or session entries.

Confirmed decisions: `/platform-ai-api-key` accepts an optional name argument (works without a picker); `platformAiApiKey` is read from `.pi/settings.json` then `<agent-dir>/settings.json`, with the project value honoured even in an untrusted project (it only selects among keys already present in the local environment); no persistent footer indicator — visibility is the session-start notice plus the query command.

## Approach

Split the pure decisions out of the extension factory so they can be tested without the Pi runtime:

- `src/keys.ts` — environment discovery, settings parsing/resolution, and active-key resolution, all pure except two thin filesystem reads.
- `src/index.ts` — keeps provider registration and the `before_provider_headers` handler, adds module-scoped active-key state, the `session_start` notice, and the two commands.

Use Vitest (colocated `src/*.test.ts`, run directly on TypeScript) rather than `node:test`. The repo has no test runner at all, and `node:test` would have to run against built `dist/**` because Node's type stripping cannot resolve the extensionless TS imports this package uses. Vitest tests the source with no build step, which keeps the test loop fast and gives `@dotc/pi-core` a test setup to reuse. It adds one devDependency and a turbo task; it does not add a config file (Vitest discovers `**/*.test.ts` by default).

Key facts relied on (from the installed Pi runtime):

- `before_provider_headers` runs after auth resolution, and the `openai-completions` path merges those request headers last, so a header set there overrides the registered `apiKey`. The extension already uses this hook for `x-litellm-session-id`.
- Pi reads project settings from the working directory's `.pi` only (context files walk up, `.pi` settings do not), so starting-key resolution does not walk upward.
- `settings.schema.json` sets `additionalProperties: true`, so `platformAiApiKey` is a valid extension-owned field.

## Files to modify

- `packages/pi-platform-ai-provider/src/keys.ts` — new: pure helpers plus thin settings reads.
- `packages/pi-platform-ai-provider/src/index.ts` — active-key state, header injection, `session_start` notice, commands.
- `packages/pi-platform-ai-provider/src/keys.test.ts` — new: Vitest cases for the pure helpers.
- `packages/pi-platform-ai-provider/package.json` — add a `test` script and a `vitest` devDependency.
- `turbo.json` and root `package.json` — add a `test` task/script so `turbo test` works.
- `packages/pi-platform-ai-provider/README.md` — document named keys, the `platformAiApiKey` setting, commands, argument form, and fallback.

## Reuse

- Existing `before_provider_headers` handler and `x-litellm-session-id` logic in `packages/pi-platform-ai-provider/src/index.ts`.
- `pi.registerCommand`, `ctx.ui.select`, `ctx.ui.notify`, `ctx.hasUI`, `ctx.mode`, `ctx.cwd` from Pi's `ExtensionAPI` / `ExtensionContext` (`dist/core/extensions/types.d.ts`).
- `PI_CODING_AGENT_DIR` for the agent directory (`docs/environment-variables.md`); `node:os`/`node:path` for the `~/.pi/agent` default.
- Node built-ins `node:fs`, `node:os`, `node:path` for filesystem access.
- Existing root tooling: Turbo task wiring in `turbo.json`, lint/format/type scripts in each package.
- New devDependency: `vitest` (installed at the workspace root with `pnpm add -w -D vitest`; this install is outside the current command allowlist and needs to be run during execution).

## Steps

After **each step**, run `lint:fix`, `format:fix`, and `check-types` through the `code-quality-checker` subagent. Then verify the change, stage only that step's files, review the staged diff, propose a one-line Conventional Commit message, and ask for approval before committing. Include plan-file progress in the commit only if deliberately tracking it; never stage `plans/` by default.

1. **Add `src/keys.ts` + tests.** Implement:
   - `discoverKeyVars(env)`: `PLATFORM_AI_API_KEY` → `default`; each non-empty `PLATFORM_AI_API_KEY_<SUFFIX>` → `suffix.toLowerCase().replaceAll('_', '-')`; ignore empty suffixes, empty values, and any suffix normalising to `default`; return `Map<name, envVarName>`.
   - `parseKeyName(settingsText)`: pure JSON parse, return `platformAiApiKey` only when it is a non-empty string; return `undefined` on malformed JSON / non-object / non-string.
   - `readKeyNameFromSettings(filePath)` and `getAgentDir(env)`: thin `node:fs` wrappers that swallow read errors.
   - `resolveStartingKeyName(cwd, env)`: `<cwd>/.pi/settings.json`, then `<agentDir>/settings.json`, else `default`.
   - `resolveActiveKey(name, vars)`: `{ name, envVar?, fellBack }`, falling back to `default` when `name` is absent.

   Add `src/keys.test.ts` covering the cases listed under Verification, add `"test": "vitest run"` to `package.json`, add `vitest` to its devDependencies, and add a `test` task to `turbo.json` plus a root `"test": "turbo test"` script. `tsconfig.build.json` already excludes `src/**/*.test.ts` from the build.

2. **Wire runtime key resolution.** In `src/index.ts`: add module scope `activePlatformAiApiKey`; on `session_start`, compute `discoverKeyVars(process.env)` and `resolveStartingKeyName(ctx.cwd, process.env)`, store the resolved name, notify a warning when it fell back, and notify the active name when `ctx.mode === 'tui'`. In `before_provider_headers` (keeping the provider guard and session-id header), resolve the active name against the current environment and set `Authorization: Bearer <key>` when a value exists. Keep `apiKey: '$PLATFORM_AI_API_KEY'` as the fallback registration so non-injected paths and auth status are unchanged.
3. **Add the two commands.** `/platform-ai-api-key`: with an argument, resolve and switch to it (notice on fallback); otherwise, when `ctx.hasUI`, `ctx.ui.select` over the discovered names with the active name in the title and switch on selection; in non-UI modes, notify that a name argument is required. If no names are discovered, notify an error. `/which-platform-ai-api-key`: notify the active name (defaulting to `default`).
4. **Update `README.md`.** Document the `PLATFORM_AI_API_KEY` / `PLATFORM_AI_API_KEY_<NAME>` convention with an example, the `platformAiApiKey` setting precedence, both commands and the argument form, the missing-key fallback, and that only names (not values) are ever shown.

## Verification

Automated (`pnpm test`, or `pnpm --filter @dotc/pi-platform-ai-provider test`):

- Discovery: default only; default + named; `PROJECT_A` → `project-a`; name derived from a multi-underscore suffix; empty suffix ignored; `PLATFORM_AI_API_KEY_DEFAULT` ignored; empty value treated as missing; unrelated `PLATFORM_*` and other env ignored.
- Settings: valid string; non-string ignored; malformed JSON ignored; missing file ignored; project value wins over user value; `PI_CODING_AGENT_DIR` overrides the agent directory; absent value → `default`.
- Active key: present name resolves without fallback; missing name falls back to `default` with `fellBack: true`; missing name when `default` is also absent yields no `envVar`.

Manual, after implementation. Pause and hand over so the user can reload the session before calling the reworked extension:

- Set `PLATFORM_AI_API_KEY` and a second `PLATFORM_AI_API_KEY_<NAME>`, reload, then run `/platform-ai-api-key <name>` and send a request; confirm the request carries `Authorization: Bearer <that key>` (check via `after_provider_response`, a local proxy, or the Platform AI account it hits) and `/which-platform-ai-api-key` reports the switched name.
- Open the picker form (no argument) and confirm names are listed with the active one shown in the title.
- Add `"platformAiApiKey": "<name>"` to `.pi/settings.json`, start a session, and confirm the session-start notice and the effective request key use it; repeat with the user-level settings file.
- Single-key: with only `PLATFORM_AI_API_KEY`, confirm the session starts on `default` and requests authorise exactly as before.
- Missing name: switch to / configure a name with no env var and confirm the fallback warning and `default` behaviour.
- Non-UI: confirm `/platform-ai-api-key` without an argument reports that a name argument is required and does not open a picker, and that requests still work.
