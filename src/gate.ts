/*
 * Decides when Sync Gate blocks editing. Pure logic: no timers, no app API.
 * The plugin feeds events in and reads the resulting GateState.
 */

import { classifyLogEntry, FULLY_SYNCED_MESSAGE, isFullySyncedEntry } from './log-entry';
import type { SyncSnapshot, SyncState } from './sync-status';

/**
 * Why the gate asks for a vault lock.
 *
 * - `startup`: the app opened.
 * - `resume`: the app came back from the background.
 * - `reconnect`: the network or the Sync server connection came back.
 */
export type LockReason = 'startup' | 'resume' | 'reconnect';

/**
 * Why the gate is in its current state.
 *
 * Lock reasons:
 * - `startup`, `resume`, `reconnect`: see {@link LockReason}.
 * - `incoming-change`: Sync brings in a change for the open note.
 *
 * Open reasons:
 * - `idle`: no lock happened yet.
 * - `fully-synced`: Sync reported a fresh "Fully synced".
 * - `download-complete`: the download for the locked note ended.
 * - `quiet`: Sync stayed synced with no activity for the quiet time.
 * - `edit-anyway`: the user ended the lock.
 * - `offline`: the device or the Sync server connection is offline.
 * - `paused`: the user paused Sync.
 * - `unavailable`: Sync Gate cannot read the Sync state.
 */
export type GateReason =
	| LockReason
	| 'incoming-change'
	| 'idle'
	| 'fully-synced'
	| 'download-complete'
	| 'quiet'
	| 'edit-anyway'
	| 'offline'
	| 'paused'
	| 'unavailable';

/**
 * Input events for {@link Gate.handle}. `at` is a time in milliseconds, for example `Date.now()`.
 *
 * A `snapshot` event carries `networkOnline`, the network state of the device (for example `navigator.onLine`).
 */
export type GateEvent =
	| { type: 'lock-trigger'; reason: LockReason; at: number }
	| { type: 'snapshot'; snapshot: SyncSnapshot; networkOnline: boolean; at: number }
	| { type: 'log-entry'; entry: unknown; openPath?: string; at: number }
	| { type: 'tick'; at: number }
	| { type: 'edit-anyway' };

/**
 * What the lock covers.
 *
 * - `none`: nothing is locked.
 * - `vault`: every note is locked until Sync confirms it is up to date.
 * - `note`: only `notePath` is locked while Sync brings in a change for it.
 */
export type LockScope = 'none' | 'vault' | 'note';

/**
 * Banner to show next to the editor. Editing is always allowed while a banner shows.
 *
 * - `none`: no banner.
 * - `offline`: no connection to the network or to the Sync server.
 * - `paused`: the user paused Sync.
 * - `unavailable`: Sync Gate cannot read the Sync state.
 */
export type GateBanner = 'none' | 'offline' | 'paused' | 'unavailable';

/**
 * Output of the gate after each event.
 */
export interface GateState {
	/**
	 * True when editing is blocked.
	 */
	locked: boolean;
	/**
	 * What the lock covers. `none` when `locked` is false.
	 */
	scope: LockScope;
	/**
	 * The locked note when `scope` is `note`.
	 */
	notePath?: string;
	/**
	 * Banner to show. Always `none` while `locked` is true.
	 */
	banner: GateBanner;
	/**
	 * True when a lock made no progress for the configured time.
	 * The UI then makes "Edit anyway" prominent.
	 */
	slow: boolean;
	/**
	 * True while locked and the network is up, but Sync has no server connection yet.
	 */
	connecting: boolean;
	/**
	 * Why the gate is in this state.
	 */
	reason: GateReason;
}

/**
 * Options for {@link Gate}. All times are in milliseconds.
 */
export interface GateOptions {
	/**
	 * Time without Sync progress before `slow` becomes true.
	 */
	slowAfterMs: number;
	/**
	 * Time that Sync must stay synced, with no activity, before a lock ends on its own.
	 */
	quietUnlockMs: number;
	/**
	 * Time that a lock waits for the Sync server connection while the network is up.
	 */
	connectGraceMs: number;
}

/**
 * Which notes the user wants to protect.
 */
export type GateCoverage = { kind: 'all-notes' } | { kind: 'single-note'; notePath: string };

