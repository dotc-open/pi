# Documentation provenance

## Pinned source

Both tools use revision [`a1005f7f129f225058e7616c52e580b6cf8dcfdc`](https://github.com/chakra-ui/chakra-ui/tree/a1005f7f129f225058e7616c52e580b6cf8dcfdc/website/content/docs/components) of `chakra-ui/chakra-ui`, selected from its `v2` branch. The shared pin is `DOCS_REVISION` in `src/chakra-v2-docs.ts`; neither tool follows a moving branch or falls back to current-version docs.

Version evidence at this revision:

- [website/package.json](https://github.com/chakra-ui/chakra-ui/blob/a1005f7f129f225058e7616c52e580b6cf8dcfdc/website/package.json) uses the workspace's `@chakra-ui/react`.
- [packages/components/package.json](https://github.com/chakra-ui/chakra-ui/blob/a1005f7f129f225058e7616c52e580b6cf8dcfdc/packages/components/package.json) identifies that package as **2.10.10**.

## Retrieval paths

`chakra_v2_docs` fetches raw component usage MDX:

```text
https://raw.githubusercontent.com/chakra-ui/chakra-ui/{revision}/website/content/docs/components/{component}/usage.mdx
```

`chakra_v2_search` lists component directory names through GitHub's Contents API:

```text
https://api.github.com/repos/chakra-ui/chakra-ui/contents/website/content/docs/components?ref={revision}
```

Search has no maintained inventory. Usage paths were checked against the [pinned component tree](https://api.github.com/repos/chakra-ui/chakra-ui/git/trees/de6c194f3821188c2fcb6ab2e98a941651274817?recursive=1); the tool does not check each directory's usage file on every call.

## Representative source checks

| Page                                                                                                                                            | Size         | Inline examples inspected                                                 |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------- |
| [Button](https://github.com/chakra-ui/chakra-ui/blob/a1005f7f129f225058e7616c52e580b6cf8dcfdc/website/content/docs/components/button/usage.mdx) | 7,234 bytes  | `colorScheme`, `isLoading`, `loadingText`, custom spinners                |
| [Modal](https://github.com/chakra-ui/chakra-ui/blob/a1005f7f129f225058e7616c52e580b6cf8dcfdc/website/content/docs/components/modal/usage.mdx)   | 14,547 bytes | `useDisclosure`, `isOpen`, `onClose`, modal composition, focus management |

These pages contain prose and fenced JSX directly in the MDX, supporting usage questions without rendering the site. Both fit below the output cap. Their inspection does not establish completeness for every page.

## Limits

- Raw MDX is not rendered. Imported examples, custom MDX components, and generated prop tables are not resolved.
- Examples may assume imports or contain illustrative placeholders; they are not necessarily standalone applications.
- The 100,000-character cap limits returned documentation body text, not download size. Truncation is marked and the source URL remains available, but examples may be cut off.
- Both tools depend on GitHub access; search is subject to unauthenticated API rate limits. Failures are reported, not replaced with another source.

For intentional source updates, follow [Updating the revision](updating-revision.md).
