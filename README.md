# Sync Gate

Sync Gate is a community plugin for [Obsidian](https://obsidian.md). It blocks editing of notes while Obsidian Sync still brings in changes from your other devices. A quick edit on your phone then cannot conflict with newer text from your laptop.

> **Status: early development.** The lock rules and the Sync status reader are in place and tested. The editor lock screen is not built yet. Do not rely on this plugin to protect your notes yet.

## Why

Obsidian Sync needs a few seconds to pull in changes after the app opens or comes back from the background. If you type during that time, Sync must merge two versions of the same note. The merge can duplicate or lose text. Sync Gate makes you wait until Sync confirms that your vault is up to date.

## How it works

Sync Gate reads the state of the core Sync plugin and its activity log. It locks the editor when a rule below applies. "Edit anyway" always ends the current lock.

| Rule | When                                                | What Sync Gate does                                                                                                         |
| ---- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| R1   | The app opens or comes back from the background     | Locks all notes. Unlocks only on a new "Fully synced": Sync must show another state first, or log a new "Fully synced" entry. |
| R2   | A change from another device arrives for the open note | Locks only that note until the download ends.                                                                            |
| R3   | A change arrives for a different note               | Does not lock.                                                                                                              |
| R4   | This device uploads a change                        | Does not lock.                                                                                                              |
| R5   | The device is offline                               | Does not lock. Shows an offline banner.                                                                                     |
| R6   | The network comes back                              | Locks all notes, as in R1.                                                                                                  |
| R7   | Sync shows no progress for 20 seconds               | Makes "Edit anyway" prominent.                                                                                              |

If Sync Gate cannot read the Sync state, for example after an app update changes the internal API, it does not lock. It shows a warning banner instead.

## Install

### With BRAT

1. Install the [BRAT](https://github.com/TfTHacker/obsidian42-brat) community plugin.
2. In BRAT, select **Add beta plugin**.
3. Enter `joboyx/obsidian-sync-gate`.
4. Turn on **Sync Gate** in **Settings → Community plugins**.

### Manually

1. Download `main.js`, `manifest.json` and `styles.css` from the latest [release](https://github.com/joboyx/obsidian-sync-gate/releases).
2. Create the folder `<your vault>/.obsidian/plugins/sync-gate/`.
3. Copy the three files into that folder.
4. Restart the app and turn on **Sync Gate** in **Settings → Community plugins**.

Install the plugin on every device that edits the vault.

## Settings

| Setting                       | Default   | Description                                                                 |
| ----------------------------- | --------- | --------------------------------------------------------------------------- |
| Protected notes               | All notes | Lock every note, or only one note that you edit on more than one device.    |
| Note path                     | (empty)   | Vault-relative path of the protected note, when you protect one note only.  |
| Lock on resume on mobile only | Off       | When on, only phones and tablets lock when the app comes back from the background. |
| Slow sync after (seconds)     | 20        | Time without Sync progress before "Edit anyway" becomes prominent.          |
| Debug logging                 | Off       | Writes lock decisions to the developer console.                             |

## Limitations

- **Undocumented API.** Sync Gate reads internal members of the core Sync plugin. An app update can change them. Sync Gate then stops locking and shows a warning.
- **This device only.** Sync Gate knows only what Sync on this device reports. It cannot know that another device has changes that it did not upload yet.
- **Editor only.** Sync Gate cannot block writes from other plugins, the share sheet or other apps that change files in the vault.
- **Offline editing is allowed.** When the device is offline, Sync Gate does not lock. Sync merges your offline edits when the network comes back.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). To report a security problem, see [SECURITY.md](SECURITY.md).

## Credits

The Sync status mapping is adapted from [sync-reminder](https://github.com/HEIXIZHU/sync-reminder) by HEIXIZHU (MIT License). See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## License

[MIT](LICENSE)
