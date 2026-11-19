# Lockdown: custom-tools page in the new-mode session permissions menu

## Context

`/lockdown:session-permissions` in **new mode** opens a two-screen flow (`configureNewModeSession`, `packages/pi-lockdown/src/session-editor.ts:352`): a chooser over the four path lists, then a list editor for the chosen list. The legacy mode editor still has a tool-permission surface (`constructSettingsList` returns `fileAccess` slots **and** `customTools` rows, `packages/pi-lockdown/src/utils.ts:181`), so switching a session to new mode silently lost the ability to change tool levels for the session.

This plan adds a fifth row to the new-mode chooser — `customTools` — opening a page that edits session tool levels: cycle `allow` / `warn` / `block`, delete a tool, and add a new one by typing its name.

## Approach

Add `customTools` as a first-class row of the existing chooser and write one new component that mirrors the existing entry editor, because the TUI's `SettingsList` cannot add or remove items (its API is `updateValue`, `selectItem`, `values` cycling, `submenu`, `onChange(id, value)`, `onCancel`, `enableSearch` — `@earendil-works/pi-tui/dist/components/settings-list.d.ts:29`).

1. **Chooser** (`createListChooser`, `session-editor.ts:36`): iterate a new `SESSION_ROW_IDS` array — the four `PATH_POLICY_KEYS` followed by `'customTools'` — and widen `done` to `(key: SessionRowId | undefined)`. Append the new row **last** so existing navigation tests keep passing. The `customTools` row shows `customTools (N)` plus a dim inline summary of `name=level` pairs, matching how path rows show their entries today. Extend the `↑↓ choose • Enter edit • Esc close` hint if needed.
2. **New `createToolLevelEditor(entries, knownTools, theme, host, done)`** in `session-editor.ts`, following `createListEditor` (`session-editor.ts:112`) closely: a windowed row list plus a trailing free-text row. `entries` is the current `Object.entries(settings.customTools)`; `done` receives the whole new map, or `undefined` on cancel.
   - Rows render `name` and the current level inline; the selected row is `accent`.
   - **Space** cycles the selected row's level `allow → warn → block → allow` (forward-only, like `SettingsList` cycles `values`). Enter on a row does the same, so the page works without a space bar.
   - **Del / Backspace** flags the selected row for deletion: strikethrough plus a ` [delete]` marker, toggling on repeat presses, exactly like the entry editor. Nothing is removed until save.
   - The trailing input row takes a tool name; **Enter** adds it at level `warn` (the documented default: `customTools[toolName] ?? 'warn'`, `index.ts:178`) and keeps the row for another add. Duplicate names are rejected with an inline error instead of added twice.
   - **Tab** completes the typed name from `knownTools` (a local prefix filter, not `CombinedAutocompleteProvider`, which is filesystem-based). Suggested names come from `pi.getAllTools()` (`ExtensionAPI.getAllTools(): ToolInfo[]`, pi-coding-agent `dist/core/extensions/types.d.ts:1307`) minus the names already configured.
   - **Enter with an empty input** saves and returns the new map. **Esc cancels** at any point (with or without typed text) and returns `undefined`, matching the entry editor.
   - Name validation: trimmed, non-empty, `^[A-Za-z0-9_-]+$` (existing tool names are `current_date`, `run_npm_script`, `shadcn_search`, `nest_generate`, `subagent`). Inline error line, same pattern as the entry editor's `PathEntrySchema` rejection (`session-editor.ts:183`).
3. **`configureNewModeSession`** (`session-editor.ts:352`): when the chooser returns `'customTools'`, open the new editor; on `undefined` return to the chooser, on a map replace `settings.customTools` (dropping flagged rows) and **close the command**, like a path-list save. Notifications are derived by diffing old against new and reuse the existing copy style: `Added "x" to customTools at warn.`, `Removed "x" from customTools.`, `Set "x" to allow in customTools.`
4. **Active tools**: the active set is computed at `session_start` as `defaultTools ∪ Object.keys(customTools)` (`index.ts:101`), so a tool added mid-session would otherwise be uncallable until reload. Extract that union as one small helper used by both `session_start` and the command, and re-apply `pi.setActiveTools(union)` once the command returns, so adds and deletes take effect immediately.

