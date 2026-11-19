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
import type { LockdownLevel, PathPolicySettings } from '../schema'
import { applyListEdits, createListChooser, createListEditor, createToolLevelEditor } from '../session-editor'

type Handler = (event: unknown, ctx: unknown) => unknown
type CommandHandler = (args: unknown, ctx: unknown) => Promise<unknown>

const UP = '\x1b[A'
const DOWN = '\x1b[B'
const ENTER = '\r'
const ESCAPE = '\x1b'
const DELETE = '\x1b[3~'
const TAB = '\t'
const SPACE = ' '

const toolEntries = (entries: Record<string, LockdownLevel>): [string, LockdownLevel][] => Object.entries(entries)

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
  const getAllTools = vi.fn().mockReturnValue([])
  const setActiveTools = vi.fn()
  const pi = {
    registerFlag: vi.fn(),
    on: (name: string, handler: Handler) => handlers.set(name, handler),
    registerCommand: (name: string, opts: { handler: CommandHandler }) => commands.set(name, opts.handler),
    registerTool: vi.fn(),
    setActiveTools,
    getAllTools,
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
    getAllTools,
    setActiveTools,
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

  it('shows the customTools row last with its levels', () => {
    const chooser = createListChooser(
      policySettings({ customTools: { subagent: 'block', shadcn_search: 'allow' } }),
      fakeTheme(),
      { requestRender: vi.fn() },
      vi.fn(),
    )

    const rendered = chooser.render(80).join('\n')
    expect(rendered).toContain('customTools (2)')
    expect(rendered).toContain('subagent=block, shadcn_search=allow')
  })

  it('selects the customTools row after the four path lists', () => {
    const done = vi.fn()
    const chooser = createListChooser(policySettings(), fakeTheme(), { requestRender: vi.fn() }, done)

    for (let i = 0; i < 4; i += 1) chooser.handleInput?.(DOWN)
    chooser.handleInput?.(ENTER)

    expect(done).toHaveBeenCalledWith('customTools')
  })
})

