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

User-approved search revision: replace the maintained static list with one GitHub Contents API request at the shared docs revision. An omitted/blank query lists all component directories; an optional query filters names. Return names only, forward cancellation, and report HTTP/network/response errors without a static fallback. This supersedes the static-inventory, links, blank-query rejection, and alias requirements below. Automated tests remain deferred at the user's request.

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

Status for step 1: implementation, source inspection, formatting, lint, type checks, and build complete. Lint reports only existing warnings in pi-core. Automated tests deferred at the user's request. The user confirmed the docs tool works after the reload handoff; direct calls are unavailable to this agent, and compiled-package verification has not been separately recorded.

- [x] Verify and pin Chakra repository v2 branch revision `a1005f7f129f225058e7616c52e580b6cf8dcfdc`. The website uses workspace `@chakra-ui/react`; `packages/components/package.json` identifies version 2.10.10. This replaces the initially verified 2.8.2 snapshot from the former docs repository.
- [x] Inspect the replacement source's Button (7,234 bytes) and Modal (14,547 bytes); their relevant examples are inline and fit below the 100,000-character output cap. Button is shorter than the former snapshot and Modal has the same Git blob hash. Record provenance and limitations in the package README.
- [x] Register the docs tool through the package entry point; validate slugs, distinguish HTTP errors, forward cancellation, and mark truncated output.
- [ ] Add deterministic automated checks — deferred by the user; not verified.
- [x] Pass formatting, lint, type checks, and build.
- [ ] Review step 1 changes and obtain commit approval.
- [x] User confirmed the docs tool works after the reload handoff; not independently tested by this agent.
- [ ] Record compiled-package smoke-test results separately.
- [x] Verify usage paths in pinned component tree `de6c194f3821188c2fcb6ab2e98a941651274817`; replace the static inventory with the GitHub directory API at the shared docs revision, per user approval. The directory endpoint returned a JSON array of component directories when fetched during implementation.
- [x] Pass formatting, lint, type checks, and build after the directory API change; only existing pi-core lint warnings remain.
- [ ] Reload and verify component listing (omitted/blank query), exact/partial/normalized queries, no results, and lookup-to-fetch flow. Automated checks remain deferred at the user's request. Per user feedback, search now fetches directory names from GitHub and omits special alias handling; no maintained list, separate list tool, or action parameter. Also verify request failure and cancellation after reload.

1. Verify and record the v2 source revision, representative page evidence, and supported slug/path conventions. Measure representative page sizes to validate the output cap, and inspect MDX imports/custom components for missing examples. Confirm that returned docs let the agent answer concrete questions about Button loading state and Modal usage without rendering the site. Implement and register the docs tool through the package entry point. Add a small runnable check covering valid and invalid slugs, successful output, truncation, missing pages, HTTP failure, network failure, and cancellation. Run lint, type checks, build, and formatting checks.
2. Pause for the user to start or reload Pi with the package source loaded. Exercise the registered docs tool in-session with a known component such as `button`, an invalid slug such as `../button`, and a nonexistent component. Also smoke-test compiled-package loading after building. Do not claim runtime verification before this handoff succeeds.
3. If the v2 inventory and links are verified, add and register static search in a separate change. Check exact, partial, whitespace-normalized, and `kbd` alias queries; blank input; and no matches. Verify that returned slugs can be resolved by the docs tool, or clearly exclude entries that are not supported. Repeat repository checks and hand off for reload and direct in-session search calls.

The package README should document source provenance, the search ceiling, local loading commands, and rebuild/reload behavior. Older tool migration, broader documentation topics, full-text search, and offline bundling remain outside this initial scope.

## Proposed extension: offline v2 documentation skills (draft)

### Context

The existing component-only, network-dependent tools do not help agents discover broader v2 guidance or follow related pages without repeated fetches. Extend this plan, preserving the implementation history above, to ship a pinned local documentation snapshot as Pi skills. The goal is **useful retrieval**, not merely copying MDX into the package.

### Approach (to refine)

