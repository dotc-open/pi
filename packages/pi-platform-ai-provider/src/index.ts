import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'

export default function (pi: ExtensionAPI) {
  pi.registerProvider('platform-ai', {
    name: 'PlatformAI',
    baseUrl: 'https://api.ai.tech.gov.sg/platform/models',
    apiKey: '$PLATFORM_AI_API_KEY',
    api: 'openai-completions',
  })

  // LiteLLM session tracking: send session ID via header and body metadata
  pi.on('before_provider_headers', (event, ctx) => {
    if (ctx.model?.provider !== 'platform-ai') return
    event.headers['x-litellm-session-id'] = process.env.PI_SESSION_ID || ctx.sessionManager.getSessionId()
  })
}
