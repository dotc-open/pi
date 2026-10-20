# Pi

## What's in this Repo

This repo contains the source code for Pi coding agent extensions. Pi extensions are located in `/packages`: one directory per extension.

## Workflow

- When asked to initialise a package, use the `init-pi-package` skill.
- When asked to formulate a plan for a Pi extension, use the `formulate-plan` skill.
- If developing Pi extensions with tools, in the plan:
  - As part of verification, include a step to pause and hand over control to the user to reload the session so that you have access to the tool.
  - Include verification test cases that you can use by calling the tool directly within the session.
- When asked to execute a plan to implement a Pi extension, use the `execute-plan` skill.
- **After every code change**, run the code quality checks, which include `lint:fix`, `format:fix`, and `check-types`. You **MUST ONLY** use the `subagent` tool with the `code-quality-checker` subagent to run code quality checks. You may run individual code quality scripts with the `run_npm_script` tool, but only when **EXPLICITLY REQUESTED** by the user.
- After implementing a Pi extension, pause and hand over control to the user to test it.
