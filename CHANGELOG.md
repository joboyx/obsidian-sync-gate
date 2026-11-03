# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Lock rules for app start, resume, incoming changes for the open note, offline state and network return.
- Reader for the internal Sync status and activity log. It turns off locking with a warning when the internal API is missing.
- Settings for protected notes, lock on resume, slow-sync time and debug logging.
- Editor lock: a locked note switches to Reading view, with a lock card and an "Edit anyway" button. The note goes back to its previous mode when the lock ends.
- Banners for offline, paused Sync and unreadable Sync state.
- State indicator: a status bar item on desktop, and a note header icon on mobile while the gate is not open.
- Quiet unlock: a lock ends when Sync stays up to date with no activity for 15 seconds.
- Connect grace time: with the network up, a lock waits 10 seconds for the Sync server before it opens with the offline banner.
- Settings for the quiet unlock time and the connect grace time.
- Commands "Show gate status", "Unlock editing until next sync check" and, with debug logging on, "Save diagnostic log".

### Changed

- "Lock on resume on mobile only" is now on by default. Desktop still locks at startup, on reconnect and for incoming changes to the open note.
- When the user pauses Sync, editing stays open with a banner. Before, the lock stayed on.
- A Sync disconnect while the network is up no longer ends a lock at once. The lock waits for the connect grace time.

## [0.1.0] - planned

First public test release through BRAT. Adds the editor lock screen and the "Edit anyway" button.

[Unreleased]: https://github.com/joboyx/obsidian-sync-gate/commits/main
[0.1.0]: https://github.com/joboyx/obsidian-sync-gate/releases/tag/0.1.0
