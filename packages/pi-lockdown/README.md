# @dotc/pi-lockdown

An opinionated [Pi](https://pi.dev/) extension that adds security constraints to agent tool usage. It intercepts every tool call and enforces fine-grained read/edit/write permissions.

## Installation

```bash
pi install npm:@dotc/pi-lockdown
```

## Usage

Lockdown has two configuration modes:

- **[Path-list policy](#path-list-file-access-policy)** — Configure four arrays of patterns (`denyRead`, `allowRead`, `allowWrite`, `denyWrite`) with most-specific-wins matching.
- **[Legacy mode](#legacy-file-access-policy-mode)** — Based on whether files are inside or outside the project, and whether they match protected patterns.

Configure Lockdown for either mode, then start Pi.

If you need to amend settings for the session:

| Command                         | Description                                      |
| ------------------------------- | ------------------------------------------------ |
| `/lockdown:session-permissions` | Open the interactive session permissions dialog  |
| `/lockdown:reset`               | Reset all permissions to settings/default values |

**Note:** Changes made through `/lockdown:session-permissions` apply immediately and last for the current session only — they are never written to `settings.json`. `/lockdown:reset` discards them.

In new mode the dialog is a chooser over the four path lists and `customTools`. On the tool-levels page, `Space` cycles `allow` / `warn` / `block`, `Del` flags a tool for deletion, and typing a name adds it at `warn`. Adding or deleting a tool also updates the active tool set for the session.

## What It Does

When you start Pi, Lockdown automatically sets the tools configured under the `defaultTools` and `customTools` properties in your settings.

On every tool call, Lockdown applies a permission outcome:

- `allow`: execution continues.
- `prompt` (legacy: `warn`): execution is halted until you confirm.
- `block`: execution is blocked unconditionally.

**Tool routing**

- `read`, `grep`, `find` and `ls` use the **read** policy.
- `edit` and `write` use the **write** policy.
- Custom tools use their `customTools` level.

**Pi package lookups**

Read-only lookups (`read`, `grep`, `find`, and `ls`) inside Pi's installed package directory are always allowed, even when those paths are external or match a protected pattern such as `**/node_modules/**`. This covers Pi's `README.md`, `docs/`, `examples/`, `src/`, and `dist/` as well as the package's bundled dependencies, and lets a search be rooted at the package directory itself. The exception uses Pi's installed package path, not an arbitrary directory named `docs`. Paths outside the package (including through symlinks) are not exempt. Edits, writes, and custom tools still follow the normal permissions.

**Empty write protection**

Lockdown also blocks empty writes (`write` with empty content) as a safeguard against file soft-deletion workarounds.

## Configuration

Add a `lockdown` property in your project or global `settings.json`. The order of hierarchy that Lockdown respects is: (1) project, (2) global, then (3) defaults (see below). Lockdown **does not** merge project and global settings. For example, if a `lockdown` config exists in **both** the project and global `settings.json` files, only the values in the **project** block are used, and none of the configs in the global `settings.json` are applied.

| property            | description                                                                                         | default                                                                              |
| ------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `defaultTools`      | Built-in tools Lockdown activates at session start                                                  | `read`, `edit`, `write`, `grep`, `find`, `ls`                                        |
| `customTools`       | Permission level per non-built-in tool                                                              | `warn` for every tool                                                                |
| `fileAccess`        | The path-list policy, or the legacy `external`/`internal` matrix                                    | Path-list policy — see [Path-list File Access Policy](#path-list-file-access-policy) |
| `protectedPatterns` | Globs that mark paths as protected, used by the [legacy mode](#legacy-file-access-policy-mode) only | `**/.env*`, `**/.git/**`, `**/node_modules/**`                                       |

### Path-list File Access Policy

```json
"lockdown": {
  "fileAccess": {
    // For READS:
    // - ANY read is prompted unless the path is in allowRead or allowWrite
    // - denyRead is not a hard-block; it only prompts
    "denyRead": ["**/.env*"],
    "allowRead": [".", "./**/.env.development"],

    // For WRITES:
    // - allowWrite also grants read access to the same paths
    // - empty ALLOW means every write is prompted
    // - a winning DENY is never prompted
    "allowWrite": [],
    "denyWrite": ["**/.env*", "**/.git/**", "**/node_modules/**", ":external"]
  }
}
```

**Tokens**

- `"."` — the project (the internal region).
- `":external"` — any path outside the project.
- `"*"` — **every** path. This is a standalone special-case, distinct from the segment-scoped `*` inside a glob. It is the least-specific rule, intended for deny lists; an allow list containing `"*"` allows everything for that action. `:internal` is **not** provided — `"."` already covers the project.

**Precedence**

Matching is resolved by **specificity**, identically for reads and writes: the most-specific matching rule wins. On an exact tie, **deny wins**.

| Rank | Rule                                       | Ranking                                                                                    |
| ---- | ------------------------------------------ | ------------------------------------------------------------------------------------------ |
| 1    | An exact path to a file                    | Matches that one file                                                                      |
| 2    | A glob                                     | More literal (non-metacharacter) characters wins; `./**/.env.development` beats `**/.env*` |
| 3    | A directory prefix                         | Longer resolved path wins; `.` or an existing directory such as `e2e/` covers the subtree  |
| 4    | The region-wide tokens `:external` and `*` | Widest reach, so least specific                                                            |

### Legacy File Access Policy Mode

Legacy mode is opt-in. Lockdown evaluates (1) whether the target path is internal or external, (2) whether the path matches a protected pattern, and (3) which tool is called.

Protected/unprotected patterns can be configured by setting the following properties.

```json
{
  "lockdown": {
    "protectedPatterns": ["**/.env*", "**/.git/**", "**/node_modules/**"],
    "fileAccess": {
      "external": {
        "protected": {
          "read": "block",
          "write": "block",
          "edit": "block",
          "other": "block"
        },
        "unprotected": {
          "read": "warn",
          "write": "block",
          "edit": "block",
          "other": "block"
        }
      },
      "internal": {
        "protected": {
          "read": "warn",
          "write": "warn",
          "edit": "warn",
          "other": "warn"
        },
        "unprotected": {
          "read": "allow",
          "write": "warn",
          "edit": "warn",
          "other": "warn"
        }
      }
    }
  }
}
```

### File Access Policy Mode Selection

**To run the path-list policy** — the default — add one or more of `denyRead`, `allowRead`, `allowWrite` or `denyWrite` to `fileAccess`. An empty `"fileAccess": {}` opts in as well, with every array taking its own default. A `lockdown` block that sets neither `fileAccess` nor `protectedPatterns` gets the path-list policy with those defaults too, as does a session with no `lockdown` block at all.

**To run the legacy matrix** instead, put `external` and/or `internal` inside `fileAccess`; that keeps its existing behaviour. `protectedPatterns` alone is not a legacy opt-in: a `lockdown` block that sets it without `fileAccess` is rejected rather than silently ignored.

Mixing path lists with the legacy matrix inside `fileAccess`, or with `protectedPatterns`, is a **hard config error** that names the conflicting keys. Path arrays placed at the top level (the old shape) are rejected with a message to nest them under `fileAccess`. Lockdown will not start rather than silently guess a mode.

### Default Configuration

Each key defaults when it is omitted; an explicit `[]` disables an array default. These are the path-list policy defaults and the fallback when nothing is configured.

```json
  "lockdown": {
    "customTools": {
      "custom-tool-name": "<allow|warn|block>"
    },
    "defaultTools": ["read", "edit", "write", "grep", "find", "ls"],
    "fileAccess": {
      "denyRead":   ["**/.env*"],
      "allowRead":  [".", "./**/.env.development"],
      "allowWrite": [],
      "denyWrite":  ["**/.env*", "**/.git/**", "**/node_modules/**", ":external"]
    }
  }
```

`bash` is never activated. `protectedPatterns` is legacy-only and defaults to the three globs shown in the [legacy example](#legacy-file-access-policy-mode).

## Subagent Profile

Subagent processes (spawned `pi` processes running in headless `--mode json`) read a **separate** permission set under `lockdownSubagent`, same shape and mode rules as `lockdown`. This lets you grant/deny subagents a different set of permissions than the main agent.

A process is treated as a subagent when it was started with the `--lockdown-subagent` flag or the `PI_LOCKDOWN_SUBAGENT=1` environment variable. The main agent never sets either, so it always uses `lockdown`.

Resolution order for a **subagent** process: (1) project `lockdownSubagent`, (2) global `lockdownSubagent`, (3) project `lockdown`, (4) global `lockdown`, then (5) defaults. If no `lockdownSubagent` key exists anywhere, subagents fall back to `lockdown`. Each selected block picks its own mode; project and global blocks are never merged.

```json
{
  "lockdown": {
    "fileAccess": {
      "allowWrite": ["."],
      "denyWrite": [".env", ":external"]
    }
  },
  "lockdownSubagent": {
    "customTools": {},
    "defaultTools": ["read", "grep", "find", "ls"],
    "fileAccess": {
      "allowRead": ["."],
      "allowWrite": [],
      "denyWrite": ["*"]
    }
  }
}
```

## Headless behavior

In interactive sessions a new-mode file prompt offers **Allow once**, **Allow for this session** and **Block**; legacy and custom-tool prompts offer **Yes** / **No**. **Allow for this session** adds the requested path to `allowRead` for reads (`read`, `grep`, `find`, `ls`) or `allowWrite` for edits and writes, in the same in-memory lists `/lockdown:session-permissions` edits. A grant covers the requested path only and not its resolved target, so a prompt raised by a symlinked target can repeat.

In headless sessions (no UI, e.g. subagents in `--mode json`) the confirmation cannot be shown, so every prompt is treated as block (fail-closed). Session grants live in the running process, so subagents never inherit them.
