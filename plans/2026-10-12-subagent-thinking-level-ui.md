# Show subagent thinking level in the UI

## Context

Subagent result lines show the model ID but not the thinking level. Add the child-reported Pi thinking level immediately after the model ID, for example `model-id high`.

## Approach

- Capture optional `thinkingLevel` from the child's completed assistant `message_end` JSON event in `SingleResult`. The tool-call value is optional and specifies a requested override, not necessarily the level used: agent defaults or child settings apply when omitted, and Pi may clamp a requested level to model capabilities. Child response metadata lets the UI report the level used alongside the response's model.
- Use the first assistant response's model/thinking metadata together, consistent with the existing first-response model summary. Do not substitute the parent's active level or the requested override: child settings and capability clamping may change the actual level.
- Keep `formatUsageStats` unchanged. Read the stored thinking level separately in the renderer and append it after the existing usage/model string wherever per-agent model IDs are currently shown: single results, chain steps, and expanded parallel results.
- Omit the suffix when the child does not provide thinking metadata. Leave aggregate parallel summaries unchanged.

## Files to modify

- `packages/pi-core/src/extensions/subagent.ts` — result metadata, child event parsing, and per-result renderer calls; leave `formatUsageStats` unchanged.

## Reuse

Existing `SingleResult`, assistant `message_end` parsing, `formatUsageStats`, and `renderResult` in `packages/pi-core/src/extensions/subagent.ts`. Completed assistant messages already expose optional Pi `thinkingLevel`; no extra CLI flags or settings resolution are needed.

## Steps

After **EACH STEP**, run code quality checks and commit changes, including updates to this plan.

- [ ] Capture child-reported thinking metadata alongside the summarized model, then append the level separately after the existing usage/model string in all per-agent UI lines without changing `formatUsageStats`.
- [ ] Run quality checks and prepare manual verification; pause for the user to reload the updated workspace extension, then verify directly in the session. Do not add an automated test harness.

## Verification

- Run `pnpm lint:fix`, `pnpm check-types`, and `pnpm format:fix`; review any fixes before committing.
- After reloading the updated extension, call `subagent` in single mode with an explicit `thinkingLevel`, then without an override; verify the UI shows the child-reported level after the model ID.
- Call parallel and chain modes with agents having different defaults; inspect per-agent result lines and verify a shared tool override is reflected. Include `{previous}` in the chain to check continuation remains intact.
- Check that missing thinking metadata leaves the existing model display intact and aggregate summaries remain unchanged.
- Confirm displayed metadata comes from the child response, including any capability clamping, rather than assuming the requested value was used.
