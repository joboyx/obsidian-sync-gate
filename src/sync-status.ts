/*
 * Reads the state of the core Sync plugin through its internal, undocumented API.
 *
 * The status mapping in readSyncSnapshot is adapted from sync-reminder
 * (https://github.com/HEIXIZHU/sync-reminder, MIT License). See THIRD_PARTY_NOTICES.md.
 *
 * This module does not import the app API. It reads plain objects and checks
 * every member before use, because the internal API can change in any release.
 */

import { FULLY_SYNCED_MESSAGE, logEntryText } from './log-entry';

/**
 * State of Sync on this device, as Sync Gate understands it.
 *
 * - `synced`: Sync reports that the vault is up to date.
 * - `syncing`: Sync transfers files.
 * - `checking`: Sync connects, indexes or looks for changes.
 * - `paused`: the user paused Sync.
 * - `disconnected`: no connection to the Sync server.
 * - `error`: Sync reports an error.
 * - `unavailable`: Sync is off, or its internal API is missing or changed.
 */
export type SyncState = 'synced' | 'syncing' | 'checking' | 'paused' | 'disconnected' | 'error' | 'unavailable';

/**
 * Normalized copy of one Sync log entry.
 */
export interface SyncLogEntry {
	/**
	 * Message text of the entry.
	 */
	info: string;
	/**
	 * True when Sync marks the entry as an error.
	 */
	error: boolean;
}

/**
 * Point-in-time view of the Sync state.
 */
export interface SyncSnapshot {
	/**
	 * Mapped Sync state.
	 */
	state: SyncState;
	/**
	 * Status text that Sync shows, for example "Fully synced".
	 */
	lastMessage?: string;
	/**
	 * Most recent entry of the Sync log.
	 */
	lastEntry?: SyncLogEntry;
}

/**
 * Names of the Sync events that Sync Gate listens to.
 */
export type SyncEventName = 'status-change' | 'new-log';

/**
 * Called when Sync emits an event. For `new-log`, `entry` is the new raw log entry when known.
 */
export type SyncEventListener = (event: SyncEventName, entry?: unknown) => void;

const SYNC_EVENTS: readonly SyncEventName[] = ['status-change', 'new-log'];

const DISCONNECTED_TEXT = /disconnected from server|unable to connect to server/i;
const CHECKING_TEXT = /connecting to server|detecting changes|indexing/i;
const ACTIVE_TEXT = /uploading file|downloading file|merging|deleting|connecting|detecting|indexing/i;

/**
 * Finds the internal Sync instance on the app object.
 *
 * Returns undefined when Sync is not installed, is turned off, or the internal API is missing.
 * Never throws.
 */
export function findSyncInstance(app: unknown): unknown {
	try {
		const manager = member(app, 'internalPlugins');
		const getPluginById = member(manager, 'getPluginById');
		const plugin =
			(typeof getPluginById === 'function' ? (getPluginById as (id: string) => unknown).call(manager, 'sync') : undefined) ??
			member(member(manager, 'plugins'), 'sync');
		if (member(plugin, 'enabled') === false) {
			return undefined;
		}
		const instance = member(plugin, 'instance');
		return isObject(instance) ? instance : undefined;
	} catch {
		return undefined;
	}
}

/**
 * Maps the internal Sync instance to a {@link SyncSnapshot}.
 *
 * Returns state `unavailable` when the instance is missing, when no known status member exists,
 * or when a member throws. Never throws.
 */
export function readSyncSnapshot(sync: unknown): SyncSnapshot {
	try {
		return mapSnapshot(sync);
	} catch {
		return { state: 'unavailable' };
	}
}

/**
 * Gets the most recent raw entry of the Sync log, or undefined when the log is missing or empty.
 * Never throws.
 */
export function latestLogEntry(sync: unknown): unknown {
	try {
		const log = member(sync, 'syncLog');
		return Array.isArray(log) && log.length > 0 ? (log[log.length - 1] as unknown) : undefined;
	} catch {
		return undefined;
	}
}

/**
 * Reads Sync snapshots and forwards Sync events to one listener.
 *
 * Each read looks up the Sync instance again. When the instance changes
 * (for example, the user turns Sync on later), the reader moves its event
 * subscriptions to the new instance.
 */
export class SyncStatusReader {
	private subscribed: unknown = undefined;
	private disposers: Array<() => void> = [];

	/**
	 * @param app The app object that holds `internalPlugins`.
	 * @param listener Gets each Sync event.
	 */
	constructor(
		private readonly app: unknown,
		private readonly listener: SyncEventListener,
	) {}

	/**
	 * Reads the current Sync snapshot and keeps the event subscriptions up to date.
	 */
	read(): SyncSnapshot {
		const sync = findSyncInstance(this.app);
		this.subscribe(sync);
		return readSyncSnapshot(sync);
	}

