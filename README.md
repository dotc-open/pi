# Pi

A repository for DOTC's Pi packages.

## Packages

## Release Steps

### 1. Create release branch

Create a release branch with the name `chore(release): <package_name>@<semVer>`. For example, `chore(release): pi-core@0.3.0`.

Bump the version:

```bash
pnpm --filter @dotc/<package_name> version <major|minor|patch>
```

### 2. Merge MR and add release tag

Once approved, merge to `develop`. After merging, **pull `develop`** and add a tag to the merge commit:

```bash
git tag -a "<package_name>@<version>" -m "<package_name>@<version>"
```

Example: `git tag -a "pi-platform-ai-provider@0.1.0" -m "pi-platform-ai-provider@0.1.0"`

Push tags to remote:

```bash
git push --tags
```

### 3. Create release via UI

1. Click on **Releases**
2. Click **Draft a new release**
3. Select the tag that was just created
4. Click **Generate release notes**
5. Click **Publish**

CI will run code quality checks and publish to npm. Check the **Actions** tab and verify that CI passes.

### 4. Approve package

Go to the [DOTC organisation on npm](https://www.npmjs.com/settings/dotc/packages) and approve the staged package with 2FA.

## Maintenance

- If publishing fails, check whether the npm token is still valid. The token has a maximum expiry of 90 days.