- Start from the verified v2 source revision above. Include all of `website/content/docs`, `website/content/getting-started`, and `website/content/tutorial`; exclude blog, changelog, community, and Figma content. Inventory imports, cross-links, and licensing before snapshotting. Keep `chakra_v2_docs` and `chakra_v2_search` unchanged until skills are verified; any retirement is a separate decision.
- Expose a small number of **task-oriented skills** with distinct trigger descriptions and compact `SKILL.md` indexes; store the complete source pages as linked references, not as eagerly loaded skill instructions. Preserve page identity, version attribution, and navigable cross-references; keep examples and conceptual guidance together where they are needed.
- Organize by agent task (getting started/theming, components, patterns, etc. as validated against the actual tree), with short index/lookup guidance so a model can find the right page and read only that page. Avoid one skill per MDX page and avoid loading the whole corpus into context.
- Retain the existing network tools alongside the skills during this implementation.

The pinned snapshot now contains **231 Git-SHA-verified MDX pages** plus the upstream MIT license: 169 component pages, 19 hooks, 16 styled-system pages, 20 getting-started pages, and seven tutorial pages. The component directory has `usage.mdx`, optional `theming.mdx`, and often `props.mdx`; the hooks and styled-system sections are flat. This dictates navigation by component slug/page type, hook name, styling topic, and framework/integration guide. Several tutorial pages are placeholders (e.g. `interactive-components.mdx`), and `tutorial/basics.mdx` is lorem-ipsum filler; props pages can be `<PropsTable>` stubs, and component theming pages range above 250 KB. Preserve these facts in the index rather than presenting stub or generated content as complete offline guidance. The upstream root license is MIT and requires including its notice with redistributed documentation. Button theming includes imported Sandpack code, and pages contain site-absolute links: an offline copy alone does not resolve either dependency.

### Files to modify (tentative)

- `packages/pi-chakra-v2-docs/package.json` — publish skill resources and snapshot files alongside the existing extension entry point.
- `packages/pi-chakra-v2-docs/skills/` — task-oriented entry points (new).
- `packages/pi-chakra-v2-docs/snapshot/` — local pinned MDX references and upstream license (new).
- `packages/pi-chakra-v2-docs/scripts/download-snapshot.ts` — explicitly loaded, one-time downloader; Git blob SHA verification and atomic snapshot installation, without shell access.
- `packages/pi-chakra-v2-docs/README.md` and `packages/pi-chakra-v2-docs/docs/` — discovery, source/license attribution, update procedure.
- `plans/2026-10-12-chakra_v2_docs.md` — track decisions and independently reviewable increments.

### Reuse

- `packages/pi-chakra-v2-docs/docs/provenance.md` and `docs/updating-revision.md` — existing pinned-revision record and refresh instructions.
- Pi package `pi.skills` support and lazy skill/reference loading; no custom search tool or MDX renderer unless real documentation examples require them.

### Steps (draft)

After **each step**, run applicable quality checks, review the change, and commit it (including any plan progress updates) only after user approval; `.pi/plans/` remains unstaged unless explicitly requested.

- [x] Inventory the pinned v2 docs tree and verify coverage, size, license, imports, links, and task-based navigation. The one-time downloader was directly called after reload and saved 231 MDX pages with verified Git blob SHA plus upstream LICENSE. Source MDX contains absolute site links (including obsolete category URLs), unresolved rendered components (e.g. `<PropsTable>`, `<SandpackEmbed>`, `<PackageManagers>`), and occasional large inline SVGs; skills must warn about these limits and route agents to usable prose/code rather than placeholders.
- [x] Define and implement three on-demand skills (components, styling, hooks) over the shared verified snapshot. Document the explicit maintenance-tool refresh procedure and rules for obsolete site links, generated props tables, imported examples, SVG-heavy pages, and tutorial placeholders; do not route agents to tutorial filler as authoritative guidance.
- [x] Package the resources, document version/attribution and usage, verify local and published-file inclusion, then pause for a Pi reload and directly exercise discovery and cross-page coding questions. The package dry run succeeded per user confirmation; after reload, Pi advertises only the three remaining skills. The setup skill was removed at user request; components now direct agents to reuse project components, and styling directs agents to reuse theme configuration and semantic tokens. All remaining skill-relative reference paths resolved; offline cross-page checks found Button `isLoading`/`loadingText`, Modal + `useDisclosure` composition, Next.js client-only provider setup, and color-mode guidance.

### Verification (draft)

- Check the snapshot against the pinned source for completeness and detect missing local targets, unresolved site components/imported examples, and unintended current-version content. Explicitly distinguish source stubs and generated props tables from usable prose.
- Confirm skill discovery after reload, minimal initial context, accurate component and non-component answers from local references, and usable citations/provenance without network access.
