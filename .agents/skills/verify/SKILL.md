---
name: verify
description: Verifies a change to Sync Gate. Runs lint, tests and the production build, then loads the build in a test vault with Obsidian Sync and checks each lock scenario against its pass rule. Use after a behavior change, before a release, or when asked to prove that the lock works.
---

# verify

Run all steps from the repo root. Stop at the first failure and report it.

The lock rules have unit tests (`tests/gate.test.ts` and others). This skill also proves the wiring that the unit tests cannot reach: the app events, the internal Sync API, the lock card and the state indicators.

## 1. Automated checks

```sh
npm ci
npm run lint
npm test
npm run build
```

All four must exit 0. Lint warnings do not block; report new ones.

## 2. Load the build in a test vault

Use a test vault with Obsidian Sync connected to a test remote vault, and a second device (or a second app window on another computer) on the same remote vault. Never use a real vault.

1. Copy `main.js`, `manifest.json` and `styles.css` into `<test vault>/.obsidian/plugins/sync-gate/`.
2. Reload the app and turn on **Sync Gate** in **Settings → Community plugins**.
3. Turn on **Debug logging** in the plugin settings. Lock decisions then show in the developer console, and the command **Save diagnostic log** saves the last gate inputs and decisions as a note in the folder `Sync Gate diagnostics`.

## 3. Scenarios

The ids match the rules table in `README.md` § How it works. A human runs the steps on the devices; an agent can run step 1, copy the files and read the diagnostic log note.

| #   | Scenario                     | Steps                                                                     | Pass when                                                                                                   |
| --- | ---------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 1   | Lock at app start (R1)       | Restart the app with a note open                                          | The note switches to Reading view with the "Waiting for Sync" card; it unlocks after Sync shows "Fully synced" |
| 2   | Edit anyway                  | During scenario 1, select **Edit anyway**                                 | The card goes away and the note goes back to its earlier mode                                               |
| 3   | Incoming change (R2)         | Edit the open note on the second device                                   | Only that note locks with "Updating from another device", then unlocks when the download ends               |
| 4   | Change to another note (R3)  | Edit a note on the second device that is not open here                    | No lock                                                                                                     |
| 5   | Local upload (R4)            | Type in the open note                                                     | No lock while Sync uploads                                                                                  |
| 6   | Offline (R5)                 | Turn off the network                                                      | No lock; the offline banner shows; the indicator shows "Offline"                                            |
| 7   | Network return (R6)          | Turn the network on again                                                 | All notes lock until Sync confirms that the vault is up to date                                             |
| 8   | Sync paused                  | Pause Sync, then resume it                                                | While paused: banner and "Paused", no lock. After resume: all notes lock, as in scenario 7                  |
| 9   | Resume on mobile             | On a phone, send the app to the background for 10 s and open it again     | All notes lock, as in scenario 1. A short notification shade pull does not lock                             |
| 10  | Mobile status icon           | On a phone, open a note in each state                                     | The header icon shows the check mark, lock, no Wi-Fi or pause icon in the colors from `README.md`            |
| 11  | Protected note rename        | Protect one note, then rename it                                          | The **Note path** setting shows the new path, and the lock rules still apply to the note                    |

For each scenario, save the diagnostic log note, or copy the console lines, as proof.

## Report

End with this table:

| #   | Scenario | Result    | Proof                                |
| --- | -------- | --------- | ------------------------------------ |
| 1   | …        | pass/fail | diagnostic log note or console lines |

Under the table, give the app version, the platform of each device and the commit that was built. Quote the gate decisions from the log for each failed scenario.
