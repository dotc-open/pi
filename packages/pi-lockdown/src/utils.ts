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
  FILE_ACCESS_KEY,
  LEGACY_FILE_ACCESS_MATRIX_KEYS,
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
 * Both modes use the `fileAccess` key: the legacy matrix (`external`/
 * `internal`) or the four path lists. Mode is decided on the raw inner keys
 * before defaults. Returns `null` when the block is present but invalid.
 */
export function parseLockdownSettings(raw: unknown, ctx: ExtensionContext): LockdownSettings | null {
  const block = (raw ?? {}) as Record<string, unknown>
  const rawFileAccess = block[FILE_ACCESS_KEY]
  const fileAccess =
    typeof rawFileAccess === 'object' && rawFileAccess !== null ? (rawFileAccess as Record<string, unknown>) : undefined

  // Path arrays at the top level are the pre-wrapper shape; name them instead
  // of falling through to a confusing legacy parse error.
  const strayPathKeys = PATH_POLICY_KEYS.filter((key) => key in block)
  if (strayPathKeys.length > 0) {
    ctx.ui.notify(
      `[LOCKDOWN] Path lists must be nested under "${FILE_ACCESS_KEY}" (found ${strayPathKeys.join(', ')}).`,
      'error',
    )
    return null
  }

  const pathKeys = fileAccess ? PATH_POLICY_KEYS.filter((key) => key in fileAccess) : []
  const matrixKeys = fileAccess ? LEGACY_FILE_ACCESS_MATRIX_KEYS.filter((key) => key in fileAccess) : []

  if (pathKeys.length > 0 && matrixKeys.length > 0) {
    ctx.ui.notify(
      `[LOCKDOWN] Cannot mix path-list keys (${pathKeys.join(', ')}) with the legacy fileAccess matrix (${matrixKeys.join(', ')}).`,
      'error',
    )
    return null
  }

  // New mode whenever `fileAccess` is present without the legacy matrix keys,
  // so `"fileAccess": {}` opts in with every default.
  if (fileAccess !== undefined && matrixKeys.length === 0) {
    if ('protectedPatterns' in block) {
      ctx.ui.notify(
        `[LOCKDOWN] Cannot mix "${FILE_ACCESS_KEY}" path lists with the legacy "protectedPatterns" key.`,
        'error',
      )
      return null
    }
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
