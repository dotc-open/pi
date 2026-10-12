import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'
import { Type } from 'typebox'

// Verified v2 snapshot: packages/components/package.json is @chakra-ui/react 2.10.10.
// See README.md for provenance and the revision-update procedure.
export const DOCS_REVISION = 'a1005f7f129f225058e7616c52e580b6cf8dcfdc'
const DOCS_BASE = `https://raw.githubusercontent.com/chakra-ui/chakra-ui/${DOCS_REVISION}/website/content/docs/components`
const MAX_BODY_CHARS = 100_000

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: 'chakra_v2_docs',
    label: 'Get Chakra UI v2 Component Docs',
    description:
      'Fetch usage documentation for one Chakra UI v2 component, such as button or modal, from a pinned v2.10.10 snapshot. To list or discover components, use chakra_v2_search. Returns raw MDX, not generated prop tables or resolved imports. Missing pages and request failures are errors.',
    promptSnippet: 'Get Chakra UI v2 component documentation',
    parameters: Type.Object({
      component: Type.String({
        description: 'Chakra UI v2 component slug, e.g. button or modal.',
      }),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const component = params.component.trim().toLowerCase()
      if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(component)) {
        throw new Error('Component must be a lowercase kebab-case slug.')
      }

      const url = `${DOCS_BASE}/${component}/usage.mdx`
      const response = await fetch(url, { signal: signal ?? ctx.signal ?? null })
      if (!response.ok) {
        const reason = response.status === 404 ? 'Page not found' : 'HTTP request failed'
        throw new Error(
          `Chakra UI v2 docs: ${reason} for "${component}": ${response.status} ${response.statusText} (${url})`,
        )
      }

      const body = await response.text()
      const truncated = body.length > MAX_BODY_CHARS
      const text = truncated ? body.slice(0, MAX_BODY_CHARS) : body

      return {
        content: [
          {
            type: 'text',
            text: `Chakra UI v2 docs snapshot (@chakra-ui/react 2.10.10)\n${url}\n\n${text}${truncated ? '\n\n[truncated at 100,000 characters; read the source URL for the full page]' : ''}`,
          },
        ],
        details: { url, revision: DOCS_REVISION, truncated },
      }
    },
  })
}
