---
name: chakra-v2-setup
description: Set up or integrate Chakra UI v2 in a React app. Use for v2 installation, ChakraProvider, framework setup (Next.js, Vite, Remix, Gatsby), migration from v1, or Formik/React Hook Form integrations.
---

# Chakra UI v2 setup and integrations

Use the pinned local `@chakra-ui/react` 2.10.10 snapshot (revision `a1005f7f129f225058e7616c52e580b6cf8dcfdc`). Resolve paths below relative to this SKILL.md, not the project cwd; pass absolute paths to file tools and read only the relevant page. Bare filenames in each list share the directory of its first full path.

- Installation and `ChakraProvider`: `../../snapshot/getting-started/index.mdx` (the `<PackageManagers>` widget contains versioned install commands in its source).
- Frameworks: `../../snapshot/getting-started/nextjs-app-guide.mdx`, `nextjs-pages-guide.mdx`, `vite-guide.mdx`, `remix-guide.mdx`, `gatsby-guide.mdx`, `cra-guide.mdx`; discover the remaining framework guides with `find ../../snapshot/getting-started -name '*guide.mdx'`.
- Upgrade from v1: `../../snapshot/getting-started/migration.mdx`.
- Ecosystem: `../../snapshot/getting-started/with-hook-form.mdx`, `with-formik.mdx`, `with-framer.mdx`, `with-storybook.mdx`, `with-capsize.mdx`, `with-react-table.mdx`.
- Principles/comparison: `../../snapshot/getting-started/principles.mdx`, `comparison.mdx`. See the `chakra-v2-styling` skill for application theming and the components/hooks skills for usage.

`../../snapshot/tutorial/` is retained for full source coverage but is **not reliable instructional guidance**: several pages are placeholders and `basics.mdx` is lorem-ipsum filler. Read one only if asked about that source. Some getting-started pages have unresolved `<SandpackEmbed>` examples, and framework instructions describe their pinned era, not necessarily today's framework releases. Site-absolute links may not point to local files. Never mix these v2 instructions with current v3 APIs. Cite the original at `https://github.com/chakra-ui/chakra-ui/blob/a1005f7f129f225058e7616c52e580b6cf8dcfdc/website/content/<snapshot-relative-path>`. See `../../snapshot/LICENSE`.
