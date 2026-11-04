import type { Static } from 'typebox'
import { Type } from 'typebox'

import { type LockdownSettings, PathEntrySchema, type PathPolicyKey, type PathPolicySettings } from './schema'

export const SESSION_PERMISSIONS_TOOL_NAME = 'lockdown_session_permissions'

export const SessionPermissionsParams = Type.Object({
  list: Type.Union(
    [Type.Literal('denyRead'), Type.Literal('allowRead'), Type.Literal('allowWrite'), Type.Literal('denyWrite')],
    { description: 'Which session path list to change.' },
  ),
  action: Type.Union([Type.Literal('add'), Type.Literal('remove'), Type.Literal('set')], {
    description:
      "How to apply `entries`: 'add' appends missing entries, 'remove' deletes exact matches, 'set' replaces the whole list.",
  }),
  entries: Type.Array(Type.String({ description: 'A path entry such as "e2e/" or "~/.config".' }), {
    description: 'Entries to add, remove, or set. Each must be a non-empty path entry; entries match exactly.',
  }),
})

export type SessionPermissionsArgs = Static<typeof SessionPermissionsParams>

export interface SessionPermissionsOutcome {
  ok: boolean
  message: string
  list?: PathPolicyKey
  entries?: string[]
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
