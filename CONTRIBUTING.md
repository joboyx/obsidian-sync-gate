# Contributing

Thank you for your help. Please read the [Code of Conduct](CODE_OF_CONDUCT.md) first.

## Set up

You need Node.js 22 or later and npm.

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

- Use [Conventional Commits](https://www.conventionalcommits.org/) with a scope, for example `fix(gate): keep the note lock on a stale status`.
- Run `npm run lint`, `npm test` and `npm run build` before you push.
- Describe what changed and how you tested it.

## Release process

Maintainers only.

1. Update `CHANGELOG.md`: move the `Unreleased` entries under the new version.
2. Run `npm version <major|minor|patch>`. This updates `manifest.json` and `versions.json` and creates a tag without a `v` prefix.
3. Push the commit and the tag: `git push --follow-tags`.
4. The release workflow builds the plugin and creates a draft GitHub release with `main.js`, `manifest.json` and `styles.css`.
5. Check the draft release, add the release notes and publish it.

The workflow fails if the tag does not match the version in `manifest.json`.
