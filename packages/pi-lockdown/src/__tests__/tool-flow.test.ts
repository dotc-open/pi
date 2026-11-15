import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  cwd: '',
  packageDir: '',
  project: {} as Record<string, unknown>,
  global: {} as Record<string, unknown>,
}))

vi.mock('@earendil-works/pi-coding-agent', () => ({
  SettingsManager: {
    create: () => ({ getProjectSettings: () => state.project, getGlobalSettings: () => state.global }),
  },
  getPackageDir: () => state.packageDir,
  getSettingsListTheme: () => ({}),
  isToolCallEventType: (name: string, event: unknown) => (event as { toolName?: string })?.toolName === name,
}))

vi.mock('@earendil-works/pi-tui', () => ({
  Box: class {},
  Container: class {},
  SettingsList: class {},
  Text: class {},
}))

import lockdownExtension from '../index'

type Handler = (event: unknown, ctx: unknown) => unknown
const handlers = new Map<string, Handler>()

function makeCtx(hasUI: boolean, select: (title: string, options: string[]) => Promise<string | undefined>) {
  const ctx = {
    cwd: state.cwd,
    hasUI,
    ui: { notify: vi.fn(), select, input: vi.fn(), custom: vi.fn() },
    shutdown: vi.fn(),
  } as unknown as ExtensionContext
  return ctx
}

function load(project: Record<string, unknown>, options: { hasUI?: boolean } = {}) {
  state.project = project
  state.global = {}
  handlers.clear()

  const pi = {
    registerFlag: vi.fn(),
    on: (name: string, handler: Handler) => handlers.set(name, handler),
    registerCommand: vi.fn(),
    registerTool: vi.fn(),
    setActiveTools: vi.fn(),
    getFlag: vi.fn().mockReturnValue(false),
  } as unknown as ExtensionAPI

  lockdownExtension(pi)

  const select = vi.fn(async () => 'Allow once' as string | undefined)
  const ctx = makeCtx(options.hasUI ?? true, select)
  handlers.get('session_start')?.(undefined, ctx)

  return { pi, ctx, select, toolCall: handlers.get('tool_call') as Handler }
}

beforeEach(() => {
  const base = realpathSync(mkdtempSync(path.join(tmpdir(), 'lockdown-tool-')))
  state.cwd = path.join(base, 'project')
  state.packageDir = path.join(base, 'pi-package')
  mkdirSync(state.cwd, { recursive: true })
  mkdirSync(state.packageDir, { recursive: true })
  writeFileSync(path.join(state.packageDir, 'README.md'), 'docs')
})

describe('new-mode file tool dispatch', () => {
  it('routes read/grep/find/ls to the read policy and edit/write to the write policy', async () => {
    const { toolCall, ctx } = load({
      lockdown: { fileAccess: { allowRead: ['docs/'], allowWrite: [], denyWrite: ['docs/'] } },
    })
    const docs = path.join(state.cwd, 'docs', 'x.txt')

    for (const toolName of ['read', 'grep', 'find', 'ls']) {
      expect(await toolCall({ toolName, input: { path: docs } }, ctx)).toBeUndefined()
    }

    for (const toolName of ['edit', 'write']) {
      const result = (await toolCall({ toolName, input: { path: docs, content: 'x' } }, ctx)) as {
        block?: boolean
        reason?: string
      }
      expect(result?.block).toBe(true)
      expect(result?.reason).toContain('docs/')
    }
  })

  it('still blocks bash outright', async () => {
    const { toolCall, ctx } = load({ lockdown: { fileAccess: { allowRead: ['.'] } } })
    expect(await toolCall({ toolName: 'bash', input: { command: 'rm -rf /' } }, ctx)).toMatchObject({ block: true })
  })

  it('blocks empty writes even when the path is allowed', async () => {
    const { toolCall, ctx } = load({ lockdown: { fileAccess: { allowWrite: ['.'] } } })
    const result = (await toolCall(
      { toolName: 'write', input: { path: path.join(state.cwd, 'a.txt'), content: '' } },
      ctx,
    )) as {
      block?: boolean
      reason?: string
    }
    expect(result?.block).toBe(true)
    expect(result?.reason).toContain('soft-remove')
  })

  it('allows otherwise-denied reads inside the Pi package directory', async () => {
    const { toolCall, ctx } = load({ lockdown: { fileAccess: { allowRead: [], denyRead: ['*'] } } }, { hasUI: false })
    expect(
      await toolCall({ toolName: 'read', input: { path: path.join(state.packageDir, 'README.md') } }, ctx),
    ).toBeUndefined()
  })
})

