# pi-chakra-v2-docs

Chakra UI v2 documentation extension for Pi. Currently a scaffold with a smoke-test command; documentation retrieval is not implemented yet.

## Local development

From the repository root:

```bash
pnpm install
pi -e ./packages/pi-chakra-v2-docs/src/index.ts
```

Run `/chakra-v2-docs` to confirm the extension is loaded. After editing the source, run `/reload`.

## Verify the package

From the repository root:

```bash
pnpm --filter @dotc/pi-chakra-v2-docs lint
pnpm --filter @dotc/pi-chakra-v2-docs check-types
pnpm --filter @dotc/pi-chakra-v2-docs build
pi -e ./packages/pi-chakra-v2-docs
```

Run `/chakra-v2-docs` again to check the compiled entry point. Rebuild after source changes before reloading the package directory.
