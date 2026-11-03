import { describe, expect, it } from 'vitest';
import {
	Gate,
	isNoteCovered,
	isNoteLocked,
	type GateBanner,
	type GateCoverage,
	type GateEvent,
	type GateOptions,
	type GateReason,
	type GateState,
} from '../src/gate';
import { editAnyway, log, networkDown, snapshot, tick, trigger } from './builders';

const OPTIONS: GateOptions = { slowAfterMs: 20_000, quietUnlockMs: 15_000, connectGraceMs: 10_000 };

const INBOX = 'Inbox.md';

function open(reason: GateReason = 'idle', banner: GateBanner = 'none'): GateState {
	return { locked: false, scope: 'none', banner, slow: false, connecting: false, reason };
}

function vault(reason: GateReason, extra: Partial<GateState> = {}): GateState {
	return { locked: true, scope: 'vault', banner: 'none', slow: false, connecting: false, reason, ...extra };
}

function inbox(extra: Partial<GateState> = {}): GateState {
	return { ...vault('incoming-change'), scope: 'note', notePath: INBOX, ...extra };
}

const OFFLINE = open('offline', 'offline');
const PAUSED = open('paused', 'paused');
const UNAVAILABLE = open('unavailable', 'unavailable');

function run(events: GateEvent[]): GateState {
	const gate = new Gate(OPTIONS);
	let state = gate.state;
	for (const event of events) {
		state = gate.handle(event);
	}
	return state;
}

type Case = [label: string, events: GateEvent[], expected: GateState];

function cases(rule: string, table: Case[]): void {
	describe(rule, () => {
		it.each(table)('%s', (_label, events, expected) => {
			expect(run(events)).toEqual(expected);
		});
	});
}

