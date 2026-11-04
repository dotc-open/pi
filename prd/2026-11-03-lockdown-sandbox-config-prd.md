# Lockdown: Path-List Read/Write Policy

Date: 2026-11-03

## Problem Statement

The DOTC team runs agents through Pi in every repo, and Lockdown is the extension that constrains those agents' file access — for a solo developer day-to-day and for the team lead who commits a shared policy that the rest of the team inherits. Today that policy is configured through a 16-slot matrix (`fileAccess.{internal,external}.{protected,unprotected}.{read,write,edit,other}`) plus `protectedPatterns`. The matrix is hard to reason about, and it **couples reads and writes**: there is no way to say "let this agent write anything under `e2e/`, but keep everything else controlled" without also widening its reads. The gap must be filled now because a concrete workflow — running an agent that regenerates snapshots and fixtures under `e2e/` — cannot be expressed at all with the current model, so the agent is either over-permissioned or unusably prompty.

## Proposed Solution

### Concept

Add a path-list based read/write policy to Lockdown — four arrays (`denyRead`, `allowRead`, `allowWrite`, `denyWrite`) modelled on `pi-sandbox` — as a new configuration mode, replacing `protectedPatterns`. The existing `fileAccess` matrix keeps working unchanged for configs that don't adopt the new keys.

### Key Components

**1. Four arrays replace `protectedPatterns`**

```jsonc
"lockdown": {
  // For READS:
  // - ANY read is prompted unless the path is in allowRead or allowWrite
  // - denyRead is not a hard-block; it just marks regions as denied by default
  "denyRead": ["/Users", "/home"],
  "allowRead": [".", "~/.config", "~/.local", "Library"],

  // For WRITES:
  // - allowWrite also grants read access to the same paths
  // - empty ALLOW means every write is prompted
  // - DENY takes precedence and is never prompted
  "allowWrite": ["."],
  "denyWrite": [".env", ".env.*", "*.pem", "*.key", ":external"]
}
```

This solves the read/write coupling in the problem statement: writes are governed solely by `allowWrite`/`denyWrite`, independently of reads.

**2. Tokens**

