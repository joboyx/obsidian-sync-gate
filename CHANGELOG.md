# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

First public test release, 0.1.0, through BRAT.

### Added

- Lock rules for app start, resume, incoming changes for an open note, offline state and network return.
- Reader for the internal Sync status and activity log. It turns off locking with a warning when the internal API is missing.
- Editor lock: a locked note switches to Reading view, with a lock card and an "Edit anyway" button. The content behind the card does not take pointer or keyboard input. The note goes back to its previous mode when the lock ends.
- Banners for offline, paused Sync and unreadable Sync state. Editing stays open while a banner shows.
- A lock that starts while Sync is paused or unreadable waits, and starts when Sync is readable and runs again. When paused Sync runs again, all notes lock until Sync confirms they are up to date.
- State indicator: a status bar item on desktop, and a note header icon on mobile.
- Mobile status icon: the note header icon shows at all times, also while editing is open. Its color tells the gate state, and a tap shows the state and the reason. The setting "Show status icon on mobile when editing is open" (on by default) turns off the icon while editing is open.
- Quiet unlock: a lock ends when Sync stays up to date with no activity for 15 seconds.
- Connect grace time: with the network up, a lock waits 10 seconds for the Sync server before it opens with the offline banner.
- Settings for protected notes, lock on resume (on mobile only by default), slow-sync time, quiet unlock time, connect grace time and debug logging. The protected note setting follows a rename of the note.
- Commands "Show gate status", "Unlock editing until next sync check" and, with debug logging on, "Save diagnostic log".

[Unreleased]: https://github.com/joboyx/obsidian-sync-gate/commits/main
