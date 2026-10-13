# Updating the documentation revision

Update the source deliberately. Do not replace the immutable pin with `v2`, `main`, or another moving reference, and do not silently switch to Chakra UI v3 documentation.

## 1. Verify the candidate

Select a full commit SHA from `chakra-ui/chakra-ui`'s `v2` branch. At that exact revision:

- Check `website/package.json` uses the workspace's `@chakra-ui/react`, and verify its version in `packages/components/package.json` is **2.x**.
- Confirm the component directory API still returns a listing and each component directory has a `usage.mdx` file. A recursive Git tree can verify the paths without one request per component; check that the tree response is not truncated.
- Inspect Button, Modal, and any changed pages for v2 APIs, usable inline examples, imports, and custom MDX components that could hide required content.
- Measure representative page sizes and confirm the retained 100,000-character output cap is appropriate. Bytes and JavaScript string characters are different measurements.

If any check fails, stop and investigate rather than changing versions or source formats implicitly.

## 2. Update the package

- Change `DOCS_REVISION` in `src/chakra-v2-docs.ts`. Search imports this constant and follows the new pin automatically; there is no component list to maintain.
- If the verified v2 package version changed, update the docs tool's description and returned snapshot header.
- Update the README's snapshot link/version and [provenance](provenance.md), including version evidence, component tree link, representative page links, sizes, and limitations.

### Refresh the offline snapshot

The packaged skills use `snapshot/`, captured from the **same** `DOCS_REVISION`. With the verified revision selected above:

1. Move the existing `snapshot/` out of the way (keep it as a backup until verification finishes). The one-time downloader intentionally refuses to overwrite an existing snapshot.
2. From the repository root, load `pi -e ./packages/pi-chakra-v2-docs/scripts/download-snapshot.ts` together with your usual extension configuration; restart or reload Pi to register `chakra_v2_download_snapshot`.
3. Call `chakra_v2_download_snapshot` once. It fetches the docs, getting-started, and tutorial MDX from the pinned revision; compares each file and the MIT license to its Git blob SHA; and atomically installs `snapshot/` only after all downloads succeed. On failure, resolve the issue and retry (the prior backup remains untouched).
4. Inspect the new content and update skill indexes, version labels, README, and provenance when the source structure or APIs change. Verify local skill paths and package inclusion before removing the backup. Keep this maintenance tool out of the package's `pi.extensions` list: it must not run in ordinary user sessions.

## 3. Check and reload

From the repository root:

```bash
pnpm --filter @dotc/pi-chakra-v2-docs lint
pnpm --filter @dotc/pi-chakra-v2-docs check-types
pnpm --filter @dotc/pi-chakra-v2-docs build
pnpm format
```

Load the source:

```bash
pi -e ./packages/pi-chakra-v2-docs/src/index.ts
```

Ask Pi to exercise:

| Tool               | Arguments                                              | Expected result                                          |
| ------------------ | ------------------------------------------------------ | -------------------------------------------------------- |
| `chakra_v2_search` | `{}`                                                   | Component directory names at the new revision            |
| `chakra_v2_search` | `{"query": "button"}`                                  | Matching names                                           |
| `chakra_v2_search` | `{"query": " Icon   Button "}`                         | `icon-button`                                            |
| `chakra_v2_search` | `{"query": "nonexistent-component"}`                   | No-results message                                       |
| `chakra_v2_docs`   | `{"component": "button"}` and `{"component": "modal"}` | Usable MDX with the new source URL and revision metadata |
| `chakra_v2_docs`   | `{"component": "../button"}`                           | Validation failure                                       |
| `chakra_v2_docs`   | `{"component": "nonexistent-component"}`               | Missing-page error                                       |

Fetch a name returned by search to verify the discovery-to-docs flow. Repeat the smoke check with the compiled package:

```bash
pi -e ./packages/pi-chakra-v2-docs
```

Rebuild before reloading a compiled-package session. Ensure Lockdown permits the tools; if verifying delegation, the child session must also load the package and permit both tools. See [optional tool permissions](../README.md#tools-optional).

Record actual verification results before review or publication. A successful build or source fetch alone does not verify tool execution; these smoke checks do not cover HTTP/network failures, cancellation, or truncation.
