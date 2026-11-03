---
name: release
description: Releases a new version of Sync Gate. Moves the Unreleased changelog entries under the new version, bumps the version in package.json, manifest.json and versions.json, runs the checks and the verify skill, checks commit identities, tags, and pushes only on the owner's explicit yes. Use when asked to release, cut a version, or tag the plugin.
---

# release

Run all steps from the repo root. Stop at the first failure and report it.

Obsidian downloads a plugin by its release tag, so the tag is the bare version (`0.2.0`, no `v` prefix). `.npmrc` sets `tag-version-prefix=""` for `npm version`.

## 1. Check the start state

```sh
git status --short                    # must be empty
git branch --show-current             # must be main
git fetch origin && git status -sb    # must not be behind origin
```

## 2. Pick the version

Read `version` in `manifest.json` and the commits since the last tag:

```sh
git describe --tags --abbrev=0
git log --oneline "$(git describe --tags --abbrev=0)"..HEAD
```

| Change since the last tag                        | Bump  |
| ------------------------------------------------ | ----- |
| Fixes only                                       | patch |
| New behavior, old behavior kept                  | minor |
| Removed or changed command, setting or behavior  | major |

With no tag yet, release the current version without a bump (skip `npm version` in step 6).

## 3. Check minAppVersion

For each Obsidian API that the release adds, check the `@since` tag in `node_modules/obsidian/obsidian.d.ts`. If an API is newer than `minAppVersion` in `manifest.json`, raise `minAppVersion` and the README requirements first, in their own commit.

## 4. Update the changelog

In `CHANGELOG.md`, move the entries under `## [Unreleased]` to a new heading `## [X.Y.Z] - YYYY-MM-DD` and keep an empty `## [Unreleased]`. At the end of the file, set the links:

```markdown
[Unreleased]: https://github.com/joboyx/obsidian-sync-gate/compare/X.Y.Z...HEAD
[X.Y.Z]: https://github.com/joboyx/obsidian-sync-gate/compare/<previous>...X.Y.Z
```

The release workflow copies this section into the release notes and fails when it is missing.

```sh
git add CHANGELOG.md
git commit -m "docs(changelog): add X.Y.Z"
```

## 5. Check and verify

```sh
npm ci && npm run lint && npm test && npm run build
```

Then run the `verify` skill. Every scenario that the change touches must pass. Keep its report table for step 8.

## 6. Bump the version and tag

```sh
npm version <major|minor|patch> -m "chore(release): %s"
```

This sets the version in `package.json`, `manifest.json` and `versions.json`, commits, and makes the tag `X.Y.Z`. For the first release, tag the changelog commit instead: `git tag -a X.Y.Z -m "Sync Gate X.Y.Z"`.

## 7. Check commit identities

```sh
git log --format='%h %an <%ae> | %cn <%ce>' "$(git describe --tags --abbrev=0 HEAD^ 2>/dev/null || git rev-list --max-parents=0 HEAD)"..HEAD
```

Every author and committer must be the owner's public identity. If one is not, stop and show the owner the commits. Do not rewrite history without the owner's yes.

## 8. Push on the owner's yes

Show the owner the version, the commits, the tag and the verify table. Ask for an explicit yes. Only then:

```sh
git push origin main
git push origin X.Y.Z
```

Never force-push. Without a yes, stop and report that the commits and the tag are local.

## 9. Publish the draft release

The tag push starts `.github/workflows/release.yml`. It checks that the tag equals the manifest version, builds, and creates a **draft** release with `main.js`, `manifest.json`, `styles.css` and the changelog section as notes. Check the draft, then publish it on the owner's yes. Obsidian and BRAT install only from a published release.
