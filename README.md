# Pi

A repository for DOTC's Pi packages.

## Packages

## Release Steps

### 1. Bump version

Bump the version:

```bash
npm version <major|minor|patch>
```

### 2. Merge changes

Open an MR, iterate, and merge.

After merging, add a tag to the merged commit:

```bash
git tag -a "<package name>@<version>" -m "<package name>@<version>"
```

Example: `git tag -a "pi-platform-ai-provider@0.1.0" -m "pi-platform-ai-provider@0.1.0"`

Push tags to remote:

```bash
git push --tags
```

### 3. Prepare release

Run a build:

```bash
pnpm --filter <package> build
```

### 4. Publish (Manual)

Ensure that you have been added to the [DOTC organisation](https://www.npmjs.com/org/dotc).

Login:

```bash
pnpm login
```

Publish:

```bash
pnpm --filter @dotc/<package name> publish --access public --publish-branch develop
```

While waiting for npm to publish the package, add a release on GitHub by:

1. Click **Create a new release**
2. Select the tag we just created
3. Click **Generate release notes**
4. Click **Publish**
