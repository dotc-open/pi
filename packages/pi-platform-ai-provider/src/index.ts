import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent'

import { DEFAULT_KEY_NAME, discoverKeyVars, resolveActiveKey, resolveStartingKeyName } from './keys'

/** Session-scoped active key name. Transient by design: never persisted, re-resolved per session. */
let activePlatformAiApiKey: string = DEFAULT_KEY_NAME

export default function (pi: ExtensionAPI) {
  /** Make the requested name active, warning when it has no environment variable. */
  const applyKey = (requested: string, ctx: ExtensionContext) => {
    const resolved = resolveActiveKey(requested, discoverKeyVars(process.env))
    activePlatformAiApiKey = resolved.name

    if (resolved.fellBack) {
      ctx.ui.notify(`Platform AI key "${requested}" is not set; using "${resolved.name}".`, 'warning')
    }

    return resolved
  }

  pi.registerProvider('platform-ai', {
    name: 'PlatformAI',
    baseUrl: 'https://api.ai.tech.gov.sg/platform/models',
    apiKey: '$PLATFORM_AI_API_KEY',
    api: 'openai-completions',
  })

  pi.on('session_start', (_event, ctx) => {
    const resolved = applyKey(resolveStartingKeyName(ctx.cwd, process.env), ctx)

    if (ctx.mode === 'tui') {
      ctx.ui.notify(`Platform AI API key: ${resolved.name}`)
    }
  })

  // LiteLLM session tracking: send session ID via header and body metadata
  // Key switching: the active key is injected per request, since Pi resolves the provider's
  // `apiKey` once and this hook merges headers last.
  pi.on('before_provider_headers', (event, ctx) => {
    if (ctx.model?.provider !== 'platform-ai') return
    event.headers['x-litellm-session-id'] = process.env.PI_SESSION_ID || ctx.sessionManager.getSessionId()

    const { envVar } = resolveActiveKey(activePlatformAiApiKey, discoverKeyVars(process.env))
    const key = envVar ? process.env[envVar] : undefined
    if (key) event.headers['Authorization'] = `Bearer ${key}`
  })

  pi.registerCommand('platform-ai-api-key', {
    description: 'Switch the Platform AI API key used by this session',
    handler: async (args, ctx) => {
      const names = [...discoverKeyVars(process.env).keys()]
      if (names.length === 0) {
        ctx.ui.notify('No Platform AI API key is set in the environment.', 'error')
        return
      }

      const requested = args.trim()
      if (requested) {
        const resolved = applyKey(requested, ctx)
        if (!resolved.fellBack) ctx.ui.notify(`Platform AI API key: ${resolved.name}`)
        return
      }

      if (!ctx.hasUI) {
        ctx.ui.notify('Pass a key name, for example /platform-ai-api-key personal.', 'warning')
        return
      }

      const chosen = await ctx.ui.select(`Platform AI API key (active: ${activePlatformAiApiKey})`, names)
      if (chosen) applyKey(chosen, ctx)
    },
  })

  pi.registerCommand('which-platform-ai-api-key', {
    description: 'Show the Platform AI API key used by this session',
    handler: async (_args, ctx) => {
      ctx.ui.notify(`Platform AI API key: ${activePlatformAiApiKey}`)
    },
  })
}
