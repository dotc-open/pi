# Multiple Platform AI API Keys in `@dotc/pi-platform-ai-provider`

Date: 2026-10-31

## Problem Statement

A new Platform AI API key was recently made available, so holding multiple Platform AI keys is now the norm rather than the exception. The `@dotc/pi-platform-ai-provider` extension registers the `platform-ai` provider with a single API key read from `PLATFORM_AI_API_KEY`, so a developer who needs a different account must edit their environment and restart Pi. Restarting discards the current session context, and because there is no in-session, visible indication of which account is in use, the developer can silently send requests to the wrong account. This friction is small per occurrence but happens whenever a developer moves between accounts, and it is now unavoidable given the new account.

## Proposed Solution

### Concept

Keep a single `platform-ai` provider, but resolve its API key at runtime from a **named set of keys discovered by convention** from the environment, with the active key switchable from inside a Pi session and defaultable per project.

### Key Components

| Component                                                                                                                                                                                                                                                                                                                      | Solves                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| **Key discovery by convention**: `PLATFORM_AI_API_KEY` is the `default` key; `PLATFORM_AI_API_KEY_<NAME>` defines additional named keys. Names are derived from the env var suffix (lowercased, `_` → `-`), so `PLATFORM_AI_API_KEY_PROJECT_A` exposes the name `project-a`. No key material is ever written to a config file. | Keeping several accounts configured at once without inventing a new config format or storing secrets. |
| **Starting-key resolution**: the active key name for a session is read from the `platformAiApiKey` setting in the nearest `.pi/settings.json` (walking up as Pi does for project settings), then user-level `<agent-dir>/settings.json`, otherwise `default`.                                                                  | Each project starts on an appropriate account without per-session switching.                          |
| **`/platform-ai-api-key` command**: opens a picker listing every discovered name with the active one marked; selecting a name switches the key for the current session.                                                                                                                                                        | Removes the edit-env-and-restart step; makes the choice deliberate rather than accidental.            |
| **`/which-platform-ai-api-key` command**: displays the active key name.                                                                                                                                                                                                                                                        | Makes the active account visible on demand.                                                           |
| **Session-start notice**: the active key name is displayed when a new session starts in TUI mode.                                                                                                                                                                                                                              | Makes the active account visible before the first request.                                            |
| **Runtime key resolution**: the active name selects which env var is used for requests, applied immediately to subsequent requests without re-registering the provider or restarting Pi.                                                                                                                                       | Switching and project defaults take effect without losing session context.                            |
| **Missing-key handling**: if the resolved name has no matching env var, fall back to `default` and show a visible notice.                                                                                                                                                                                                      | Prevents a confusing auth failure when a project names a key this machine does not have.              |

### Scope

In scope: named keys, in-session switching, project/user-level default key name, active-key visibility, single-key backward compatibility.

Out of scope: storing key values in config or `auth.json`, per-name model lists or endpoints, non-TUI modes (no picker and no session-start notice), and editing `settings.json` from the switch command (switching is transient for the session).

### Alternatives Considered

- **Status quo (edit env, restart Pi)** — loses session context and still allows the wrong account to be used unnoticed.
- **Register one Pi provider per key** (e.g. `platform-ai-personal`, `platform-ai-project-a`) and switch with `/model` — no new command, but each provider needs its own model list, clutters the model picker, and conflates "which account" with "which model".
- **`/login` and `auth.json`** — Pi stores one credential per provider, so it cannot hold several credentials for `platform-ai` with an in-session switch.
- **Store the list of available key names in config** (e.g. `settings.json` or `~/.pi/platform-ai.json`) — an explicit list of names and their env vars is easier to read than a naming convention, but requires maintaining configuration for something the environment already expresses, and can drift from the env vars actually set.

## User Stories

1. As a developer with multiple Platform AI keys, I want each key exposed under a named env var so that I can keep several accounts configured at once.
2. As a developer, I want to list and switch the active key from inside a Pi session so that I don't have to edit env vars and restart.
3. As a developer, I want to see which key is active so that I don't accidentally send requests to the wrong account.
4. As a developer, I want a session to start on a project-appropriate key so that I don't have to switch at the start of every session.
5. As a developer with only one key, I want the existing `PLATFORM_AI_API_KEY` setup to keep working unchanged so that nothing breaks.

## User Flows

### User Flow 1: Switch key mid-session

1. User runs `/platform-ai-api-key`.
2. Pi displays a picker listing every available name (`default`, `personal`, `project-a`) with the active one marked.
3. User selects a name.
4. Pi sets that name as the active key for the session.
5. Subsequent requests use the selected key immediately, with no reload or restart.

### User Flow 2: Check the active key

1. User runs `/which-platform-ai-api-key`.
2. Pi displays the active name (e.g. `personal`).

### User Flow 3: Session starts on the project default

1. User starts Pi inside a project whose nearest `.pi/settings.json` names a key (e.g. `project-a`).
2. Pi resolves that name to `PLATFORM_AI_API_KEY_PROJECT_A`.
3. Pi displays the active key name when the session starts (TUI mode).
4. User works without switching.

### User Flow 4: Single-key user

1. Only `PLATFORM_AI_API_KEY` is set.
2. The session starts on `default`, and in TUI mode the start notice shows `default`.
3. `/platform-ai-api-key` lists `default` only; `/which-platform-ai-api-key` displays `default`.
4. Requests behave exactly as before the change.

### User Flow 5: Resolved name has no matching env var

1. The active or configured name (e.g. `project-a`) has no matching env var set.
2. Pi falls back to `default`.
3. Pi shows a visible notice explaining the fallback.
4. Requests proceed using `default`.