	/**
	 * Removes all event subscriptions.
	 */
	detach(): void {
		for (const dispose of this.disposers.splice(0)) {
			try {
				dispose();
			} catch {
				// The instance is gone or changed. Nothing is left to remove.
			}
		}
		this.subscribed = undefined;
	}

	private subscribe(sync: unknown): void {
		if (sync === this.subscribed) {
			return;
		}
		this.detach();
		this.subscribed = sync;
		const on = member(sync, 'on');
		const offref = member(sync, 'offref');
		if (typeof on !== 'function' || typeof offref !== 'function') {
			// No events. Callers still poll with read().
			return;
		}
		for (const event of SYNC_EVENTS) {
			try {
				const ref: unknown = (on as (name: string, callback: (...args: unknown[]) => void) => unknown).call(
					sync,
					event,
					(...args: unknown[]) => {
						this.listener(event, event === 'new-log' ? newLogEntry(sync, args) : undefined);
					},
				);
				this.disposers.push(() => (offref as (ref: unknown) => void).call(sync, ref));
			} catch {
				// This event is not available. Polling still works.
			}
		}
	}
}

function mapSnapshot(sync: unknown): SyncSnapshot {
	if (!isObject(sync)) {
		return { state: 'unavailable' };
	}
	const getStatus = member(sync, 'getStatus');
	const status: unknown = typeof getStatus === 'function' ? (getStatus as () => unknown).call(sync) : undefined;
	const rawMessage = member(sync, 'syncStatus');
	const message = typeof rawMessage === 'string' ? rawMessage : '';
	const last = latestLogEntry(sync);
	const lastEntry = last === undefined ? undefined : toSyncLogEntry(last);
	const syncing = member(sync, 'syncing');

	const snapshot = (state: SyncState): SyncSnapshot => {
		const result: SyncSnapshot = { state };
		if (message !== '') {
			result.lastMessage = message;
		}
		if (lastEntry) {
			result.lastEntry = lastEntry;
		}
		return result;
	};

	if (typeof status !== 'string' && message === '' && typeof syncing !== 'boolean' && lastEntry === undefined) {
		// None of the known members exist: the internal API changed.
		return { state: 'unavailable' };
	}

	if (status === 'paused' || member(sync, 'pause') === true) {
		return snapshot('paused');
	}
	// A disconnect comes before an error, so the connect grace time and the offline banner apply.
	if (status === 'disconnected' || DISCONNECTED_TEXT.test(message)) {
		return snapshot('disconnected');
	}
	const server = member(sync, 'server');
	const hasConnection = member(server, 'hasConnection');
	const noConnection = typeof hasConnection === 'function' && !(hasConnection as () => unknown).call(server);
	if (status === 'error' || member(sync, 'error') === true) {
		// An error with no server connection is a disconnect, for the same reason as above.
		return snapshot(noConnection ? 'disconnected' : 'error');
	}
	if (status === 'uninitialized') {
		return snapshot('checking');
	}
	if (noConnection) {
		return snapshot('disconnected');
	}
	if (status === 'syncing' || syncing === true) {
		return snapshot('syncing');
	}
	if (CHECKING_TEXT.test(message)) {
		return snapshot('checking');
	}
	if (status === 'synced') {
		return snapshot('synced');
	}
	if (typeof status === 'string') {
		// A status value this version does not know. Do not guess.
		return snapshot('unavailable');
	}

	// No getStatus(): fall back to the status text and the log. A log entry is history,
	// so only this path reads its error flag. getStatus() tells the current state.
	if (lastEntry && DISCONNECTED_TEXT.test(lastEntry.info)) {
		return snapshot('disconnected');
	}
	const complete = message === FULLY_SYNCED_MESSAGE || lastEntry?.info === FULLY_SYNCED_MESSAGE;
	if (complete && syncing !== true) {
		return snapshot('synced');
	}
	if (lastEntry?.error === true) {
		return snapshot('error');
	}
	if (lastEntry && ACTIVE_TEXT.test(lastEntry.info)) {
		return snapshot('syncing');
	}
	return snapshot('unavailable');
}

function newLogEntry(sync: unknown, args: unknown[]): unknown {
	const fromEvent = args.find((arg) => logEntryText(arg) !== '');
	return fromEvent ?? latestLogEntry(sync);
}

function toSyncLogEntry(raw: unknown): SyncLogEntry {
	return {
		info: logEntryText(raw),
		error: isObject(raw) && (raw as { error?: unknown }).error === true,
	};
}

function isObject(value: unknown): value is object {
	return typeof value === 'object' && value !== null;
}

function member(target: unknown, key: string): unknown {
	return isObject(target) ? (target as Record<string, unknown>)[key] : undefined;
}
