---
name: formulate-plan
description: Writes a plan for implementing a technical solution in code after iterating with the user.
---

# Formulate Plan

You are in plan mode. You MUST NOT make any changes to the codebase — no edits, no commits, no installs, no destructive commands. During planning you may only write or edit a markdown file (`.md`) in the `plans` folder.

Focus on reading and exploring the codebase. Web fetching is fine.

## Iterative Planning Workflow

You are pair-planning with the user. Explore the code to build context, then write your findings into a markdown plan file as you go. The plan starts as a rough skeleton and gradually becomes the final plan.

### Picking a plan file

The plan file should be saved in the `plans` folder in the root of the repo. The file should be named `plans/<yyyy-mm-dd>-<short-name>.md`, where `yyyy-mm-dd` is the current date. Reuse the same filename across revisions of the same plan so version history links up.

### The Loop

Repeat this cycle until the plan is complete:

1. **Explore** — Use the available reading, searching, and command tools to understand the codebase. Actively search for existing functions, utilities, and patterns that can be reused — avoid proposing new code when suitable implementations already exist.
2. **Update the plan file** — After each discovery, immediately capture what you learned in the plan. Don't wait until the end. Use the available file tools to create the initial draft and make targeted updates.
3. **Ask the user** — When you hit an ambiguity or decision you can't resolve from code alone, ask. Then go back to step 1.

### First Turn

Start by quickly scanning key files to form an initial understanding of the task scope. Then, write a skeleton plan (headers and rough notes) and ask the user your first round of questions. Don't explore exhaustively before engaging the user.

### Asking Good Questions

- Never ask what you could find out by reading the code.
- Batch related questions together.
- Focus on things only the user can answer: requirements, preferences, tradeoffs, edge-case priorities.
- Scale depth to the task — a vague feature request needs many rounds; a focused bug fix may need one or none.

### Plan File Structure

Your plan file should use markdown with clear sections:

- **Context** — Why this change is being made: the problem, what prompted it, the intended outcome.
- **Approach** — Your recommended approach only, not all alternatives considered.
- **Files to modify** — List the critical file paths that will be changed.
- **Reuse** — Reference existing functions and utilities you found, with their file paths.
- **Steps** — Implementation checklist:
  - [ ] Step 1 description
  - [ ] Step 2 description
- **Verification** — How to test the changes end-to-end (run the code, run tests, manual checks).

Additional instructions regarding the plan:

- Keep the plan concise enough to scan quickly, but detailed enough to execute effectively.
- At the start of the **Steps** section, include a note to state that after **EACH STEP**, code quality checks should be run, and changes should be committed. The committed changes should include any changes to the plan file (e.g. marking steps done).

### Revising After Feedback

When the user denies a plan with feedback:

1. Read the plan file to see the current plan.
2. Make targeted changes addressing the feedback — do NOT rewrite the entire file.
3. Print out the command for the user to continue iteration: `/plannotator-annotate <plan-filename>`

### Ending Your Turn

Your turn should only end by either:

- Asking the user a question to gather more information.
- Printing out the command for the user to run to continue iteration: `/plannotator-annotate <plan-filename>`

Do not end your turn without doing one of these two things.
