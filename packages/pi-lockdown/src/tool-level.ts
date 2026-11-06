import type { LockdownLevel } from './schema'

export const SUBAGENT_TOOL_NAME = 'subagent'
const SUBAGENT_TOOL_PREFIX = `${SUBAGENT_TOOL_NAME}:`

/** Keys like `subagent:<name>` scope a level to one agent; they are not tool names. */
export function isScopedToolKey(key: string): boolean {
  return key.startsWith(SUBAGENT_TOOL_PREFIX)
}

/**
 * Resolve the session level for a custom tool call. For the `subagent` tool a
 * `subagent:<agent>` key overrides the generic `subagent` level; a call naming
 * several agents takes the strictest level of the group.
 */
export function resolveToolLevel(
  customTools: Record<string, LockdownLevel>,
  toolName: string,
  input: unknown,
): LockdownLevel {
  if (toolName !== SUBAGENT_TOOL_NAME) return customTools[toolName] ?? 'warn'

  const generic = customTools[SUBAGENT_TOOL_NAME] ?? 'warn'
  const names = subagentNames(input)
  if (names.length === 0) return generic

  const levels = names.map((name) => customTools[`${SUBAGENT_TOOL_PREFIX}${name}`] ?? generic)
  if (levels.includes('block')) return 'block'
  if (levels.includes('warn')) return 'warn'
  return 'allow'
}

/** Agent names named by a subagent call, across single, parallel and chain modes. */
function subagentNames(input: unknown): string[] {
  if (typeof input !== 'object' || input === null) return []
  const value = input as { agent?: unknown; tasks?: unknown; chain?: unknown }
  const names: string[] = []
  if (typeof value.agent === 'string') names.push(value.agent)
  for (const list of [value.tasks, value.chain]) {
    if (!Array.isArray(list)) continue
    for (const item of list) {
      if (typeof item === 'object' && item !== null && typeof (item as { agent?: unknown }).agent === 'string') {
        names.push((item as { agent: string }).agent)
      }
    }
  }
  return names
}