describe('Gate', () => {
	it('starts open', () => {
		expect(new Gate(OPTIONS).state).toEqual(open());
	});

	cases('R1: lock on open or resume, unlock on a fresh "Fully synced"', [
		['locks on startup before any snapshot', [trigger('startup', 0)], vault('startup')],
		['unlocks after syncing then synced', [trigger('startup', 0), snapshot('syncing', 1), snapshot('synced', 2)], open('fully-synced')],
		['unlocks after checking then synced', [trigger('resume', 0), snapshot('checking', 1), snapshot('synced', 2)], open('fully-synced')],
		['unlocks on a new "Fully synced" log entry', [trigger('startup', 0), log('Fully synced', 1)], open('fully-synced')],
		['stays locked while syncing', [trigger('startup', 0), snapshot('syncing', 1)], vault('startup')],
		['stays locked on "Download complete"', [trigger('startup', 0), snapshot('syncing', 1), log('Download complete', 2)], vault('startup')],
		['stays locked on "Upload complete"', [trigger('startup', 0), snapshot('syncing', 1), log('Upload complete', 2)], vault('startup')],
		['stays locked on error', [trigger('startup', 0), snapshot('error', 1)], vault('startup')],
		['an error lock becomes slow and does not end on its own', [trigger('startup', 0), snapshot('error', 1), tick(30_000)], vault('startup', { slow: true })],
		['an error then synced unlocks', [trigger('startup', 0), snapshot('error', 1), snapshot('synced', 2)], open('fully-synced')],
	]);

	cases('R1: a stale "synced" after resume does not unlock', [
		['synced before and after resume', [snapshot('synced', 0), trigger('resume', 10), snapshot('synced', 11)], vault('resume')],
		['synced right after startup', [trigger('startup', 0), snapshot('synced', 1), snapshot('synced', 2)], vault('startup')],
		[
			'"Fully synced" status text that did not change',
			[
				snapshot('synced', 0, { lastMessage: 'Fully synced' }),
				trigger('resume', 10),
				snapshot('synced', 11, { lastMessage: 'Fully synced' }),
			],
			vault('resume'),
		],
		['not-synced seen before the lock does not count', [snapshot('syncing', 0), trigger('resume', 10), snapshot('synced', 11)], vault('resume')],
		[
			'a second resume needs its own fresh "Fully synced"',
			[trigger('resume', 0), snapshot('syncing', 1), snapshot('synced', 2), trigger('resume', 10), snapshot('synced', 11)],
			vault('resume'),
		],
	]);

	cases('Quiet fallback: a lock ends when Sync stays synced with no activity', [
		['unlocks at the quiet time', [trigger('startup', 0), snapshot('synced', 1), tick(15_000)], open('quiet')],
		['stays locked just before the quiet time', [trigger('startup', 0), snapshot('synced', 1), tick(14_999)], vault('startup')],
		[
			'a new log entry restarts the quiet time',
			[trigger('startup', 0), snapshot('synced', 1), log('Downloading file Other.md', 10_000), tick(15_000)],
			vault('startup'),
		],
		[
			'unlocks at the quiet time after the last log entry',
			[trigger('startup', 0), snapshot('synced', 1), log('Downloading file Other.md', 10_000), tick(25_000)],
			open('quiet'),
		],
		['a not-synced state turns off the quiet unlock', [trigger('startup', 0), snapshot('syncing', 1), tick(30_000)], vault('startup', { slow: true })],
		[
			'a status text other than "Fully synced" is not quiet',
			[trigger('startup', 0), snapshot('synced', 1, { lastMessage: 'Starting' }), tick(15_001)],
			vault('startup'),
		],
		['no snapshot is not quiet', [trigger('startup', 0), tick(16_000)], vault('startup')],
		[
			'a Sync disconnect restarts the quiet time',
			[trigger('startup', 0), snapshot('synced', 1), snapshot('disconnected', 5_000), snapshot('synced', 6_000), tick(15_001)],
			vault('startup'),
		],
		['ends a note lock', [snapshot('synced', 0), log(`Downloading file ${INBOX}`, 1, INBOX), tick(15_001)], open('quiet')],
	]);

	cases('R2: a change from another device locks the open note only', [
		['locks the open note on download', [snapshot('synced', 0), log(`Downloading file ${INBOX}`, 1, INBOX)], inbox()],
		['locks the open note on merge', [snapshot('synced', 0), log(`Merging conflicted file ${INBOX}`, 1, INBOX)], inbox()],
		[
			'unlocks on "Download complete"',
			[snapshot('synced', 0), log(`Downloading file ${INBOX}`, 1, INBOX), log('Download complete', 2, INBOX)],
			open('download-complete'),
		],
		[
			'unlocks on "Fully synced"',
			[snapshot('synced', 0), log(`Downloading file ${INBOX}`, 1, INBOX), log('Fully synced', 2, INBOX)],
			open('fully-synced'),
		],
		[
			'unlocks after syncing then synced',
			[snapshot('synced', 0), log(`Downloading file ${INBOX}`, 1, INBOX), snapshot('syncing', 2), snapshot('synced', 3)],
			open('fully-synced'),
		],
		[
			'stays locked on a stale synced snapshot',
			[snapshot('synced', 0), log(`Downloading file ${INBOX}`, 1, INBOX), snapshot('synced', 2)],
			inbox(),
		],
		[
			'stays locked while other files download',
			[snapshot('synced', 0), log(`Downloading file ${INBOX}`, 1, INBOX), log('Downloading file Other.md', 2, INBOX)],
			inbox(),
		],
		[
			'a vault lock wins over a note lock',
			[snapshot('synced', 0), log(`Downloading file ${INBOX}`, 1, INBOX), trigger('resume', 2)],
			vault('resume'),
		],
		[
			'a download during a vault lock keeps the vault lock',
			[trigger('startup', 0), snapshot('syncing', 1), log(`Downloading file ${INBOX}`, 2, INBOX), log('Download complete', 3, INBOX)],
			vault('startup'),
		],
	]);

	cases('R3: a change for a different note does not lock', [
		['download of another note', [snapshot('synced', 0), log('Downloading file Other.md', 1, INBOX)], open()],
		['download with no open note', [snapshot('synced', 0), log(`Downloading file ${INBOX}`, 1)], open()],
		['delete of the open note', [snapshot('synced', 0), log(`Deleting file ${INBOX}`, 1, INBOX)], open()],
	]);

	cases('R4: an upload from this device does not lock', [
		['upload of the open note', [snapshot('synced', 0), log(`Uploading file ${INBOX}`, 1, INBOX)], open()],
		['upload complete', [snapshot('synced', 0), log('Upload complete', 1, INBOX)], open()],
	]);

	cases('R5: with no network, editing stays open with a banner', [
		['network down', [networkDown(0)], OFFLINE],
		['startup with no network', [networkDown(0), trigger('startup', 1)], OFFLINE],
		['resume with no network', [networkDown(0), trigger('resume', 1)], OFFLINE],
		['a vault lock ends at once when the network goes down', [trigger('startup', 0), networkDown(1)], OFFLINE],
		['a note lock ends at once when the network goes down', [snapshot('synced', 0), log(`Downloading file ${INBOX}`, 1, INBOX), networkDown(2)], OFFLINE],
		['a download for the open note with no network', [networkDown(0), log(`Downloading file ${INBOX}`, 1, INBOX)], OFFLINE],
	]);

	cases('R5: with the network up, a Sync disconnect waits for the connect grace time', [
		['a lock stays on as connecting', [trigger('resume', 0), snapshot('disconnected', 1)], vault('resume', { connecting: true })],
		[
			'stays locked just before the grace time',
			[trigger('resume', 0), snapshot('disconnected', 1), tick(10_000)],
			vault('resume', { connecting: true }),
		],
		['unlocks with the offline banner at the grace time', [trigger('resume', 0), snapshot('disconnected', 1), tick(10_001)], OFFLINE],
		[
			'a disconnect from before the resume gets a new grace time',
			[snapshot('disconnected', 0), tick(60_000), trigger('resume', 60_000), snapshot('disconnected', 60_001)],
			vault('resume', { connecting: true }),
		],
		[
			'connecting unlocks at once when the network goes down',
			[trigger('resume', 0), snapshot('disconnected', 1), networkDown(2)],
			OFFLINE,
		],
		['while open, no banner during the grace time', [snapshot('disconnected', 0), tick(9_999)], open()],
		['while open, the banner shows at the grace time', [snapshot('disconnected', 0), tick(10_000)], OFFLINE],
	]);

	cases('R6: network back locks like R1', [
		['locks when the network returns', [networkDown(0), snapshot('checking', 1)], vault('reconnect')],
		[
			'locks as connecting when the network returns before Sync connects',
			[networkDown(0), snapshot('disconnected', 1)],
			vault('reconnect', { connecting: true }),
		],
		[
			'locks when Sync connects after the offline banner',
			[snapshot('disconnected', 0), tick(10_000), snapshot('checking', 10_001)],
			vault('reconnect'),
		],
		['a short Sync disconnect while open does not lock', [snapshot('synced', 0), snapshot('disconnected', 1), snapshot('synced', 2)], open()],
		['a synced snapshot right after reconnect does not unlock', [networkDown(0), snapshot('synced', 1)], vault('reconnect')],
		[
			'unlocks after a fresh "Fully synced"',
			[networkDown(0), snapshot('checking', 1), snapshot('syncing', 2), snapshot('synced', 3)],
			open('fully-synced'),
		],
		['unlocks on a new "Fully synced" log entry', [networkDown(0), snapshot('synced', 1), log('Fully synced', 2)], open('fully-synced')],
		['unlocks at the quiet time', [networkDown(0), snapshot('synced', 1), tick(15_001)], open('quiet')],
	]);

	cases('R7: no progress for the slow time makes the lock slow', [
		['not slow just before the limit', [trigger('startup', 0), tick(19_999)], vault('startup')],
		['slow at the limit', [trigger('startup', 0), tick(20_000)], vault('startup', { slow: true })],
		[
			'repeated identical snapshots are not progress',
			[trigger('startup', 0), snapshot('syncing', 1), snapshot('syncing', 15_000), tick(20_001)],
			vault('startup', { slow: true }),
		],
		['a new log entry is progress', [trigger('startup', 0), log('Downloading file Other.md', 10_000), tick(25_000)], vault('startup')],
		[
			'a new status text is progress',
			[
				trigger('startup', 0),
				snapshot('checking', 1, { lastMessage: 'Connecting to server' }),
				snapshot('checking', 10_000, { lastMessage: 'Detecting changes' }),
				tick(25_000),
			],
			vault('startup'),
		],
		['an open gate is never slow', [snapshot('synced', 0), tick(60_000)], open()],
	]);

	cases('Paused Sync keeps editing open with a banner', [
		['paused snapshot', [snapshot('paused', 0)], PAUSED],
		['a vault lock ends when Sync is paused', [trigger('startup', 0), snapshot('paused', 1)], PAUSED],
		['startup while paused', [snapshot('paused', 0), trigger('startup', 1)], PAUSED],
		['a download for the open note while paused', [snapshot('paused', 0), log(`Downloading file ${INBOX}`, 1, INBOX)], PAUSED],
		['the banner clears when Sync runs again', [snapshot('paused', 0), snapshot('synced', 1)], open('paused')],
	]);

	cases('Edit anyway is always available', [
		['ends a vault lock', [trigger('startup', 0), editAnyway()], open('edit-anyway')],
		['ends a slow vault lock', [trigger('startup', 0), tick(30_000), editAnyway()], open('edit-anyway')],
		['ends a connecting lock', [trigger('resume', 0), snapshot('disconnected', 1), editAnyway()], open('edit-anyway')],
		['ends a note lock', [snapshot('synced', 0), log(`Downloading file ${INBOX}`, 1, INBOX), editAnyway()], open('edit-anyway')],
		[
			'a later change for the open note locks again',
			[snapshot('synced', 0), log(`Downloading file ${INBOX}`, 1, INBOX), editAnyway(), log(`Downloading file ${INBOX}`, 2, INBOX)],
			inbox(),
		],
		['a later resume locks again', [trigger('startup', 0), editAnyway(), trigger('resume', 10)], vault('resume')],
	]);

	cases('Fail open when the Sync state is unavailable', [
		['unavailable snapshot', [snapshot('unavailable', 0)], UNAVAILABLE],
		['startup lock ends when the first snapshot is unavailable', [trigger('startup', 0), snapshot('unavailable', 1)], UNAVAILABLE],
		['resume while unavailable', [snapshot('unavailable', 0), trigger('resume', 1)], UNAVAILABLE],
		['a download for the open note while unavailable', [snapshot('unavailable', 0), log(`Downloading file ${INBOX}`, 1, INBOX)], UNAVAILABLE],
		['the unavailable banner wins over the offline banner', [networkDown(0), snapshot('unavailable', 1, {}, false)], UNAVAILABLE],
		['a later readable state removes the banner', [snapshot('unavailable', 0), snapshot('synced', 1)], open('unavailable')],
	]);

	it('applies new options', () => {
		const gate = new Gate(OPTIONS);
		gate.handle(trigger('startup', 0));
		gate.setOptions({ slowAfterMs: 5_000 });
		expect(gate.handle(tick(5_000))).toEqual(vault('startup', { slow: true }));
		gate.setOptions({ quietUnlockMs: 1_000 });
		gate.handle(snapshot('synced', 5_001));
		expect(gate.handle(tick(6_001))).toEqual(open('quiet'));
	});
});

