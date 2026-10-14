# Documentation provenance

## Pinned source

The offline skills use revision [`a1005f7f129f225058e7616c52e580b6cf8dcfdc`](https://github.com/chakra-ui/chakra-ui/tree/a1005f7f129f225058e7616c52e580b6cf8dcfdc/website/content) of `chakra-ui/chakra-ui`, selected from its `v2` branch. The snapshot downloader pins `DOCS_REVISION` in `scripts/download-snapshot.ts`; the bundled skill references cite the same revision.

Version evidence at this revision:

- [website/package.json](https://github.com/chakra-ui/chakra-ui/blob/a1005f7f129f225058e7616c52e580b6cf8dcfdc/website/package.json) uses the workspace's `@chakra-ui/react`.
- [packages/components/package.json](https://github.com/chakra-ui/chakra-ui/blob/a1005f7f129f225058e7616c52e580b6cf8dcfdc/packages/components/package.json) identifies that package as **2.10.10**.

## Offline snapshot

`snapshot/` contains 231 MDX files from `website/content/docs` (169 component pages, 19 hook pages, 16 styled-system pages), `website/content/getting-started` (20), and `website/content/tutorial` (7). The one-time `scripts/download-snapshot.ts` tool verified every file and the root `LICENSE` against the pinned Git blob SHA before installing the snapshot. The MIT notice is included as `snapshot/LICENSE`. The published package includes `snapshot/` and the three skill entry points; only the entry points are advertised to Pi at startup.

The local copy is raw MDX, not rendered HTML. Component `props.mdx` pages often hold only generated `<PropsTable>` tags; some theming pages contain very large inline SVGs or imported Sandpack examples. Several tutorial pages are placeholders or filler. Historical category URLs (e.g. `/docs/components/overlay/modal`) do not map directly to source directories (`docs/components/modal/usage.mdx`). Skill instructions direct agents to source files and warn about these limitations.

## Representative source checks

| Page                                                                                                                                            | Size         | Inline examples inspected                                                 |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------- |
| [Button](https://github.com/chakra-ui/chakra-ui/blob/a1005f7f129f225058e7616c52e580b6cf8dcfdc/website/content/docs/components/button/usage.mdx) | 7,234 bytes  | `colorScheme`, `isLoading`, `loadingText`, custom spinners                |
| [Modal](https://github.com/chakra-ui/chakra-ui/blob/a1005f7f129f225058e7616c52e580b6cf8dcfdc/website/content/docs/components/modal/usage.mdx)   | 14,547 bytes | `useDisclosure`, `isOpen`, `onClose`, modal composition, focus management |

These pages contain prose and fenced JSX directly in the MDX, supporting usage questions without rendering the site. Their inspection does not establish completeness for every page.

## Limits

- Raw MDX is not rendered. Imported examples, custom MDX components, and generated prop tables are not resolved.
- Examples may assume imports or contain illustrative placeholders; they are not necessarily standalone applications.
- Offline skills read bundled files without network access.

For intentional source updates, follow [Updating the revision](updating-revision.md).