describe('tool level editor', () => {
  const render = (component: Component) => component.render(80).join('\n')

  it('cycles a level forward with space and saves', () => {
    const done = vi.fn()
    const editor = createToolLevelEditor(
      toolEntries({ subagent: 'warn' }),
      [],
      fakeTheme(),
      { requestRender: vi.fn() },
      done,
    )

    editor.handleInput?.(UP)
    editor.handleInput?.(SPACE)
    editor.handleInput?.(DOWN)
    editor.handleInput?.(ENTER)

    expect(done).toHaveBeenCalledWith({ subagent: 'block' })
  })

  it('cycles a level on enter and wraps block to allow', () => {
    const done = vi.fn()
    const editor = createToolLevelEditor(
      toolEntries({ shadcn_search: 'allow' }),
      [],
      fakeTheme(),
      { requestRender: vi.fn() },
      done,
    )

    editor.handleInput?.(UP)
    editor.handleInput?.(ENTER)
    editor.handleInput?.(DOWN)
    editor.handleInput?.(ENTER)

    expect(done).toHaveBeenCalledWith({ shadcn_search: 'warn' })
  })

  it('flags a row for deletion and saves without it', () => {
    const done = vi.fn()
    const editor = createToolLevelEditor(
      toolEntries({ subagent: 'warn', current_date: 'allow' }),
      [],
      fakeTheme(),
      { requestRender: vi.fn() },
      done,
    )

    editor.handleInput?.(UP)
    editor.handleInput?.(UP)
    editor.handleInput?.(DELETE)
    expect(render(editor)).toContain('[delete]')

    editor.handleInput?.(DOWN)
    editor.handleInput?.(DOWN)
    editor.handleInput?.(ENTER)

    expect(done).toHaveBeenCalledWith({ current_date: 'allow' })
  })

  it('toggles the deletion flag off on a second press', () => {
    const done = vi.fn()
    const editor = createToolLevelEditor(
      toolEntries({ subagent: 'warn' }),
      [],
      fakeTheme(),
      { requestRender: vi.fn() },
      done,
    )

    editor.handleInput?.(UP)
    editor.handleInput?.(DELETE)
    editor.handleInput?.(DELETE)
    editor.handleInput?.(DOWN)
    editor.handleInput?.(ENTER)

    expect(done).toHaveBeenCalledWith({ subagent: 'warn' })
  })

  it('adds a typed tool at warn and keeps the row for another add', () => {
    const done = vi.fn()
    const editor = createToolLevelEditor([], [], fakeTheme(), { requestRender: vi.fn() }, done)

    for (const character of 'nest_generate') editor.handleInput?.(character)
    editor.handleInput?.(ENTER)
    for (const character of 'subagent') editor.handleInput?.(character)
    editor.handleInput?.(ENTER)
    editor.handleInput?.(ENTER)

    expect(done).toHaveBeenCalledWith({ nest_generate: 'warn', subagent: 'warn' })
  })

  it('rejects an invalid tool name inline', () => {
    const done = vi.fn()
    const editor = createToolLevelEditor([], [], fakeTheme(), { requestRender: vi.fn() }, done)

    for (const character of 'bad name') editor.handleInput?.(character)
    editor.handleInput?.(ENTER)

    expect(done).not.toHaveBeenCalled()
    expect(render(editor)).toContain('letters, numbers, underscores and dashes')
  })

  it('rejects a duplicate tool name inline', () => {
    const done = vi.fn()
    const editor = createToolLevelEditor(
      toolEntries({ subagent: 'warn' }),
      [],
      fakeTheme(),
      { requestRender: vi.fn() },
      done,
    )

    for (const character of 'subagent') editor.handleInput?.(character)
    editor.handleInput?.(ENTER)

    expect(done).not.toHaveBeenCalled()
    expect(render(editor)).toContain('already configured')
  })

  it('completes the typed name from known tools, skipping configured ones', () => {
    const done = vi.fn()
    const editor = createToolLevelEditor(
      toolEntries({ subagent: 'block' }),
      ['subagent', 'current_date'],
      fakeTheme(),
      { requestRender: vi.fn() },
      done,
    )

    for (const character of 'cur') editor.handleInput?.(character)
    editor.handleInput?.(TAB)
    editor.handleInput?.(ENTER)
    editor.handleInput?.(ENTER)

    expect(done).toHaveBeenCalledWith({ subagent: 'block', current_date: 'warn' })
  })

  it('returns undefined on escape without saving', () => {
    const done = vi.fn()
    const editor = createToolLevelEditor(
      toolEntries({ subagent: 'warn' }),
      [],
      fakeTheme(),
      { requestRender: vi.fn() },
      done,
    )

    editor.handleInput?.('x')
    editor.handleInput?.(ESCAPE)

    expect(done).toHaveBeenCalledWith(undefined)
  })

  it('switches the hint between save and add', () => {
    const editor = createToolLevelEditor([], [], fakeTheme(), { requestRender: vi.fn() }, vi.fn())

    expect(render(editor)).toContain('Enter save • Esc cancel')
    editor.handleInput?.('a')
    expect(render(editor)).toContain('Enter add • Esc cancel')
  })

  it('windows long lists and shows the scroll position', () => {
    const entries = toolEntries(
      Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`tool${i}`, 'warn' as LockdownLevel])),
    )
    const editor = createToolLevelEditor(entries, [], fakeTheme(), { requestRender: vi.fn() }, vi.fn())

    const rendered = render(editor)
    expect(rendered).not.toContain('tool0')
    expect(rendered).toContain('tool19')
    expect(rendered).toContain('(21/21)')
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

  it('adds a custom tool at warn and activates it immediately', async () => {
    const { custom, components } = createCustomDriver()
    const { ctx, sessionPermissions, toolCall, setActiveTools } = setup({ fileAccess: {} }, { custom })

    const run = sessionPermissions(undefined, ctx)

    const chooser = await nextComponent(components, 1)
    for (let i = 0; i < 4; i += 1) chooser.handleInput?.(DOWN)
    chooser.handleInput?.(ENTER)

    const editor = await nextComponent(components, 2)
    for (const character of 'nest_generate') editor.handleInput?.(character)
    editor.handleInput?.(ENTER) // add at warn
    editor.handleInput?.(ENTER) // save
    await run

    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining('Added "nest_generate" to customTools at warn.'),
      'info',
    )
    expect(setActiveTools).toHaveBeenLastCalledWith(['read', 'edit', 'write', 'grep', 'find', 'ls', 'nest_generate'])

    ctx.ui.select = vi.fn().mockResolvedValue('No')
    expect(await toolCall({ toolName: 'nest_generate', input: {} }, ctx)).toMatchObject({
      block: true,
      reason: '[LOCKDOWN] Action blocked by user.',
    })
    ctx.ui.select = vi.fn().mockResolvedValue('Yes')
    expect(await toolCall({ toolName: 'nest_generate', input: {} }, ctx)).toBeUndefined()
  })

  it('sets an existing custom tool to allow and applies it immediately', async () => {
    const { custom, components } = createCustomDriver()
    const { ctx, sessionPermissions, toolCall } = setup(
      { customTools: { nest_generate: 'warn' }, fileAccess: {} },
      { custom },
    )

    const run = sessionPermissions(undefined, ctx)
    const chooser = await nextComponent(components, 1)
    for (let i = 0; i < 4; i += 1) chooser.handleInput?.(DOWN)
    chooser.handleInput?.(ENTER)

    const editor = await nextComponent(components, 2)
    editor.handleInput?.(UP)
    editor.handleInput?.(SPACE) // warn -> block
    editor.handleInput?.(SPACE) // block -> allow
    editor.handleInput?.(DOWN)
    editor.handleInput?.(ENTER)
    await run

    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining('Set "nest_generate" to allow in customTools.'),
      'info',
    )
    expect(await toolCall({ toolName: 'nest_generate', input: {} }, ctx)).toBeUndefined()
  })

  it('blocks a custom tool set to block', async () => {
    const { custom, components } = createCustomDriver()
    const { ctx, sessionPermissions, toolCall } = setup(
      { customTools: { nest_generate: 'warn' }, fileAccess: {} },
      { custom },
    )

    const run = sessionPermissions(undefined, ctx)
    const chooser = await nextComponent(components, 1)
    for (let i = 0; i < 4; i += 1) chooser.handleInput?.(DOWN)
    chooser.handleInput?.(ENTER)

    const editor = await nextComponent(components, 2)
    editor.handleInput?.(UP)
    editor.handleInput?.(SPACE) // warn -> block
    editor.handleInput?.(DOWN)
    editor.handleInput?.(ENTER)
    await run

    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining('Set "nest_generate" to block in customTools.'),
      'info',
    )
    expect(await toolCall({ toolName: 'nest_generate', input: {} }, ctx)).toMatchObject({ block: true })
  })

  it('falls back to warn after deleting a custom tool', async () => {
    const { custom, components } = createCustomDriver()
    const { ctx, sessionPermissions, toolCall, setActiveTools } = setup(
      { customTools: { nest_generate: 'allow' }, fileAccess: {} },
      { custom },
    )

    const run = sessionPermissions(undefined, ctx)
    const chooser = await nextComponent(components, 1)
    for (let i = 0; i < 4; i += 1) chooser.handleInput?.(DOWN)
    chooser.handleInput?.(ENTER)

    const editor = await nextComponent(components, 2)
    editor.handleInput?.(UP)
    editor.handleInput?.(DELETE)
    editor.handleInput?.(DOWN)
    editor.handleInput?.(ENTER)
    await run

    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining('Removed "nest_generate" from customTools.'),
      'info',
    )
    expect(setActiveTools).toHaveBeenLastCalledWith(['read', 'edit', 'write', 'grep', 'find', 'ls'])

    ctx.ui.select = vi.fn().mockResolvedValue('No')
    expect(await toolCall({ toolName: 'nest_generate', input: {} }, ctx)).toMatchObject({
      block: true,
      reason: '[LOCKDOWN] Action blocked by user.',
    })
    ctx.ui.select = vi.fn().mockResolvedValue('Yes')
    expect(await toolCall({ toolName: 'nest_generate', input: {} }, ctx)).toBeUndefined()
  })

  it('returns to the chooser when the tool editor is cancelled', async () => {
    const { custom, components } = createCustomDriver()
    const { ctx, sessionPermissions, toolCall } = setup(
      { customTools: { nest_generate: 'block' }, fileAccess: {} },
      { custom },
    )

    const run = sessionPermissions(undefined, ctx)
    const chooser = await nextComponent(components, 1)
    for (let i = 0; i < 4; i += 1) chooser.handleInput?.(DOWN)
    chooser.handleInput?.(ENTER)

    const editor = await nextComponent(components, 2)
    editor.handleInput?.(ESCAPE)

    const closing = await nextComponent(components, 3)
    closing.handleInput?.(ESCAPE)
    await run

    expect(ctx.ui.notify).not.toHaveBeenCalledWith(expect.stringContaining('customTools'), 'info')
    expect(await toolCall({ toolName: 'nest_generate', input: {} }, ctx)).toMatchObject({ block: true })
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

  it('restores configured tool levels after session edits', async () => {
    const { custom, components } = createCustomDriver()
    const { ctx, sessionPermissions, toolCall, reset } = setup(
      { customTools: { nest_generate: 'block' }, fileAccess: {} },
      { custom },
    )

    const run = sessionPermissions(undefined, ctx)
    const chooser = await nextComponent(components, 1)
    for (let i = 0; i < 4; i += 1) chooser.handleInput?.(DOWN)
    chooser.handleInput?.(ENTER)

    const editor = await nextComponent(components, 2)
    editor.handleInput?.(UP)
    editor.handleInput?.(SPACE) // block -> allow
    editor.handleInput?.(DOWN)
    editor.handleInput?.(ENTER)
    await run
    expect(await toolCall({ toolName: 'nest_generate', input: {} }, ctx)).toBeUndefined()

    await reset(undefined, ctx)

    expect(await toolCall({ toolName: 'nest_generate', input: {} }, ctx)).toMatchObject({ block: true })
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
