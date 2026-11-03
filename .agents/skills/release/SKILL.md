---
name: release
description: Releases a new version of Sync Gate. Opens a release pull request that moves the Unreleased changelog entries under the new version and bumps the version in package.json, manifest.json and versions.json, runs the checks and the verify skill, checks commit identities, merges after CI, then tags main and pushes the tag only on the owner's explicit yes. Use when asked to release, cut a version, or tag the plugin.
---

# release

Run all steps from the repo root. Stop at the first failure and report it.

`main` takes changes only through a pull request with a merge commit, after the `check` CI job passes. Never push to `main`. The release tag is the only thing pushed directly.

Obsidian downloads a plugin by its release tag, and the tag must equal the version in `manifest.json`. So the tag is the bare version (`0.2.0`, no `v` prefix).

## 1. Check the start state

```sh
git switch main
git status --short                         # must be empty
git fetch origin && git pull --ff-only     # must match origin/main
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

## 3. Check minAppVersion

For each Obsidian API that the release adds, check the `@since` tag in `node_modules/obsidian/obsidian.d.ts`. If an API is newer than `minAppVersion` in `manifest.json`, raise `minAppVersion` and the README requirements first, in their own pull request.

## 4. Make the release branch

```sh
git switch -c chore/release-X.Y.Z
```

## 5. Update the changelog

In `CHANGELOG.md`, move the entries under `## [Unreleased]` to a new heading `## [X.Y.Z] - YYYY-MM-DD` and keep an empty `## [Unreleased]`. At the end of the file, set the links:

```markdown
[Unreleased]: https://github.com/joboyx/obsidian-sync-gate/compare/X.Y.Z...HEAD
[X.Y.Z]: https://github.com/joboyx/obsidian-sync-gate/compare/<previous>...X.Y.Z
```

The release workflow copies this section into the release notes and fails when it is missing.

## 6. Bump the version

```sh
npm version X.Y.Z --no-git-tag-version
```

This sets the version in `package.json` and `package-lock.json`, and the `version` script writes it to `manifest.json` and `versions.json`. It does not commit or tag. Commit all changes:

```sh
git add CHANGELOG.md package.json package-lock.json manifest.json versions.json
git commit -m "chore(release): X.Y.Z"
```

## 7. Check and verify

```sh
npm ci && npm run lint && npm test && npm run build
```

Then run the `verify` skill. Every scenario that the change touches must pass. Keep its report table for step 9.

## 8. Check commit identities

```sh
git log --format='%h %an <%ae> | %cn <%ce>' "$(git describe --tags --abbrev=0)"..HEAD
```

Every author and committer must be the owner's public identity. If one is not, stop and show the owner the commits. Do not rewrite history without the owner's yes.

## 9. Open and merge the release pull request on the owner's yes

Show the owner the version, the commits and the verify table. Ask for an explicit yes. Only then:

```sh
git push -u origin HEAD
gh pr create --base main --title "chore(release): X.Y.Z" --body "<changelog section and verify table>"
```

When the `check` job passes, merge with a merge commit and delete the branch:

```sh
gh pr merge <number> --merge --delete-branch
```

Without a yes, stop and report that the release branch is local.

## 10. Tag main and push the tag

```sh
git switch main && git pull --ff-only
git tag -a X.Y.Z -m "Sync Gate X.Y.Z"
git push origin X.Y.Z
```

Push only the tag. Never force-push.

## 11. Publish the draft release

The tag push starts `.github/workflows/release.yml`. It checks that the tag equals the manifest version, builds, and creates a **draft** release with `main.js`, `manifest.json`, `styles.css` and the changelog section as notes. Check the assets of the draft, then publish it on the owner's yes. Obsidian and BRAT install only from a published release.
