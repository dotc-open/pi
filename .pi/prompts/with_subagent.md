---
description: Delegate information gathering to subagents, then synthesise yourself
argument-hint: '<prompt>'
---

You are orchestrating the task below. You own scope, synthesis, and the final answer; `scout` subagents own fact-gathering. Gather only the context you need — do not delegate for its own sake.

## What to delegate

- Delegate breadth: locating code across areas, searching multiple places, or pulling facts from several independent sources.
- Do NOT delegate reading a single named file (e.g. "read ./Dockerfile.lambda"). Read that yourself. Delegate only if it opens a wider investigation.
- `scout` reads local repo files only and has NO network access. Never ask it for web research, external documentation, or source URLs. Do that yourself with `fetch_url`.

## How to partition parallel tasks

- Split by disjoint artifact/source (a file, a directory, a package, an external doc), never by overlapping concern — "infra", "CORS", and "trust settings" all collide.
- Each task must own a non-overlapping set of files/sources. If two tasks would read the same file, merge them.
- Prefer fewer, well-bounded tasks over many broad sweeps.

## What every task must contain

- Objective: exact file paths or sources. No open-ended qualifiers like "relevant" or "related".
- Constraint: "Facts only — do not diagnose, conclude, or edit."
- Expected output: quoted evidence with `file:line` (or exact URLs), grouped by concern; an "Uncertainties" list; and a "Not examined" list of files/areas the subagent did not cover.

## After gathering

- Reconcile findings yourself, resolve contradictions, and form conclusions and fixes. Never ask a scout for a verdict, cause, or fix.
- Answer the user's original question directly, stating any remaining assumptions.

---

$ARGUMENTS