/**
 * State machine that implements the Sync Gate lock rules.
 *
 * - A vault lock (startup, resume, reconnect) ends on a fresh "Fully synced":
 *   Sync must report a state other than synced after the lock and then synced again,
 *   or a new "Fully synced" log entry must arrive.
 * - A lock also ends when Sync stays synced with no activity for the quiet time,
 *   because Sync does not always start a new round.
 * - A download or merge for the open note locks that note until the transfer ends.
 * - Uploads and changes to other notes do not lock.
 * - When the network is down, editing stays open with a banner. When the network is up
 *   but Sync has no server connection, a lock waits for the connect grace time first.
 * - When Sync is paused, or its state cannot be read, editing stays open with a banner.
 * - "Edit anyway" always ends the current lock.
 */
export class Gate {
	private scope: LockScope = 'none';
	private notePath: string | undefined = undefined;
	private lockReason: GateReason = 'idle';
	private openReason: GateReason = 'idle';
	private syncState: SyncState | undefined = undefined;
	private lastMessage: string | undefined = undefined;
	private networkOnline = true;
	private disconnectedSince: number | undefined = undefined;
	private offline = false;
	private sawNotSynced = false;
	private lastProgressAt = 0;
	private quietSince = 0;
	private now = 0;

	/**
	 * @param options Gate options. Change them later with {@link Gate.setOptions}.
	 */
	constructor(private options: GateOptions) {}

	/**
	 * Current output of the gate.
	 */
	get state(): GateState {
		const locked = this.scope !== 'none';
		const banner = locked ? 'none' : this.banner();
		const state: GateState = {
			locked,
			scope: this.scope,
			banner,
			slow: locked && this.now - this.lastProgressAt >= this.options.slowAfterMs,
			connecting: locked && this.networkOnline && this.syncState === 'disconnected',
			reason: locked ? this.lockReason : banner !== 'none' ? banner : this.openReason,
		};
		if (this.scope === 'note' && this.notePath !== undefined) {
			state.notePath = this.notePath;
		}
		return state;
	}

	/**
	 * Changes some of the gate options.
	 */
	setOptions(options: Partial<GateOptions>): void {
		this.options = { ...this.options, ...options };
	}

	/**
	 * Applies one event and returns the new output.
	 */
	handle(event: GateEvent): GateState {
		switch (event.type) {
			case 'lock-trigger':
				this.advanceClock(event.at);
				this.lockVault(event.reason, event.at);
				break;
			case 'snapshot':
				this.advanceClock(event.at);
				this.onSnapshot(event.snapshot, event.networkOnline, event.at);
				break;
			case 'log-entry':
				this.advanceClock(event.at);
				this.onLogEntry(event.entry, event.openPath, event.at);
				break;
			case 'tick':
				this.advanceClock(event.at);
				break;
			case 'edit-anyway':
				this.release('edit-anyway');
				break;
		}
		this.applyTimers();
		return this.state;
	}

	private onSnapshot(snapshot: SyncSnapshot, networkOnline: boolean, at: number): void {
		const previousState = this.syncState;
		const wasNetworkOnline = this.networkOnline;
		const wasOffline = this.offline;
		if (snapshot.state !== previousState || snapshot.lastMessage !== this.lastMessage) {
			this.lastProgressAt = at;
		}
		this.syncState = snapshot.state;
		this.lastMessage = snapshot.lastMessage;
		this.networkOnline = networkOnline;

		if (snapshot.state !== 'disconnected') {
			this.disconnectedSince = undefined;
		} else if (previousState !== 'disconnected' || this.disconnectedSince === undefined) {
			this.disconnectedSince = at;
		}
		if (!this.isQuietSnapshot()) {
			this.quietSince = at;
		}

		if (snapshot.state === 'unavailable' || snapshot.state === 'paused') {
			this.release(snapshot.state);
			return;
		}
		const reconnected = networkOnline && (snapshot.state !== 'disconnected' || !wasNetworkOnline);
		if (wasOffline && reconnected) {
			// This snapshot was taken at the reconnect, so it cannot unlock.
			this.lockVault('reconnect', at);
			return;
		}
		if (this.scope === 'none') {
			return;
		}
		if (snapshot.state === 'synced') {
			if (this.sawNotSynced) {
				this.release('fully-synced');
			}
		} else if (snapshot.state !== 'disconnected') {
			this.sawNotSynced = true;
		}
	}

