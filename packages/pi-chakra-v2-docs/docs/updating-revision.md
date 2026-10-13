# Updating the documentation revision

Update the source deliberately. Do not replace the immutable pin with `v2`, `main`, or another moving reference, and do not silently switch to Chakra UI v3 documentation.

## 1. Verify the candidate

Select a full commit SHA from `chakra-ui/chakra-ui`'s `v2` branch. At that exact revision:

- Check `website/package.json` uses the workspace's `@chakra-ui/react`, and verify its version in `packages/components/package.json` is **2.x**.
- Confirm the component directory and bundled skill paths match the new snapshot. A recursive Git tree can verify the paths; check that the tree response is not truncated.
- Inspect Button, Modal, and any changed pages for v2 APIs, usable inline examples, imports, and custom MDX components that could hide required content.

If any check fails, stop and investigate rather than changing versions or source formats implicitly.

## 2. Update the package

- Change `DOCS_REVISION` in `scripts/download-snapshot.ts` and update the revision cited by all three skills.
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
pi --skill ./packages/pi-chakra-v2-docs/skills/chakra-v2-components \
  --skill ./packages/pi-chakra-v2-docs/skills/chakra-v2-hooks \
  --skill ./packages/pi-chakra-v2-docs/skills/chakra-v2-styling
```

Ask Pi to find and read the local Button and Modal usage pages, then repeat with the installed package. Check that all three skills cite the updated revision and that the snapshot is included in the published package.