- `"."` = the project (the internal region; same as today's `internal`).
- `":external"` = any path outside the project.
- `"*"` = **every** path. An entry that is exactly `"*"` is a documented special-case (distinct from the segment-scoped `*` inside a glob). It is the least-specific rule, so `denyWrite: ["*"]` blocks every write not covered by a more specific `allowWrite` — with no `allowWrite` entry the project is read-only, and `denyWrite: ["*"]` + `allowWrite: ["e2e/"]` makes `e2e/` the only writable location. `*` is intended for deny lists; it is accepted in an `allow*` list but warned about, because it removes all prompts.
- `:internal` is **not** provided, because `"."` already means the project.

**3. Matching**

- Entries resolve against the project cwd; `~` expands to the home directory.
- A directory entry (`.`, `e2e/`, `~/.config`) matches by prefix — itself and everything under it.
- Entries containing glob metacharacters (`.env.*`, `*.pem`, `**/.env*`) match as globs. As with pi-sandbox, `*` is segment-scoped (`*.pem` does not match `dir/a.pem`; use `**/*.pem` for that). The standalone entry `"*"` is the exception: it means every path (see Tokens).
- Path classification for `:external` reuses the existing `isInside` semantics.

**4. Precedence — most-specific match wins, for both reads and writes**

| Group | Winning deny                | Winning allow | No match |
| ----- | --------------------------- | ------------- | -------- |
| Write | hard block (never prompted) | allow         | prompt   |
| Read  | prompt                      | allow         | prompt   |

- Matching is resolved by **specificity**, identically for reads and writes. The only difference is the _outcome_ of a winning deny: a denied write is hard-blocked, a denied read prompts (reads never hard-block).
- Specificity order, most to least: (1) an exact path to a file; (2) a glob, ranked by how many literal characters it contains (`./**/.env.development` beats `**/.env*`); (3) a directory prefix, ranked by resolved path length; (4) `:external` and `*` are region-wide and least specific.
- On an exact tie, deny wins.
- Because `*` is least specific, `denyWrite: ["*"]` with no `allowWrite` entry makes the project read-only, while `denyWrite: ["*"]` + `allowWrite: ["e2e/"]` makes `e2e/` the _only_ writable location — a write allowlist.
- `allowWrite` also grants read access to the same paths, so write paths need not be repeated in `allowRead`.
- Unlike pi-sandbox, a deny is **not** an unbreakable absolute: a more specific allow can carve a hole in it. This is acceptable because Lockdown configs are not layered — project and global are not merged, so only the config actually running can open a hole. It also enables the write-allowlist case above.

This replaces pi-sandbox's opposite read/write precedence with a single rule. Call this out in the README, since it deliberately differs from pi-sandbox.

**5. Sensible defaults (per-array)**

Each array has a built-in default that applies only when the user omits it; an explicit `[]` disables it.

```jsonc
"denyRead":   ["**/.env*"],
"allowRead":  [".", "./**/.env.development"],
"allowWrite": [],
"denyWrite":  ["**/.env*", "**/.git/**", "**/node_modules/**", ":external"]
```

Mapping to legacy defaults:

| Legacy default                       | New default                                                                                                                             |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `internal/unprotected.read = allow`  | `allowRead: ["."]`                                                                                                                      |
| `internal/protected.read = warn`     | `denyRead: ["**/.env*"]` → secret reads prompt; `"./**/.env.development"` explicitly allowed; other protected reads allowed via `["."]` |
| `external/unprotected.read = warn`   | prompt (unmatched)                                                                                                                      |
| `external/protected.read = block`    | **prompt** — the new read model has no hard block                                                                                       |
| `internal/unprotected.write = warn`  | `allowWrite: []` → prompt                                                                                                               |
| `internal/protected.write = warn`    | **hard block** via `denyWrite` protected globs (deviation: warn → block)                                                                |
| `external/unprotected.write = block` | `denyWrite: [":external"]`                                                                                                              |
| `external/protected.write = block`   | `denyWrite: [":external", <protected globs>]`                                                                                           |

**6. Backward compatibility — mode switch**

- If any of `denyRead` / `allowRead` / `allowWrite` / `denyWrite` is present, the **new engine** runs.
- Otherwise the existing `fileAccess` matrix + `protectedPatterns` runs **exactly as today** (legacy engine).
- Mixing new keys with legacy `fileAccess` / `protectedPatterns` is a **hard config error** that names the offending keys, rather than silently picking one model.

**7. Prompts stay one-shot**

- The `warn` outcome keeps the existing Yes/No confirmation and does **not** persist anything. Saying Yes allows that single call only; there are no "allow for session/project/global" grants and no in-memory allowlist mutation from prompts.

**8. Session commands**

- `/lockdown:session-permissions` is reworked for the new mode: it lets the user add/remove paths in the four arrays for the current session.
- `/lockdown:reset` re-reads `settings.json` / defaults, discarding session edits.
- Project or global policy changes are made by editing `settings.json` (the team lead's committed-policy workflow), not from a prompt.

**9. Retained behaviour**

- `customTools` and `defaultTools` remain as they are, in both the `lockdown` and `lockdownSubagent` blocks.
- `bash` remains blocked outright.
- The `session_start` / settings-load flow and shutdown-on-invalid-config behaviour are unchanged.
- The `lockdownSubagent` profile keeps its stricter `customTools`/`defaultTools`, but its **file-access policy uses the same mode switch as `lockdown`**: once any of the four path-list keys is present it runs the new engine with its own arrays/defaults, and only a block with none of them falls back to the legacy matrix. The profile's mode is selected independently — a new-mode `lockdown` block does not migrate a legacy `lockdownSubagent` block.

**10. Documentation**

- The README gets the new-mode reference: the four arrays, the `"."`, `":external"` and `"*"` tokens, matching rules, the most-specific-wins precedence (and how it differs from pi-sandbox), defaults, and the legacy-vs-new mode switch.

### Alternatives Considered

- **Internal/external as two scoped rule sets (8 lists).** Preserves the current mental model exactly, but doubles the config surface, reintroduces the nesting we are trying to remove, and still needs `allowWrite` under `internal` for the `e2e/` case. Rejected.
- **An explicit `:internal` token.** Redundant with `"."`. Rejected; only `:external` is reserved.
- **`:external` instead of `*`.** `*` expresses "block everything" (a read-only project); `:external` expresses "block only outside the project". They solve different cases, so both are kept rather than choosing one.
- **Keep pi-sandbox's opposite precedence (writes deny-first, reads allow-first).** Rejected. It needs a special-case soft `denyRead` _and_ cannot express "deny `**/.env*`, allow `.env.development`" without session grants (which we removed). One most-specific-wins rule is easier to explain and unlocks write-allowlists (`denyWrite: ["*"]` + `allowWrite: ["e2e/"]`).
- **Translate legacy → new at load and run one engine.** Cleaner internals, but lossy: the legacy `allow`/`warn`/`block` slot levels do not map cleanly onto the new `allow`/`prompt`/`block` model (e.g. `external.protected.write: block` vs the new model's soft `denyRead`). Rejected in favour of the mode switch.
- **Layer legacy as a fallback under new rules.** Most flexible, hardest to explain, and easy to reason about incorrectly. Rejected.

## User Stories

**Solo dev**

1. As a solo dev, I want to grant an agent unrestricted writes to a specific subdirectory for the session, so that automated workflows (e.g. `e2e/` regenerating snapshots) run without me approving every file change.
2. As a solo dev, I want reads/writes that aren't in any allowlist to prompt me, so that anything undeclared stays under my control.
3. As a solo dev, I want reads of my project auto-allowed, so that the common case isn't a wall of prompts.
4. As a solo dev, I want secrets (`**/.env*`, `*.pem`, `*.key`) hard-blocked from writes, so that I can't leak credentials by accident.

**Team lead**

5. As a team lead, I want to commit one `lockdown` policy in the repo's `.pi/settings.json`, so that the whole team inherits a safe-by-default policy without hand-holding.
6. As a team lead, I want sensible built-in defaults, so that the committed policy stays short and reviewable in a PR.
7. As a team lead, I want external writes hard-blocked (`:external`) and secrets denied, so that a committed policy meaningfully contains agents.

**Existing user / migration**

8. As an existing Lockdown user, I want my current `fileAccess`/`protectedPatterns` config to keep working unchanged, so that upgrading doesn't break me.
9. As an existing Lockdown user, I want a clear error if I mix legacy and new keys, so that I know which model is active.
10. As an existing Lockdown user, I want the `lockdownSubagent` profile to use the same path-list model as `lockdown`, so that subagents inherit the new policy instead of a stale legacy matrix.

**Agent (secondary)**

11. As an agent, I want an explicit block reason naming the path and rule, so that the user and I understand why a call was denied.

## User Flows

### User Flow 1: Scoped write access for a session workflow (solo dev, config-driven)

1. Dev adds `"lockdown": { "allowWrite": ["e2e/"] }` to `.pi/settings.json`.
2. Dev reloads the Pi session; Lockdown sees the new keys and selects the new engine.
3. Agent writes `e2e/snapshot.spec.ts` → matches `allowWrite` → allowed.
4. Agent writes `src/index.ts` → matches neither `allowWrite` nor `denyWrite` → Yes/No prompt.
5. Dev picks **No** → the call is blocked for this attempt only. Picking **Yes** allows it once, with no persistence.
6. Agent writes `.env` → matches `denyWrite` → hard block, no prompt.

### User Flow 2: Prompted read of an unlisted path

1. Agent reads `~/.ssh/config` → not in `allowRead`/`allowWrite` → Yes/No prompt.
2. **Yes** allows that call only. The next read of the same path prompts again (prompt results are not persisted).

### User Flow 3: Team lead commits a shared policy

1. Team lead adds the `lockdown` block to the repo's `.pi/settings.json`, often relying on the built-in defaults.
2. Team lead opens a PR; a reviewer reads the JSON.
3. Teammate pulls the branch and grants project trust.
4. Pi loads the committed policy for the session. Ad-hoc tweaks via `/lockdown:session-permissions` never persist.

### User Flow 4: Session tweak without editing config

1. Dev runs `/lockdown:session-permissions`.
2. The dialog lists the four arrays.
3. Dev adds `e2e/` to `allowWrite` (session only) → changes apply immediately.
4. Dev runs `/lockdown:reset` → rules are restored from `settings.json` / defaults.

### User Flow 5: Legacy config upgrade

1. Existing user updates the package.
2. Their config contains only legacy `fileAccess`/`protectedPatterns` keys → the legacy engine runs → behaviour is unchanged.
3. If they add a new key alongside legacy keys, Lockdown raises a hard error naming both, instead of silently choosing one.

### User Flow 6: Team lead hard-blocks external writes / secrets

1. The built-in defaults already carry `:external` and the secret globs in `denyWrite`, so no config is needed.
2. With a committed per-repo policy, an agent tries to edit `/etc/hosts` → matches `:external` → hard block with an explicit reason, no prompt.
