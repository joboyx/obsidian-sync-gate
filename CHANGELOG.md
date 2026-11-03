# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Lock rules for app start, resume, incoming changes for the open note, offline state and network return.
- Reader for the internal Sync status and activity log. It turns off locking with a warning when the internal API is missing.
- Settings for protected notes, lock on resume, slow-sync time and debug logging.

## [0.1.0] - planned

First public test release through BRAT. Adds the editor lock screen and the "Edit anyway" button.

[Unreleased]: https://github.com/joboyx/obsidian-sync-gate/commits/main
[0.1.0]: https://github.com/joboyx/obsidian-sync-gate/releases/tag/0.1.0
