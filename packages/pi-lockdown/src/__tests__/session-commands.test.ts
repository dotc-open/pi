import { mkdirSync, mkdtempSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import type { ExtensionAPI, ExtensionContext, Theme } from '@earendil-works/pi-coding-agent'
import type { Component } from '@earendil-works/pi-tui'
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

import lockdownExtension from '../index'
import type { PathPolicySettings } from '../schema'
import { applyListEdits, createListChooser, createListEditor } from '../session-editor'

type Handler = (event: unknown, ctx: unknown) => unknown
type CommandHandler = (args: unknown, ctx: unknown) => Promise<unknown>

const UP = '\x1b[A'
const DOWN = '\x1b[B'
const ENTER = '\r'
const ESCAPE = '\x1b'
const DELETE = '\x1b[3~'
const TAB = '\t'

function fakeTheme() {
  return {
    fg: vi.fn((_color: string, text: string) => text),
    bold: vi.fn((text: string) => text),
    strikethrough: vi.fn((text: string) => text),
  } as unknown as Theme
}

function policySettings(overrides: Partial<PathPolicySettings> = {}): PathPolicySettings {
  return {
    defaultTools: ['read', 'edit', 'write', 'grep', 'find', 'ls'],
    customTools: {},
    denyRead: ['**/.env*'],
    allowRead: ['.'],
    allowWrite: [],
    denyWrite: ['**/.git/**'],
    ...overrides,
  }
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

async function nextComponent(components: Component[], count: number): Promise<Component> {
  for (let i = 0; i < 100; i += 1) {
    const component = components[count - 1]
    if (component) return component
    await tick()
  }
  throw new Error(`component ${count} was not created`)
}

/** A `ctx.ui.custom` replacement that hands tests the created components. */
function createCustomDriver() {
  const components: Component[] = []
  const custom = vi.fn(
    (factory: unknown) =>
      new Promise((resolve) => {
        const component = (factory as (...args: unknown[]) => Component)(
          { requestRender: vi.fn() },
          fakeTheme(),
          {},
          resolve,
        )
        components.push(component)
      }),
  )
  return { custom, components }
}

function setup(projectLockdown: Record<string, unknown>, options: { hasUI?: boolean; custom?: unknown } = {}) {
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
  const custom = options.custom ?? vi.fn()
  const ctx = {
    cwd: state.cwd,
    hasUI: options.hasUI ?? true,
    ui: { notify: vi.fn(), select, input, custom },
    shutdown: vi.fn(),
  } as unknown as ExtensionContext

  handlers.get('session_start')?.(undefined, ctx)

  return {
    ctx,
    select,
    input,
    custom: custom as ReturnType<typeof vi.fn>,
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

describe('applyListEdits', () => {
  it('removes flagged entries, appends additions and skips duplicates', () => {
    expect(applyListEdits(['a', 'b'], { added: ['c', 'a'], removed: ['b'] })).toEqual(['a', 'c'])
  })
})

describe('list chooser', () => {
  it('shows each list inline in a dim style, truncated to one line', () => {
    const theme = fakeTheme()
    const chooser = createListChooser(
      policySettings({ denyRead: ['a'.repeat(200)], allowWrite: ['e2e/'] }),
      theme,
      { requestRender: vi.fn() },
      vi.fn(),
    )

    const lines = chooser.render(40)
    const denyLine = lines.find((line) => line.includes('denyRead'))
    expect(denyLine).toContain('...')
    expect(theme.fg).toHaveBeenCalledWith('dim', expect.stringContaining('e2e/'))
  })

  it('returns the selected key and closes on escape', () => {
    const done = vi.fn()
    const chooser = createListChooser(policySettings(), fakeTheme(), { requestRender: vi.fn() }, done)

    chooser.handleInput?.(DOWN)
    chooser.handleInput?.(DOWN)
    chooser.handleInput?.(ENTER)
    expect(done).toHaveBeenCalledWith('allowWrite')

    chooser.handleInput?.(ESCAPE)
    expect(done).toHaveBeenCalledWith(undefined)
  })
})

describe('list editor', () => {
  it('flags an entry for deletion and saves on empty enter', () => {
    const done = vi.fn()
    const editor = createListEditor('allowWrite', ['e2e/'], state.cwd, fakeTheme(), { requestRender: vi.fn() }, done)

    editor.handleInput?.(UP)
    editor.handleInput?.(DELETE)
    expect(done).not.toHaveBeenCalled()

    editor.handleInput?.(ENTER)
    expect(done).toHaveBeenCalledWith({ added: [], removed: ['e2e/'] })
  })

  it('returns undefined on escape without saving', () => {
    const done = vi.fn()
    const editor = createListEditor('allowWrite', ['e2e/'], state.cwd, fakeTheme(), { requestRender: vi.fn() }, done)

    editor.handleInput?.(UP)
    editor.handleInput?.(DELETE)
    editor.handleInput?.(ESCAPE)

    expect(done).toHaveBeenCalledWith(undefined)
  })

  it('adds free text then saves on empty enter', () => {
    const done = vi.fn()
    const editor = createListEditor('allowWrite', [], state.cwd, fakeTheme(), { requestRender: vi.fn() }, done)

    for (const character of 'tmp/') editor.handleInput?.(character)
    editor.handleInput?.(ENTER)
    editor.handleInput?.(ENTER)

    expect(done).toHaveBeenCalledWith({ added: ['tmp/'], removed: [] })
  })

  it('completes the free text from the filesystem', async () => {
    mkdirSync(path.join(state.cwd, 'e2e'))
    const done = vi.fn()
    const editor = createListEditor('allowWrite', [], state.cwd, fakeTheme(), { requestRender: vi.fn() }, done)

    editor.handleInput?.('e')
    editor.handleInput?.('2')
    await tick()
    editor.handleInput?.(TAB)
    editor.handleInput?.(ENTER)
    editor.handleInput?.(ENTER)

    expect(done).toHaveBeenCalledWith({ added: ['e2e/'], removed: [] })
  })

  it('switches the hint between save/exit and add/discard', () => {
    const editor = createListEditor('allowWrite', [], state.cwd, fakeTheme(), { requestRender: vi.fn() }, vi.fn())

    expect(editor.render(80).join('\n')).toContain('Enter save • Esc exit')
    editor.handleInput?.('e')
    expect(editor.render(80).join('\n')).toContain('Enter add • Esc discard')
  })

  it('windows long lists and shows the scroll position', () => {
    const entries = Array.from({ length: 20 }, (_, i) => `dir${i}/`)
    const editor = createListEditor('allowWrite', entries, state.cwd, fakeTheme(), { requestRender: vi.fn() }, vi.fn())

    const rendered = editor.render(60).join('\n')
    expect(rendered).not.toContain('dir0/')
    expect(rendered).toContain('dir19/')
    expect(rendered).toContain('(21/21)')
  })
})

describe('new-mode session permissions', () => {
  it('reports that an interactive UI is required when headless', async () => {
    const { ctx, sessionPermissions, custom } = setup({ fileAccess: { allowWrite: [] } }, { hasUI: false })

    await sessionPermissions(undefined, ctx)

    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining('interactive UI'), 'error')
    expect(custom).not.toHaveBeenCalled()
  })

  it('adds an entry to a selected list and applies it immediately', async () => {
    const { custom, components } = createCustomDriver()
    const { ctx, sessionPermissions, toolCall } = setup({ fileAccess: { allowWrite: [], denyWrite: [] } }, { custom })

    const run = sessionPermissions(undefined, ctx)

    const chooser = await nextComponent(components, 1)
    chooser.handleInput?.(DOWN)
    chooser.handleInput?.(DOWN)
    chooser.handleInput?.(ENTER)

    const editor = await nextComponent(components, 2)
    for (const character of 'e2e/') editor.handleInput?.(character)
    editor.handleInput?.(ENTER)
    editor.handleInput?.(ENTER)
    await run

    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining('Added "e2e/"'), 'info')
    expect(await writeFile(toolCall, ctx, 'e2e/snapshot.txt')).toBeUndefined()
  })

  it('removes an entry from a selected list', async () => {
    const { custom, components } = createCustomDriver()
    const { ctx, sessionPermissions, toolCall } = setup(
      { fileAccess: { allowWrite: ['e2e/'], denyWrite: [] } },
      { custom },
    )

    const run = sessionPermissions(undefined, ctx)

    const chooser = await nextComponent(components, 1)
    chooser.handleInput?.(DOWN)
    chooser.handleInput?.(DOWN)
    chooser.handleInput?.(ENTER)

    const editor = await nextComponent(components, 2)
    editor.handleInput?.(UP)
    editor.handleInput?.(DELETE)
    editor.handleInput?.(ENTER)
    await run

    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining('Removed "e2e/"'), 'info')

    ctx.ui.select = vi.fn().mockResolvedValue('No')
    expect(await writeFile(toolCall, ctx, 'e2e/snapshot.txt')).toMatchObject({ block: true })
  })

  it('does not save escape cancellation to the list', async () => {
    const { custom, components } = createCustomDriver()
    const { ctx, sessionPermissions, toolCall } = setup({ fileAccess: { allowWrite: [], denyWrite: [] } }, { custom })

    const run = sessionPermissions(undefined, ctx)

    const chooser = await nextComponent(components, 1)
    chooser.handleInput?.(DOWN)
    chooser.handleInput?.(DOWN)
    chooser.handleInput?.(ENTER)

    const editor = await nextComponent(components, 2)
    for (const character of 'tmp/') editor.handleInput?.(character)
    editor.handleInput?.(ENTER)
    editor.handleInput?.(ESCAPE)

    const closing = await nextComponent(components, 3)
    closing.handleInput?.(ESCAPE)
    await run

    expect(ctx.ui.notify).not.toHaveBeenCalledWith(expect.stringContaining('Added'), 'info')

    ctx.ui.select = vi.fn().mockResolvedValue('No')
    expect(await writeFile(toolCall, ctx, 'tmp/session.txt')).toMatchObject({
      block: true,
      reason: '[LOCKDOWN] Action blocked by user.',
    })
  })
})

describe('lockdown:reset', () => {
  it('discards session edits by reloading the selected settings', async () => {
    const { custom, components } = createCustomDriver()
    const { ctx, sessionPermissions, toolCall, reset } = setup(
      { fileAccess: { allowWrite: ['e2e/'], denyWrite: [] } },
      { custom },
    )

    const run = sessionPermissions(undefined, ctx)
    const chooser = await nextComponent(components, 1)
    chooser.handleInput?.(DOWN)
    chooser.handleInput?.(DOWN)
    chooser.handleInput?.(ENTER)

    const editor = await nextComponent(components, 2)
    for (const character of 'tmp/') editor.handleInput?.(character)
    editor.handleInput?.(ENTER)
    editor.handleInput?.(ENTER)
    await run
    expect(await writeFile(toolCall, ctx, 'tmp/session.txt')).toBeUndefined()

    await reset(undefined, ctx)

    ctx.ui.select = vi.fn().mockResolvedValue('No')
    expect(await writeFile(toolCall, ctx, 'tmp/session.txt')).toMatchObject({ block: true })
  })
})

describe('legacy session editor', () => {
  it('keeps the SettingsList editor in legacy mode', async () => {
    const { ctx, sessionPermissions, custom, select } = setup({
      fileAccess: {
        external: { protected: {}, unprotected: {} },
        internal: { protected: {}, unprotected: {} },
      },
    })

    await sessionPermissions(undefined, ctx)

    expect(custom).toHaveBeenCalledTimes(1)
    expect(select).not.toHaveBeenCalled()
  })
})
