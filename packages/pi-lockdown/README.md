# @dotc/pi-lockdown

An opinionated [Pi](https://pi.dev/) extension that adds security constraints to agent tool usage. It intercepts every tool call and enforces fine-grained read/edit/write permissions.

Lockdown has two configuration modes:

- **Path-list policy (new mode)** — four arrays (`denyRead`, `allowRead`, `allowWrite`, `denyWrite`) with most-specific-wins matching. Recommended.
- **Legacy mode** — the original `fileAccess` matrix plus `protectedPatterns`. Still supported unchanged for existing configs.

See [Mode switch](#mode-switch) for how Lockdown picks a mode.

## Installation

```bash
pi install npm:@dotc/pi-lockdown
```

## Usage

Configure Lockdown (see [Configuration](#configuration) below), then start Pi.

If you need to amend settings for the session:

| Command                         | Description                                      |
| ------------------------------- | ------------------------------------------------ |
| `/lockdown:session-permissions` | Open the interactive session permissions dialog  |
| `/lockdown:reset`               | Reset all permissions to settings/default values |

**Note:** Changes made through `/lockdown:session-permissions` apply immediately and last for the current session only — they are never written to `settings.json`. `/lockdown:reset` discards them.

## What It Does

When you start Pi, Lockdown automatically sets the tools configured under the `defaultTools` and `customTools` properties in your settings.

On every tool call, Lockdown applies a permission outcome:

- `allow`: Execution continues.
- `prompt` (shown as `warn` in legacy mode): Execution is halted — you must confirm the action. In new mode a winning `deny` on a **read** also prompts.
- `block`: Execution is blocked unconditionally. In new mode a winning `deny` on a **write** always blocks.

`bash` is always blocked outright, and `write` calls with empty content are always blocked as a safeguard against file soft-deletion.

### Tool routing

- `read`, `grep`, `find` and `ls` use the **read** policy.
- `edit` and `write` use the **write** policy.
- Custom tools use their `customTools` level.

## Configuration

Add a `lockdown` property in your project or global `settings.json`. The order of hierarchy that Lockdown respects is: (1) project, (2) global, then (3) defaults (see below). Lockdown **does not** merge project and global settings. For example, if a `lockdown` config exists in **both** the project and global `settings.json` files, only the values in the **project** block are used, and none of the configs in the global `settings.json` are applied.

`defaultTools` and `customTools` work the same way in both modes:

- `defaultTools` overrides which built-in tools Lockdown activates.
- `customTools` maps tool names to `<allow|warn|block>`. Add permissions for all custom tools and tools from other extensions here, or Lockdown defaults them to `warn`.

### Mode switch

- If a `fileSystemAccess` key is present, the **new path-list policy** runs. It may be `{}` to use every default.
- Otherwise, the **legacy** `fileAccess` matrix + `protectedPatterns` runs exactly as before.
- Mixing `fileSystemAccess` with a legacy key (`fileAccess` or `protectedPatterns`) is a **hard config error** that names the offending keys. Path arrays placed at the top level (the old shape) are rejected with a message to nest them under `fileSystemAccess`. Lockdown will not start rather than silently guess a mode.

### Path-list policy (new mode)

```jsonc
"lockdown": {
  "fileSystemAccess": {
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

Every array is optional and has its own built-in default (below). An omitted array receives its default; an explicit `[]` disables that default.

#### Tokens

- `"."` — the project (the internal region).
- `":external"` — any path outside the project.
- `"*"` — **every** path. This is a standalone special-case, distinct from the segment-scoped `*` inside a glob. It is the least-specific rule, intended for deny lists; an allow list containing `"*"` allows everything for that action. `:internal` is **not** provided — `"."` already covers the project.

#### Matching

- Entries resolve against the project cwd; a leading `~` expands to the home directory. Pi's `@` path prefix on tool paths is stripped before matching.
- An entry ending in `/` is a directory prefix. An entry that points at an existing directory (e.g. `.`, `~/.config`) is also a prefix. Any other entry is an exact file path. Non-existent intended directories must be written with a trailing slash.
- Entries containing glob metacharacters (`.env.*`, `*.pem`, `**/.env*`) match as globs. As with pi-sandbox, `*` is segment-scoped (`*.pem` does not match `dir/a.pem`; use `**/*.pem` for that). The standalone `"*"` entry is the exception.

#### Precedence

Matching is resolved by **specificity**, identically for reads and writes: the most-specific matching rule wins.

1. An exact path to a file.
2. A glob, ranked by how many literal (non-metacharacter) characters it contains (`./**/.env.development` beats `**/.env*`).
3. A directory prefix, ranked by resolved path length.
4. `:external` and `*` are region-wide and least specific.

On an exact tie, **deny wins**. The outcome then depends on the action:

| Group | Winning deny                | Winning allow | No match |
| ----- | --------------------------- | ------------- | -------- |
| Write | hard block (never prompted) | allow         | prompt   |
| Read  | prompt                      | allow         | prompt   |

`allowWrite` also grants read access to the same paths, so write paths need not be repeated in `allowRead`.

#### Defaults

Each default applies only when its array is omitted.

```jsonc
"fileSystemAccess": {
  "denyRead":   ["**/.env*"],
  "allowRead":  [".", "./**/.env.development"],
  "allowWrite": [],
  "denyWrite":  ["**/.env*", "**/.git/**", "**/node_modules/**", ":external"]
}
```

These deliberately differ from the legacy defaults: protected internal **writes** change from prompt to hard block, and protected external **reads** change from block to prompt. `denyRead` never hard-blocks.

#### Example policies

Grant unattended writes under `e2e/` while everything else stays controlled:

```json
{
  "lockdown": {
    "fileSystemAccess": {
      "allowWrite": ["e2e/"]
    }
  }
}
```

- Writing `e2e/snapshot.spec.ts` matches `allowWrite` → allowed.
- Writing `src/index.ts` matches neither list → Yes/No prompt.
- Writing `.env` matches `denyWrite` → hard block, no prompt.

Make a project read-only except for one directory (a write allowlist):

```json
{
  "lockdown": {
    "fileSystemAccess": {
      "denyWrite": ["*"],
      "allowWrite": ["e2e/"]
    }
  }
}
```

Because `*` is least specific, `e2e/` is the only writable location and every other write is hard-blocked.

#### Symlinks and target resolution

For every file call Lockdown evaluates **both** the requested path and its canonical target (symlinks resolved; for a path that does not exist yet, the nearest existing parent is resolved and the remaining segments appended). The call is allowed only if both paths are allowed; a write denied on either path is hard-blocked; otherwise a prompt on either path prompts. If the target cannot be resolved, Lockdown fails closed.

This stops `allowWrite: ["e2e/"]` from authorising writes through an `e2e/` symlink into an external or protected directory: the requested path matches the allow, but the resolved target matches the deny.

#### Difference from pi-sandbox

pi-sandbox applies deny-first precedence to writes and allow-first to reads. Lockdown uses a single most-specific-wins rule for both, which additionally means a more specific allow **can carve a hole** in a broader deny — so only the config actually running can open one (project and global settings are never merged).

#### Session commands (new mode)

`/lockdown:session-permissions` shows the four arrays with their current entries inline (dim, single line, truncated with `...`). Choosing one opens a vertical list (windowed to 10 rows): move with ↑↓, press Del to flag an entry for deletion, and type in the trailing row to add one (Tab completes paths from the filesystem). Enter adds the typed text, or saves when the row is empty (a save is final and closes the command); Esc returns to the list menu without saving. Entries are validated before they are applied, and edits are in-memory only. `/lockdown:reset` reloads the selected `settings.json` block (or defaults), discarding session edits. In a non-interactive session the command reports that an interactive UI is required.

### Legacy mode (fileAccess matrix)

If `fileSystemAccess` is not present, the original matrix runs unchanged.

```json
{
  "lockdown": {
    "customTools": {
      "custom-tool-name": "<allow|warn|block>"
    },
    // No Bash
    "defaultTools": ["read", "edit", "write", "grep", "find", "ls"],
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

Default protected patterns:

```
**/.env*
**/.git/**
**/node_modules/**
```

#### Migrating to the new mode

1. Remove `fileAccess` and `protectedPatterns`, then add a `fileSystemAccess` object with whichever of the four arrays you need.
2. Omitted arrays use the [new-mode defaults](#defaults); set `"allowWrite": []` explicitly if you want every write to prompt.
3. Lockdown refuses to start if `fileSystemAccess` appears alongside `fileAccess` or `protectedPatterns`, and names the conflicting keys.

In legacy mode, `/lockdown:session-permissions` keeps its original editor and toggles the `fileAccess` slots (and custom-tool levels) for the session.

## Pi package lookups

Read-only lookups (`read`, `grep`, `find`, and `ls`) inside Pi's installed package directory are always allowed, even when those paths are external or match a protected pattern such as `**/node_modules/**`. This covers Pi's `README.md`, `docs/`, `examples/`, `src/`, and `dist/` as well as the package's bundled dependencies, and lets a search be rooted at the package directory itself. The exception uses Pi's installed package path, not an arbitrary directory named `docs`. Paths outside the package (including through symlinks) are not exempt. Edits, writes, and custom tools still follow the normal permissions.

## Subagent Profile

Subagent processes (spawned `pi` processes running in headless `--mode json`) read a **separate** permission set under `lockdownSubagent`, same shape and mode rules as `lockdown`. This lets you grant/deny subagents a different set of permissions than the main agent.

A process is treated as a subagent when it was started with the `--lockdown-subagent` flag or the `PI_LOCKDOWN_SUBAGENT=1` environment variable. The main agent never sets either, so it always uses `lockdown`.

Resolution order for a **subagent** process: (1) project `lockdownSubagent`, (2) global `lockdownSubagent`, (3) project `lockdown`, (4) global `lockdown`, then (5) defaults. If no `lockdownSubagent` key exists anywhere, subagents fall back to `lockdown`. Each selected block picks its own mode; project and global blocks are never merged.

```json
{
  "lockdown": {
    "fileSystemAccess": {
      "allowWrite": ["."],
      "denyWrite": [".env", ":external"]
    }
  },
  "lockdownSubagent": {
    "customTools": {},
    "defaultTools": ["read", "grep", "find", "ls"],
    "fileSystemAccess": {
      "allowRead": ["."],
      "allowWrite": [],
      "denyWrite": ["*"]
    }
  }
}
```

**Spawner contract:** when a future subagent extension spawns child `pi` processes, it must add `--lockdown-subagent` to the child's arguments — and **only** for subagent processes, never for the main agent. Example:

```ts
const args: string[] = ['--mode', 'json', '-p', '--no-session']
args.push('--lockdown-subagent') // always, for every spawned subagent
```

Requires pi-lockdown to be installed globally (`~/.pi/agent/extensions` or via a pi package) so it loads inside the spawned processes.

## Headless behavior

In interactive sessions a prompt shows a Yes/No confirmation; picking **Yes** allows that single call only, and nothing is persisted. In headless sessions (no UI, e.g. subagents in `--mode json`) the confirmation cannot be shown, so any prompt outcome fails closed and blocks.
