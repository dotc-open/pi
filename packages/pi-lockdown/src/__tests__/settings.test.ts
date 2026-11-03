import type { ExtensionContext } from '@earendil-works/pi-coding-agent'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  project: {} as Record<string, unknown>,
  global: {} as Record<string, unknown>,
}))

vi.mock('@earendil-works/pi-coding-agent', () => ({
  SettingsManager: {
    create: () => ({ getProjectSettings: () => state.project, getGlobalSettings: () => state.global }),
  },
  getPackageDir: () => '/pi-package',
}))

import { DEFAULT_PATH_POLICY, type LockdownSettings } from '../schema'
import { loadSettings } from '../utils'

function newMode(settings: LockdownSettings | null) {
  if (settings?.mode !== 'new') throw new Error(`expected new mode, got ${String(settings?.mode)}`)
  return settings
}

function makeCtx(): { ctx: ExtensionContext; shutdown: ReturnType<typeof vi.fn> } {
  const shutdown = vi.fn()
  return { ctx: { cwd: '/repo', ui: { notify: vi.fn() }, shutdown } as unknown as ExtensionContext, shutdown }
}

beforeEach(() => {
  state.project = {}
  state.global = {}
})

describe('loadSettings source order', () => {
  it('prefers the project block over the global block, without merging', () => {
    state.project = { lockdown: { allowWrite: ['e2e/'] } }
    state.global = { lockdown: { allowWrite: ['global/'], denyWrite: ['.env'] } }

    const settings = newMode(loadSettings(makeCtx().ctx))
    expect(settings.allowWrite).toEqual(['e2e/'])
    // `denyWrite` from the global block must not leak into the project block.
    expect(settings.denyWrite).toEqual([...DEFAULT_PATH_POLICY.denyWrite])
  })

  it('falls back to the global block when the project has no block', () => {
    state.global = { lockdown: { allowWrite: ['global/'] } }
    expect(newMode(loadSettings(makeCtx().ctx)).allowWrite).toEqual(['global/'])
  })

  it('uses legacy defaults when no block exists', () => {
    const settings = loadSettings(makeCtx().ctx)
    expect(settings?.mode).toBe('legacy')
  })
})

describe('loadSettings subagent profile', () => {
  it('prefers project lockdownSubagent over project lockdown', () => {
    state.project = {
      lockdownSubagent: { allowWrite: ['subagent/'] },
      lockdown: { allowWrite: ['main/'] },
    }
    expect(newMode(loadSettings(makeCtx().ctx, true)).allowWrite).toEqual(['subagent/'])
  })

  it('prefers global lockdownSubagent over project lockdown', () => {
    state.project = { lockdown: { allowWrite: ['main/'] } }
    state.global = { lockdownSubagent: { allowWrite: ['global-subagent/'] } }
    expect(newMode(loadSettings(makeCtx().ctx, true)).allowWrite).toEqual(['global-subagent/'])
  })

  it('falls back to project lockdown when no subagent profile exists', () => {
    state.project = { lockdown: { allowWrite: ['main/'] } }
    state.global = { lockdown: { allowWrite: ['global/'] } }
    expect(newMode(loadSettings(makeCtx().ctx, true)).allowWrite).toEqual(['main/'])
  })
})

describe('loadSettings invalid config', () => {
  it('returns null and shuts down on an invalid selected block', () => {
    state.project = { lockdown: { allowWrite: [''] } }
    const { ctx, shutdown } = makeCtx()
    expect(loadSettings(ctx)).toBeNull()
    expect(shutdown).toHaveBeenCalled()
  })
})