describe('isNoteCovered', () => {
	it.each<[string, string | undefined, GateCoverage, boolean]>([
		['all notes', 'Other.md', { kind: 'all-notes' }, true],
		['protected note', INBOX, { kind: 'single-note', notePath: INBOX }, true],
		['unprotected note', 'Other.md', { kind: 'single-note', notePath: INBOX }, false],
		['no note', undefined, { kind: 'all-notes' }, false],
	])('%s', (_label, path, coverage, expected) => {
		expect(isNoteCovered(path, coverage)).toBe(expected);
	});
});

describe('isNoteLocked', () => {
	const ALL: GateCoverage = { kind: 'all-notes' };
	const ONLY_INBOX: GateCoverage = { kind: 'single-note', notePath: INBOX };

	it.each<[string, GateState, string | undefined, GateCoverage, boolean]>([
		['vault lock, all notes', vault('startup'), 'Other.md', ALL, true],
		['vault lock, protected note', vault('startup'), INBOX, ONLY_INBOX, true],
		['vault lock, unprotected note', vault('startup'), 'Other.md', ONLY_INBOX, false],
		['note lock, same note', inbox(), INBOX, ALL, true],
		['note lock, other note', inbox(), 'Other.md', ALL, false],
		['open gate', open(), INBOX, ALL, false],
		['no open note', vault('startup'), undefined, ALL, false],
	])('%s', (_label, state, path, coverage, expected) => {
		expect(isNoteLocked(state, path, coverage)).toBe(expected);
	});
});
