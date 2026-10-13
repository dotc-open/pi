# Local development

From the repository root, load the checked-out extension and all four skills without installing the package:

```bash
pi --continue -e ./packages/pi-chakra-v2-docs/src/index.ts \
  --skill ./packages/pi-chakra-v2-docs/skills/chakra-v2-setup \
  --skill ./packages/pi-chakra-v2-docs/skills/chakra-v2-components \
  --skill ./packages/pi-chakra-v2-docs/skills/chakra-v2-hooks \
  --skill ./packages/pi-chakra-v2-docs/skills/chakra-v2-styling
```

The package manifest distributes the compiled extension, skills, and snapshot together. To smoke-test it locally, build first and then load the package directory:

```bash
pnpm --filter @dotc/pi-chakra-v2-docs build
pi --continue -e ./packages/pi-chakra-v2-docs
```

Reload Pi after editing skills; rebuild before reloading compiled extensions. Check which files will ship with `npm pack --dry-run --json` from `packages/pi-chakra-v2-docs`; ensure all four `SKILL.md` files and the 231 MDX pages are listed. For snapshot refreshes, see [updating the revision](updating-revision.md).
