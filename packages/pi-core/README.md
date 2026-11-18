# @dotc/pi-core

A collection of core extensions and tools for the [Pi coding agent](https://github.com/badlogic/pi-mono).

## Features

- **`subagent`**: Delegate tasks to specialized subagents in isolated Pi processes with support for single execution, parallel batches, and sequential chains.
- **`git_inspect`**: Read-only Git inspections (history, status, diffs, branches, remotes, worktrees) with bounded output.
- **`git_stage_unstage`**: Stage or unstage named repository-relative files with path and tracked/staged-file validation.
- **`git_commit`**: Commit already-staged files with a validated one-line Conventional Commit message.
- **`git_worktree_add`**: Create and switch to new branches/worktrees using structured bare-repo conventions and strict branch naming rules.
- **`git_changes`** (legacy): Inspect staged, unstaged, and untracked changes across the working tree in a unified diff view with safety line caps. Prefer `git_inspect`.
- **`commit_changes`** (legacy): Stage and commit repository changes in a single operation, with full handling for Git hooks and error reporting. Prefer `git_commit` + `git_stage_unstage`.
- **`run_npm_script`**: Execute allowlisted project scripts.
- **`fetch_url`**: Fetch content from web pages, APIs, or raw files with output character limiting and abort signal support.
- **`current_date`**: Get current date, weekday, time, and timezone information with support for IANA timezones.

## Installation

Install using the Pi package manager:

```bash
pi install npm:@dotc/pi-core
```

Or configure it in your Pi settings file (`~/.pi/agent/settings.json` or project `.pi/settings.json`):

```json
{
  "packages": ["npm:@dotc/pi-core"]
}
```

## Extensions & Tools

The package exposes eight independent extensions registered via the Pi `ExtensionAPI`.

### 1. `subagent`

Spawns separate `pi` child processes in isolated contexts with JSON communication, token/cost tracking, and real-time streaming UI updates.

#### Execution Modes

- **Single mode**:
  ```json
  {
    "agent": "scout",
    "task": "Investigate repo structure",
    "cwd": "./packages/pi-core"
  }
  ```
- **Parallel mode**: Runs multiple tasks concurrently (up to 8 tasks total, maximum 4 running concurrently):
  ```json
  {
    "tasks": [
      { "agent": "scout", "task": "Check package.json" },
      { "agent": "scout", "task": "Check source code" }
    ]
  }
  ```
- **Chain mode**: Runs tasks sequentially, passing previous output via `{previous}` template placeholder:
  ```json
  {
    "chain": [
      { "agent": "scout", "task": "Analyze dependencies in {cwd}" },
      { "agent": "coder", "task": "Based on analysis:\n{previous}\nUpdate outdated packages." }
    ]
  }
  ```

#### Thinking Level

Set optional top-level `thinkingLevel` to control every agent dispatched by a single, parallel, or chain call:

```json
{
  "agent": "scout",
  "task": "Investigate repo structure",
  "thinkingLevel": "high"
}
```

Agents can also specify a default in Markdown frontmatter:

```yaml
---
name: reviewer
description: Review proposed changes
thinkingLevel: low
---
```

Accepted values are `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, and `max`. Invalid agent-definition values fail discovery with an error identifying the file.

Resolution for each dispatched agent is:

1. Top-level tool-call `thinkingLevel` (shared by all tasks).
2. That agent's frontmatter `thinkingLevel`.
3. The selected model's `modelThinkingLevels` entry in child Pi settings.
4. Child Pi's global `defaultThinkingLevel`.
5. Built-in `medium`.

With neither override set, the child receives no `--thinking` flag, whether its model is explicit or inherited. The parent's active thinking level is never inherited. Pi may clamp the resolved level to the selected model's capabilities.

Parallel and chain calls can use different agent-definition defaults; a top-level override replaces all of them. There is no per-task or per-chain-step thinking parameter.

#### Agent Discovery and Scopes

Agents are defined as Markdown files with YAML frontmatter:

- **User agents**: Stored in `~/.pi/agent/agents`
- **Project agents**: Stored in `.pi/agents` within the workspace
- **`agentScope` parameter**: Select `"project"` (default), `"user"`, or `"both"`. When `"both"` is selected, project agents take precedence over user agents with matching names.
- **`confirmProjectAgents` parameter**: Boolean (default `true`). Prompts for confirmation before running project-local agents in untrusted repositories.

---

### 2. `git_changes` (legacy)

> **Legacy:** superseded by `git_inspect`, which also covers history, status, branches, remotes, and worktrees. Kept for backward compatibility.

Reads line-by-line staged, unstaged, and untracked changes across the Git working tree.

- **Parameters**: None.
- **Output**: Returns a structured text output containing three sections:
  - `=== STAGED ===` (`git diff --staged`)
  - `=== UNSTAGED ===` (`git diff`)
  - `=== UNTRACKED ===` (`git ls-files --others --exclude-standard`)
- **Safety Caps**: Large diff sections exceeding 2,000 lines are truncated and summarized by affected file list to prevent context window blowout.

---

### 3. `commit_changes` (legacy)

> **Legacy:** superseded by `git_commit` + `git_stage_unstage`, which commit only staged files. Kept for backward compatibility.

Stages all changes and creates a Git commit in a single step.

- **Parameters**:
  - `message` (`string`, required): Commit message, typically following Conventional Commits (e.g. `feat: add new endpoint`).
- **Behavior**:
  - Automatically locates repository root from any subdirectory.
  - Runs `git add .` followed by `git commit -m <message>`.
  - Captures Git commit hash and exit codes.
  - Returns hook failures (such as `pre-commit` or `commit-msg`) in tool result content without throwing unhandled exceptions.

---

### 4. `git_inspect`

Read-only Git inspections in the repository. Prefer this over the legacy `git_changes` tool.

- **Parameters**:
  - `command` (`string`, required): One of `log`, `show`, `status`, `diff`, `diff --cached`, `worktree list`, `branch`, `remote`.
  - `ref` (`string`, optional): Commit or ref to show (default `HEAD`); only valid for `show`.
  - `paths` (`string[]`, optional): Repository-relative paths (literal pathspecs, directories allowed) to limit `diff`, `diff --cached`, or `show`.
- **Behavior**:
  - Runs with `cwd = ctx.cwd`; output is truncated to `DEFAULT_MAX_BYTES` / `DEFAULT_MAX_LINES` with an `[Output truncated.]` notice and a `truncated` flag in `details`.
  - Returns `isError: true` for failing commands; a `ref` on anything other than `show`, or `paths` on anything other than `diff` / `diff --cached` / `show`, is rejected.

---

### 5. `git_stage_unstage`

Stages or unstages named repository-relative files.

- **Parameters**:
  - `command` (`"stage" | "unstage"`, required).
  - `paths` (`string[]`, required, min 1): File paths only — directories are rejected for `stage`, and `unstage` requires an already-staged file.
- **Behavior**:
  - Validates paths (relative, no `.` / `..` / backslashes) and rejects untracked-and-absent paths.
  - `stage` runs `git add -A -- <paths>`; `unstage` runs `git restore --staged -- <paths>`. Both use literal pathspecs.
  - Prefer this over the legacy `commit_changes`, which stages everything with `git add .`.

---

### 6. `git_commit`

Commits already-staged files with a Conventional Commit message. Prefer this over the legacy `commit_changes`.

- **Parameters**:
  - `message` (`string`, required): One-line Conventional Commit message (validated against `^(build|ci|chore|docs|feat|fix|perf|refactor|revert|style|test)(\([^)]+\))?!?: \S...`).
- **Behavior**:
  - Commits only what is currently staged; staging is done separately with `git_stage_unstage`.
  - Rejects an invalid message or an empty index.
  - Returns Git output and `isError: true` on failure; repo hooks (e.g. commitlint) surface in the result rather than throwing.

---

### 7. `git_worktree_add`

Creates a Git branch and dedicated worktree according to a bare-repo layout: `(bare-repo)/(prefix)/(name)`.

- **Parameters**:
  - `branch` (`string`, required): Full branch name formatted as `<prefix>/<name>`.
    - **Prefix**: Must be one of `build`, `ci`, `chore`, `docs`, `feat`, `fix`, `perf`, `refactor`, `revert`, `style`, `test`.
    - **Name**: Strict lowercase kebab-case letters (no uppercase, digits, dots, underscores, or consecutive/trailing dashes).
  - `mode` (`"new" | "remote"`, required):
    - `"new"`: Fetches `origin develop` and creates the branch from `origin/develop`.
    - `"remote"`: Tracks an existing origin branch `origin/<branch>` (without fetching).

---

### 8. `run_npm_script`

Executes configured, allowlisted package-manager commands (`npm` or `pnpm`) from within Pi. Configure the effective Pi settings in `~/.pi/agent/settings.json` or the trusted project's `.pi/settings.json`:

```json
{
  "runNpmScript": {
    "packageManager": "pnpm",
    "validScripts": ["build", "build --watch", "--filter=@dotc/pi-core check-types"]
  }
}
```

- **Settings**:
  - `packageManager` (`"npm"` or `"pnpm"`, optional): The package manager used to run allowlisted commands. Defaults to `"pnpm"` when omitted for backward compatibility; any other value is reported as a session-start error and the tool is not registered. When `"npm"` is selected, `validScripts` entries must be written for npm (pnpm-only options such as `--filter` are not automatically translated).
  - `validScripts` (`string[]`): Allowlisted invocations; each entry may be a single token or a whitespace-separated multi-token invocation.
- **Parameters**:
  - `script` (`string`, required): The entire permitted invocation, exactly as listed in `validScripts`. No separate or appended arguments are accepted.
- **Behavior**:
  - For valid settings, the effective allowlist is selected in the order specified below. Project and global arrays are **not merged**.
    - Trusted project's `runNpmScript.validScripts` array, **even if it is empty**
    - Global `runNpmScript.validScripts` array
    - An empty array `[]`
  - Settings are read on `session_start`, after Pi binds the extension runtime. An invalid namespace, non-array `validScripts`, non-string or empty entry, unsupported shell/quoting syntax, or an invalid `packageManager` value is reported as a session-start error and the tool is not registered. Pi may continue loading other extensions; this is not a fatal startup or extension-load error. Entries must consist of plain whitespace-delimited tokens containing letters, digits, underscores, `@`, `.`, `/`, `:`, `=`, `+`, or `-`; spaces and tabs may separate tokens, but no leading/trailing whitespace is allowed.
  - Checks the exact configured string before execution, including any pre-supplied arguments. Executes the selected manager with separate argv tokens and `shell: false` in the current working directory (`ctx.cwd`); it never spawns an unlisted request. Allowlisted entries are not translated between managers: entries must be appropriate for the configured `packageManager`.
  - Returns stdout on success and captured command output or an error on failure/abort.
  - If an older `.pi/extensions/run-npm-script.ts` copy exists in your project, that separate extension is not configured by this setting.

---

### 9. `fetch_url`

Fetches contents from external HTTP and HTTPS URLs.

- **Parameters**:
  - `url` (`string`, required): The URL to retrieve.
  - `maxChars` (`integer`, optional): Maximum characters to return, from 1 to 500,000; defaults to 100,000.
- **Behavior**:
  - Supports cancellation via tool abort signal.
  - Automatically throws for non-2xx HTTP responses.
  - Truncates response text at `maxChars` with an explicit notice in the returned output.
  - Returns metadata in `details` (`status`, `contentType`, `charCount`, `truncated`).

---

### 10. `current_date`

Provides accurate temporal context to avoid hallucinating current dates or deadlines.

- **Parameters**:
  - `timezone` (`string`, optional): IANA timezone name (e.g. `'America/New_York'`, `'Europe/London'`, `'Asia/Tokyo'`). Defaults to the host system timezone.
- **Output**: Formatted date, day of week, time, timezone label, and ISO 8601 timestamp.

---

## Development

### Monorepo Setup

This package is part of the `dotc-pi` workspace managed with `pnpm` and Turborepo.

### Scripts

Run scripts from the repository root:

```bash
# Build the TypeScript extensions into dist/
pnpm --filter @dotc/pi-core build

# Type check without emitting files
pnpm --filter @dotc/pi-core check-types

# Run ESLint
pnpm --filter @dotc/pi-core lint

# Fix ESLint issues
pnpm --filter @dotc/pi-core lint:fix
```

### Peer Dependencies

The extensions interact directly with the Pi SDK and require the following peer dependencies:

- `@earendil-works/pi-agent-core`
- `@earendil-works/pi-ai`
- `@earendil-works/pi-coding-agent`
- `@earendil-works/pi-tui`
- `typebox`

## License

[MIT](LICENSE)
