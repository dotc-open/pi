# Multiple Platform AI API Keys in `@dotc/pi-platform-ai-provider`

Date: 2026-10-31

## Problem Context

Holding more than one Platform AI API key is now normal rather than the exception, but `@dotc/pi-platform-ai-provider` registers the `platform-ai` provider with a single key read from `PLATFORM_AI_API_KEY`. A developer who needs a different account must edit their environment and restart Pi, which discards the current session context. Because nothing visible says which account is in use, the developer can also silently send requests to the wrong account. The friction is small per occurrence but happens on every account switch, and the second account makes it unavoidable.

The PRD ([`prd/2026-10-31-multiple-platformai-api-keys.md`](../prd/2026-10-31-multiple-platformai-api-keys.md)) fixes the product shape: one provider, named keys discovered by convention, an in-session switch command, a visibility command, a project/user default, and a visible fallback when a named key is missing. This RFC settles the technical approach.

## Goals

- Keep a single `platform-ai` provider while allowing several keys to be configured and switched in-session.
- Switch the effective key for subsequent requests without a restart and without losing session context.
- Make the active account visible before and during a session.
- Preserve existing single-key behaviour unchanged.
- Never write key material to settings, logs, or the session.

## Requirements

### Functional requirements

- `PLATFORM_AI_API_KEY` is the key named `default`; `PLATFORM_AI_API_KEY_<NAME>` defines additional named keys. The name is the suffix lowercased with `_` replaced by `-` (`PLATFORM_AI_API_KEY_PROJECT_A` → `project-a`).
- The active key name for a session is resolved from project settings, then user settings, otherwise `default`.
- `/platform-ai-api-key` lists every discovered name, marks the active one, and switches the active key for the session.
- `/which-platform-ai-api-key` reports the active name.
- A new session in TUI mode shows the active key name at session start.
- A switch applies to subsequent provider requests without re-registering the provider, reloading, or restarting Pi.
- If the resolved name has no matching environment variable, fall back to `default` and show a visible notice.
- With only `PLATFORM_AI_API_KEY` set, behaviour is identical to today.

### Non-functional requirements

- No key value is ever written to config, logs, notices, or session entries; only names are shown.
- No new network calls and no new runtime dependencies; environment scanning and two small local JSON reads only.
- Must not break non-TUI modes: commands degrade to a notice or a clear "requires interactive mode" message; no custom terminal components.
- Resolution and switching must be cheap enough to run on every provider request.
- Reading `.pi/settings.json` must tolerate malformed or missing files without failing the session.

## Options

### Option 1: Inject `Authorization` per request via `before_provider_headers`

Register the provider without committing to a single key, then resolve the active key on every request and set the `Authorization: Bearer <key>` header in the existing `before_provider_headers` handler.

Pi runs `before_provider_headers` after auth resolution and passes the merged header set to the provider API. The `openai-completions` implementation (through the OpenAI SDK) merges these request headers last, so a header set here overrides the registered `apiKey`. The existing `x-litellm-session-id` handler already uses this hook, so the change lives in code we already own.

### Option 2: Re-register the provider on every switch

Call `pi.registerProvider('platform-ai', { ..., apiKey: process.env[varName] })` when the active key changes. Pi documents that registrations after the initial load take effect immediately, so this satisfies "no restart". It needs no header trickery, but it replaces provider state on every switch and couples key selection to provider lifecycle. It also contradicts the PRD's requirement to switch "without re-registering the provider", and re-registration has to be checked against model catalog state on each call.

### Option 3: Mutate `process.env.PLATFORM_AI_API_KEY` on switch

Keep `apiKey: '$PLATFORM_AI_API_KEY'` and overwrite that variable with the selected key's value. This relies on Pi resolving the interpolation per request rather than caching it, and it leaks the selected key into every child process the session spawns. It is hard to reason about and easy to get wrong; rejected.

### Option 4: One provider per key (`platform-ai-personal`, `platform-ai-project-a`)

Rejected at the PRD level: each provider needs its own model list, the model picker is cluttered, and "which account" is conflated with "which model".

