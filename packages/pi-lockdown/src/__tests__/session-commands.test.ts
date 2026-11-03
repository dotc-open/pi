import { mkdirSync, mkdtempSync, realpathSync } from 'node:fs'
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
type CommandHandler = (args: unknown, ctx: unknown) => Promise<unknown>

function setup(projectLockdown: Record<string, unknown>, options: { hasUI?: boolean } = {}) {
  state.project = { lockdown: projectLockdown }
  state.global = {}

  const handlers = new Map<string, Handler>()
  const commands = new Map<string, CommandHandler>()
  const pi = {
    registerFlag: vi.fn(),
    on: (name: string, handler: Handler) => handlers.set(name, handler),
    registerCommand: (name: string, opts: { handler: CommandHandler }) => commands.set(name, opts.handler),
    setActiveTools: vi.fn(),
    getFlag: vi.fn().mockReturnValue(false),
  } as unknown as ExtensionAPI

  lockdownExtension(pi)

  const select = vi.fn()
  const input = vi.fn()
  const ctx = {
    cwd: state.cwd,
    hasUI: options.hasUI ?? true,
    ui: { notify: vi.fn(), select, input, custom: vi.fn() },
    shutdown: vi.fn(),
  } as unknown as ExtensionContext

  handlers.get('session_start')?.(undefined, ctx)

  return {
    ctx,
    select,
    input,
    toolCall: handlers.get('tool_call') as Handler,
    sessionPermissions: commands.get('lockdown:session-permissions') as CommandHandler,
    reset: commands.get('lockdown:reset') as CommandHandler,
  }
}

async function writeFile(toolCall: Handler, ctx: ExtensionContext, relPath: string) {
  return (await toolCall({ toolName: 'write', input: { path: path.join(state.cwd, relPath), content: 'x' } }, ctx)) as
    { block?: boolean; reason?: string } | undefined
}

beforeEach(() => {
  const base = realpathSync(mkdtempSync(path.join(tmpdir(), 'lockdown-session-')))
  state.cwd = path.join(base, 'project')
  state.packageDir = path.join(base, 'pi-package')
  mkdirSync(state.cwd, { recursive: true })
  mkdirSync(state.packageDir, { recursive: true })
})

describe('new-mode session permissions', () => {
  it('reports that an interactive UI is required when headless', async () => {
    const { ctx, sessionPermissions, select } = setup({ allowWrite: [] }, { hasUI: false })

    await sessionPermissions(undefined, ctx)

    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining('interactive UI'), 'error')
    expect(select).not.toHaveBeenCalled()
  })

  it('adds an entry to a selected list and applies it immediately', async () => {
    const { ctx, sessionPermissions, select, input, toolCall } = setup({ allowWrite: [], denyWrite: [] })
    select
      .mockResolvedValueOnce('allowWrite (0 entries)')
      .mockResolvedValueOnce('Add entry')
      .mockResolvedValueOnce(undefined)
    input.mockResolvedValueOnce('e2e/')

    await sessionPermissions(undefined, ctx)

    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining('Added "e2e/"'), 'info')
    expect(await writeFile(toolCall, ctx, 'e2e/snapshot.txt')).toBeUndefined()
  })

  it('rejects an invalid entry before mutating the list', async () => {
    const { ctx, sessionPermissions, select, input, toolCall } = setup({ allowWrite: [], denyWrite: [] })
    select
      .mockResolvedValueOnce('allowWrite (0 entries)')
      .mockResolvedValueOnce('Add entry')
      .mockResolvedValueOnce(undefined)
    input.mockResolvedValueOnce('   ')

    await sessionPermissions(undefined, ctx)

    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining('must not be empty'), 'error')

    select.mockReset()
    select.mockResolvedValueOnce('No')
    expect(await writeFile(toolCall, ctx, 'e2e/snapshot.txt')).toMatchObject({
      block: true,
      reason: '[LOCKDOWN] Action blocked by user.',
    })
  })

  it('removes an entry from a selected list', async () => {
    const { ctx, sessionPermissions, select, toolCall } = setup({ allowWrite: ['e2e/'], denyWrite: [] })
    select
      .mockResolvedValueOnce('allowWrite (1 entry)')
      .mockResolvedValueOnce('Remove entry')
      .mockResolvedValueOnce('e2e/')
      .mockResolvedValueOnce(undefined)

    await sessionPermissions(undefined, ctx)

    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining('Removed "e2e/"'), 'info')

    select.mockReset()
    select.mockResolvedValueOnce('No')
    expect(await writeFile(toolCall, ctx, 'e2e/snapshot.txt')).toMatchObject({ block: true })
  })

  it('treats cancellation at the list prompt as closing the editor', async () => {
    const { ctx, sessionPermissions, select } = setup({ allowWrite: ['e2e/'], denyWrite: [] })
    select.mockResolvedValueOnce(undefined)

    await sessionPermissions(undefined, ctx)

    // Only the list prompt ran; no mutation happened.
    expect(select).toHaveBeenCalledTimes(1)
    expect(ctx.ui.notify).not.toHaveBeenCalled()
  })
})

describe('lockdown:reset', () => {
  it('discards session edits by reloading the selected settings', async () => {
    const { ctx, sessionPermissions, select, input, toolCall, reset } = setup({
      allowWrite: ['e2e/'],
      denyWrite: [],
    })
    select
      .mockResolvedValueOnce('allowWrite (1 entry)')
      .mockResolvedValueOnce('Add entry')
      .mockResolvedValueOnce(undefined)
    input.mockResolvedValueOnce('tmp/')

    await sessionPermissions(undefined, ctx)
    expect(await writeFile(toolCall, ctx, 'tmp/session.txt')).toBeUndefined()

    await reset(undefined, ctx)

    select.mockReset()
    select.mockResolvedValueOnce('No')
    expect(await writeFile(toolCall, ctx, 'tmp/session.txt')).toMatchObject({ block: true })
  })
})

describe('legacy session editor', () => {
  it('keeps the SettingsList editor in legacy mode', async () => {
    const { ctx, sessionPermissions } = setup({
      fileAccess: {
        external: { protected: {}, unprotected: {} },
        internal: { protected: {}, unprotected: {} },
      },
    })

    await sessionPermissions(undefined, ctx)

    expect(ctx.ui.custom).toHaveBeenCalledTimes(1)
    expect(ctx.ui.select).not.toHaveBeenCalled()
  })
})
