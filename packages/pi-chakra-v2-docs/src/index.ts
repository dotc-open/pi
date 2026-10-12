import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'

export default function (pi: ExtensionAPI) {
  pi.registerCommand('chakra-v2-docs', {
    description: 'Check that the Chakra UI v2 docs extension is loaded',
    handler: async (_args, ctx) => {
      ctx.ui.notify('pi-chakra-v2-docs is loaded. Docs retrieval is not implemented yet.', 'info')
    },
  })
}
