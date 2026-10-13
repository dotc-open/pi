---
name: chakra-v2-styling
description: Style and theme Chakra UI v2 React apps. Use for v2 style props, responsive layouts, color mode, design tokens, component variants, theme overrides, or the chakra factory.
---

# Chakra UI v2 styling and theming

Pinned offline source: `@chakra-ui/react` 2.10.10, `chakra-ui/chakra-ui` revision `a1005f7f129f225058e7616c52e580b6cf8dcfdc`. Resolve paths relative to this SKILL.md. Start with the page matching the task, then follow related local pages; do not load the entire snapshot. In each list, bare filenames share the directory of its first full path.

- Theme tokens and defaults: `../../snapshot/docs/styled-system/theme.mdx`, `customize-theme.mdx`, `semantic-tokens.mdx`.
- Component variants and multipart anatomy: `../../snapshot/docs/styled-system/component-style.mdx`, `advanced-theming.mdx`; for a named component also read `../../snapshot/docs/components/<slug>/theming.mdx` if present.
- Style props and `sx`: `../../snapshot/docs/styled-system/style-props.mdx`, `the-sx-prop.mdx`.
- Responsive behavior: `../../snapshot/docs/styled-system/responsive-styles.mdx`.
- Dark mode: `../../snapshot/docs/styled-system/color-mode.mdx`.
- Other topics: `find ../../snapshot/docs/styled-system -name '*.mdx'` (CSS variables, global styles, gradients, RTL, CLI, text/layer styles, chakra factory).

Site-absolute `/docs/...` links are not local file paths: map `/docs/styled-system/<topic>` to `../../snapshot/docs/styled-system/<topic>.mdx` and `/docs/components/.../<slug>` to `../../snapshot/docs/components/<slug>/usage.mdx` or `theming.mdx`. Source may embed rendered components or unresolved Sandpack examples; do not present those as included code. If a theming page contains huge SVGs, find headings with `grep` and read only relevant lines. Cite `https://github.com/chakra-ui/chakra-ui/blob/a1005f7f129f225058e7616c52e580b6cf8dcfdc/website/content/<snapshot-relative-path>` when reporting findings. See `../../snapshot/LICENSE`.
