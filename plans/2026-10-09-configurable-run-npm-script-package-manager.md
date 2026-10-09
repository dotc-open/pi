# Configurable package manager for `run_npm_script` (draft)

## Context

`packages/pi-core/src/extensions/run-npm-script.ts` currently authorizes exact strings from `runNpmScript.validScripts` and always invokes `pnpm`. Support `npm` while retaining existing multi-token allowlist entries and pnpm behavior; document the manager setting and invocation forms in the package README. A prior completed plan, `plans/2026-10-09-configurable-run-npm-scripts.md`, covers the allowlist, not this option.

## Approach

- Keep exact-match authorization, existing multi-token allowlist validation and tokenization, shell-free spawning, and error/abort handling intact.
- Add `runNpmScript.packageManager` as a sibling of the existing `validScripts` array. Validate it as exactly `"npm"` or `"pnpm"` during session startup; invalid configuration must not register the tool. When omitted, default to `pnpm` for backward compatibility.
- Retain the existing exact-string allowlist and whitespace tokenization: the caller supplies the exact configured string, which maps to an argv array. Invoke `spawn('pnpm', argv, ...)` for pnpm or `spawn('npm', ['run', ...argv], ...)` for npm, with `shell: false`. No extra argument handling or automatic `--` separator. Note that configured pnpm-specific options such as `--filter` are not automatically translated into npm syntax; entries must be appropriate for the selected manager.

## Files to modify

- `packages/pi-core/src/extensions/run-npm-script.ts`
- `packages/pi-core/README.md`
- No change to `.pi/settings.json` is needed for the compatibility default; optional example only if the project itself should opt into npm.

## Reuse

- The existing `pi.getSettings()` lookup, settings validation, exact-match allowlist map and whitespace-tokenized argv storage, `spawn` with `shell: false`, and result/error/abort handling in `packages/pi-core/src/extensions/run-npm-script.ts`.

## Steps

After **EACH STEP**, run repository-level `pnpm lint:fix`, `pnpm format:fix`, and `pnpm check-types`, review any generated changes, then commit changes, including any changes to this plan file (e.g., marking steps done).

- [x] Confirm the sibling setting, `pnpm` fallback, and retained multi-token allowlist contract: invoke `spawn('pnpm', argv, ...)` or `spawn('npm', ['run', ...argv], ...)`.
- [x] Implement strict manager validation and manager-specific spawning; retain existing multi-token validation and exact-match authorization, and update tool descriptions.
- [x] Update the package README with supported values, default, examples of both single- and multi-token entries, and the npm/pnpm invocation forms; note that pnpm-specific allowlist entries need manager-appropriate configuration for npm.
- [ ] Verify both managers end to end, including denial/error/abort behavior.

## Verification

- Run repository-level quality checks: `pnpm lint:fix`, `pnpm format:fix`, and `pnpm check-types`; review generated changes. There is currently no working automated test script; consider a focused regression test if feasible.
- Test the allowlisted `build` script and both configured `--filter` entries from `.pi/settings.json` via `run_npm_script` after reloading Pi with the default pnpm manager; record each result (the second filtered entry has no explicit script name). Do not expect pnpm's `--filter` entries to work unchanged in npm mode; test npm using a manager-compatible allowlisted entry such as `build`.
- Check missing/invalid manager settings, pnpm single- and multi-token behavior (including filtered entries), npm single- and multi-token argv forwarding (`build` → `npm run build`; e.g. `build --watch` → `npm run build --watch`), exact-match rejection of unlisted scripts, and failure/abort handling.
- **Pause and hand control to the user to reload Pi after implementation** so the changed extension/tool is available; then invoke `run_npm_script` directly in the reloaded session for the configured build script(s), npm and pnpm cases (as well as an unlisted script). Confirm the installed extension path and active project settings before the live check.

Scouts found no `docs/index.md` in this checkout; no additional contribution guideline could be selected.
