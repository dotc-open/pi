# Chakra UI v2 Documentation Package for Pi

## Problem Context

Pi needs access to Chakra UI v2 component documentation without confusing it with current-version Chakra UI APIs. Returning the wrong version can produce incompatible component examples and wasted implementation work.

The repository contains a scaffold for `@dotc/pi-chakra-v2-docs`. The delivery target is a reusable package under `packages/pi-chakra-v2-docs`, loadable locally before publication.

Two supplied TypeScript files demonstrate previous work:

- `src/chakra-v2-docs.ts` registers `chakra_v2_docs`, validates a component slug, fetches usage MDX from `chakra-ui/chakra-ui-docs/main`, passes `ctx.signal` to fetch, and limits returned body text to 100,000 characters.
- `src/chakra-v2-search.ts` registers `chakra_v2_search`, searches a static component-name list, and returns links to the v2 site without network access.

These files are implementation references, not proof of source provenance. The docs file calls the repository archived, and the search file describes a v2.10.10 snapshot; neither claim has been independently verified for this RFC. The docs fetch still targets `main`, not an immutable revision. The package entry point must explicitly register the selected extensions before the package exposes them.

## Goals

- Give Pi reliable access to Chakra UI v2 component usage documentation and examples.
- Deliver the functionality through the existing package scaffold and repository conventions.
- Provide lightweight component discovery only if the component inventory and links can be verified against v2 documentation.
- Establish source provenance, failure behavior, and verification criteria before implementing or publishing.

## Requirements

### Functional requirements

- Export an extension factory through `src/index.ts`, compiled to the existing `dist/index.js` package entry point.
- Register `chakra_v2_docs` with one `component` string parameter, using Pi's tool registration and TypeBox conventions.
- Trim and lowercase component input, then reject invalid slugs before any network request. Do not permit path traversal or arbitrary source URLs.
- Fetch component usage documentation from a verified v2-specific source. Record the source revision and evidence establishing its version.
- Return source attribution with the documentation so callers can identify what was fetched.
- Report missing pages, HTTP failures, network failures, and cancellation as failed tool calls; do not silently fall back to current-version documentation.
- Bound documentation output to prevent an unexpectedly large page from consuming excessive model context and token budget. Retain the reference implementation's 100,000-character cap as an initial safety ceiling, not a measured optimum; check representative page sizes before finalizing it. Explicitly mark truncation and include the source URL so omitted content is discoverable. The cap applies to returned text, not downloaded response size, and can cut off examples; normal component pages should be returned in full.
- If a static v2 inventory can be verified, register `chakra_v2_search` separately with one `query` string parameter. Search component names, return canonical slugs and verified v2 links, reject blank queries, and report no matches clearly.
- Describe static search as component-name lookup, not full-text or semantic documentation search. If the inventory cannot be verified, omit the search tool rather than shipping a stub.
- Support local source loading and compiled-package loading before publication.

### Non-functional requirements

- Use existing package tooling, native `fetch`, and host-provided Pi/TypeBox peer dependencies; add no runtime dependency for fetching or name lookup.
- Use the cancellation signal supplied by the supported Pi execution context and verify that cancellation reaches the request.
- Keep documentation output usable in interactive and non-interactive modes; no UI interaction is required for either tool.
- Keep the source stable by preferring an immutable repository revision verified to contain v2 documentation. Document how maintainers can intentionally update that revision.
- Keep search deterministic and bounded by a small, checked-in inventory. Do not introduce a live crawler, external search service, or generic action framework.
- Pass package lint, type checks, build, and formatting checks.
- Leave a small runnable check for slug validation, output truncation, and search matching if search ships. Network failure and cancellation checks must be reproducible without depending on a live service outage.
- Deliver independently verified, commit-sized changes and obtain review before committing.
- Do not remove older tools or alter consumers' permission settings as part of the initial package implementation. Any migration requires a separate review of actual callers and configuration.

## Options

### Option 1: Verified repository MDX with optional static component lookup

Verify the repository content against known v2 documentation, starting with Button and at least one component with version-distinguishing behavior, such as Modal. Select an immutable revision containing the intended pages and fetch usage MDX directly from that revision.

Reuse the supplied docs implementation's validation, cancellation, attribution, and output-limit approach. Review its error wording so an HTTP server failure is not described merely as a missing component. Verify the checked-in search inventory and each link convention before exposing the separate search tool.

