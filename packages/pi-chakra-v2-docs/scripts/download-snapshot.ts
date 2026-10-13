// One-time maintenance tool: load explicitly with `pi -e ./packages/pi-chakra-v2-docs/scripts/download-snapshot.ts`.
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'
import { Type } from 'typebox'

import { DOCS_REVISION } from '../src/chakra-v2-docs.ts'

const root = fileURLToPath(new URL('../snapshot', import.meta.url))
const source = 'website/content/'
const sections = ['docs', 'getting-started', 'tutorial']
const api = `https://api.github.com/repos/chakra-ui/chakra-ui/git/trees/`
const raw = `https://raw.githubusercontent.com/chakra-ui/chakra-ui/${DOCS_REVISION}/${source}`

type Entry = { path: string; type: string; sha: string }
type Tree = { tree: Entry[]; truncated: boolean }

async function get(url: string, signal?: AbortSignal): Promise<Response> {
  const response = await fetch(url, { signal: signal ?? null })
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`)
  return response
}

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: 'chakra_v2_download_snapshot',
    label: 'Download pinned Chakra UI v2 docs snapshot',
    description:
      'One-time maintenance: download and verify the pinned Chakra UI v2 docs, getting-started, and tutorial MDX into this package. Fails if a snapshot already exists.',
    parameters: Type.Object({}),
    async execute(_id, _params, signal, _update, ctx) {
      const abort = signal ?? ctx.signal
      if (existsSync(root)) throw new Error(`Snapshot already exists: ${root}`)
      const staging = await mkdtemp(join(dirname(root), '.chakra-snapshot-'))
      let count = 0
      try {
        const commit = (await (
          await get(`https://api.github.com/repos/chakra-ui/chakra-ui/git/commits/${DOCS_REVISION}`, abort)
        ).json()) as { tree: { sha: string } }
        const revision = (await (await get(`${api}${commit.tree.sha}`, abort)).json()) as { tree: Entry[] }
        const license = revision.tree.find((entry) => entry.path === 'LICENSE' && entry.type === 'blob')
        if (!license) throw new Error('Pinned source has no LICENSE')
        const notice = Buffer.from(
          await (
            await get(`https://raw.githubusercontent.com/chakra-ui/chakra-ui/${DOCS_REVISION}/LICENSE`, abort)
          ).arrayBuffer(),
        )
        const licenseHash = createHash('sha1').update(`blob ${notice.length}\0`).update(notice).digest('hex')
        if (licenseHash !== license.sha) throw new Error('License source mismatch')
        await writeFile(join(staging, 'LICENSE'), notice)
        const content = revision.tree.find((entry) => entry.path === 'website' && entry.type === 'tree')
        if (!content) throw new Error('Pinned source has no website tree')
        const website = (await (await get(`${api}${content.sha}`, abort)).json()) as { tree: Entry[] }
        const contentTree = website.tree.find((entry) => entry.path === 'content' && entry.type === 'tree')
        if (!contentTree) throw new Error('Pinned source has no website/content tree')
        const top = (await (await get(`${api}${contentTree.sha}`, abort)).json()) as { tree: Entry[] }
        for (const section of sections) {
          const item = top.tree.find((entry) => entry.path === section && entry.type === 'tree')
          if (!item) throw new Error(`Missing ${section} tree`)
          const tree = (await (await get(`${api}${item.sha}?recursive=1`, abort)).json()) as Tree
          if (tree.truncated) throw new Error(`Incomplete ${section} tree`)
          for (const entry of tree.tree.filter((file) => file.type === 'blob' && file.path.endsWith('.mdx'))) {
            if (!/^[a-z0-9-]+(?:\/[a-z0-9-]+)*\.mdx$/.test(entry.path))
              throw new Error(`Unsafe source path: ${entry.path}`)
            const bytes = Buffer.from(await (await get(`${raw}${section}/${entry.path}`, abort)).arrayBuffer())
            const sha = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')
            if (sha !== entry.sha) throw new Error(`Source mismatch: ${section}/${entry.path}`)
            const dest = join(staging, section, entry.path)
            await mkdir(dirname(dest), { recursive: true })
            await writeFile(dest, bytes)
            count++
          }
        }
        await rename(staging, root)
        return {
          content: [{ type: 'text', text: `Saved ${count} verified MDX pages from ${DOCS_REVISION} to ${root}` }],
          details: { count, revision: DOCS_REVISION },
        }
      } catch (error) {
        await rm(staging, { recursive: true, force: true })
        throw error
      }
    },
  })
}
