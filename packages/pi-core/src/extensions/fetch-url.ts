/**
 * Fetch URL Extension
 *
 * Registers a custom tool `fetch_url` that the LLM can call to retrieve
 * the contents of a URL (HTML, JSON, plain text, etc.).
 */

import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'
import { Type } from 'typebox'

// Cap the body returned to the LLM to avoid flooding the context window.
const DEFAULT_MAX_BODY_CHARS = 100_000
const MAX_BODY_CHARS = 500_000

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: 'fetch_url',
    label: 'Fetch URL',
    description:
      'Retrieve the contents of a URL. Returns the response body as text, plus the status code and content type as details. Throws on non-2xx responses. Defaults to 100,000 characters; maxChars can raise the cap to 500,000.',
    promptSnippet: 'Fetch the contents of a URL',
    promptGuidelines: [
      'Use fetch_url to retrieve the current content of a web page, API endpoint, or raw file. maxChars optionally sets the response-body character limit (1–500,000); omit it for the 100,000-character default and increase it only when you need more of the response.',
    ],
    parameters: Type.Object({
      url: Type.String({ description: 'The URL to fetch' }),
      maxChars: Type.Optional(
        Type.Integer({
          minimum: 1,
          maximum: MAX_BODY_CHARS,
          description: 'Maximum characters to return (default: 100,000)',
        }),
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const response = await fetch(params.url, ctx.signal ? { signal: ctx.signal } : {})

      if (!response.ok) {
        throw new Error(`fetch_url failed: ${response.status} ${response.statusText} for ${params.url}`)
      }

      const body = await response.text()
      const limit = params.maxChars ?? DEFAULT_MAX_BODY_CHARS
      const truncated = body.length > limit
      const text = truncated ? body.slice(0, limit) : body
      const suffix = truncated ? `\n\n[truncated: showing first ${limit} of ${body.length} characters]` : ''

      return {
        content: [{ type: 'text', text: text + suffix }],
        details: {
          url: params.url,
          status: response.status,
          contentType: response.headers.get('content-type'),
          charCount: body.length,
          truncated,
        },
      }
    },
  })
}
