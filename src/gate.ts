/*
 * Decides when Sync Gate blocks editing. Pure logic: no timers, no app API.
 * The plugin feeds events in and reads the resulting GateState.
 */

import { classifyLogEntry, isFullySyncedEntry } from './log-entry';
import type { SyncSnapshot, SyncState } from './sync-status';

/**
 * Why the plugin asks for a vault lock.
 *
 * - `startup`: the app opened.
 * - `resume`: the app came back from the background.
 */
export type LockReason = 'startup' | 'resume';

/**
 * Input events for {@link Gate.handle}. `at` is a time in milliseconds, for example `Date.now()`.
 */
export type GateEvent =
	| { type: 'lock-trigger'; reason: LockReason; at: number }
	| { type: 'snapshot'; snapshot: SyncSnapshot; at: number }
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
 * Banner to show next to the editor.
 *
 * - `none`: no banner.
 * - `offline`: no connection to the Sync server. Editing is allowed.
 * - `unavailable`: Sync Gate cannot read the Sync state. Editing is allowed.
 */
export type GateBanner = 'none' | 'offline' | 'unavailable';

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
	 * Banner to show.
	 */
	banner: GateBanner;
	/**
	 * True when a lock made no progress for the configured time.
	 * The UI then makes "Edit anyway" prominent.
	 */
	slow: boolean;
}

/**
 * Options for {@link Gate}.
 */
export interface GateOptions {
	/**
	 * Time in milliseconds without Sync progress before `slow` becomes true.
	 */
	slowAfterMs: number;
}

/**
 * Which notes the user wants to protect.
 */
export type GateCoverage = { kind: 'all-notes' } | { kind: 'single-note'; notePath: string };

/**
 * State machine that implements the Sync Gate lock rules.
 *
 * - A vault lock (startup, resume, network back) ends only on a fresh "Fully synced":
 *   Sync must report a state other than synced after the lock and then synced again,
 *   or a new "Fully synced" log entry must arrive.
 * - A download or merge for the open note locks that note until the transfer ends.
 * - Uploads and changes to other notes do not lock.
 * - Offline, or when the Sync state cannot be read, editing stays open with a banner.
 * - "Edit anyway" always ends the current lock.
 */
export class Gate {
	private scope: LockScope = 'none';
	private notePath: string | undefined = undefined;
	private syncState: SyncState | undefined = undefined;
	private lastMessage: string | undefined = undefined;
	private sawNotSynced = false;
	private lastProgressAt = 0;
	private now = 0;

	/**
	 * @param options Gate options. Change them later with {@link Gate.setSlowAfterMs}.
	 */
	constructor(private options: GateOptions) {}

	/**
	 * Current output of the gate.
	 */
	get state(): GateState {
		const banner = this.banner();
		const locked = this.scope !== 'none' && banner === 'none';
		const state: GateState = {
			locked,
			scope: locked ? this.scope : 'none',
			banner,
			slow: locked && this.now - this.lastProgressAt >= this.options.slowAfterMs,
		};
		if (locked && this.scope === 'note' && this.notePath !== undefined) {
			state.notePath = this.notePath;
		}
		return state;
	}

	/**
	 * Sets the time without progress before a lock is reported as slow.
	 */
	setSlowAfterMs(slowAfterMs: number): void {
		this.options = { ...this.options, slowAfterMs };
	}

	/**
	 * Applies one event and returns the new output.
	 */
	handle(event: GateEvent): GateState {
		switch (event.type) {
			case 'lock-trigger':
				this.advanceClock(event.at);
				this.onLockTrigger(event.at);
				break;
			case 'snapshot':
				this.advanceClock(event.at);
				this.onSnapshot(event.snapshot, event.at);
				break;
			case 'log-entry':
				this.advanceClock(event.at);
				this.onLogEntry(event.entry, event.openPath, event.at);
				break;
			case 'tick':
				this.advanceClock(event.at);
				break;
			case 'edit-anyway':
				this.release();
				break;
		}
		return this.state;
	}

	private onLockTrigger(at: number): void {
		if (this.isFailOpen()) {
			// Offline or unreadable: stay open. A reconnect locks again.
			return;
		}
		this.lock('vault', at);
	}

	private onSnapshot(snapshot: SyncSnapshot, at: number): void {
		const previous = this.syncState;
		if (snapshot.state !== previous || snapshot.lastMessage !== this.lastMessage) {
			this.lastProgressAt = at;
		}
		this.syncState = snapshot.state;
		this.lastMessage = snapshot.lastMessage;

		if (this.isFailOpen()) {
			this.release();
			return;
		}
		if (previous === 'disconnected') {
			// Network is back. This snapshot was taken at the lock, so it cannot unlock.
			this.lock('vault', at);
			return;
		}
		if (this.scope === 'none') {
			return;
		}
		if (snapshot.state !== 'synced') {
			this.sawNotSynced = true;
		} else if (this.sawNotSynced) {
			this.release();
		}
	}

	private onLogEntry(entry: unknown, openPath: string | undefined, at: number): void {
		this.lastProgressAt = at;
		if (this.isFailOpen()) {
			return;
		}
		if (isFullySyncedEntry(entry)) {
			this.release();
			return;
		}
		if (this.scope === 'vault') {
			return;
		}
		const { direction, path } = classifyLogEntry(entry);
		const incoming = direction === 'download' || direction === 'merge';
		if (incoming && path !== undefined && openPath !== undefined && path === openPath) {
			this.lock('note', at, path);
			return;
		}
		if (this.scope === 'note' && direction === 'download' && path === undefined) {
			// "Download complete": the transfer for the locked note ended.
			this.release();
		}
	}

	private lock(scope: 'vault' | 'note', at: number, notePath?: string): void {
		this.scope = scope;
		this.notePath = notePath;
		this.sawNotSynced = false;
		this.lastProgressAt = at;
	}

	private release(): void {
		this.scope = 'none';
		this.notePath = undefined;
		this.sawNotSynced = false;
	}

	private advanceClock(at: number): void {
		this.now = Math.max(this.now, at);
	}

	private isFailOpen(): boolean {
		return this.syncState === 'disconnected' || this.syncState === 'unavailable';
	}

	private banner(): GateBanner {
		if (this.syncState === 'disconnected') {
			return 'offline';
		}
		if (this.syncState === 'unavailable') {
			return 'unavailable';
		}
		return 'none';
	}
}

/**
 * Tells if editing of one note is blocked, given the gate output and the notes the user protects.
 */
export function isNoteLocked(state: GateState, path: string | undefined, coverage: GateCoverage): boolean {
	if (!state.locked || path === undefined) {
		return false;
	}
	if (coverage.kind === 'single-note' && path !== coverage.notePath) {
		return false;
	}
	return state.scope === 'vault' || state.notePath === path;
}
