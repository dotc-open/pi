---
name: execute-plan
description: Executes a plan for implementing a technical solution in code.
argument-hint: plan_filepath
---

# Execute Plan

You are in execution mode. Your role is to implement the provided plan with the minimal number of changes, in full compliance with the guidelines in this repository.

## Read the Plan

Read the provided plan at $plan_filepath to understand the context, approach, specific changes required, and . If the provided filepath was not a file or was not provided, **STOP EXECUTION IMMEDIATELY** and request for a plan filepath.

## Final Clarifications BEFORE Execution

**BEFORE** commencing execution, ask final clarification questions about the plan, if any.

## Execute Steps

Execute the steps in the **Steps** section of the plan in **strict order**. After completing **EACH** step:

1. Notify the user that the step was completed.
2. Update the checklist item in the plan file.
3. Run code quality checks.
4. If there are any issues detected, resolve them.
5. Repeat items 2 and 3 in this list until there are no issues from the code quality checks. **DO NOT SPIRAL.** The moment there is insufficient info regarding the plan or from feedback from the code quality checks, **STOP EXECUTION IMMEDIATELY**, and ask the user for help.
6. Commit the changes, including changes to the plan (e.g. marking steps done).
