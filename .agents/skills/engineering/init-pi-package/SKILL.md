---
name: init-pi-package
description: Initialises or creates a new directory for a Pi package in this repository
---

# Init Pi Package

## Objective

Create a new Pi package in the `/packages` directory with linting config set up.

## Task

### 1. Decide on a name

The Pi package name must be in kebab-case: `pi-<name-of-package>`. DO NOT proceed to the next step if the name does not follow this convention or if you have not aligned with the user on the name.

- If the user has provided a name that follows the naming convention, proceed with the next step using this name.
- Else if the user has provided enough context about the package, propose a name.
- Else: Ask the user for a name.

### 2. Initialise the directory

Create a subdirectory under the `/packages` directory named after the package by creating the files below. For example, if the package is to be named `pi-new-package`, it should be created under `/packages/pi-new-package`.

Create a `tsconfig.json` in the package directory:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

Create a `tsconfig.build.json` in the package directory:

```json
{
  "extends": "./tsconfig.json",
  "exclude": ["node_modules", "dist", "src/**/*.test.ts"]
}
```

Initialise a `README.md` in the package directory:

```md
# <package name>
```

Create an ESLint config file `eslint.config.mjs`:

```js
import { baseConfig } from '@repo/eslint-config/base'

export default [...baseConfig]
```

Ensure the `package.json` in the package directory has the following set:

```json
{
  "name": "@dotc/<package name>",
  "version": "0.1.0",
  "description": "<package description>",
  "author": "DOTC",
  "license": "MIT",
  "keywords": ["<package name>"],
  "scripts": {
    "lint": "eslint .",
    "lint:fix": "eslint . --fix",
    "check-types": "tsc --noEmit",
    "build": "tsc -p tsconfig.build.json",
    "prepublishOnly": "pnpm build"
  },
  "files": ["dist"],
  "pi": {
    "extensions": ["dist/index.js"]
  },
  "devDependencies": {
    "@repo/eslint-config": "workspace:*",
    "@types/node": "^22.20.5",
    "eslint": "^10.12.0",
    "typescript": "^7.0.2"
  },
  "peerDependencies": {
    "@earendil-works/pi-coding-agent": "*",
    "typebox": "*"
  }
}
```
