# @dotc/pi-chakra-v2-docs

Pinned Chakra UI v2 documentation for the [Pi coding agent](https://github.com/badlogic/pi-mono).

## Features

- **Offline skills**: `chakra-v2-setup`, `chakra-v2-components`, `chakra-v2-hooks`, and `chakra-v2-styling` guide agents to relevant local documentation on demand—no network or explicit slash command needed.
- **Optional tools**: `chakra_v2_search` discovers component names; `chakra_v2_docs` fetches component usage MDX. These existing tools still require GitHub access.
- All resources use the same [Chakra UI 2.10.10 snapshot](https://github.com/chakra-ui/chakra-ui/tree/a1005f7f129f225058e7616c52e580b6cf8dcfdc/website/content). The package includes 231 MDX pages and the upstream MIT license.

## Installation

```bash
pi install npm:@dotc/pi-chakra-v2-docs
```

## Skills

Ask Pi a Chakra UI **v2** question. Pi sees each skill's name and description and reads its instructions only when the task calls for it; the full documentation corpus is not loaded into every prompt.

| Skill                  | Use for                                                      |
| ---------------------- | ------------------------------------------------------------ |
| `chakra-v2-setup`      | Installation, providers, frameworks, migration, integrations |
| `chakra-v2-components` | Component composition, examples, accessibility, theming      |
| `chakra-v2-hooks`      | Hooks, state, responsive behavior, custom controls           |
| `chakra-v2-styling`    | Style props, color mode, tokens, variants, theme overrides   |

For example, ask “How do I show a loading state on a Chakra UI v2 Button?” or “How do I set up Chakra UI v2 in a Next.js app?” The agent reads the relevant local MDX page and can cite its pinned source. `/skill:chakra-v2-components` is available if you want to force a skill, but is not required.

The bundled pages are raw MDX: generated prop tables and imported Sandpack examples are not rendered. Some tutorial pages are placeholders; the skills prioritize usable guides and examples. See [documentation provenance and limits](docs/provenance.md).

## Tools (optional)

Network-backed tools remain available alongside the offline skills:

| Tool               | Arguments                 | Result                              |
| ------------------ | ------------------------- | ----------------------------------- |
| `chakra_v2_search` | `{}`                      | All component names, alphabetically |
| `chakra_v2_search` | `{"query": "button"}`     | Names containing `button`           |
| `chakra_v2_docs`   | `{"component": "button"}` | Button usage MDX                    |

Search is case-insensitive and uses GitHub's directory API; blank queries list all components. Pass a returned name to the docs tool. Fetch output is capped at 100,000 characters and marks truncation. Both tools support cancellation and report request errors rather than falling back to current-version docs.

If you use `@chrischow/pi-lockdown`, permit the tools in your Pi settings (the skills themselves do not require these permissions):

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

`warn` prompts for approval; `allow` permits requests without prompting. Merge these keys into your existing settings rather than replacing them. No separate `fetch_url` permission is needed. Run `/reload` after changing settings.

To delegate network research to a `subagent`, install this package in the child session too, add both tools to that agent's tool list, and grant its tool permissions if needed. CLI `-e` arguments in the parent are not forwarded to children.

## Development

For checked-out source loading and package testing, see [local development](docs/local-development.md). For the pinned source, licensing, and refresh procedure, see [provenance](docs/provenance.md) and [updating the revision](docs/updating-revision.md).
