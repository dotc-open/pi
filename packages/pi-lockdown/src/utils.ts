import { realpathSync } from 'node:fs'
import path from 'node:path'

import { type ExtensionContext, getPackageDir, SettingsManager } from '@earendil-works/pi-coding-agent'
import type { SettingItem } from '@earendil-works/pi-tui'

import {
  LOCATION,
  PERM_ACTION,
  PROTECTION,
  SETTING_ID_SEPARATOR,
  SETTINGS_KEY,
  SUBAGENT_SETTINGS_KEY,
} from './constants'
import {
  defaultLockdownSettings,
  FILE_SYSTEM_ACCESS_KEY,
  LEGACY_ONLY_KEYS,
  LegacyLockdownSettingsSchema,
  type LegacyModeSettings,
  lockdownLevelOptions,
  type LockdownSettings,
  PATH_POLICY_KEYS,
  PathPolicySettingsSchema,
} from './schema'

// Pi's own installation directory is safe to read: its README, docs,
// examples, source, dist, and bundled dependencies. Writes, edits, and custom
// tools still use the normal permissions.
export function isPiReadablePath(cwd: string, inputPath: string): boolean {
  try {
    // Pi's file tools accept an @ prefix on paths.
    const requestedPath = inputPath.startsWith('@') ? inputPath.slice(1) : inputPath
    const target = realpathSync(path.resolve(cwd, requestedPath))
    const root = realpathSync(getPackageDir())
    const relative = path.relative(root, target)
    return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
  } catch {
    // Missing paths or an inaccessible package root must use the ordinary
    // permissions.
    return false
  }
}

export function isInside(root: string, value: string): boolean {
  // Resolve `value` relative to `root`, NOT the process CWD.
  // This prevents a bug where a relative `value` resolves differently
  // depending on the process's current directory.
  const resolvedValue = path.resolve(root, value)

  // Normalize trailing separators so "root" and "root/" are treated identically.
  const normalizedRoot = root.replace(/[/\\]+$/, '') + path.sep
  const normalizedValue = resolvedValue.replace(/[/\\]+$/, '')

  // Allow value == root itself (no trailing separator needed).
  return normalizedValue === root || normalizedValue.startsWith(normalizedRoot)
}

function notifyIssues(ctx: ExtensionContext, issues: { path: PropertyKey[]; message: string }[]): void {
  for (const issue of issues) {
    ctx.ui.notify(`[LOCKDOWN] ${issue.path[0] as string} - ${issue.message}`, 'error')
  }
}

/**
 * Parse a selected settings block into exactly one mode.
 *
 * Mode is decided on raw key presence (before defaults) so an explicit `[]`
 * still opts in. Mixing path-policy keys with legacy keys is a hard error.
 * Returns `null` when the block is present but invalid.
 */
export function parseLockdownSettings(raw: unknown, ctx: ExtensionContext): LockdownSettings | null {
  const block = (raw ?? {}) as Record<string, unknown>
  const hasFileSystemAccess = FILE_SYSTEM_ACCESS_KEY in block
  const legacyKeys = LEGACY_ONLY_KEYS.filter((key) => key in block)
  const strayPathKeys = PATH_POLICY_KEYS.filter((key) => key in block)

  // Top-level path arrays are the pre-wrapper shape; name them instead of
  // falling through to a confusing legacy parse error.
  if (strayPathKeys.length > 0) {
    ctx.ui.notify(
      `[LOCKDOWN] Path lists must be nested under "${FILE_SYSTEM_ACCESS_KEY}" (found ${strayPathKeys.join(', ')}).`,
      'error',
    )
    return null
  }

  if (hasFileSystemAccess && legacyKeys.length > 0) {
    ctx.ui.notify(
      `[LOCKDOWN] Cannot mix "${FILE_SYSTEM_ACCESS_KEY}" with legacy keys (${legacyKeys.join(', ')}).`,
      'error',
    )
    return null
  }

  if (hasFileSystemAccess) {
    const parsed = PathPolicySettingsSchema.safeParse(block)
    if (!parsed.success) {
      notifyIssues(ctx, parsed.error.issues)
      return null
    }
    return { mode: 'new', ...parsed.data }
  }

  const parsed = LegacyLockdownSettingsSchema.safeParse(block)
  if (!parsed.success) {
    notifyIssues(ctx, parsed.error.issues)
    return null
  }
  return { mode: 'legacy', ...parsed.data }
}

/**
 * Parse a single settings key from a settings object.
 *
 * Returns:
 * - `{ found: false }` when the key is absent (caller should fall through to the next source/key),
 * - `{ found: true, value }` when the key is present and valid,
 * - `null` when the key is present but invalid (caller must notify + shutdown).
 */
function parseLockdownKey(
  raw: Record<string, unknown>,
  key: string,
  ctx: ExtensionContext,
): { found: boolean; value?: LockdownSettings } | null {
  // Explicit presence check: a missing key falls through to the next source,
  // while a present-but-invalid key is a hard error.
  if (!(key in raw)) {
    return { found: false }
  }

  const value = parseLockdownSettings(raw[key], ctx)
  if (value === null) {
    return null
  }

  return { found: true, value }
}

export function loadSettings(ctx: ExtensionContext, isSubagent = false): LockdownSettings | null {
  const sm = SettingsManager.create(ctx.cwd)
  const projectSettings = sm.getProjectSettings() as Record<string, unknown>
  const globalSettings = sm.getGlobalSettings() as Record<string, unknown>

  // Key-ordered lookup: subagent profile first (project → global), then fall
  // back to the generic `lockdown` key (project → global), then defaults.
  const keys = isSubagent ? [SUBAGENT_SETTINGS_KEY, SETTINGS_KEY] : [SETTINGS_KEY]
  const sources = [projectSettings, globalSettings]

  for (const key of keys) {
    for (const source of sources) {
      const result = parseLockdownKey(source, key, ctx)
      if (result === null) {
        ctx.shutdown()
        return null
      }
      if (result.found) {
        return result.value ?? null
      }
    }
  }

  return defaultLockdownSettings()
}

export function constructSettingsList(lockdownSettings: LegacyModeSettings): SettingItem[] {
  const items: SettingItem[] = []

  // File access
  for (const location of LOCATION) {
    for (const protection of PROTECTION) {
      for (const permAction of PERM_ACTION) {
        const id = ['fileAccess', location, protection, permAction].join(SETTING_ID_SEPARATOR)
        const fullLabel = permAction
        const titleCaseLabel = fullLabel[0]?.toUpperCase() + fullLabel.slice(1)
        const label = `${titleCaseLabel.padEnd(12, ' ')}>  ${location}  ${protection.padEnd(11, ' ')}`
        const currentValue = lockdownSettings.fileAccess[location][protection][permAction]

        items.push({
          id,
          label,
          currentValue,
          values: lockdownLevelOptions,
        })
      }
    }
  }

  // Custom tools
  Object.keys(lockdownSettings.customTools).forEach((customTool) => {
    const id = ['customTool', customTool].join(SETTING_ID_SEPARATOR)
    const label = customTool.padEnd(36, ' ')
    const currentValue = lockdownSettings.customTools[customTool] ?? 'warn'

    items.push({
      id,
      label,
      currentValue,
      values: lockdownLevelOptions,
    })
  })

  return items
}
