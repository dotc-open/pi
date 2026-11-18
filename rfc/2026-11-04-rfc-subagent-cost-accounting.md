# Subagent cost accounting in session totals

_Status: Draft — 2026-11-04_

## Problem Context

The `subagent` extension in `@dotc/pi-core` spawns a separate `pi` process per dispatched agent (`packages/pi-core/src/extensions/subagent.ts:467`, `:511`) and parses the child's JSON messages to accumulate token and cost figures (`:532-541`). Those figures are stored per result and surfaced only in the extension's own rendering (`:211-233`, `:1037-1047`, `:1093-1100`, `:1168-1175`).

Pi's accounting contract is narrower than the extension's data model: the parent session counts usage that is attached as a top-level `usage` field on the tool result, which the agent loop copies onto the `toolResult` message (`pi-agent-core/dist/agent-loop.js:660`) and `AgentSession.getSessionStats()` then sums (`pi-coding-agent/dist/core/agent-session.js:3466-3470`). `docs/extensions.md:249` states the expectation: "If the tool makes nested model calls, include their `usage` in the result so session totals remain accurate."

The extension never does this. It returns `content` plus `details` on every path (`subagent.ts:868-876`, `:781-794`, `:895-904`), with usage nested inside `details.results[].usage` (`:328-333`). Consequence: **session cost and token totals omit subagent spend.** The footer (`pi-coding-agent/dist/modes/interactive/components/footer.js:99-111`), `/session` totals and `getSessionStats` (`agent-session.js:3445-3497`) all undercount by the full cost of every dispatched agent. In subagent-heavy workflows this can be most of the actual spend, and there is no signal that anything is missing.

A related limitation is deliberately **not** in scope here, but explains a constraint below: `/session` cannot attribute cost to an individual agent type. Its per-line breakdown, `getUsageCostBreakdown(entries)` (`pi-coding-agent/dist/core/usage-totals.js:40-79`), keys assistant usage by `${provider}/${responseModel ?? model}` and usage entries by `${provider}/${model}`, but collapses **all** tool-result usage into one `"Tools/summaries"` bucket shared with compaction and branch summaries. It never reads `toolName`, `kind`, or `note`; `ToolResultMessage` carries no `provider`/`model` (`pi-ai/dist/types.d.ts:420-435`); and extensions receive a `ReadonlySessionManager` (`pi-coding-agent/dist/core/session-manager.d.ts:178`, `dist/core/extensions/types.d.ts:223`) that omits `appendUsage` (`session-manager.d.ts:268-269`). Correcting that requires changes to Pi itself, which is out of scope for this RFC; the user-facing workaround is deferred (see "The per-agent-type listing is deferred" below).

Why now: subagents are dispatched on most nontrivial tasks, so every session's reported cost is currently wrong.

## Goals

- Session cost and token totals (footer, `/session`, RPC `getSessionStats`) include all subagent usage in single, parallel, and chain modes.
- No double counting, no token/cost entry polluting model context, no caps or budgets.
- Do not depend on a Pi release. Per-agent-type reporting is a separate change, not part of this fix.

## Requirements

### Functional requirements

- **FR1**: The `subagent` tool reports aggregate usage for every dispatch mode (single, parallel, chain). The invalid-parameter path reports none.
- **FR2**: Reported cost is the exact sum of what the child reported, component by component: `cost.input`, `cost.output`, `cost.cacheRead`, `cost.cacheWrite`, `cost.total`, plus `input`, `output`, `cacheRead`, `cacheWrite`, `totalTokens`. No re-derivation from a pricing table.
- **FR3**: Failed, aborted, and non-zero-exit subagent runs still contribute their usage.
- **FR4**: Subagent usage appears in the footer cost, the `/session` aggregate cost, and `getSessionStats()` tokens/cost.
- **FR5**: Each child model call is counted exactly once.
- **FR6**: The child's provider/model for each dispatched agent remains visible in the `subagent` tool's own `details`, and existing per-model lines for the main session's own model are unchanged.

### Non-functional requirements

- **NFR1**: The change is confined to `pi-core` (`subagent.ts`, plus README), with no new runtime dependency and no dependency on a Pi release.
- **NFR2**: Usage is metadata only. It must not enter LLM context, alter what the model sees, or change session history semantics.
- **NFR3**: Session file format is unchanged — existing `usage` on messages only (`pi-ai/dist/types.d.ts:420-435`). Sessions written before and after the change must both load.
- **NFR4**: Types come from `pi-ai`'s `Usage`; no `any`, no local re-declaration of the same shape.
- **NFR5**: Verification follows the project convention: quality checks, then a user-handed-over session reload and a live `subagent` tool call.

## Options

| Option                                                    | Meets FR1-FR4 | Repo-only | Notes                                                                   |
| --------------------------------------------------------- | ------------- | --------- | ----------------------------------------------------------------------- |
| 1. Return top-level `usage` from the subagent tool result | Yes           | Yes       | Smallest complete fix; spend appears under `Tools/summaries`            |
| 2. Extension command listing per-agent-type cost          | n/a           | Yes       | Does not fix totals; deferred to a separate change                      |
| 3. Upstream label on tool-result usage                    | Yes           | No        | Needs a Pi release; one tool result cannot carry per-type labels anyway |
| 4. Upstream usage recording exposed to extensions         | Yes           | No        | Needs a Pi release                                                      |
| 5. Reuse the parent session for the child process         | Partial       | Yes       | Drops `--no-session`; pollutes context and breaks child isolation       |
| 6. Status quo                                             | No            | n/a       | Cost reporting stays wrong                                              |

