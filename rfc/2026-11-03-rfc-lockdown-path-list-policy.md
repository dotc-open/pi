# Lockdown: Path-List Read/Write Policy

## Problem Context

Lockdown currently classifies each tool call using a 16-slot `fileAccess` matrix and `protectedPatterns`. That model cannot grant unattended writes to `e2e/` without also changing broad read permissions. It is difficult for a solo developer to adjust and for a team lead to review as a committed `.pi/settings.json` policy. Agents regenerating snapshots and fixtures therefore either prompt too often or receive unnecessarily broad permissions. The [PRD](../prd/2026-11-03-lockdown-sandbox-config-prd.md) defines a four-list alternative and requires existing configurations to keep working.

## Goals

- Allow independently scoped reads and writes, including an `e2e/` write allowlist, without granting unrelated file access.
- Make unmatched access prompt, denied writes block without prompting, and denied reads prompt rather than hard-block.
- Give new-mode users safe per-array defaults while preserving legacy behavior for configurations that do not opt in.
- Keep the existing tool interception, session configuration, subagent, and headless fail-closed behavior.

## Requirements

### Functional requirements

- Support `denyRead`, `allowRead`, `allowWrite`, and `denyWrite` arrays under `fileAccess` in `lockdown` and `lockdownSubagent`; omitted arrays receive independent defaults and explicit `[]` disables each default.
- Select new mode when `fileAccess` holds any of the new array keys, including `[]`, or is an empty object. Reject configurations mixing path lists with the legacy `fileAccess` matrix (`external`/`internal`) or `protectedPatterns`, naming the conflicting keys. Without path lists, retain the existing matrix and protected-pattern logic unchanged.
- Resolve entries relative to the project cwd; expand `~`; support directory prefixes, file paths, segment-scoped globs, `.` (project), `:external` (outside project), and a standalone `*` (all paths). Do not introduce `:internal`.
- Choose the most-specific matching rule separately for reads and writes: exact file > glob (more literal characters wins) > directory (longer path wins) > region-wide token; deny wins an exact tie. `allowWrite` also contributes to read allows, but `allowRead` does not grant writes.
- Winning write deny: hard block. Winning read deny: one-shot Yes/No prompt. Winning allow: proceed. No match: one-shot prompt. Without a UI, prompt outcomes block.
- Route `read`, `grep`, `find`, and `ls` to the read policy and both `edit` and `write` to the write policy. Preserve custom-tool permissions, configured active tools, unconditional bash blocking, empty-write blocking, and Pi-installation read exemptions.
- Let `/lockdown:session-permissions` add and remove entries in all four new-mode lists without writing settings; `/lockdown:reset` reloads the selected settings/defaults. Keep the legacy session editor in legacy mode.
- Give a blocked file call a reason containing its path and the winning deny rule; document new and legacy modes, defaults, tokens, matching and precedence in the README.

### Non-functional requirements

- Preserve current project/global and subagent-profile selection: one chosen settings block, no merging between sources or profiles. Invalid selected configuration shuts down rather than silently falling back.
- Evaluate paths consistently for all built-in file tools; normalize `.`/`..` and path separators before matching, without treating a sibling prefix as inside the project. Do not let symlinks or non-existent write targets bypass a denied region where the target can be resolved through an existing parent.
- Keep tool-call decisions deterministic and cheap enough to run for every call; avoid a new dependency if the existing Node path APIs suffice.
- Cover mode selection, default/empty-array behavior, specificity and ties, path boundaries and symlinks, headless prompts, reset/session changes, and legacy regressions with tests.

## Options

### Option 1: Parallel path-list policy and legacy matrix