describe('new-mode prompt outcomes', () => {
  it('prompts once and allows on Allow once', async () => {
    const { toolCall, ctx } = load({ lockdown: { fileAccess: { allowWrite: [], denyWrite: [] } } })
    expect(
      await toolCall({ toolName: 'write', input: { path: path.join(state.cwd, 'src', 'a'), content: 'x' } }, ctx),
    ).toBeUndefined()
    expect(ctx.ui.select).toHaveBeenCalledTimes(1)
  })

  it('blocks on Block with the user-blocked reason', async () => {
    const { toolCall, ctx, select } = load({ lockdown: { fileAccess: { allowWrite: [], denyWrite: [] } } })
    select.mockResolvedValueOnce('Block')
    expect(
      await toolCall({ toolName: 'write', input: { path: path.join(state.cwd, 'src', 'a'), content: 'x' } }, ctx),
    ).toMatchObject({ block: true, reason: '[LOCKDOWN] Action blocked by user.' })
  })

  it('fails closed in headless mode', async () => {
    const { toolCall, ctx } = load({ lockdown: { fileAccess: { allowWrite: [], denyWrite: [] } } }, { hasUI: false })
    const result = (await toolCall(
      { toolName: 'write', input: { path: path.join(state.cwd, 'src', 'a'), content: 'x' } },
      ctx,
    )) as {
      block?: boolean
      reason?: string
    }
    expect(result?.block).toBe(true)
    expect(result?.reason).toContain('src')
  })

  it('reports the path and winning deny rule on a write block', async () => {
    const { toolCall, ctx } = load({ lockdown: { fileAccess: { denyWrite: ['**/.env*'] } } })
    const result = (await toolCall(
      { toolName: 'write', input: { path: path.join(state.cwd, '.env'), content: 'x' } },
      ctx,
    )) as {
      block?: boolean
      reason?: string
    }
    expect(result?.block).toBe(true)
    expect(result?.reason).toContain('.env')
    expect(result?.reason).toContain('**/.env*')
  })

  it('prompts (does not hard-block) on a denied read', async () => {
    const { toolCall, ctx } = load({ lockdown: { fileAccess: { denyRead: ['**/.env*'] } } })
    expect(await toolCall({ toolName: 'read', input: { path: path.join(state.cwd, '.env') } }, ctx)).toBeUndefined()
    expect(ctx.ui.select).toHaveBeenCalledTimes(1)
  })
})

describe('session grants from the prompt', () => {
  it('offers the session option in new mode', async () => {
    const { toolCall, ctx, select } = load({ lockdown: { fileAccess: { allowWrite: [], denyWrite: [] } } })
    await toolCall({ toolName: 'write', input: { path: path.join(state.cwd, 'src', 'a'), content: 'x' } }, ctx)
    expect(select).toHaveBeenCalledWith(expect.any(String), ['Allow once', 'Allow for this session', 'Block'])
  })

  it('adds a write path to allowWrite and stops prompting', async () => {
    const { toolCall, ctx, select } = load({ lockdown: { fileAccess: { allowWrite: [], denyWrite: [] } } })
    const target = path.join(state.cwd, 'src', 'a')

    select.mockResolvedValueOnce('Allow for this session')
    expect(await toolCall({ toolName: 'write', input: { path: target, content: 'x' } }, ctx)).toBeUndefined()
    expect(ctx.ui.notify).toHaveBeenCalledWith('[LOCKDOWN] Added "src/a" to allowWrite.', 'info')

    expect(await toolCall({ toolName: 'write', input: { path: target, content: 'x' } }, ctx)).toBeUndefined()
    expect(ctx.ui.select).toHaveBeenCalledTimes(1)
  })

  it('adds an external read to allowRead as an absolute path', async () => {
    const { toolCall, ctx, select } = load({ lockdown: { fileAccess: { allowRead: ['.'] } } })
    const target = path.join(path.dirname(state.cwd), 'outside.txt')

    select.mockResolvedValueOnce('Allow for this session')
    expect(await toolCall({ toolName: 'read', input: { path: target } }, ctx)).toBeUndefined()
    expect(ctx.ui.notify).toHaveBeenCalledWith(`[LOCKDOWN] Added "${target}" to allowRead.`, 'info')

    expect(await toolCall({ toolName: 'read', input: { path: target } }, ctx)).toBeUndefined()
    expect(ctx.ui.select).toHaveBeenCalledTimes(1)
  })

  it('uses "." for the project root', async () => {
    const { toolCall, ctx, select } = load({ lockdown: { fileAccess: { allowRead: [] } } })
    select.mockResolvedValueOnce('Allow for this session')

    expect(await toolCall({ toolName: 'ls', input: {} }, ctx)).toBeUndefined()
    expect(ctx.ui.notify).toHaveBeenCalledWith('[LOCKDOWN] Added "." to allowRead.', 'info')
  })

  it('grants a folder and its subtree', async () => {
    mkdirSync(path.join(state.cwd, 'src'), { recursive: true })
    const { toolCall, ctx, select } = load({ lockdown: { fileAccess: { allowRead: [] } } })

    select.mockResolvedValueOnce('Allow for this session')
    expect(await toolCall({ toolName: 'ls', input: { path: path.join(state.cwd, 'src') } }, ctx)).toBeUndefined()
    expect(ctx.ui.notify).toHaveBeenCalledWith('[LOCKDOWN] Added "src" to allowRead.', 'info')

    // The directory rule covers src and everything under it.
    expect(
      await toolCall({ toolName: 'read', input: { path: path.join(state.cwd, 'src', 'a.ts') } }, ctx),
    ).toBeUndefined()
    expect(ctx.ui.select).toHaveBeenCalledTimes(1)
  })
})

