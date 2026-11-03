# Add the `git-tools.tmp.ts` tools to `@dotc/pi-core` alongside the old ones

## Context

`git-tools.tmp.ts` (untracked, repo root) is a finished prototype that registers
three git tools:

- `git_inspect` — bounded read-only inspections: `log`, `show`, `status`,
  `diff`, `diff --cached`, `worktree list`, `branch`, `remote`; optional
  `ref` (show only) and literal `paths` (diff / diff --cached / show).
- `git_stage_unstage` — stage/unstage named repo-relative files, with path and
  tracked/staged-file validation.
- `git_commit` — commit **already-staged** files, validating a one-line
  Conventional Commit message.

`@dotc/pi-core` currently ships a different, overlapping set:

- `git-changes.ts` → `git_changes` (staged/unstaged/untracked diff view).
- `commit-changes.ts` → `commit_changes` (`git add .` + `git commit`).

Decision: add the three tmp tools to core **without removing the old tools**, so
existing users/config keep working. The new tools are the preferred ones, so the
old tools get a note steering agents to the new equivalents.

## Approach

- Add one extension file `packages/pi-core/src/extensions/git-tools.ts` holding
  the three new tools and their shared helpers, ported from `git-tools.tmp.ts`.
- Thread `ctx.cwd` explicitly into the helpers (tmp used a module-level `cwd`);
  drop `fileURLToPath` / `resolve`-relative root entirely.
- Drop the `ExtensionToolContext` dependency from the commit helper — it only
  needs `cwd` + `signal`.
- **Keep** `git-changes.ts` and `commit-changes.ts`. Add a `promptGuidelines`
  line (and a short `description` prefix) to each pointing at the preferred new
  tool: `git_changes` → `git_inspect`, `commit_changes` → `git_commit` (plus
  `git_stage_unstage` for staging).
- The new tools' `promptGuidelines` state they are the preferred tools for git
  inspection, staging/unstaging, and committing staged changes.
- The user will delete `git-tools.tmp.ts` afterwards.

No naming collisions: `git_inspect`, `git_stage_unstage`, `git_commit` are
distinct from the existing `git_changes`, `commit_changes`, `git_worktree_add`.

## Files to modify

| File                                                | Change                                                                                                                              |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `packages/pi-core/src/extensions/git-tools.ts`      | **New** — ported tmp tools                                                                                                          |
| `packages/pi-core/src/extensions/git-changes.ts`    | Keep; add note steering agents to `git_inspect`                                                                                     |
| `packages/pi-core/src/extensions/commit-changes.ts` | Keep; add note steering agents to `git_commit` / `git_stage_unstage`                                                                |
| `packages/pi-core/package.json`                     | `pi.extensions`: **add** `git-tools.js` (keep existing entries)                                                                     |
| `packages/pi-core/README.md`                        | Add tool sections for the three new tools; mark `git_changes`/`commit_changes` as legacy/superseded                                 |
| `.pi/settings.json`                                 | `lockdown.customTools` and `lockdownSubagent.customTools`: **add** `git_inspect`, `git_stage_unstage`, `git_commit` (keep existing) |
| `.pi/agents/scout.md`                               | `tools:` frontmatter: use `git_inspect` instead of `git_changes`                                                                    |

Not touched: `git-worktree.ts` (`git_worktree_add` is not in the tmp file),
`AGENTS.md` (no tool-name references).

## Reuse

- `checkPaths`, `stageFiles`, `commitStaged`, `inspect` from `git-tools.tmp.ts`
  — ported as-is apart from `cwd`.
- `DEFAULT_MAX_BYTES`, `DEFAULT_MAX_LINES`, `formatSize`, `truncateHead` from
  `@earendil-works/pi-coding-agent` (verified exported).
- `StringEnum` from `@earendil-works/pi-ai` (already used by `git-worktree.ts`).

## Steps

> After **EACH STEP**, run code quality checks via the `code-quality-checker`
> subagent (`lint:fix`, `format:fix`, `check-types`) and commit — including any
> edits to this plan file (e.g. ticking steps off).

- [x] Create `git-tools.ts` from `git-tools.tmp.ts`:
  - remove the module-level `cwd` + `fileURLToPath` import;
  - change `stageFiles(command, files, cwd, signal)`,
    `commitStaged(message, cwd, signal)`, `inspect(command, cwd, ref, paths, signal)`;
  - pass `ctx.cwd` from each `execute`;
  - drop the unused `ExtensionToolContext` import;
  - keep `checkPaths` local (not exported — no importers);
  - add `promptGuidelines` noting these are the preferred git tools.
- [x] Register the new file in `package.json` (add, don't remove) and add the
      steering note to `git-changes.ts` and `commit-changes.ts`.
- [x] Update `.pi/settings.json` (add new tools, keep old) and
      `.pi/agents/scout.md` (`git_changes`→`git_inspect`).
- [x] Extend `packages/pi-core/README.md`: new tool sections + legacy note on
      the old two.
- [ ] Final pass: `pnpm --filter @dotc/pi-core build` (or root `build`).

## Verification

- Pause and hand control back to the user to reload the session so the new
  extensions are live.
- Call each new tool directly in-session:
  - `git_inspect` — `status`, `log`, `diff` with paths, `show` with a ref,
    unsupported `ref` on `log` rejected, oversized output truncated.
  - `git_stage_unstage` — stage a modified file, unstage it; reject unknown
    paths, directories, and unstaged files for unstage.
  - `git_commit` — valid message with staged changes commits; invalid message
    rejected; nothing staged rejected; a repo hook rejection surfaces in the
    result (not thrown).
- Confirm the **old** tools still work unchanged (`git_changes`,
  `commit_changes`, `git_worktree_add`).
