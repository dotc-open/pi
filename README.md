# Pi

A repository for DOTC's Pi packages.

## Packages

| Package                                                             | Description                                                                                                                         |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| [`@dotc/pi-core`](packages/pi-core)                                 | A collection of core extensions and tools for the Pi coding agent, including subagent delegation, Git workflows, and utility tools. |
| [`@dotc/pi-platform-ai-provider`](packages/pi-platform-ai-provider) | Integrates Platform AI with Pi as a provider and adds LiteLLM session tracking headers.                                             |
| [`@dotc/pi-chakra-v2-docs`](packages/pi-chakra-v2-docs)             | Offline Chakra UI v2 documentation.                                                                                                 |

## Release Steps

If releasing an initial version, skip straight to step 3.

### 1. Create release branch and bump version

Create a release branch with the name `release/<package_name>/<semVer>`. For example, `release/pi-core/0.3.0`.

Bump the version:

```bash
pnpm --filter @dotc/<package_name> version <major|minor|patch>
```

Commit with `chore: bump <package_name> to <semVer>`. For example, `chore: bump pi-core to 0.3.0`.

### 2. Merge MR and add release tag

Open an MR with the title `chore(release): <package_name>@<semVer>`. For example, `chore(release): pi-core@0.3.0`.

Once approved, merge to `develop` **with a Merge Commit**.

## 3. Add a release tag

**Pull `develop`** and add a tag to the merge commit:

```bash
git tag -a "<package_name>@<version>" -m "<package_name>@<version>"
```

Example: `git tag -a "pi-core@0.3.0" -m "pi-core@0.3.0"`

Push tags to remote:

```bash
git push --tags
```

### 4. Create release via UI

1. Click on **Releases**
2. Click **Draft a new release**
3. Select the tag that was just created
4. Click **Generate release notes**
5. Click **Publish**

CI will run code quality checks and stage the package on npm. Check the **Actions** tab and verify that CI passes.

### 4. Approve package

Go to the [DOTC organisation on npm](https://www.npmjs.com/settings/dotc/packages) and approve the staged package with 2FA.

## Maintenance

- If publishing fails, check whether the npm token is still valid. The token has a maximum expiry of 90 days.
- Token settings:
  - Bypass 2FA: `Checked`
  - Permissions: `Read and write (stage only)`
  - Selected scopes: `@dotc` only
  - Organisation permissions: `No access`
  - Expiration date: `90 days`
