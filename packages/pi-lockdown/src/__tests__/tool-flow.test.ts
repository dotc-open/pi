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
import { SESSION_PERMISSIONS_TOOL_NAME } from '../session-permissions-tool'

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

type ToolExecutor = {
  execute: (
    toolCallId: string,
    params: unknown,
    ctx: ExtensionContext,
  ) => Promise<{ content: { text: string }[]; isError?: boolean }>
}

function load(project: Record<string, unknown>, options: { hasUI?: boolean } = {}) {
  state.project = project
  state.global = {}
  handlers.clear()

  const tools = new Map<string, ToolExecutor>()
  const pi = {
    registerFlag: vi.fn(),
    on: (name: string, handler: Handler) => handlers.set(name, handler),
    registerCommand: vi.fn(),
    registerTool: (tool: {
      name: string
      execute: (id: string, params: unknown, signal: unknown, update: unknown, ctx: ExtensionContext) => Promise<never>
    }) => {
      tools.set(tool.name, { execute: (id, params, ctx) => tool.execute(id, params, undefined, undefined, ctx) })
    },
    setActiveTools: vi.fn(),
    getFlag: vi.fn().mockReturnValue(false),
  } as unknown as ExtensionAPI

  lockdownExtension(pi)

  const select = vi.fn(async () => 'Yes' as string | undefined)
  const ctx = makeCtx(options.hasUI ?? true, select)
  handlers.get('session_start')?.(undefined, ctx)

  return { pi, ctx, select, tools, toolCall: handlers.get('tool_call') as Handler }
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
  it('prompts once and allows on Yes', async () => {
    const { toolCall, ctx } = load({ lockdown: { fileAccess: { allowWrite: [], denyWrite: [] } } })
    expect(
      await toolCall({ toolName: 'write', input: { path: path.join(state.cwd, 'src', 'a'), content: 'x' } }, ctx),
    ).toBeUndefined()
    expect(ctx.ui.select).toHaveBeenCalledTimes(1)
  })

  it('blocks on No with the user-blocked reason', async () => {
    const { toolCall, ctx, select } = load({ lockdown: { fileAccess: { allowWrite: [], denyWrite: [] } } })
    select.mockResolvedValueOnce('No')
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

describe('session permission tool', () => {
  it('applies an add to the session list', async () => {
    const { toolCall, ctx, tools } = load({ lockdown: { fileAccess: { allowWrite: [], denyWrite: [] } } })

    const result = await tools
      .get('lockdown_session_permissions')
      ?.execute('call', { list: 'allowWrite', action: 'add', entries: ['src/'] }, ctx)

    expect(result?.isError).toBeUndefined()
    expect(result?.content[0]?.text).toContain('allowWrite is now: src/')
    expect(
      await toolCall({ toolName: 'write', input: { path: path.join(state.cwd, 'src', 'a'), content: 'x' } }, ctx),
    ).toBeUndefined()
  })

  it('rejects changes in legacy mode', async () => {
    const { ctx, tools } = load({
      lockdown: {
        fileAccess: { external: { protected: {}, unprotected: {} }, internal: { protected: {}, unprotected: {} } },
      },
    })

    const result = await tools
      .get('lockdown_session_permissions')
      ?.execute('call', { list: 'allowWrite', action: 'add', entries: ['src/'] }, ctx)

    expect(result?.isError).toBe(true)
    expect(result?.content[0]?.text).toContain('new mode')
  })

  it('rejects empty entries', async () => {
    const { ctx, tools } = load({ lockdown: { fileAccess: { allowWrite: [], denyWrite: [] } } })

    const result = await tools
      .get('lockdown_session_permissions')
      ?.execute('call', { list: 'allowWrite', action: 'add', entries: ['   '] }, ctx)

    expect(result?.isError).toBe(true)
    expect(result?.content[0]?.text).toContain('No entries')
  })

  it('adds a custom tool at block level', async () => {
    const { toolCall, ctx, tools } = load({ lockdown: { fileAccess: { allowWrite: [], denyWrite: [] } } })

    const result = await tools
      .get('lockdown_session_permissions')
      ?.execute('call', { list: 'customTools', action: 'set', entries: ['danger'] }, ctx)

    expect(result?.isError).toBeUndefined()
    expect(result?.content[0]?.text).toContain('customTools is now: danger=block')
    expect(await toolCall({ toolName: 'danger', input: {} }, ctx)).toMatchObject({ block: true })
  })

  it('sets a custom tool level with name=level', async () => {
    const { toolCall, ctx, tools } = load({
      lockdown: { fileAccess: { allowWrite: [], denyWrite: [] }, customTools: { maybe: 'warn' } },
    })

    const result = await tools
      .get('lockdown_session_permissions')
      ?.execute('call', { list: 'customTools', action: 'set', entries: ['maybe=allow'] }, ctx)

    expect(result?.isError).toBeUndefined()
    expect(await toolCall({ toolName: 'maybe', input: {} }, ctx)).toBeUndefined()
    expect(ctx.ui.select).not.toHaveBeenCalled()
  })

  it('removes a custom tool', async () => {
    const { ctx, tools } = load({
      lockdown: { fileAccess: { allowWrite: [], denyWrite: [] }, customTools: { gone: 'block' } },
    })

    const result = await tools
      .get('lockdown_session_permissions')
      ?.execute('call', { list: 'customTools', action: 'remove', entries: ['gone'] }, ctx)

    expect(result?.isError).toBeUndefined()
    expect(result?.content[0]?.text).toContain('(empty)')
  })

  it('rejects an invalid custom tool level', async () => {
    const { ctx, tools } = load({ lockdown: { fileAccess: { allowWrite: [], denyWrite: [] } } })

    const result = await tools
      .get('lockdown_session_permissions')
      ?.execute('call', { list: 'customTools', action: 'set', entries: ['tool=maybe'] }, ctx)

    expect(result?.isError).toBe(true)
    expect(result?.content[0]?.text).toContain('Invalid level')
  })

  it('refuses to change its own session level', async () => {
    const { ctx, tools } = load({ lockdown: { fileAccess: { allowWrite: [], denyWrite: [] } } })

    const result = await tools
      .get('lockdown_session_permissions')
      ?.execute(
        'call',
        { list: 'customTools', action: 'set', entries: [`${SESSION_PERMISSIONS_TOOL_NAME}=allow`] },
        ctx,
      )

    expect(result?.isError).toBe(true)
    expect(result?.content[0]?.text).toContain('Refusing')
  })

  it('applies nothing when a mixed call touches its own level', async () => {
    const { toolCall, ctx, tools } = load(
      { lockdown: { fileAccess: { allowWrite: [], denyWrite: [] } } },
      { hasUI: false },
    )

    const result = await tools
      .get('lockdown_session_permissions')
      ?.execute(
        'call',
        { list: 'customTools', action: 'set', entries: ['other=allow', SESSION_PERMISSIONS_TOOL_NAME] },
        ctx,
      )

    expect(result?.isError).toBe(true)
    // `other` was not applied, so it still defaults to warn and blocks headless.
    expect(await toolCall({ toolName: 'other', input: {} }, ctx)).toMatchObject({ block: true })
  })
})

describe('custom tools', () => {
  it('uses customTools permissions in new mode', async () => {
    const { toolCall, ctx } = load({
      lockdown: { fileAccess: { allowWrite: [], denyWrite: [] }, customTools: { danger: 'block' } },
    })
    expect(await toolCall({ toolName: 'danger', input: {} }, ctx)).toMatchObject({ block: true })
  })

  it('fails closed for warn custom tools in headless mode', async () => {
    const { toolCall, ctx } = load(
      { lockdown: { fileAccess: { allowWrite: [], denyWrite: [] }, customTools: { maybe: 'warn' } } },
      { hasUI: false },
    )
    expect(await toolCall({ toolName: 'maybe', input: {} }, ctx)).toMatchObject({ block: true })
  })
})

describe('subagent tool levels', () => {
  const fileAccess = { allowWrite: [], denyWrite: [] }

  it('lets subagent:<name> override the generic subagent level', async () => {
    const { toolCall, ctx } = load({
      lockdown: { fileAccess, customTools: { subagent: 'block', 'subagent:scout': 'allow' } },
    })

    expect(await toolCall({ toolName: 'subagent', input: { agent: 'scout', task: 'x' } }, ctx)).toBeUndefined()
    expect(await toolCall({ toolName: 'subagent', input: { agent: 'other', task: 'x' } }, ctx)).toMatchObject({
      block: true,
    })
  })

  it('falls back to the generic subagent level for unnamed agents', async () => {
    const { toolCall, ctx, select } = load({
      lockdown: { fileAccess, customTools: { subagent: 'warn', 'subagent:scout': 'allow' } },
    })

    expect(await toolCall({ toolName: 'subagent', input: { agent: 'other', task: 'x' } }, ctx)).toBeUndefined()
    expect(select).toHaveBeenCalledTimes(1)
  })

  it('takes the strictest level across a multi-agent call', async () => {
    const { toolCall, ctx } = load({
      lockdown: { fileAccess, customTools: { subagent: 'allow', 'subagent:blocked': 'block' } },
    })

    const parallel = {
      tasks: [
        { agent: 'ok', task: 'a' },
        { agent: 'blocked', task: 'b' },
      ],
    }
    expect(await toolCall({ toolName: 'subagent', input: parallel }, ctx)).toMatchObject({ block: true })

    const chain = {
      chain: [
        { agent: 'blocked', task: 'a' },
        { agent: 'ok', task: 'b' },
      ],
    }
    expect(await toolCall({ toolName: 'subagent', input: chain }, ctx)).toMatchObject({ block: true })
  })

  it('does not treat scoped keys as tool names', () => {
    const { pi } = load({ lockdown: { fileAccess, customTools: { 'subagent:scout': 'allow' } } })

    const activated = (pi.setActiveTools as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string[]
    expect(activated).not.toContain('subagent:scout')
  })
})

describe('legacy mode regression', () => {
  const legacy = {
    fileAccess: {
      external: {},
      internal: { unprotected: { read: 'allow', write: 'warn' } },
    },
  }

  it('keeps the fileAccess matrix behaviour', async () => {
    const { toolCall, ctx } = load({ lockdown: legacy }, { hasUI: false })
    expect(await toolCall({ toolName: 'read', input: { path: path.join(state.cwd, 'src', 'a') } }, ctx)).toBeUndefined()
    expect(
      await toolCall({ toolName: 'write', input: { path: path.join(state.cwd, 'src', 'a'), content: 'x' } }, ctx),
    ).toMatchObject({ block: true })
  })

  it('keeps protectedPatterns behaviour for legacy configs', async () => {
    const { toolCall, ctx } = load({ lockdown: legacy }, { hasUI: false })
    expect(
      await toolCall({ toolName: 'write', input: { path: path.join(state.cwd, '.env'), content: 'x' } }, ctx),
    ).toMatchObject({ block: true })
  })
})
