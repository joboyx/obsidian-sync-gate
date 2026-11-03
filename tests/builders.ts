import type { GateEvent, LockReason } from '../src/gate';
import type { SyncSnapshot, SyncState } from '../src/sync-status';

/**
 * Builds a snapshot event. The network is up unless `networkOnline` is false.
 */
export function snapshot(state: SyncState, at: number, extra: Partial<SyncSnapshot> = {}, networkOnline = true): GateEvent {
	return { type: 'snapshot', snapshot: { state, ...extra }, networkOnline, at };
}

/**
 * Builds a snapshot event for a device with no network. Sync then reports `disconnected`.
 */
export function networkDown(at: number): GateEvent {
	return snapshot('disconnected', at, {}, false);
}

/**
 * Builds a lock-trigger event.
 */
export function trigger(reason: LockReason, at: number): GateEvent {
	return { type: 'lock-trigger', reason, at };
}

/**
 * Builds a log-entry event from the message text, in the `{ info }` shape that Sync uses.
 * `open` is the path of the one open note, or the paths of all open notes.
 */
export function log(info: string, at: number, open?: string | readonly string[]): GateEvent {
	const event: GateEvent = { type: 'log-entry', entry: { info }, at };
	if (open !== undefined) {
		event.openPaths = typeof open === 'string' ? [open] : open;
	}
	return event;
}

/**
 * Builds a rename event.
 */
export function rename(from: string, to: string): GateEvent {
	return { type: 'rename', from, to };
}

/**
 * Builds a tick event.
 */
export function tick(at: number): GateEvent {
	return { type: 'tick', at };
}

/**
 * Builds an edit-anyway event.
 */
export function editAnyway(): GateEvent {
	return { type: 'edit-anyway' };
}

/**
 * A plain object shaped like the internal Sync instance, with working event methods.
 */
export interface SyncLike {
	getStatus?: () => unknown;
	syncStatus?: unknown;
	syncing?: unknown;
	syncLog?: unknown;
	server?: { hasConnection?: () => unknown };
	on?: (name: string, callback: (...args: unknown[]) => void) => unknown;
	offref?: (ref: unknown) => void;
	[key: string]: unknown;
}

/**
 * Builds a Sync-shaped object that reports `status`, plus any extra members.
 */
export function syncWithStatus(status: string, extra: SyncLike = {}): SyncLike {
	return { getStatus: () => status, ...extra };
}

/**
 * A Sync-shaped object whose `on` and `offref` keep real listener lists, so a test can emit events.
 */
export interface EmittingSync extends SyncLike {
	emit(name: string, ...args: unknown[]): void;
	listenerCount(): number;
}

/**
 * Builds an {@link EmittingSync}.
 */
export function emittingSync(extra: SyncLike = {}): EmittingSync {
	const listeners = new Map<number, { name: string; callback: (...args: unknown[]) => void }>();
	let nextRef = 0;
	return {
		getStatus: () => 'synced',
		...extra,
		on(name: string, callback: (...args: unknown[]) => void) {
			nextRef += 1;
			listeners.set(nextRef, { name, callback });
			return nextRef;
		},
		offref(ref: unknown) {
			listeners.delete(ref as number);
		},
		emit(name: string, ...args: unknown[]) {
			for (const listener of listeners.values()) {
				if (listener.name === name) {
					listener.callback(...args);
				}
			}
		},
		listenerCount() {
			return listeners.size;
		},
	};
}

/**
 * Builds an app-shaped object whose `internalPlugins.getPluginById('sync')` returns the instance.
 */
export function appWithSync(instance: unknown, enabled = true): unknown {
	const plugin = { enabled, instance };
	return {
		internalPlugins: {
			getPluginById: (id: string) => (id === 'sync' ? plugin : undefined),
		},
	};
}
