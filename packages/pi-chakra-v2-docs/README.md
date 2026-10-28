# @dotc/pi-chakra-v2-docs

Offline Chakra UI v2 documentation for the [Pi coding agent](https://github.com/badlogic/pi-mono).

The `chakra-v2-components`, `chakra-v2-hooks`, and `chakra-v2-styling` skills guide agents to the relevant local documentation on demand—no network or explicit slash command needed. They use the same [Chakra UI 2.10.10 snapshot](https://github.com/chakra-ui/chakra-ui/tree/a1005f7f129f225058e7616c52e580b6cf8dcfdc/website/content). The package includes 231 MDX pages and the upstream MIT license.

## Installation

```bash
pi install npm:@dotc/pi-chakra-v2-docs
```

## Skills

Ask Pi a Chakra UI **v2** question. Pi sees each skill's name and description and reads its instructions only when the task calls for it; the full documentation corpus is not loaded into every prompt.

| Skill                  | Use for                                                    |
| ---------------------- | ---------------------------------------------------------- |
| `chakra-v2-components` | Component composition, examples, accessibility, theming    |
| `chakra-v2-hooks`      | Hooks, state, responsive behavior, custom controls         |
| `chakra-v2-styling`    | Style props, color mode, tokens, variants, theme overrides |

For example, ask “How do I show a loading state on a Chakra UI v2 Button?” or “How do I customize the v2 theme using this project's semantic tokens?” The agent reads the relevant local MDX page and can cite its pinned source. `/skill:chakra-v2-components` is available if you want to force a skill, but is not required.

The bundled pages are raw MDX: generated prop tables and imported Sandpack examples are not rendered. Some tutorial pages are placeholders; the skills prioritize usable guides and examples. See [documentation provenance and limits](docs/provenance.md).

## Development

For checked-out source loading and package testing, see [local development](docs/local-development.md). For the pinned source, licensing, and refresh procedure, see [provenance](docs/provenance.md) and [updating the revision](docs/updating-revision.md).