Page copy, consistent with the entry editor: header `[LOCKDOWN] customTools`, hint `dim: Space cycles allow/warn/block • Del flags • Enter add • Esc cancel` and `Enter save` when the input row is empty, plus a body hint that file tools use the path lists instead.

## Files to modify

- `packages/pi-lockdown/src/session-editor.ts` — `SESSION_ROW_IDS` + `SessionRowId`, chooser row rendering/widening of `done`, new `createToolLevelEditor`, `configureNewModeSession` branch and notifications.
- `packages/pi-lockdown/src/index.ts` — command handler passes `pi.getAllTools()` names into `configureNewModeSession` and re-applies the active tools after it returns; extract the `defaultTools ∪ customTools` union as a helper shared with `session_start`.
- `packages/pi-lockdown/src/schema.ts` — reuse only (`LockdownLevel`, `LockdownLevelSchema`, `lockdownLevelOptions`); no schema change expected, since `customTools` is already `z.record(z.string(), LockdownLevelSchema)` (`schema.ts:15`).
- `packages/pi-lockdown/src/__tests__/session-commands.test.ts` — chooser row, component unit tests, command-level end-to-end through `tool_call`.
- `packages/pi-lockdown/README.md` — new-mode session commands section.
- `packages/pi-lockdown/docs/permission-flow.md` — one line that session tool levels are edited from the same menu.

## Reuse

- `applyListEdits` (`session-editor.ts:21`) — merge helper for add/remove arrays; the level page can reuse the same removal-then-addition discipline, or return a whole map.
- `createListEditor` (`session-editor.ts:112`) — the structure to mirror: `rows` + trailing `Input`, `MAX_VISIBLE_ROWS` windowing, `cached` lines with `host.requestRender()` refresh, suggestion block rendering, hint line that switches on `input.getValue()`.
- `lockdownLevelOptions`, `LockdownLevelSchema`, `LockdownLevel` (`schema.ts:3`) — the value domain and the parser for the cycle.
- `PATH_POLICY_KEYS`, `PathPolicyKey` (`schema.ts:52`) — the existing row ids.
- Existing notification strings and test harness: `createCustomDriver` / `nextComponent` (`__tests__/session-commands.test.ts:71`, `:59`) already drive multi-screen flows by component index, so new screens plug straight in.
- `pi.getAllTools()` — real tool names for completion; `pi.setActiveTools()` — refresh the active set.

## Steps

After **each step**, run code quality checks (`lint:fix`, `format:fix`, `check-types`) via the `code-quality-checker` subagent and commit, including plan-file updates marking steps done.

- [x] Chooser: add the `customTools` row (with level summary) as the last entry, widen `done` to `SessionRowId`, keep the four path rows working.
- [x] `createToolLevelEditor`: level cycling, flagged deletion, trailing-name add with validation + known-name completion, save on empty Enter, cancel on Esc, windowing and hints.
- [x] Wire it into `configureNewModeSession` (cancel returns to the chooser, save closes the command) with diff-based notifications; pass known tool names from `index.ts` and re-apply active tools on return.
- [ ] Tests: chooser row and count, cycle/flag-delete/add/validation/duplicate, save and cancel semantics, active-tool refresh, end-to-end through `tool_call` (set a custom tool to `allow` → call allowed; set to `block` → blocked; delete → falls back to `warn`), plus `/lockdown:reset` restoring the configured levels.
- [ ] Docs: README session-commands section and the one-line note in `docs/permission-flow.md`.

## Verification

- `pnpm --filter @dotc/pi-lockdown test`.
- `pnpm build` before reloading (the extension loads from `dist/`).
- Interactive: reload, run `/lockdown:session-permissions`, confirm the fifth row; add a tool, cycle it to `allow`, call it and see it run; cycle to `block` and see it blocked; Del it and see it prompt again (`warn` fallback); press Esc mid-edit and confirm nothing is saved and the chooser returns; confirm a save closes the command; `/lockdown:reset` and confirm the configured levels return. Confirm `/lockdown:session-permissions` in **legacy** mode is unchanged.

## Decisions

1. **Esc cancels** on the tools page, exactly like the entry editor: nothing is applied and the chooser comes back.
2. **Del flags for deletion** (strikethrough + ` [delete]`), applied only on save.
3. **A save closes the command**, matching a path-list save.
4. **Active tools are re-applied on save** (`pi.setActiveTools(defaultTools ∪ customTools)`), so an added tool is callable immediately and a deleted one stops being active.