	private onLogEntry(entry: unknown, openPath: string | undefined, at: number): void {
		this.lastProgressAt = at;
		this.quietSince = at;
		if (this.isFailOpen()) {
			return;
		}
		if (isFullySyncedEntry(entry)) {
			if (this.scope !== 'none') {
				this.release('fully-synced');
			}
			return;
		}
		if (this.scope === 'vault') {
			return;
		}
		const { direction, path } = classifyLogEntry(entry);
		const incoming = direction === 'download' || direction === 'merge';
		if (incoming && path !== undefined && openPath !== undefined && path === openPath) {
			this.lock('note', 'incoming-change', at, path);
			return;
		}
		if (this.scope === 'note' && direction === 'download' && path === undefined) {
			// "Download complete": the transfer for the locked note ended.
			this.release('download-complete');
		}
	}

	private lockVault(reason: LockReason, at: number): void {
		if (this.syncState === 'unavailable' || this.syncState === 'paused') {
			return;
		}
		if (!this.networkOnline) {
			// Offline: stay open. The network return locks again.
			this.offline = true;
			return;
		}
		this.lock('vault', reason, at);
		// A Sync disconnect that started before the lock (for example while the app was
		// in the background) gets a new grace time.
		this.disconnectedSince = this.syncState === 'disconnected' ? at : undefined;
		this.offline = false;
	}

	private lock(scope: 'vault' | 'note', reason: GateReason, at: number, notePath?: string): void {
		this.scope = scope;
		this.notePath = notePath;
		this.lockReason = reason;
		this.sawNotSynced = false;
		this.lastProgressAt = at;
		this.quietSince = at;
	}

	private release(reason: GateReason): void {
		this.scope = 'none';
		this.notePath = undefined;
		this.sawNotSynced = false;
		this.openReason = reason;
	}

	/**
	 * Applies the rules that depend on elapsed time or on the connection state.
	 */
	private applyTimers(): void {
		if (!this.networkOnline) {
			this.offline = true;
		} else if (this.syncState === 'disconnected') {
			const since = this.disconnectedSince ?? this.now;
			if (this.now - since >= this.options.connectGraceMs) {
				this.offline = true;
			}
		} else {
			this.offline = false;
		}
		if (this.offline) {
			if (this.scope !== 'none') {
				this.release('offline');
			}
			return;
		}
		if (
			this.scope !== 'none' &&
			!this.sawNotSynced &&
			this.isQuietSnapshot() &&
			this.now - this.quietSince >= this.options.quietUnlockMs
		) {
			this.release('quiet');
		}
	}

	/**
	 * True when Sync reports a strict "synced": synced state and no other status text.
	 */
	private isQuietSnapshot(): boolean {
		return (
			this.networkOnline &&
			this.syncState === 'synced' &&
			(this.lastMessage === undefined || this.lastMessage === FULLY_SYNCED_MESSAGE)
		);
	}

	private advanceClock(at: number): void {
		this.now = Math.max(this.now, at);
	}

	private isFailOpen(): boolean {
		return this.offline || this.syncState === 'unavailable' || this.syncState === 'paused';
	}

	private banner(): GateBanner {
		if (this.syncState === 'unavailable') {
			return 'unavailable';
		}
		if (this.offline) {
			return 'offline';
		}
		if (this.syncState === 'paused') {
			return 'paused';
		}
		return 'none';
	}
}

/**
 * Tells if a note is in the set of notes that the user protects.
 */
export function isNoteCovered(path: string | undefined, coverage: GateCoverage): boolean {
	if (path === undefined) {
		return false;
	}
	return coverage.kind === 'all-notes' || path === coverage.notePath;
}

/**
 * Tells if editing of one note is blocked, given the gate output and the notes the user protects.
 */
export function isNoteLocked(state: GateState, path: string | undefined, coverage: GateCoverage): boolean {
	if (!state.locked || !isNoteCovered(path, coverage)) {
		return false;
	}
	return state.scope === 'vault' || state.notePath === path;
}
