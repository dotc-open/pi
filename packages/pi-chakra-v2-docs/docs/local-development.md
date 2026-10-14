# Local development

From the repository root, load all three skills without installing the package:

```bash
pi --continue --skill ./packages/pi-chakra-v2-docs/skills/chakra-v2-components \
  --skill ./packages/pi-chakra-v2-docs/skills/chakra-v2-hooks \
  --skill ./packages/pi-chakra-v2-docs/skills/chakra-v2-styling
```

Reload Pi after editing skills. Check which files will ship with `npm pack --dry-run --json` from `packages/pi-chakra-v2-docs`; ensure all three `SKILL.md` files and the 231 MDX pages are listed. For snapshot refreshes, see [updating the revision](updating-revision.md).
