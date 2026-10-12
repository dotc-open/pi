import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'
import { Type } from 'typebox'

// Snapshot of https://v2.chakra-ui.com/docs/components/button/usage (v2.10.10),
// including its Layout section and the user-provided component categories.
const COMPONENTS = `
aspect-ratio box center container flex grid simple-grid stack wrap
button checkbox editable form-control icon-button input number-input pin-input radio range-slider select slider switch textarea
badge card code divider kbd list stat table tag
alert circular-progress progress skeleton spinner toast
text heading highlight
alert-dialog drawer menu modal popover tooltip
accordion tabs visually-hidden
breadcrumb link link-overlay skip-nav stepper
avatar icon image
close-button portal show-hide transitions
`
  .trim()
  .split(/\s+/)

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: 'chakra_v2_search',
    label: 'Search Chakra UI v2 Components',
    description:
      'Search the static Chakra UI v2.10.10 component list by name and return links to v2 docs. No live search index or network request is needed.',
    promptSnippet: 'Find Chakra UI v2 component documentation',
    promptGuidelines: ['Use chakra_v2_search to find a Chakra UI v2 component slug before calling chakra_v2_docs.'],
    parameters: Type.Object({
      query: Type.String({ description: 'Component name or part of a name.' }),
    }),
    async execute(_toolCallId, params) {
      const query = params.query.trim().toLowerCase()
      if (!query) throw new Error('Query must not be empty.')

      const term = query.replace(/\s+/g, '-')
      const matches = COMPONENTS.filter(
        (component) => component.includes(term) || (component === 'kbd' && 'keyboard-key'.includes(term)),
      )
      return {
        content: [
          {
            type: 'text',
            text: matches.length
              ? matches
                  .map((component) => `${component}: https://v2.chakra-ui.com/docs/components/${component}`)
                  .join('\n')
              : 'No Chakra UI v2 components found.',
          },
        ],
        details: { matches },
      }
    },
  })
}
