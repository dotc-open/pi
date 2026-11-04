import type { ExtensionContext } from '@earendil-works/pi-coding-agent'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@earendil-works/pi-coding-agent', () => ({
  SettingsManager: { create: () => ({ getProjectSettings: () => ({}), getGlobalSettings: () => ({}) }) },
  getPackageDir: () => '/pi-package',
}))

import {
  DEFAULT_PATH_POLICY,
  DEFAULT_PROTECTED_PATTERNS,
  LegacyLockdownSettingsSchema,
  PathEntrySchema,
  PathPolicySettingsSchema,
} from '../schema'
import { parseLockdownSettings } from '../utils'

function makeCtx(): { ctx: ExtensionContext; notify: ReturnType<typeof vi.fn>; shutdown: ReturnType<typeof vi.fn> } {
  const notify = vi.fn()
  const shutdown = vi.fn()
  return { ctx: { ui: { notify }, shutdown } as unknown as ExtensionContext, notify, shutdown }
}

const legacyBlock = {
  fileAccess: {
    external: { protected: {}, unprotected: {} },
    internal: { protected: {}, unprotected: {} },
  },
}

describe('path policy schema', () => {
  it('applies per-array defaults when fileSystemAccess is omitted or empty', () => {
    const parsed = PathPolicySettingsSchema.parse({ fileSystemAccess: {} })
    expect(parsed.denyRead).toEqual([...DEFAULT_PATH_POLICY.denyRead])
    expect(parsed.allowRead).toEqual([...DEFAULT_PATH_POLICY.allowRead])
    expect(parsed.allowWrite).toEqual([...DEFAULT_PATH_POLICY.allowWrite])
    expect(parsed.denyWrite).toEqual([...DEFAULT_PATH_POLICY.denyWrite])
  })

  it('lets an explicit [] disable a default per array', () => {
    const parsed = PathPolicySettingsSchema.parse({ fileSystemAccess: { denyRead: [], allowWrite: [] } })
    expect(parsed.denyRead).toEqual([])
    expect(parsed.allowWrite).toEqual([])
    expect(parsed.allowRead).toEqual([...DEFAULT_PATH_POLICY.allowRead])
  })

  it('rejects empty entries, accepts ordinary ones', () => {
    expect(PathEntrySchema.safeParse('').success).toBe(false)
    expect(PathEntrySchema.safeParse('   ').success).toBe(false)
    expect(PathEntrySchema.safeParse('e2e/').success).toBe(true)
    expect(PathEntrySchema.safeParse('*').success).toBe(true)
  })
})

describe('mode selection on raw keys', () => {
  it('selects new mode when fileSystemAccess is present, even as {}', () => {
    const { ctx } = makeCtx()
    expect(parseLockdownSettings({ fileSystemAccess: { allowWrite: [] } }, ctx)?.mode).toBe('new')
    expect(parseLockdownSettings({ fileSystemAccess: {} }, ctx)?.mode).toBe('new')
  })

  it('selects legacy mode when only legacy keys are present', () => {
    const { ctx } = makeCtx()
    expect(parseLockdownSettings(legacyBlock, ctx)?.mode).toBe('legacy')
  })

  it('errors when a path list sits outside fileSystemAccess', () => {
    const { ctx, notify } = makeCtx()
    const result = parseLockdownSettings({ allowWrite: [] }, ctx)
    expect(result).toBeNull()
    const message = String(notify.mock.calls[0]?.[0])
    expect(message).toContain('fileSystemAccess')
    expect(message).toContain('allowWrite')
  })

  it('errors when fileSystemAccess and legacy keys are mixed, naming both', () => {
    const { ctx, notify, shutdown } = makeCtx()
    const result = parseLockdownSettings({ fileSystemAccess: {}, fileAccess: {} }, ctx)
    expect(result).toBeNull()
    expect(shutdown).not.toHaveBeenCalled()
    const message = String(notify.mock.calls[0]?.[0])
    expect(message).toContain('fileSystemAccess')
    expect(message).toContain('fileAccess')
  })

  it('rejects invalid entries with an error notification', () => {
    const { ctx, notify } = makeCtx()
    const result = parseLockdownSettings({ fileSystemAccess: { allowWrite: [''] } }, ctx)
    expect(result).toBeNull()
    expect(notify).toHaveBeenCalled()
  })
})

describe('legacy parsing', () => {
  it('keeps legacy defaults unchanged', () => {
    const parsed = LegacyLockdownSettingsSchema.parse(legacyBlock)
    expect(parsed.protectedPatterns).toEqual([...DEFAULT_PROTECTED_PATTERNS])
    expect(parsed.fileAccess.internal.unprotected.read).toBe('allow')
    expect(parsed.fileAccess.internal.protected.write).toBe('warn')
    expect(parsed.fileAccess.external.protected.read).toBe('block')
  })
})
