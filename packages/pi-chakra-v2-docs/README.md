# @dotc/pi-chakra-v2-docs

Chakra UI v2 component documentation and discovery for the [Pi coding agent](https://github.com/badlogic/pi-mono).

## Features

- **`chakra_v2_search`**: List available components or filter their names using GitHub's directory API.
- **`chakra_v2_docs`**: Fetch component usage documentation and examples as raw MDX, with source attribution.
- Both tools use the same [pinned Chakra UI 2.10.10 snapshot](https://github.com/chakra-ui/chakra-ui/tree/a1005f7f129f225058e7616c52e580b6cf8dcfdc/website/content/docs/components), support cancellation, and require network access. Search is subject to GitHub API rate limits.
- Docs output is capped at 100,000 characters with a truncation notice to preserve session context.

## Installation

```bash
pi install npm:@dotc/pi-chakra-v2-docs
```

Or add `npm:@dotc/pi-chakra-v2-docs` to the `packages` array in `~/.pi/agent/settings.json` or project `.pi/settings.json`.

## Setup

### Lockdown (optional)

If using `@chrischow/pi-lockdown`, merge these permissions into your Pi settings:

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

`warn` asks for approval; `allow` permits requests without prompting. Unlisted custom tools may not be available. No separate `fetch_url` permission is required.

### Subagents (optional)

The docs tool encourages delegation when `subagent` and a docs-capable child agent are available; otherwise it supports direct calls. For [`@dotc/pi-core`](../pi-core/README.md):

- Install/configure this package for child sessions too; the parent's `-e` arguments are not forwarded.
- Add `chakra_v2_search` and `chakra_v2_docs` to the existing `tools` list in `.pi/agents/scout.md` or `~/.pi/agent/agents/scout.md`:

  ```yaml
  tools: read, grep, find, ls, chakra_v2_search, chakra_v2_docs
  ```

- If using Lockdown, merge the following into settings. Child `allow` permissions authorize unattended GitHub requests; enable them only if acceptable:

  ```json
  {
    "lockdown": {
      "customTools": { "subagent": "warn" }
    },
    "lockdownSubagent": {
      "customTools": {
        "chakra_v2_docs": "allow",
        "chakra_v2_search": "allow"
      }
    }
  }
  ```

Run `/reload` after setup changes. Preserve existing settings and agent tools when merging these examples.

## Usage

Ask Pi to call these tools; they are not slash commands:

| Tool               | Arguments                  | Result                              |
| ------------------ | -------------------------- | ----------------------------------- |
| `chakra_v2_search` | `{}`                       | All component names, alphabetically |
| `chakra_v2_search` | `{"query": "button"}`      | Names containing `button`           |
| `chakra_v2_search` | `{"query": "Icon Button"}` | `icon-button`                       |
| `chakra_v2_docs`   | `{"component": "button"}`  | Button usage documentation          |

Search is case-insensitive; omitted or blank queries list all components. Pass a returned name to the docs tool—`all` is not a component name. Request failures are reported as errors.

For delegated research, ask Pi to use `scout` to fetch the docs and return relevant examples and source URLs. If you have this repository's optional prompt template loaded, you can also use:

```text
/with_subagent Research Chakra UI v2 Button loading states using chakra_v2_docs. Return examples and source URLs.
```

The template is not bundled with this package.
