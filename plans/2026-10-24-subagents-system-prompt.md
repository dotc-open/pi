# Subagents in the system prompt

## Context

The `pi-core` subagent extension discovers project-local agent definitions from the nearest `.pi/agents/` directory, but the parent assistant's system prompt does not currently list those agents' descriptions and tools. Surface this information in a dedicated `Subagents` section so the parent can choose appropriate delegates.

## Approach

Reuse `discoverAgents(ctx.cwd, 'project')` in `packages/pi-core/src/extensions/subagent.ts` so the prompt lists only agents from the nearest project `.pi/agents/`, matching the tool's current default execution scope. On `before_agent_start`, set `event.systemPromptOptions.sections.subagents` to a `Subagents` heading followed by each discovered agent's name, description, and configured tools. Pi wraps this additional section in `<subagents>` tags; avoid replacing the entire system prompt. For agents without a `tools` field, state that child tools use the child's configured defaults: the extension passes no `--tools` flag, and Pi's default (`read`, `bash`, `edit`, `write`) can be changed by settings or activated extensions. Omit the section when no project agents are found. Recompute on each run to reflect working-directory or agent-definition changes; do not alter the subagent tool's discovery defaults.

## Files to modify

- `packages/pi-core/src/extensions/subagent.ts` — format the discovered project agents and register the system-prompt hook.

## Reuse

- `discoverAgents`, `parseToolList`, and `AgentConfig` in `packages/pi-core/src/extensions/subagent.ts`.
- `before_agent_start` and `systemPromptOptions.sections` per Pi's `docs/extensions.md` and `examples/extensions/prompt-customizer.ts`.

## Steps

After **each step**, run code quality checks through the `code-quality-checker` subagent and commit the changes, including updates to this plan file.

- [ ] Add a `before_agent_start` handler that calls `discoverAgents(ctx.cwd, 'project')` and renders agent names, descriptions, and explicit tool lists in `sections.subagents`; label missing tool lists as child-configured defaults, and delete the section if there are no project agents.
- [ ] Verify the prompt renders a single `Subagents` section for multiple agents, matches project-only discovery from nested directories, reflects changes between runs, excludes user-only agents, and distinguishes configured tools from child defaults.

## Verification

- Run lint, format, and type checks via the `code-quality-checker` subagent after each implementation step.
- Check project-only discovery, explicit and omitted tool lists, empty/missing directories, and prompt updates across runs. Inspect the resulting system prompt in a live Pi session; if a new or reloaded extension tool is needed, pause and hand control to the user to reload before testing calls directly.
- After implementation, hand control to the user to test the extension.
