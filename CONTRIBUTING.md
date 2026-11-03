# Contributing

Thank you for your help. Please read the [Code of Conduct](CODE_OF_CONDUCT.md) first.

## Set up

You need Node.js 22 (the version in `.nvmrc`; with nvm, run `nvm use`) and npm.

```bash
git clone https://github.com/joboyx/obsidian-sync-gate.git
cd obsidian-sync-gate
npm ci
```

## Scripts

| Command           | What it does                                                    |
| ----------------- | --------------------------------------------------------------- |
| `npm run dev`     | Builds `main.js` and rebuilds it when a source file changes.    |
| `npm run build`   | Type-checks the code and builds a minified `main.js`.           |
| `npm run lint`    | Runs ESLint with the Obsidian plugin rules.                     |
| `npm test`        | Runs the unit tests with Vitest.                                |
| `npm version <x>` | Sets the version in `package.json`, `manifest.json` and `versions.json`. |

## Code layout

| File                 | Purpose                                                                 |
| -------------------- | ----------------------------------------------------------------------- |
| `src/main.ts`           | Plugin entry. Sends app, network and Sync events to the gate, and registers the commands. |
| `src/gate.ts`           | Lock rules as a state machine. No app API, no timers.                   |
| `src/gate-view.ts`      | Maps the gate state to the icons and text that the UI shows.            |
| `src/editor-lock.ts`    | Applies the gate state to open notes: Reading view, lock card, banner, state indicator. |
| `src/mode-memory.ts`    | Remembers the mode of each note before a lock, for the restore after it. |
| `src/resume-detector.ts` | Decides which window focus events count as a resume on mobile.        |
| `src/sync-status.ts`    | Reads the internal Sync state. Checks every member and never throws.    |
| `src/log-entry.ts`      | Classifies Sync log messages by direction and file path.                |
| `src/diagnostics.ts`    | Ring buffer of gate inputs and decisions for the diagnostic log.        |
| `src/settings-model.ts` | Settings data, defaults, validation and conversion to gate options.     |
| `src/settings.ts`       | The settings tab.                                                       |

Only `main.ts`, `editor-lock.ts` and `settings.ts` import `obsidian`. Keep all other modules free of it, so the tests can run in Node.

## Test

```bash
npm test
```

Add a test for each change to the lock rules. The gate tests are tables: one row per case, with literal expected states.

## Load the plugin in a dev vault

Use a test vault, not your real vault.

1. Run `npm run dev`.
2. Create the folder `<test vault>/.obsidian/plugins/sync-gate/`.
3. Link or copy `main.js`, `manifest.json` and `styles.css` into that folder.
4. Turn on **Sync Gate** in **Settings → Community plugins**.
5. After each rebuild, reload the app, or use the [Hot Reload](https://github.com/pjeby/hot-reload) plugin.

To see lock decisions, turn on **Debug logging** in the plugin settings and open the developer console.

## Pull requests

Every change goes to `main` through a pull request. Do not push to `main`.

- Make a branch from an up-to-date `main` with the name `<type>/<short-description>`, where the type is `feat`, `fix`, `docs`, `chore` or `ci`. For example: `fix/stale-status-lock`.
- Open the pull request into `main`. It merges with a merge commit after the `check` CI job passes. Squash merges are off, and the branch is deleted after the merge.
- Use [Conventional Commits](https://www.conventionalcommits.org/) with a scope, for example `fix(gate): keep the note lock on a stale status`.
- Run `npm run lint`, `npm test` and `npm run build` before you push.
- Describe what changed and how you tested it.

## Release process

Maintainers only.

1. Create the branch `chore/release-X.Y.Z` from an up-to-date `main`.
2. Update `CHANGELOG.md`: move the `Unreleased` entries under a heading for the new version, for example `## [0.2.0] - 2027-01-31`, and set the links for `Unreleased` and the new version at the end of the file.
3. Run `npm version X.Y.Z --no-git-tag-version`. This updates `package.json`, `package-lock.json`, `manifest.json` and `versions.json`, and does not commit or tag.
4. Commit the changes, push the branch and open a release pull request. Merge it with a merge commit after the `check` CI job passes.
5. On `main`, pull the merge and create the annotated tag `X.Y.Z`: `git tag -a X.Y.Z -m "Sync Gate X.Y.Z"`. Use no `v` prefix: Obsidian requires the tag to equal the version in `manifest.json`.
6. Push only the tag: `git push origin X.Y.Z`.
7. The release workflow builds the plugin and creates a draft GitHub release with `main.js`, `manifest.json` and `styles.css`. The release notes are the section of that version in `CHANGELOG.md`.
8. Check the assets of the draft release, then publish it.

The workflow fails if the tag does not match the version in `manifest.json`, or if `CHANGELOG.md` has no section for the version.

The `release` skill in `.agents/skills/release/` has the same steps with the checks between them, for maintainers who use a coding agent.
