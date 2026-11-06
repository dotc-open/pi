import path from 'node:path'

import {
  type ExtensionAPI,
  type ExtensionContext,
  getSettingsListTheme,
  isToolCallEventType,
} from '@earendil-works/pi-coding-agent'
import { Box, Container, SettingsList, Text } from '@earendil-works/pi-tui'

import { SUBAGENT_FLAG } from './constants'
import { evaluateFilePath, type PathEvaluation } from './path-policy'
import { defaultLockdownSettings, type LockdownLevel, LockdownLevelSchema } from './schema'
import { configureNewModeSession } from './session-editor'
import {
  applySessionPermissions,
  SESSION_PERMISSIONS_TOOL_NAME,
  SessionPermissionsParams,
} from './session-permissions-tool'
import { isScopedToolKey, resolveToolLevel } from './tool-level'
import { constructSettingsList, isInside, isPiReadablePath, loadSettings } from './utils'

type BlockResult = { block: true; reason: string }

function denyReason(toolName: string, inputPath: string, decision: PathEvaluation): string {
  const rule = decision.rule ? `\n\nMatched deny rule: "${decision.rule}".` : ''
  const target = decision.target !== decision.requested ? `\nResolved target: ${decision.target}.` : ''
  return `[LOCKDOWN] Not allowed to perform action:\n\n${toolName}: ${inputPath}.${target}${rule}`
}

/**
 * Prompts for a file call the policy did not allow. Returns `undefined` when
 * the user allows the single call, otherwise a block result. Without a UI,
 * the prompt fails closed.
 */
async function promptForPath(
  ctx: ExtensionContext,
  toolName: string,
  inputPath: string,
  rule: string | undefined,
): Promise<BlockResult | undefined> {
  const detail = rule ? `\n\nMatched rule: "${rule}".` : ''
  if (!ctx.hasUI) {
    return { block: true, reason: `[LOCKDOWN] Not allowed to perform action:\n\n${toolName}: ${inputPath}.${detail}` }
  }

  const choice = await ctx.ui.select(
    `[LOCKDOWN]\n⚠️ Allow agent to perform action?\n\n${toolName}: ${inputPath}${detail}`,
    ['Yes', 'No'],
  )

  if (choice !== 'Yes') {
    return { block: true, reason: '[LOCKDOWN] Action blocked by user.' }
  }
  return undefined
}

// Settings
let lockdownSettings = defaultLockdownSettings()

function isSubagentProcess(pi: ExtensionAPI): boolean {
  return pi.getFlag(SUBAGENT_FLAG) === true || process.env.PI_LOCKDOWN_SUBAGENT === '1'
}

/**
 * Lockdown: A Pi extension to add security constraints to agents' tool usage.
 */
