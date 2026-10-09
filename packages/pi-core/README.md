# @dotc/pi-core

A collection of core extensions and tools for the [Pi coding agent](https://github.com/badlogic/pi-mono).

## Features

- **`subagent`**: Delegate tasks to specialized subagents in isolated Pi processes with support for single execution, parallel batches, and sequential chains.
- **`git_changes`**: Inspect staged, unstaged, and untracked changes across the working tree in a unified diff view with safety line caps.
- **`commit_changes`**: Stage and commit repository changes in a single operation, with full handling for Git hooks and error reporting.
- **`git_worktree_add`**: Create and switch to new branches/worktrees using structured bare-repo conventions and strict branch naming rules.
- **`run_npm_script`**: Execute allowlisted project scripts and database commands securely.
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

The package exposes seven independent extensions registered via the Pi `ExtensionAPI`.

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

#### Agent Discovery and Scopes

Agents are defined as Markdown files with YAML frontmatter:

- **User agents**: Stored in `~/.pi/agent/agents`
- **Project agents**: Stored in `.pi/agents` within the workspace
- **`agentScope` parameter**: Select `"project"` (default), `"user"`, or `"both"`. When `"both"` is selected, project agents take precedence over user agents with matching names.
- **`confirmProjectAgents` parameter**: Boolean (default `true`). Prompts for confirmation before running project-local agents in untrusted repositories.

---

### 2. `git_changes`

Reads line-by-line staged, unstaged, and untracked changes across the Git working tree.

- **Parameters**: None.
- **Output**: Returns a structured text output containing three sections:
  - `=== STAGED ===` (`git diff --staged`)
  - `=== UNSTAGED ===` (`git diff`)
  - `=== UNTRACKED ===` (`git ls-files --others --exclude-standard`)
- **Safety Caps**: Large diff sections exceeding 2,000 lines are truncated and summarized by affected file list to prevent context window blowout.

---

### 3. `commit_changes`

Stages all changes and creates a Git commit in a single step.

- **Parameters**:
  - `message` (`string`, required): Commit message, typically following Conventional Commits (e.g. `feat: add new endpoint`).
- **Behavior**:
  - Automatically locates repository root from any subdirectory.
  - Runs `git add .` followed by `git commit -m <message>`.
  - Captures Git commit hash and exit codes.
  - Returns hook failures (such as `pre-commit` or `commit-msg`) in tool result content without throwing unhandled exceptions.

---

### 4. `git_worktree_add`

Creates a Git branch and dedicated worktree according to a bare-repo layout: `(bare-repo)/(prefix)/(name)`.

- **Parameters**:
  - `branch` (`string`, required): Full branch name formatted as `<prefix>/<name>`.
    - **Prefix**: Must be one of `build`, `ci`, `chore`, `docs`, `feat`, `fix`, `perf`, `refactor`, `revert`, `style`, `test`.
    - **Name**: Strict lowercase kebab-case letters (no uppercase, digits, dots, underscores, or consecutive/trailing dashes).
  - `mode` (`"new" | "remote"`, required):
    - `"new"`: Fetches `origin develop` and creates the branch from `origin/develop`.
    - `"remote"`: Tracks an existing origin branch `origin/<branch>` (without fetching).

---

### 5. `run_npm_script`

Executes allowed package scripts and repository database commands safely from within Pi.

- **Parameters**:
  - `script` (`string`, required): Script command to execute. Must match one of the allowed scripts:
    - `build`
    - `lint`
    - `lint:fix`
    - `check-types`
    - `format`
    - `format:fix`
    - `test`
    - `--filter=@repo/db db:sync`
    - `--filter=@repo/db db:seed:run`
    - `--filter=@repo/db db:migration:run`
    - `--filter=@repo/db db:generate`
- **Behavior**:
  - Validates the requested command against the allowlist before execution.
  - Executes `pnpm <script>` in the current working directory (`ctx.cwd`).
  - Returns command output or captured errors and status codes.

---

### 6. `fetch_url`

Fetches contents from external HTTP and HTTPS URLs.

- **Parameters**:
  - `url` (`string`, required): The URL to retrieve.
- **Behavior**:
  - Supports cancellation via tool abort signal.
  - Automatically throws for non-2xx HTTP responses.
  - Caps response text at 100,000 characters with an explicit truncation notice in the returned output.
  - Returns metadata in `details` (`status`, `contentType`, `charCount`, `truncated`).

---

### 7. `current_date`

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