- Extend the Zod settings schema so `fileAccess` may be either the legacy matrix or the four defaulted path arrays. Check the raw inner keys **before** applying defaults, because defaults would otherwise make every config appear to opt in. Validate mixed keys as a hard error in the selected `lockdown` or `lockdownSubagent` block. Keep legacy parsing and defaults as a separate branch; do not translate legacy levels or merge policies.
- Add a single path-policy evaluator for both read and write. Normalize a tool path against `ctx.cwd` (including Pi's supported `@` path prefix), expand `~` in rules, and classify `:external` with the existing `isInside` semantics. For write targets that do not yet exist, resolve the nearest existing ancestor for symlink checks. Treat explicit trailing-slash entries as directory prefixes, and existing directories (including `.` and `~/.config`) as prefixes; use file-exact matching otherwise. Non-existent intended directories must be written with a trailing slash. Make directory prefix matching path-segment aware.
- Compile glob entries against the cwd and match normalized paths, with `*` confined to one path segment except for the standalone all-path token; check Node's actual `path.matchesGlob` behavior for root-level `**/` matches and absolute paths in tests. Count literal (non-metacharacter) characters to rank globs, with deny on ties. Use the same ranking for both actions; add `allowWrite` entries to the read candidates. An unmatched read/write prompts, and a winning read deny also prompts. A write deny blocks immediately with the path and matched rule in the reason.
- Defaults for new mode (only when each field is absent):

  ```jsonc
  {
    "fileAccess": {
      "denyRead": ["**/.env*"],
      "allowRead": [".", "./**/.env.development"],
      "allowWrite": [],
      "denyWrite": ["**/.env*", "**/.git/**", "**/node_modules/**", ":external"],
    },
  }
  ```

  These defaults intentionally change protected internal writes from prompt to block and protected external reads from block to prompt **only in new mode**. `denyRead` does not create a hard block. `allowWrite: ["e2e/"]` allows writes there while other unlisted writes prompt; `denyWrite: ["*"]` together with that allow makes other writes hard-blocked. Warn when an allow list contains standalone `*`, since it eliminates prompts for that action.

- Dispatch file tools to the new evaluator only in new mode. Leave bash, custom tools, empty-write prevention, Pi package read exception, session-start loading, profile selection and one-shot prompt mechanics in the existing path. Keep a legacy SettingsList editor; provide a new-mode session list editor capable of adding/removing paths, validating entries with the same rule parser, and updating only in-memory arrays. Reset reconstructs the selected configuration.
- Update the README with the mode switch, examples, default arrays, soft read denials, specificity, the distinction between `*` and `:external`, and the deliberate departure from pi-sandbox's read/write precedence.

### Option 2: Translate legacy settings into path lists and run one engine

- Convert the matrix and protected patterns at settings load, then process all file operations with one path matcher. This reduces dispatch branches but cannot preserve the full 16-slot semantics: legacy distinguishes `write`, `edit`, and `other`, and can hard-block reads, while the new policy combines edit/write and never hard-blocks reads. Emulating those differences inside the new evaluator would recreate a second policy engine in disguise and risk silently changing existing policies.

### Option 3: Layer path lists on top of legacy permissions

- Keep the matrix as a fallback whenever a path-list decision is unmatched. This might reduce prompts when migrating, but a reviewer would have to reason about two interacting precedence systems. It also makes `denyWrite: ["*"]` and explicit `[]` harder to explain, and conflicts with the PRD's hard error for mixed keys.

## Proposed Solution

Choose **Option 1**. It satisfies the independent read/write scope, safe defaults, one-shot prompts and migration requirements without weakening existing configurations. The cost is maintaining two explicit policy branches and two session-editor presentations; that is preferable to a lossy migration or an implicit layered policy. Scope implementation to settings validation, path evaluation, built-in tool dispatch, the session editor, README and focused tests. The repo's own `.pi/settings.json` must migrate the `lockdownSubagent` block alongside `lockdown`, using the profile's own arrays (reads inside the project; no writes; `:external` and secret globs denied); a profile left with only `fileAccess`/`protectedPatterns` keeps running the legacy engine. Do not add persistent prompt grants, an extra `:internal` token, or project/global config merging.

The primary security risk is inconsistent path resolution across file tools (notably symlinks and not-yet-created files). Verification must exercise those cases and confirm that headless prompts fail closed before rollout. After implementation, reload Pi and exercise direct `read`, `write` and `edit` calls plus the session editor and reset in an interactive session; a committed new-mode policy should be reviewed as a change in security semantics, not an automatic migration from legacy defaults.