### Option 1: Return top-level `usage` from the subagent tool

Build a `pi-ai` `Usage` from the aggregated per-result stats and attach it to each tool result alongside `details`. Pi attaches it to the `toolResult` message and every total includes it. Smallest complete change, uses only documented behaviour, and meets FR1-FR6. It cannot produce per-agent-type `/session` lines: `getUsageCostBreakdown` collapses the result into `"Tools/summaries"` (`usage-totals.js:54-60`), so all agents, plus compaction summaries, share one line.

### Option 2: Extension command listing per-agent-type cost

`pi.registerCommand` (`extensions/types.d.ts:1231`) lets the extension expose a command that reads persisted tool-result `details` — the whole message including `details` is stored by `appendMessage` (`session-manager.js:827-837`) and readable through `ctx.sessionManager.getEntries()` — and prints accumulated cost per agent type. Repo-local and viable, but it does not change session totals and is a new user-facing surface with its own naming and formatting decisions. Taken as a separate change (see "The per-agent-type listing is deferred" below), not bundled with the correctness fix.

### Option 3: Upstream label on tool-result usage

Upstream adds an optional label (for example `usageLabel`) to tool-result usage and keys the breakdown by it. Rejected: it needs a Pi release we are not making, and because one tool result can only carry one usage object, all agents in a parallel call would still land on one line.

### Option 4: Upstream usage recording exposed to extensions

Upstream exposes `SessionManager.appendUsage` (`session-manager.d.ts:268-269`) to extensions as `ctx.recordUsage(...)`, letting the tool write one usage entry per agent type; the breakdown's existing `${provider}/${model}` keying (`usage-totals.js:48-51`) would then render `subagent/scout` per type. Rejected: requires a Pi release, so it cannot ship here.

### Option 5: Run children in the parent session

Dropping `--no-session` would persist child usage in the parent session file. Rejected: it merges child transcripts into the parent context, breaking the tool's core isolation guarantee, and the child's own totals are model-context accounting, not the parent's.

### Option 6: Status quo

Session cost stays understated. Rejected.

## Proposed Solution

Option 1, because it is the only alternative that fixes session totals without a Pi release, and it satisfies every functional and non-functional requirement.

1. Extend the local `UsageStats` accumulation (`subagent.ts:303-310`, `:532-541`) to sum all cost components, not just `usage.cost.total`: `cost.input`, `cost.output`, `cost.cacheRead`, `cost.cacheWrite`, `cost.total`, and `totalTokens`. The child already reports the full split, computed by `calculateCost` (`pi-ai/dist/models.js:672-690`), so this is pass-through, not derivation (FR2).
2. Add a converter from aggregated stats to `pi-ai`'s `Usage` and attach it as the top-level `usage` of every tool result: the parallel return (`:868-876`), both chain returns (`:781-785`, `:791-794`), and both single returns (`:895-899`, `:901-904`). The invalid-parameter return stays usage-free (FR1, FR3).
3. `totalTokens` is the sum of the child runs' `totalTokens`. Nothing reads it for context accounting on a tool result; it exists so the object is a complete `Usage` (NFR4).
4. No change to the extension's own rendering, which already shows per-result and aggregate cost (FR6).

Tradeoffs accepted:

- **Subagent spend shares the `Tools/summaries` line** in `/session` with compaction and branch summaries. The total is correct; the breakdown is not attributable per agent type until the deferred change. This is a limitation of Pi's breakdown, not of the reported usage.
- **No caps or budgets**, per decision. Subagent spend is reported, never limited.
- **Nested subagents are out of scope.** Children run with `PI_LOCKDOWN_SUBAGENT=1`; a grandchild's cost counts only if the child itself reports it.
- **One extra field on five return objects**, with no shared helper, which is the smallest change that keeps each mode's return shape explicit.

### The per-agent-type listing is deferred

A command that lists accumulated cost per agent type (working name `/subagent-session`) is specified, implemented, and reviewed as a **separate change** from this fix. Reasons: it does not affect session totals, so bundling it would delay correctness; and it is a new user-facing surface whose name, output format, and grouping (per agent type per session, or per invocation) deserve their own review. It needs no Pi release, since tool-result `details` are persisted in the session and readable from the extension context.

### Impacted files

- `packages/pi-core/src/extensions/subagent.ts` — usage accumulation, the `Usage` converter, and tool-result `usage`.
- `packages/pi-core/README.md` — document that subagent spend is included in session totals, and that `/session` shows it under `Tools/summaries`.

### Verification

- Quality checks via the `code-quality-checker` subagent (`lint:fix`, `format:fix`, `check-types`), plus `pnpm build`.
- Pause and hand control to the user to reload the session, then call the `subagent` tool directly in each mode and compare the reported cost before and after:
  - Single: cost increases by the child's own reported total.
  - Parallel with two different agent types: both counted, each once.
  - Chain: every step counted once, not once per `{previous}` substitution.
  - Failing agent (non-zero exit): its cost still counted.
  - Footer, `/session` total, and `getSessionStats()` agree with each other, and `/session` shows the expected `Tools/summaries` line.
- Session load check: a session file written before the change still opens (NFR3).
