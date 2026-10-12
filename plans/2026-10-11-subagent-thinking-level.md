# Configure subagent thinking level

## Context

Allow callers to choose a subagent's thinking level through the `subagent` tool or an agent Markdown definition. Resolution per dispatched agent: tool-call value → agent definition → the selected model's `modelThinkingLevels` entry in child Pi settings → global `defaultThinkingLevel` → built-in `medium`. Do not inherit the parent's active thinking level.

## Approach

- Add optional `thinkingLevel` to the top-level tool schema and agent Markdown frontmatter; restrict values to `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max`. Validate definition values when loading agents, rather than silently falling back on malformed configuration.
- Resolve each invocation as: top-level tool `thinkingLevel` (shared by all tasks) → that agent's definition `thinkingLevel` → the selected model's startup thinking level from child Pi settings. Never use the parent's active `ctx.thinkingLevel` as the fallback, even if the child inherits the parent model. Pass tool/agent overrides via CLI `--thinking`; when absent, omit the flag so child Pi uses its per-model setting, then global default, then built-in `medium`. Pi may clamp levels to model capabilities.
- Do not add per-task or per-chain-step thinking parameters; parallel/chain agents may have different definition defaults unless overridden by the shared tool-call level. Preserve existing dispatch behavior.

## Files to modify

- `packages/pi-core/src/extensions/subagent.ts` — types/schema, agent loading, dispatch, CLI arguments, and descriptions.
- `packages/pi-core/README.md` — usage examples and precedence.
- `.pi/agents/scout.md` — optional example documentation only; do not change its current thinking behavior by adding a default.
- Add focused regression tests if a practical test harness is available.

## Reuse

- `discoverAgents()` / `loadAgentsFromDir()` parse and resolve agents in `packages/pi-core/src/extensions/subagent.ts`.
- `runSingleAgent()` centralizes child CLI arguments for every mode; `ctx.model` still supplies the child model when an agent has no explicit model. Remove current `ctx.thinkingLevel` inheritance; omitting `--thinking` lets the child resolve its selected model's startup level.
- Pi CLI `--thinking` and startup settings (`modelThinkingLevels` and `defaultThinkingLevel`) provide validated levels and model-specific defaults.

## Steps

After **EACH STEP**, run code quality checks and commit changes, including any changes to this plan file (such as marking steps complete).

- [ ] Add validated agent-definition `thinkingLevel` and optional top-level tool-call `thinkingLevel` (no per-task fields); document values and resolution in help text/examples.
- [ ] Route effective thinking into the shared child invocation: tool → agent; otherwise omit the flag for child settings fallback for both inherited and explicit models.
- [ ] Add focused regression coverage for precedence and single/parallel/chain dispatch; update docs.

## Verification

- Run repository quality checks (`pnpm lint`, `pnpm check-types`, `pnpm build`, `pnpm format`) and any new tests.
- Verify tool override > agent definition in single, parallel, and chain modes. With both omitted, confirm neither inherited-model nor explicitly modeled agents receive `--thinking` and each resolves the selected model's startup settings (per-model entry, global default when no entry exists, and built-in `medium` when neither is configured); verify a changed parent active thinking level does not leak through. Include different per-agent defaults in one parallel/chain call and a shared top-level override; Pi may clamp unsupported levels.
- **Pause and hand control to the user to reload the Pi session**, then call the newly registered `subagent` tool directly to verify tool-level and agent-definition settings, omitted-field fallback, parallel tasks, and `{previous}` chain continuation.
