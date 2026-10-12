# pi-chakra-v2-docs

Chakra UI v2 component usage documentation for Pi.

## Tool

`chakra_v2_docs` takes a `component` string such as `button` or `modal`. It trims and lowercases the input, validates a kebab-case slug, and fetches the component's usage MDX. Output includes the pinned source URL and revision metadata.

Missing pages, HTTP failures, network failures, and cancellation fail the tool call. The returned documentation body is capped at 100,000 characters to protect model context; truncation is marked and the source URL provides access to the complete page. This is not a download-size limit.

Search is not registered yet. The supplied search implementation remains a reference for a later, verified component-name lookup, not full-text search.

## Source provenance

Documentation comes from the [Chakra repository's v2 website source](https://github.com/chakra-ui/chakra-ui/tree/v2/website/content/docs/components), pinned to revision [`a1005f7f129f225058e7616c52e580b6cf8dcfdc`](https://github.com/chakra-ui/chakra-ui/tree/a1005f7f129f225058e7616c52e580b6cf8dcfdc/website/content/docs/components). At this revision, [website/package.json](https://github.com/chakra-ui/chakra-ui/blob/a1005f7f129f225058e7616c52e580b6cf8dcfdc/website/package.json) uses the workspace's `@chakra-ui/react`, and [packages/components/package.json](https://github.com/chakra-ui/chakra-ui/blob/a1005f7f129f225058e7616c52e580b6cf8dcfdc/packages/components/package.json) identifies that package as **2.10.10**. The tool fetches raw MDX from this immutable snapshot, not GitHub's HTML directory view or a moving branch.

Pages are fetched from:

```text
https://raw.githubusercontent.com/chakra-ui/chakra-ui/a1005f7f129f225058e7616c52e580b6cf8dcfdc/website/content/docs/components/{component}/usage.mdx
```

Verification inspected the pinned Button and Modal pages:

- Button: 7,234 bytes; inline examples document `colorScheme`, `isLoading`, `loadingText`, and custom spinners. The public [v2 Button page](https://v2.chakra-ui.com/docs/components/button/usage) identifies itself as v2.10.10 and uses the same `colorScheme` API.
- Modal: 14,547 bytes; inline examples show `useDisclosure`, `isOpen`, `onClose`, `ModalOverlay`, and `ModalContent`, plus focus management and accessibility guidance.

Button is shorter than the former 2.8.2 docs snapshot (8,290 bytes), removing the social-button examples; Modal's usage file has the same Git blob hash as the former snapshot. Both fit well below the retained 100,000-character safety cap. The inspected examples are present directly in the MDX and can answer Button loading-state and Modal composition questions without rendering the site. Examples still assume appropriate imports and may contain illustrative placeholders such as `Lorem`; they are documentation, not standalone runnable applications.

Raw MDX preserves prose and fenced JSX, but this tool does not render custom MDX components, resolve imported examples, or fetch generated prop tables. Coverage of these features on other pages has not been verified.

To update the snapshot, verify the candidate revision's Chakra major version, page paths, representative examples, and page sizes. Then update `DOCS_REVISION` in `src/chakra-v2-docs.ts` and the provenance above together. Do not replace the pin with a moving branch or silently fall back to current-version docs.

## Local development

From the repository root:

```bash
pnpm install
pi -e ./packages/pi-chakra-v2-docs/src/index.ts
```

Ask Pi to call `chakra_v2_docs` with `{ "component": "button" }`. This is an agent tool, not a slash command; the scaffold's `/chakra-v2-docs` command has been replaced. After editing the source, run `/reload`.

## Verify the package

From the repository root:

```bash
pnpm --filter @dotc/pi-chakra-v2-docs lint
pnpm --filter @dotc/pi-chakra-v2-docs check-types
pnpm --filter @dotc/pi-chakra-v2-docs build
pi -e ./packages/pi-chakra-v2-docs
```

The package directory loads compiled `dist/index.js`. Rebuild after source changes before reloading that session.

In each loading mode, exercise the tool with `button`, `modal`, `../button` (validation failure), and `nonexistent-component` (missing page). Automated tests are deferred for now; HTTP/network failures, truncation, and cancellation still require runtime verification.
