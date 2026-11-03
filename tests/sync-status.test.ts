import { describe, expect, it } from 'vitest';
import { findSyncInstance, latestLogEntry, readSyncSnapshot, SyncStatusReader, type SyncEventName } from '../src/sync-status';
import { appWithSync, emittingSync, syncWithStatus, type SyncLike } from './builders';

describe('findSyncInstance', () => {
	const instance = { getStatus: () => 'synced' };

	it('reads the instance through getPluginById', () => {
		expect(findSyncInstance(appWithSync(instance))).toBe(instance);
	});

	it('falls back to internalPlugins.plugins.sync', () => {
		const app = { internalPlugins: { plugins: { sync: { enabled: true, instance } } } };
		expect(findSyncInstance(app)).toBe(instance);
	});

	it.each([
		['Sync is turned off', appWithSync(instance, false)],
		['the app is undefined', undefined],
		['internalPlugins is missing', {}],
		['the plugin has no instance', { internalPlugins: { plugins: { sync: { enabled: true } } } }],
		[
			'getPluginById throws',
			{
				internalPlugins: {
					getPluginById: () => {
						throw new Error('changed API');
					},
				},
			},
		],
	])('returns undefined when %s', (_label, app) => {
		expect(findSyncInstance(app)).toBeUndefined();
	});
});

describe('readSyncSnapshot', () => {
	const throwing = () => {
		throw new Error('changed API');
	};

	it.each<[string, unknown, string]>([
		['no instance', undefined, 'unavailable'],
		['an instance without known members', { somethingNew: true }, 'unavailable'],
		['getStatus throws', { getStatus: throwing }, 'unavailable'],
		['hasConnection throws', syncWithStatus('synced', { server: { hasConnection: throwing } }), 'unavailable'],
		['an unknown status value', syncWithStatus('rebuilding'), 'unavailable'],
		['status synced', syncWithStatus('synced'), 'synced'],
		['status syncing', syncWithStatus('syncing'), 'syncing'],
		['status uninitialized', syncWithStatus('uninitialized'), 'checking'],
		['status paused', syncWithStatus('paused'), 'paused'],
		['status disconnected', syncWithStatus('disconnected'), 'disconnected'],
		['status error', syncWithStatus('error'), 'error'],
		['an old error log entry with status synced', syncWithStatus('synced', { syncLog: [{ info: 'Upload failed', error: true }] }), 'synced'],
		[
			'an error log entry about the connection with status disconnected',
			syncWithStatus('disconnected', { syncLog: [{ info: 'Unable to connect to server', error: true }] }),
			'disconnected',
		],
		['status error with status text "Unable to connect to server"', syncWithStatus('error', { syncStatus: 'Unable to connect to server' }), 'disconnected'],
		['no getStatus, last log marked as error', { syncLog: [{ info: 'Upload failed', error: true }] }, 'error'],
		['no getStatus, error log entry about the connection', { syncLog: [{ info: 'Unable to connect to server', error: true }] }, 'disconnected'],
		['no server connection', syncWithStatus('synced', { server: { hasConnection: () => false } }), 'disconnected'],
		['status error with no server connection', syncWithStatus('error', { server: { hasConnection: () => false } }), 'disconnected'],
		['status error with a server connection', syncWithStatus('error', { server: { hasConnection: () => true } }), 'error'],
		['status uninitialized with no server connection', syncWithStatus('uninitialized', { server: { hasConnection: () => false } }), 'checking'],
		['status text "Unable to connect to server"', syncWithStatus('synced', { syncStatus: 'Unable to connect to server' }), 'disconnected'],
		['status text "Detecting changes"', syncWithStatus('synced', { syncStatus: 'Detecting changes' }), 'checking'],
		['syncing flag on', syncWithStatus('synced', { syncing: true }), 'syncing'],
		['no getStatus, status text "Fully synced"', { syncStatus: 'Fully synced', syncing: false }, 'synced'],
		['no getStatus, last log "Fully synced"', { syncLog: [{ info: 'Fully synced' }] }, 'synced'],
		['no getStatus, last log "Downloading file"', { syncLog: [{ info: 'Downloading file Inbox.md' }] }, 'syncing'],
		['no getStatus, last log "Disconnected from server"', { syncLog: [{ info: 'Disconnected from server' }] }, 'disconnected'],
		['no getStatus, unknown text', { syncStatus: 'Something new' }, 'unavailable'],
	])('maps %s', (_label, sync, state) => {
		expect(readSyncSnapshot(sync).state).toBe(state);
	});

	it('includes the status text and the last log entry', () => {
		const sync = syncWithStatus('synced', {
			syncStatus: 'Fully synced',
			syncLog: [{ info: 'Downloading file Inbox.md' }, { info: 'Fully synced' }],
		});
		expect(readSyncSnapshot(sync)).toEqual({
			state: 'synced',
			lastMessage: 'Fully synced',
			lastEntry: { info: 'Fully synced', error: false },
		});
	});
});

describe('latestLogEntry', () => {
	it.each<[string, unknown, unknown]>([
		['the last entry', { syncLog: [{ info: 'Indexing' }, { info: 'Fully synced' }] }, { info: 'Fully synced' }],
		['undefined for an empty log', { syncLog: [] }, undefined],
		['undefined when the log is not an array', { syncLog: 'Fully synced' }, undefined],
		['undefined for no instance', undefined, undefined],
	])('returns %s', (_label, sync, expected) => {
		expect(latestLogEntry(sync)).toEqual(expected);
	});
});

describe('SyncStatusReader', () => {
	function readerFor(app: unknown) {
		const events: Array<[SyncEventName, unknown]> = [];
		const reader = new SyncStatusReader(app, (event, entry) => events.push([event, entry]));
		return { reader, events };
	}

	it('subscribes on the first read and forwards events', () => {
		const sync = emittingSync({ syncLog: [{ info: 'Downloading file Inbox.md' }] });
		const { reader, events } = readerFor(appWithSync(sync));

		expect(reader.read().state).toBe('synced');
		sync.emit('status-change');
		sync.emit('new-log', { info: 'Fully synced' });
		sync.emit('new-log');

		expect(sync.listenerCount()).toBe(2);
		expect(events).toEqual([
			['status-change', undefined],
			['new-log', { info: 'Fully synced' }],
			['new-log', { info: 'Downloading file Inbox.md' }],
		]);
	});

	it('subscribes once across reads', () => {
		const sync = emittingSync();
		const { reader } = readerFor(appWithSync(sync));
		reader.read();
		reader.read();
		expect(sync.listenerCount()).toBe(2);
	});

	it('moves subscriptions when the instance changes', () => {
		const first = emittingSync();
		const second = emittingSync();
		const app = appWithSync(first) as { internalPlugins: { getPluginById: (id: string) => unknown } };
		const { reader } = readerFor(app);
		reader.read();

		app.internalPlugins.getPluginById = () => ({ enabled: true, instance: second });
		reader.read();

		expect(first.listenerCount()).toBe(0);
		expect(second.listenerCount()).toBe(2);
	});

	it('removes subscriptions on detach', () => {
		const sync = emittingSync();
		const { reader } = readerFor(appWithSync(sync));
		reader.read();
		reader.detach();
		expect(sync.listenerCount()).toBe(0);
	});

	it('reads without events when on() or offref() is missing', () => {
		const sync: SyncLike = syncWithStatus('syncing');
		const { reader } = readerFor(appWithSync(sync));
		expect(reader.read().state).toBe('syncing');
	});
});
