---
name: craft-prd
description: Generate a Product Requirements Document (PRD) for a new product or feature. Use this to gain clarity on requirements, concepts, and specific features.
---

# Craft PRD

## Objective

Write a new Product Requirements Document (PRD) that captures the **problem statement**, **proposed solution**, **user flows**, and **user stories** for the user's new product or feature.

## Input

The user will give you a spiel of the product or feature idea. This will be highly varied: it could be a high-level concept, or a list of ideas. If the user does not provide any idea, ask the user for it.

## Task

Ask the user clarification questions in four rounds: (1) Problem Statement, (2) Proposed Solution, (3) User Stories, and (4) User Flows. You MUST ask one question at time. You may ask more than one question per round.

At the end of each round, you **MUST** present the user with a summary of the round, and ask the user if they want to make any refinements. Refinements **MUST** be clarified before modification of the summmary.

### Problem Statement Round

In this round, ask the user questions to clarify the problem statement. To terminate the round, the following must be clear:

- Who the primary user groups are
- Where the gap is and if possible, why
- Why the gap must be filled now/soon

### Proposed Solution Round

In this round, ask the user questions to clarify the proposed solution. To terminate the round, the following must be clear:

- The high level concept for the solution
- The key components of the solution
- The parts of the problem statement that each part of the solution solves
- That there are alternatives that do not solve the solution as well as the proposed solution

### User Stories Round

In this round, ask the user questions to write user stories. Each user story should follow the format:

```
As a <user>, I want <goal> so that I can <benefit>.
```

To terminate the round, the core user stories for a Minimum Viable Product (MVP) must be written. That is, if the solution were built ONLY using these user stories, they would solve the core problem identified.

### User Flows Round

In this round, ask the user questions to develop user flows. User flows are a series of steps that the user takes on the app, starting from the entrypoint and ending at the achievement of the objective.

For example:

1. User clicks **Get Started** CTA
2. App displays ...
3. User clicks ...

To terminate the round, the core user flows for an MVP must be developed. That is, if the solution were built ONLY to achieve these user flows and nothing more, they would solve the core problem identified.

## Write the PRD

Consolidate the inputs from the various rounds into a PRD in the following format:

```
# <Title>
Date: <yyyy-mm-dd>

## Problem Statement
1-paragraph statement of the problem, stating who the user is, where the gap is, and why it should be filled

## Proposed Solution

### Concept
1-2 sentences elevator pitch to describe the solution

### Key Components
Key solution components and how each solves the problem

### Alternatives Considered
Alternatives and why they are not preferred

## User Stories
List of user stories

## User Flows

### User Flow 1: <Title>

1. User clicks on ...
2. App displays ...
3. <Other steps>
```

Save the PRD to `../../../prd/<yyyy-mm-dd>-prd.md`.