describe('custom tools', () => {
  it('uses customTools permissions in new mode', async () => {
    const { toolCall, ctx } = load({
      lockdown: { fileAccess: { allowWrite: [], denyWrite: [] }, customTools: { danger: 'block' } },
    })
    expect(await toolCall({ toolName: 'danger', input: {} }, ctx)).toMatchObject({ block: true })
  })

  it('keeps the custom-tool two-option prompt', async () => {
    const { toolCall, ctx, select } = load({
      lockdown: { fileAccess: { allowWrite: [], denyWrite: [] }, customTools: { maybe: 'warn' } },
    })
    select.mockResolvedValueOnce('Yes')

    expect(await toolCall({ toolName: 'maybe', input: {} }, ctx)).toBeUndefined()
    expect(select).toHaveBeenCalledWith(expect.any(String), ['Yes', 'No'])
  })

  it('fails closed for warn custom tools in headless mode', async () => {
    const { toolCall, ctx } = load(
      { lockdown: { fileAccess: { allowWrite: [], denyWrite: [] }, customTools: { maybe: 'warn' } } },
      { hasUI: false },
    )
    expect(await toolCall({ toolName: 'maybe', input: {} }, ctx)).toMatchObject({ block: true })
  })
})

describe('legacy mode regression', () => {
  const legacy = {
    fileAccess: {
      external: { protected: {}, unprotected: {} },
      internal: { protected: {}, unprotected: { read: 'allow', write: 'warn' } },
    },
  }

  it('keeps the fileAccess matrix behaviour', async () => {
    const { toolCall, ctx } = load({ lockdown: legacy }, { hasUI: false })
    expect(await toolCall({ toolName: 'read', input: { path: path.join(state.cwd, 'src', 'a') } }, ctx)).toBeUndefined()
    expect(
      await toolCall({ toolName: 'write', input: { path: path.join(state.cwd, 'src', 'a'), content: 'x' } }, ctx),
    ).toMatchObject({ block: true })
  })

  it('keeps the legacy two-option prompt', async () => {
    const { toolCall, ctx, select } = load({ lockdown: legacy })
    select.mockResolvedValueOnce('Yes')

    expect(
      await toolCall({ toolName: 'write', input: { path: path.join(state.cwd, 'src', 'a'), content: 'x' } }, ctx),
    ).toBeUndefined()
    expect(select).toHaveBeenCalledWith(expect.any(String), ['Yes', 'No'])
  })

  it('keeps protectedPatterns behaviour for legacy configs', async () => {
    const { toolCall, ctx } = load({ lockdown: legacy }, { hasUI: false })
    expect(
      await toolCall({ toolName: 'write', input: { path: path.join(state.cwd, '.env'), content: 'x' } }, ctx),
    ).toMatchObject({ block: true })
  })
})
