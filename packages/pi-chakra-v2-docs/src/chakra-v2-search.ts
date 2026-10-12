import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'
import { Type } from 'typebox'

import { DOCS_REVISION } from './chakra-v2-docs.js'

const COMPONENTS_URL = `https://api.github.com/repos/chakra-ui/chakra-ui/contents/website/content/docs/components?ref=${DOCS_REVISION}`

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: 'chakra_v2_search',
    label: 'Search Chakra UI v2 Components',
    description:
      'List or search available Chakra UI v2 components. Omit query or pass an empty string to list all components; provide query to filter names. Use a returned name with chakra_v2_docs. Requires network access to GitHub.',
    promptSnippet: 'List or search Chakra UI v2 components',
    parameters: Type.Object({
      query: Type.Optional(
        Type.String({ description: 'Component name or partial name. Omit to list all components.' }),
      ),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const response = await fetch(COMPONENTS_URL, {
        headers: { Accept: 'application/vnd.github+json' },
        signal: signal ?? ctx.signal ?? null,
      })
      if (!response.ok) {
        throw new Error(
          `Chakra UI v2 search: HTTP request failed: ${response.status} ${response.statusText} (${COMPONENTS_URL})`,
        )
      }

      const entries: unknown = await response.json()
      if (!Array.isArray(entries)) throw new Error('Chakra UI v2 search: Expected a GitHub directory listing.')

      const components: string[] = []
      for (const entry of entries as unknown[]) {
        if (
          typeof entry !== 'object' ||
          entry === null ||
          !('type' in entry) ||
          typeof entry.type !== 'string' ||
          !('name' in entry) ||
          typeof entry.name !== 'string'
        ) {
          throw new Error('Chakra UI v2 search: Invalid GitHub directory entry.')
        }
        if (entry.type === 'dir') components.push(entry.name)
      }

      const query = (params.query ?? '').trim().toLowerCase().replace(/\s+/g, '-')
      const matches = components.filter((component) => component.includes(query)).sort()
      return {
        content: [
          {
            type: 'text',
            text: matches.length ? matches.join(', ') : 'No Chakra UI v2 components found.',
          },
        ],
        details: { matches, url: COMPONENTS_URL, revision: DOCS_REVISION },
      }
    },
  })
}
