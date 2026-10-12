import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'

import registerDocs from './chakra-v2-docs.js'
import registerSearch from './chakra-v2-search.js'

export default function (pi: ExtensionAPI) {
  registerDocs(pi)
  registerSearch(pi)
}
