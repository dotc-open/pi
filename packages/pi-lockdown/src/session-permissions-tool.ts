import type { Static } from 'typebox'
import { Type } from 'typebox'

import {
  type LockdownLevel,
  LockdownLevelSchema,
  type LockdownSettings,
  PathEntrySchema,
  type PathPolicyKey,
  type PathPolicySettings,
} from './schema'

export const SESSION_PERMISSIONS_TOOL_NAME = 'lockdown_session_permissions'

const CUSTOM_TOOLS_LIST = 'customTools' as const
export type SessionPermissionsList = PathPolicyKey | typeof CUSTOM_TOOLS_LIST

export const SessionPermissionsParams = Type.Object({
  list: Type.Union(
    [
      Type.Literal('denyRead'),
      Type.Literal('allowRead'),
      Type.Literal('allowWrite'),
      Type.Literal('denyWrite'),
      Type.Literal('customTools'),
    ],
    { description: "Which session list to change: a path list, or 'customTools' for per-tool levels." },
  ),
  action: Type.Union([Type.Literal('add'), Type.Literal('remove'), Type.Literal('set')], {
    description:
      "How to apply `entries`: for path lists 'add' appends missing entries, 'remove' deletes exact matches and 'set' replaces the list; for 'customTools' 'add'/'set' upsert levels and 'remove' deletes tools.",
  }),
  entries: Type.Array(
    Type.String({
      description:
        'A path entry such as "e2e/" or "~/.config". For "customTools", "tool_name" (defaults to block) or "tool_name=<allow|warn|block>".',
    }),
    {
      description:
        'Entries to apply. Each must be non-empty; path entries match exactly. Its own tool level cannot be changed.',
    },
  ),
})

export type SessionPermissionsArgs = Static<typeof SessionPermissionsParams>

export interface SessionPermissionsOutcome {
  ok: boolean
  message: string
  list?: SessionPermissionsList
  entries?: string[]
}

interface ToolLevelUpdate {
  name: string
  level: LockdownLevel
}

/** Parse `name` (default level block) or `name=level` entries for the customTools list. */
function parseToolEntry(entry: string): ToolLevelUpdate | string {
  const separator = entry.indexOf('=')
  const name = (separator === -1 ? entry : entry.slice(0, separator)).trim()
  if (name.length === 0) return `Invalid tool entry: "${entry}".`
  const level = separator === -1 ? 'block' : entry.slice(separator + 1).trim()
  const parsed = LockdownLevelSchema.safeParse(level)
  if (!parsed.success) return `Invalid level in "${entry}": use allow, warn or block.`
  return { name, level: parsed.data }
}

/**
 * Applies a session-only change to one of the four new-mode path lists. Mutates
 * `settings` in place; the caller owns persistence (there is none).
 */
export function applySessionPermissions(
  settings: LockdownSettings,
  args: SessionPermissionsArgs,
): SessionPermissionsOutcome {
  if (settings.mode !== 'new') {
    return {
      ok: false,
      message:
        'Session permission lists are only available in new mode; this session uses the legacy fileAccess matrix.',
    }
  }

  const entries = args.entries.map((entry) => entry.trim()).filter((entry) => entry.length > 0)
  if (entries.length === 0) {
    return { ok: false, message: 'No entries provided.' }
  }

  if (args.list === CUSTOM_TOOLS_LIST) {
    return applyCustomTools(settings, args.action, entries)
  }

  const invalid = entries.find((entry) => !PathEntrySchema.safeParse(entry).success)
  if (invalid !== undefined) {
    return { ok: false, message: `Invalid path entry: "${invalid}".` }
  }

  const next = applyTo(settings, args.list, args.action, entries)
  return {
    ok: true,
    message: `Session ${args.list} is now: ${next.length > 0 ? next.join(', ') : '(empty)'}.`,
    list: args.list,
    entries: next,
  }
}

function applyCustomTools(
  settings: PathPolicySettings,
  action: SessionPermissionsArgs['action'],
  entries: string[],
): SessionPermissionsOutcome {
  const updates = entries.map(parseToolEntry)
  const invalid = updates.find((update) => typeof update === 'string')
  if (typeof invalid === 'string') {
    return { ok: false, message: invalid }
  }

  const parsed = updates as ToolLevelUpdate[]
  // The agent must not raise (or change) its own session level: it could set
  // itself to `allow` and then widen its access without any prompt.
  if (parsed.some((update) => update.name === SESSION_PERMISSIONS_TOOL_NAME)) {
    return { ok: false, message: `Refusing to change the session level of ${SESSION_PERMISSIONS_TOOL_NAME}.` }
  }

  for (const update of parsed) {
    if (action === 'remove') {
      delete settings.customTools[update.name]
    } else {
      settings.customTools[update.name] = update.level
    }
  }

  const summary = Object.entries(settings.customTools).map(([name, level]) => `${name}=${level}`)
  return {
    ok: true,
    message: `Session customTools is now: ${summary.length > 0 ? summary.join(', ') : '(empty)'}.`,
    list: CUSTOM_TOOLS_LIST,
    entries: summary,
  }
}

function applyTo(
  settings: PathPolicySettings,
  list: PathPolicyKey,
  action: SessionPermissionsArgs['action'],
  entries: string[],
): string[] {
  const current = settings[list]
  let next: string[]

  if (action === 'add') {
    next = [...current]
    for (const entry of entries) {
      if (!next.includes(entry)) next.push(entry)
    }
  } else if (action === 'remove') {
    const remove = new Set(entries)
    next = current.filter((entry) => !remove.has(entry))
  } else {
    next = [...entries]
  }

  settings[list] = next
  return next
}