## Proposed Solution

**Option 1 — inject the resolved key through `before_provider_headers`.** It is the only option that meets every requirement: it switches each request without re-registering the provider or restarting, it reuses the hook the extension already registers, and it adds no new lifecycle or environment side effects. The other runtime options either re-register the provider (Option 2) or mutate process state (Option 3). The tradeoff is that the key is applied as a request header rather than as provider configuration, so correctness depends on the header merge order documented above; this is verified against the installed `openai-completions` implementation and must be covered by a test (see Verification).

### Key discovery

Scan `process.env` once per resolution:

- `PLATFORM_AI_API_KEY` → `default`.
- Every `PLATFORM_AI_API_KEY_<SUFFIX>` → `SUFFIX.toLowerCase().replaceAll('_', '-')`.

Ignore an empty suffix and any suffix that normalises to `default` (avoids `PLATFORM_AI_API_KEY_DEFAULT` colliding with `default`). Names are read from the environment; no list of names is stored in config.

### Starting-key resolution

Read `platformAiApiKey` as a string from:

1. `<cwd>/.pi/settings.json`
2. `<agentDir>/settings.json`, where `<agentDir>` is `PI_CODING_AGENT_DIR` or `~/.pi/agent`

Project wins over user; missing key means `default`. This matches how Pi loads user and project settings. Note: Pi loads project settings from the working directory's `.pi` only — context files walk up, `.pi` settings do not — so "nearest `.pi/settings.json`" in the PRD is implemented as the working directory's file, not an upward search. `settings.json` permits additional properties, so `platformAiApiKey` is a valid extension-owned field. Reading the file directly means the project value is honoured even when the project is untrusted; since it only selects among keys already present in the local environment and never executes project code, this is acceptable, but it should be documented.

### Session state

A module-scoped `activePlatformAiApiKey` holds the session's active key name. It defaults to the resolved starting key and is set by the switch command. It is intentionally transient: a reload or new session re-resolves the starting key. The active name is not written to the session.

### Commands and events

- `/platform-ai-api-key`: rescan the environment, call `ctx.ui.select(title, names)` with the active name named in the title, and set `activePlatformAiApiKey` to the selection. In non-UI modes, notify that the command needs interactive mode (or accept an argument name if one is supplied).
- `/which-platform-ai-api-key`: `ctx.ui.notify` the active name. In non-UI modes this is a no-op; the JSON/print caller can rely on the same resolver.
- `session_start`: resolve the starting key, apply the missing-key fallback, and when `ctx.mode === 'tui'` notify the active name.
- `before_provider_headers`: when `ctx.model?.provider === 'platform-ai'`, look up the active name's value and set `Authorization` to `Bearer <key>` alongside the existing `x-litellm-session-id`. Only names are ever inspected for logging; values are never surfaced.

### Missing-key handling

If the resolved starting name has no environment variable, set `activePlatformAiApiKey` to `default` and notify that the requested name was unavailable. If `default` is also absent, the request fails with the provider's normal "no API key" error; no special handling is added.

### Backward compatibility

With only `PLATFORM_AI_API_KEY` set, discovery yields `{ default }`, resolution yields `default`, and `before_provider_headers` sends the same `Authorization` the registered `apiKey` would have. The `apiKey: '$PLATFORM_AI_API_KEY'` registration is kept as a fallback so provider auth status and any non-injected request path behave as before.

## Verification

- Switching mid-session: run `/platform-ai-api-key`, select a non-default name, send a request, and confirm the request carries `Authorization: Bearer <that key>` via `after_provider_response` or a local proxy.
- Active-key visibility: `/which-platform-ai-api-key` and the TUI session-start notice both report the resolved name.
- Project default: a `.pi/settings.json` with `"platformAiApiKey": "project-a"` starts the session on `project-a`.
- Single-key compatibility: with only `PLATFORM_AI_API_KEY` set, the session starts on `default` and requests authorise as before.
- Missing named key: name a key that is not set and confirm the fallback notice and `default` behaviour.
- Non-TUI: confirm commands do not attempt terminal-only UI and the session still serves requests.