export default function (pi: ExtensionAPI) {
  pi.registerFlag(SUBAGENT_FLAG, {
    description: 'Run with the lockdownSubagent permission profile (for subagent processes).',
    type: 'boolean',
    default: false,
  })

  // Set allowed tools
  pi.on('session_start', (_, ctx) => {
    // Load settings
    const loadedSettings = loadSettings(ctx, isSubagentProcess(pi))
    if (!loadedSettings) {
      ctx.ui.notify('Could not load settings.', 'error')
      ctx.shutdown()
      return
    }

    lockdownSettings = loadedSettings

    // Set tools. The session-permissions tool is main-agent only; its level
    // still comes from `customTools` (default `warn`, so it prompts).
    const tools = (lockdownSettings.defaultTools as string[]).concat(
      Object.keys(lockdownSettings.customTools).filter((name) => !isScopedToolKey(name)),
    )
    if (!isSubagentProcess(pi)) tools.push(SESSION_PERMISSIONS_TOOL_NAME)
    pi.setActiveTools(Array.from(new Set(tools)))
  })

  pi.registerTool({
    name: SESSION_PERMISSIONS_TOOL_NAME,
    label: 'Update Session Permissions',
    description:
      'Temporarily add, remove, or set entries in one of the session lockdown path lists (denyRead, allowRead, allowWrite, denyWrite), or set per-tool levels via the customTools list. Use it only when the user asks to grant or revoke access for the current session, for example after a write was blocked or prompted. The tool refuses to change its own session level. Changes are in-memory only and are discarded by /lockdown:reset or a new session.',
    promptSnippet: 'Change session-only lockdown path lists or tool levels when the user asks for temporary access',
    promptGuidelines: [
      'Use lockdown_session_permissions to grant or revoke session access only when the user asks; the call itself is confirmed by the normal custom-tool permission.',
      'Prefer the narrowest entry that unblocks the task (for example "e2e/" rather than "."), and say what you changed.',
      'For customTools, pass "tool_name" (defaults to block) or "tool_name=<allow|warn|block>"; the tool cannot change its own level.',
    ],
    parameters: SessionPermissionsParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      if (isSubagentProcess(pi)) {
        return {
          content: [{ type: 'text', text: 'Session permissions are not available to subagents.' }],
          details: {},
          isError: true,
        }
      }

      const outcome = applySessionPermissions(lockdownSettings, params)
      if (!outcome.ok) {
        return { content: [{ type: 'text', text: outcome.message }], details: {}, isError: true }
      }

      ctx.ui.notify(`[LOCKDOWN] ${outcome.message}`, 'info')
      return {
        content: [{ type: 'text', text: `${outcome.message} Changes apply to this session only.` }],
        details: { list: outcome.list, entries: outcome.entries },
      }
    },
  })

  pi.on('tool_call', async (event, ctx) => {
    // Block bash
    if (isToolCallEventType('bash', event)) {
      return { block: true, reason: '[LOCKDOWN] Bash usage blocked.' }
    }

    const isRead = isToolCallEventType('read', event)
    const isEdit = isToolCallEventType('edit', event)
    const isWrite = isToolCallEventType('write', event)
    const isGrep = isToolCallEventType('grep', event)
    const isFind = isToolCallEventType('find', event)
    const isLs = isToolCallEventType('ls', event)

    // Special case: Prevent deletion workaround
    if (isWrite && event.input.content.trim().length === 0) {
      return {
        block: true,
        reason: '[LOCKDOWN] Not allowed to soft-remove file by writing empty content to file.',
      }
    }

    // Compute permissions
    const hasPath = isRead || isEdit || isWrite
    let inputPath = '.'
    if (hasPath) {
      inputPath = event.input.path
    } else if (isGrep || isFind || isLs) {
      inputPath = event.input.path ?? '.'
    } else {
      inputPath = event.input ? JSON.stringify(event.input) : '.'
    }

    let permAction: 'read' | 'edit' | 'write' | undefined = undefined

    if (isRead) {
      permAction = 'read'
    } else if (isGrep) {
      permAction = 'read'
    } else if (isFind || isLs) {
      permAction = 'read'
    } else if (isEdit) {
      permAction = 'edit'
    } else if (isWrite) {
      permAction = 'write'
    }

    // Pi's own installation directory is safe to look up even when external
    // or under node_modules. Never exempt writes, edits, or custom tools.
    if (permAction === 'read' && isPiReadablePath(ctx.cwd, inputPath)) {
      return
    }

    // New mode: built-in file tools go through the four path-list policy.
    if (lockdownSettings.mode === 'new' && permAction) {
      const action = permAction === 'read' ? 'read' : 'write'
      const decision = evaluateFilePath(lockdownSettings, ctx.cwd, inputPath, action)
      switch (decision.outcome) {
        case 'allow':
          return
        case 'block':
          return { block: true, reason: denyReason(event.toolName, inputPath, decision) }
        case 'prompt':
          return promptForPath(ctx, event.toolName, inputPath, decision.rule)
      }
    }

    let permission: LockdownLevel
    if (permAction && lockdownSettings.mode === 'legacy') {
      const location: 'internal' | 'external' = isInside(ctx.cwd, inputPath) ? 'internal' : 'external'
      const isProtected = lockdownSettings.protectedPatterns.some((pattern) => path.matchesGlob(inputPath, pattern))
      const protection: 'protected' | 'unprotected' = isProtected ? 'protected' : 'unprotected'
      permission = lockdownSettings.fileAccess[location][protection][permAction]
    } else {
      // Custom tools: Default to warn; `subagent:<name>` overrides `subagent`.
      permission = resolveToolLevel(lockdownSettings.customTools, event.toolName, event.input)
    }

    switch (permission) {
      case 'block':
        return {
          block: true,
          reason: `[LOCKDOWN] Not allowed to perform action:\n\n${event.toolName}: ${inputPath}.`,
        }
      case 'warn': {
        if (!ctx.hasUI) {
          // Headless (e.g. subagents in JSON mode): no way to confirm the
          // action, so fail closed and block.
          return {
            block: true,
            reason: `[LOCKDOWN] Not allowed to perform action:\n\n${event.toolName}: ${inputPath}.`,
          }
        }

        const choice = await ctx.ui.select(
          `[LOCKDOWN]\n⚠️ Allow agent to perform action?\n\n${event.toolName}: ${inputPath}`,
          ['Yes', 'No'],
        )

        if (choice !== 'Yes') {
          return {
            block: true,
            reason: '[LOCKDOWN] Action blocked by user.',
          }
        }
        return
      }
      case 'allow':
        return
    }
  })

  // Reset permissions
  pi.registerCommand('lockdown:reset', {
    description: 'Reset permissions to those specified in settings.json and/or defaults.',
    handler: async (_, ctx) => {
      const loadedSettings = loadSettings(ctx, isSubagentProcess(pi))
      if (!loadedSettings) {
        ctx.ui.notify('Could not update permissions.', 'error')
        ctx.shutdown()
        return
      }
      lockdownSettings = loadedSettings
      ctx.ui.notify('Permissions have been reset.', 'info')
    },
  })

  // Temporarily update permissions
  pi.registerCommand('lockdown:session-permissions', {
    description: 'Configure file access permissions for session.',
    handler: async (_args, ctx) => {
      const settings = lockdownSettings
      if (settings.mode === 'new') {
        await configureNewModeSession(ctx, settings)
        return
      }
      const items = constructSettingsList(settings)

      await ctx.ui.custom((_tui, theme, _kb, done) => {
        const container = new Container()

        const titleBox = new Box(0, 1)
        titleBox.addChild(new Text(theme.fg('accent', theme.bold('Session Permissions')), 0, 0))
        titleBox.addChild(
          new Text(
            theme.fg('dim', 'Toggle file access permissions for the session. Changes are immediately applied.'),
            0,
            0,
          ),
        )

        container.addChild(titleBox)

        const settingsList = new SettingsList(
          items,
          Math.min(items.length + 2, 15),
          getSettingsListTheme(),
          (id, newValue) => {
            // Handle value change
            const [permType, locationOrCustomTool, protection, perm] = id.split('__')
            if (permType === 'fileAccess') {
              settings.fileAccess[locationOrCustomTool as 'external' | 'internal'][
                protection as 'protected' | 'unprotected'
              ][perm as 'read' | 'write' | 'edit'] = LockdownLevelSchema.parse(newValue)
            } else {
              settings.customTools[locationOrCustomTool as string] = LockdownLevelSchema.parse(newValue)
            }
          },
          () => done(undefined), // On close
          { enableSearch: true }, // Optional: enable fuzzy search by label
        )
        container.addChild(settingsList)

        return {
          render: (w) => container.render(w),
          invalidate: () => container.invalidate(),
          handleInput: (data) => settingsList.handleInput?.(data),
        }
      })
    },
  })
}
