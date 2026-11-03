# AGENTS.md

Sync Gate is an Obsidian community plugin (id `sync-gate`). It locks the note editor while the core Sync plugin still brings in changes from other devices, and unlocks when Sync confirms that the vault is up to date. It runs on desktop and mobile.
User docs are in `README.md`. Contributor docs are in `CONTRIBUTING.md`.

## Layout

| Path                     | Content                                                                                       |
| ------------------------ | --------------------------------------------------------------------------------------------- |
| `src/main.ts`            | Plugin entry: sends app, network and Sync events to the gate, registers commands and settings |
| `src/gate.ts`            | Lock rules as a pure state machine: no app API, no timers                                     |
| `src/gate-view.ts`       | Maps the gate state to the icons and text that the UI shows                                   |
| `src/editor-lock.ts`     | Applies the gate state to open notes: Reading view, lock card, banner, state indicator        |
| `src/mode-memory.ts`     | Remembers the mode of each note before a lock, for the restore after it                       |
| `src/resume-detector.ts` | Decides which window focus events count as a resume on mobile                                 |
| `src/sync-status.ts`     | Reads the internal Sync state and log; checks every member and never throws                   |
| `src/log-entry.ts`       | Classifies Sync log messages by direction and file path                                       |
| `src/diagnostics.ts`     | Ring buffer of gate inputs and decisions for the diagnostic log                               |
| `src/settings-model.ts`  | Settings data, defaults, validation and conversion to gate options                            |
| `src/settings.ts`        | The settings tab                                                                              |
| `tests/`                 | Vitest unit tests; `tests/builders.ts` holds the test data builders                           |
| `styles.css`             | Plugin styles; theme variables only                                                           |
| `manifest.json`          | Plugin manifest: `version`, `minAppVersion`, listing fields                                   |
| `versions.json`          | Map of plugin version to `minAppVersion`                                                      |
| `version-bump.mjs`       | `npm version` hook: writes the new version to `manifest.json` and `versions.json`             |
| `docs/demo/`             | HTML sources of the README illustrations; `docs/images/` holds the rendered PNG files         |
| `.agents/skills/`        | Repo skills `verify` and `release` (`.claude/skills` links here)                              |

`main.js` is build output. It is a release asset and is not committed.

## Commands

Run from the repo root with the Node.js version in `.nvmrc`.

| Task                            | Command                                  |
| ------------------------------- | ---------------------------------------- |
| Install dependencies            | `npm ci`                                 |
| Lint (Obsidian plugin rules)    | `npm run lint`                           |
| Unit tests                      | `npm test`                               |
| Type-check and production build | `npm run build`                          |
| Watch build for a dev vault     | `npm run dev`                            |
| Bump the version (release PR)   | `npm version X.Y.Z --no-git-tag-version` |

CI (`.github/workflows/ci.yml`) runs `npm ci`, lint, test and build in the job `check` on every push to `main` and on every pull request. A pushed tag `X.Y.Z` runs `.github/workflows/release.yml`, which builds a draft GitHub release with the notes from `CHANGELOG.md`.

## Branches and pull requests

- Never push to `main`. Every change goes on a branch `<feat|fix|docs|chore|ci>/<short-description>` and merges to `main` through a pull request.
- The pull request merges with a merge commit after the `check` job passes. Squash merges are off, and the branch is deleted after the merge.
- Tags are the only thing pushed to the repo directly, and only in the release flow.

## Rules

- Only `src/main.ts`, `src/editor-lock.ts` and `src/settings.ts` import `obsidian`. Keep every other module free of it, so the tests run in Node.
- Pure logic goes in a module with unit tests. Lock rule tests are tables: one row per case, with literal expected states.
- The Sync plugin API is internal and undocumented. Read it defensively in `src/sync-status.ts`: check each member, never throw, and report `unavailable` when a member is missing.
- A new Obsidian API call must exist in `minAppVersion`. Check the `@since` tag in `node_modules/obsidian/obsidian.d.ts`, and raise `minAppVersion` in `manifest.json`, `versions.json` and the README requirements when the API is newer.
- No network calls, no telemetry, no writes outside the vault. The diagnostic log holds states and member names only, never note names or note text.
- UI text uses sentence case and the theme's colors, fonts and icons.
- Use made-up names only in examples, fixtures, tests and docs: vault `Demo vault`, notes `Weekly plan`, `Shopping list`, `Ideas`. Never paste real vault content or real file paths.
- Every exported function, type and constant has a JSDoc block.
- Commits use [Conventional Commits](https://www.conventionalcommits.org/) with a scope, for example `fix(gate): …`.
- Update `README.md` and the `Unreleased` section of `CHANGELOG.md` when behavior changes.

## Skills

- `verify` (`.agents/skills/verify/SKILL.md`): run the checks, load the build in a test vault and prove each lock scenario. Run it after a behavior change.
- `release` (`.agents/skills/release/SKILL.md`): open a release pull request with the changelog and the version bump, merge it, then tag `main` and push the tag on the owner's yes.
