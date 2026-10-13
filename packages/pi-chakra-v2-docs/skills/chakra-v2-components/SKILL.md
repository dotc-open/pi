---
name: chakra-v2-components
description: Implement or customize Chakra UI v2 React components. Use for v2 component composition, examples, props, accessibility, or component-specific theming (Button, Modal, Grid, etc.).
---

# Chakra UI v2 components

Source: `chakra-ui/chakra-ui` revision `a1005f7f129f225058e7616c52e580b6cf8dcfdc` (`@chakra-ui/react` 2.10.10). Resolve paths below relative to this SKILL.md. The snapshot is offline; cite the original page at `https://github.com/chakra-ui/chakra-ui/blob/a1005f7f129f225058e7616c52e580b6cf8dcfdc/website/content/` followed by its snapshot-relative path.

Find the component slug with `find ../../snapshot/docs/components -name usage.mdx`; use the directory name, not the site's historical category in the link. Read `../../snapshot/docs/components/<slug>/usage.mdx` first. If customizing its appearance, read adjacent `theming.mdx` when present, then use the `chakra-v2-styling` skill for shared theme concepts. `props.mdx` is often only a `<PropsTable>` placeholder; never infer a complete prop API from it. Prefer the usage examples and, if exact generated types are essential, check the installed v2 library declarations.

Common routes: actions/forms (`button`, `icon-button`, `input`, `form-control`, `checkbox`, `select`); overlays (`modal`, `alert-dialog`, `drawer`, `popover`); layout (`box`, `flex`, `grid`, `stack`, `container`); feedback (`alert`, `toast`, `progress`); disclosure (`accordion`, `tabs`). For other components, search the snapshot directories by slug or search page contents with `grep`.

Raw MDX may contain unresolved `<SandpackEmbed>` imports, embedded SVG diagrams, and site-absolute links. For very large theming pages, search headings first and read the relevant lines rather than loading the whole file. `/docs/components/<category>/<slug>` links in upstream MDX may use obsolete paths: look up `<slug>/usage.mdx` locally. Do not substitute current Chakra UI v3 docs. Consult `../../snapshot/LICENSE` for redistribution terms.