This preserves useful source examples and requires no HTML parser or search infrastructure. Raw MDX is useful to the Pi agent because it contains readable headings, explanations, fenced JSX examples, and exact prop names. Inspection of the repository's Button usage page confirms these are present, including `colorScheme`, `isLoading`, and accessibility guidance. The agent does not need to render MDX to use this text. However, custom MDX components or imported examples can hide content that is only resolved when the site renders; fetch-only output does not automatically include those dependencies. Verification must check representative pages for this limitation and confirm that the returned text supports actual coding questions. Add targeted handling only if required content is missing, rather than introducing an MDX renderer preemptively. The tradeoffs are source-format noise, network dependence for docs retrieval, and manual maintenance of both the source revision and component inventory. Name lookup cannot answer conceptual or full-text queries. Component entries may not map uniformly to repository folders or public URLs; unsupported entries must be corrected or omitted rather than assumed valid.

### Option 2: Fetch pages from the live v2 documentation site

Fetch component usage pages directly from `https://v2.chakra-ui.com` and extract useful documentation from HTML. A verified static inventory could still supply component-name lookup.

The public v2 hostname makes version intent visible and provides reader-facing links. However, live pages are mutable, may include navigation and client-rendering artifacts, and require extraction logic to produce useful tool output. This approach adds parsing and maintenance work without a demonstrated advantage over available MDX. It is a fallback if repository source provenance cannot be established, not an automatic substitution.

### Option 3: Bundle a verified documentation snapshot

Include a curated v2 MDX snapshot in the published package and read it locally. Component lookup can use the same bundled inventory.

This removes runtime network failures and fixes the documentation version to the package release. For a component-usage-only snapshot, a planning estimate of roughly 60 pages at 5–20 KB each gives **0.3–1.2 MB of uncompressed MDX**, excluding images, generated API references, and imported example files. These are assumptions, not a measured inventory or average; the inspected Button page is consistent with this order of magnitude, but the selected revision must be measured before making a packaging decision. The npm tarball should be smaller through compression, but its size must be measured rather than promised.

That estimate is modest: package size alone is not a strong reason to reject bundling. The more significant costs are snapshot acquisition, licensing/redistribution review, attribution, and refresh work. It is appropriate if offline access or removing runtime network dependence becomes a requirement, but offline docs retrieval has not been requested here.

## Proposed Solution

Choose **Option 1**, conditional on verifying the repository source and selecting an immutable v2 revision. It best meets the version-correctness, small-package, cancellation, attribution, and minimal-dependency requirements while reusing the supplied implementation approach. Unlike live-page extraction, it does not require HTML cleanup; unlike a bundled snapshot, it avoids maintaining and redistributing a local documentation copy. A component-only snapshot is estimated to be modest in size, so this choice is based on maintenance scope rather than an assumption that bundling would be prohibitively large.

The accepted tradeoffs are network-dependent docs retrieval, readable MDX source rather than rendered site content, and deliberately limited component-name search. MDX preserves the prose and code the agent needs, but pages with unresolved imported examples require verification and potentially targeted handling. The output cap protects context budget at the cost of incomplete content on unusually large pages; its initial value must be checked against real page sizes. Pinning the source requires intentional updates but prevents an upstream branch change from silently changing the tool's API examples. The static inventory is acceptable only after verification; the previous search file is a starting point, not an authoritative index.

Source verification is a delivery gate. If it fails, record the findings and revisit the options rather than claiming the current `main` URL is v2 or switching versions silently.

Implementation should proceed in these independently reviewable increments:

1. Verify and record the v2 source revision, representative page evidence, and supported slug/path conventions. Measure representative page sizes to validate the output cap, and inspect MDX imports/custom components for missing examples. Confirm that returned docs let the agent answer concrete questions about Button loading state and Modal usage without rendering the site. Implement and register the docs tool through the package entry point. Add a small runnable check covering valid and invalid slugs, successful output, truncation, missing pages, HTTP failure, network failure, and cancellation. Run lint, type checks, build, and formatting checks.
2. Pause for the user to start or reload Pi with the package source loaded. Exercise the registered docs tool in-session with a known component such as `button`, an invalid slug such as `../button`, and a nonexistent component. Also smoke-test compiled-package loading after building. Do not claim runtime verification before this handoff succeeds.
3. If the v2 inventory and links are verified, add and register static search in a separate change. Check exact, partial, whitespace-normalized, and `kbd` alias queries; blank input; and no matches. Verify that returned slugs can be resolved by the docs tool, or clearly exclude entries that are not supported. Repeat repository checks and hand off for reload and direct in-session search calls.

The package README should document source provenance, the search ceiling, local loading commands, and rebuild/reload behavior. Older tool migration, broader documentation topics, full-text search, and offline bundling remain outside this initial scope.
