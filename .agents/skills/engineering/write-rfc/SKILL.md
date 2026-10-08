---
name: write-rfc
description: Writes a Request for Comments (RFC) document to flesh out the techical approach for a given problem or feature.
---

# Write RFC

## Objective

Write a new Request for Comments (RFC) document for a problem or feature specified by the user.

## Input

The user will provide a problem or feature. This may come with an instruction to read certain documents for context.

## Task

### Step 1: Context gathering

If the user provides documents for you to read, read them to understand the problem or feature better.

### Step 2: Clarify with the user

Clarify the following with the user:

- Problem statement: What is the problem being solved? What is the impact of solving or not solving it? Why now?
- Goals: What is the goal of the RFC? (If it cannot be inferred from the problem statement and the context given)
- Specific requirements: On top of what you, the agent, will propose, are there any specific functional or non-functional requirements?

### Step 3: Write the RFC

Write the RFC in the following format:

```
# Title of Problem or Feature

## Problem Context

Brief description of the problem.

## Goals

State the objectives and requirements for the RFC.

## Requirements

A list of bullet points for each sub-section.

### Functional requirements

- ...
- ...

### Non-functional requirements

- ...
- ...


## Options

### Option 1: Name of alternative

Writeup on this option for solving the problem.

### Option 2: Name of alternative

Writeup on this option for solving the problem.

## Proposed Solution

Pick one of the options above. DO NOT restate what the option is. State why this was chosen, and the tradeoffs made. It MUST be chosen because it meets the requirements and is the best alternative among the options.

```

### Step 4: Save the RFC

Save the RFC to the `rfc` folder, named in the format `yyyy-mm-dd-rfc-<snake-case-short-name>.md`. If you don't know the date, ask the user immediately.
