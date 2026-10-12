# pi-chakra-v2-docs

Chakra UI v2 component usage documentation for Pi.

## Tools

`chakra_v2_docs` takes a `component` string such as `button` or `modal`. It trims and lowercases the input, validates a kebab-case slug, and fetches the component's usage MDX. Output includes the pinned source URL and revision metadata.

Missing pages, HTTP failures, network failures, and cancellation fail the tool call. The returned documentation body is capped at 100,000 characters to protect model context; truncation is marked and the source URL provides access to the complete page. This is not a download-size limit.

`chakra_v2_search` lists available component names when called with `{}` or an empty query. Supply an optional `query` to filter names by substring. Matching is case-insensitive and converts whitespace to hyphens (`icon button` → `icon-button`). Pass a returned name to `chakra_v2_docs` to fetch its documentation. Unmatched queries return a no-results message.

Listing and search make one request to the [GitHub directory API](https://api.github.com/repos/chakra-ui/chakra-ui/contents/website/content/docs/components?ref=a1005f7f129f225058e7616c52e580b6cf8dcfdc), using the same pinned revision as the docs tool. Only directory names are returned, sorted alphabetically; there is no maintained component list or full-text search. At this snapshot, usage paths were verified against the [component tree](https://api.github.com/repos/chakra-ui/chakra-ui/git/trees/de6c194f3821188c2fcb6ab2e98a941651274817?recursive=1). The tool does not check each directory's usage file on every call.

Search requires network access and is subject to GitHub's unauthenticated API rate limits. HTTP errors (including rate limits), network failures, malformed responses, and cancellation fail the tool call; there is no cached or static fallback.

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

To update the snapshot, verify the candidate revision's Chakra major version, page paths, representative examples, and page sizes. Then update the shared `DOCS_REVISION` in `src/chakra-v2-docs.ts` and the provenance above together. Search uses that same revision automatically; verify that its component directories still contain usage files. Do not replace the pin with a moving branch or silently fall back to current-version docs.

## Local development

From the repository root:

```bash
pnpm install
pi -e ./packages/pi-chakra-v2-docs/src/index.ts
```

Ask Pi to call `chakra_v2_docs` with `{ "component": "button" }`. This is an agent tool, not a slash command; the scaffold's `/chakra-v2-docs` command has been replaced. After editing the source, run `/reload`.

## Lockdown permissions

If using `@chrischow/pi-lockdown`, explicitly configure both tools; otherwise registered tools may not be activated. Merge the following into your Pi settings (for example, `.pi/settings.json`), preserving existing permissions:

```json
{
  "lockdown": {
    "customTools": {
      "chakra_v2_docs": "warn",
      "chakra_v2_search": "warn"
    }
  }
}
```

`warn` requests approval; use `allow` only if you want these network requests to run without prompting. Both tools contact GitHub using native `fetch`; they do not require the separate `fetch_url` tool. This package does not change your permissions automatically.

## Optional subagent research

The docs tool's description asks the agent to prefer delegation for documentation research **when the `subagent` tool and a child agent with Chakra docs access are available**. The child should return relevant examples and source URLs rather than the full MDX. This is model guidance, not enforced routing: direct calls remain supported, and neither a subagent extension nor a skill is required for normal use.

For the `subagent` tool supplied by `@dotc/pi-core`:

1. Make this package available through the child session's package/extension configuration, not just the parent session. This subagent implementation starts a separate Pi process and does not forward the parent's `-e` arguments. Loading the source with `pi -e ...` alone is therefore insufficient for child access.
2. If your agent definition has an explicit `tools` list, add `chakra_v2_search` and `chakra_v2_docs`. For a project `scout`, edit `.pi/agents/scout.md`; for a personal agent, edit `~/.pi/agent/agents/scout.md`. Preserve the agent's existing tools and other frontmatter. For example, a docs-capable scout could have:

   ```yaml
   tools: read, grep, find, ls, chakra_v2_search, chakra_v2_docs
   ```

3. If using Lockdown, permit the parent's delegation tool and configure the child's tools separately. Merge these entries into existing settings:

   ```json
   {
     "lockdown": {
       "customTools": {
         "subagent": "warn"
       }
     },
     "lockdownSubagent": {
       "customTools": {
         "chakra_v2_docs": "allow",
         "chakra_v2_search": "allow"
       }
     }
   }
   ```

   The child `allow` entries authorize unattended GitHub requests; enable them only if acceptable for your workflow. Parent permissions do not grant child permissions. Other subagent implementations may use different configuration.

4. Reload the parent session after configuration changes. Ask it to delegate a small request to `scout`, such as listing components with `chakra_v2_search({})`, fetching Button docs, and returning a brief summary with its pinned source URL. Verify the child actually calls the Chakra tools; parent-only success does not establish child access. Use project agent scope for `.pi/agents/scout.md`, or user/both scope for a personal agent.

### Explicit delegation with a prompt template

This repository's `.pi/prompts/with_subagent.md` is an optional prompt template that delegates information gathering to `scout` through the `subagent` tool. It is not itself a tool and is not bundled by this package. If you have that template loaded, invoke it by its filename-derived command:

```text
/with_subagent Research Chakra UI v2 Button loading states using chakra_v2_docs. Return relevant examples and source URLs, not the full MDX.
```

Without the template, simply ask Pi to delegate the same research to a docs-capable subagent. No new skill or prompt template is needed for the automatic preference.

## Verify the package

From the repository root:

```bash
pnpm --filter @dotc/pi-chakra-v2-docs lint
pnpm --filter @dotc/pi-chakra-v2-docs check-types
pnpm --filter @dotc/pi-chakra-v2-docs build
pi -e ./packages/pi-chakra-v2-docs
```

The package directory loads compiled `dist/index.js`. Rebuild after source changes before reloading that session.

In each loading mode, exercise the tool with `button`, `modal`, `../button` (validation failure), and `nonexistent-component` (missing page). For search, check `{}` (all components), `modal` (exact match), `button` (button, icon-button, close-button), `Icon   Button` (icon-button), whitespace-only input (all components), and `nonexistent-component` (no results). Fetch one returned slug with `chakra_v2_docs` to verify the lookup-to-fetch flow. Automated tests are deferred for now; search behavior, HTTP/network failures, truncation, and cancellation still require runtime verification.
