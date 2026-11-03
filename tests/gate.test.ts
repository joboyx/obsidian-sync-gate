import { describe, expect, it } from 'vitest';
import { Gate, isNoteLocked, type GateCoverage, type GateEvent, type GateState } from '../src/gate';
import { editAnyway, log, snapshot, tick, trigger } from './builders';

const SLOW_AFTER_MS = 20_000;

const OPEN: GateState = { locked: false, scope: 'none', banner: 'none', slow: false };
const VAULT_LOCKED: GateState = { locked: true, scope: 'vault', banner: 'none', slow: false };
const VAULT_LOCKED_SLOW: GateState = { locked: true, scope: 'vault', banner: 'none', slow: true };
const INBOX_LOCKED: GateState = { locked: true, scope: 'note', notePath: 'Inbox.md', banner: 'none', slow: false };
const OFFLINE: GateState = { locked: false, scope: 'none', banner: 'offline', slow: false };
const UNAVAILABLE: GateState = { locked: false, scope: 'none', banner: 'unavailable', slow: false };

const INBOX = 'Inbox.md';

function run(events: GateEvent[]): GateState {
	const gate = new Gate({ slowAfterMs: SLOW_AFTER_MS });
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
		expect(new Gate({ slowAfterMs: SLOW_AFTER_MS }).state).toEqual(OPEN);
	});

	cases('R1: lock on open or resume, unlock only on a fresh "Fully synced"', [
		['locks on startup before any snapshot', [trigger('startup', 0)], VAULT_LOCKED],
		['unlocks after syncing then synced', [trigger('startup', 0), snapshot('syncing', 1), snapshot('synced', 2)], OPEN],
		['unlocks after checking then synced', [trigger('resume', 0), snapshot('checking', 1), snapshot('synced', 2)], OPEN],
		['unlocks on a new "Fully synced" log entry', [trigger('startup', 0), log('Fully synced', 1)], OPEN],
		['stays locked while syncing', [trigger('startup', 0), snapshot('syncing', 1)], VAULT_LOCKED],
		['stays locked on "Download complete"', [trigger('startup', 0), snapshot('syncing', 1), log('Download complete', 2)], VAULT_LOCKED],
		['stays locked on "Upload complete"', [trigger('startup', 0), snapshot('syncing', 1), log('Upload complete', 2)], VAULT_LOCKED],
		['stays locked while paused', [trigger('startup', 0), snapshot('paused', 1)], VAULT_LOCKED],
		['stays locked on error', [trigger('startup', 0), snapshot('error', 1)], VAULT_LOCKED],
	]);

	cases('R1: a stale "synced" after resume does not unlock', [
		['synced before and after resume', [snapshot('synced', 0), trigger('resume', 10), snapshot('synced', 11)], VAULT_LOCKED],
		['synced right after startup', [trigger('startup', 0), snapshot('synced', 1), snapshot('synced', 2)], VAULT_LOCKED],
		[
			'"Fully synced" status text that did not change',
			[
				snapshot('synced', 0, { lastMessage: 'Fully synced' }),
				trigger('resume', 10),
				snapshot('synced', 11, { lastMessage: 'Fully synced' }),
			],
			VAULT_LOCKED,
		],
		['not-synced seen before the lock does not count', [snapshot('syncing', 0), trigger('resume', 10), snapshot('synced', 11)], VAULT_LOCKED],
		[
			'a second resume needs its own fresh "Fully synced"',
			[trigger('resume', 0), snapshot('syncing', 1), snapshot('synced', 2), trigger('resume', 10), snapshot('synced', 11)],
			VAULT_LOCKED,
		],
	]);

	cases('R2: a change from another device locks the open note only', [
		['locks the open note on download', [snapshot('synced', 0), log(`Downloading file ${INBOX}`, 1, INBOX)], INBOX_LOCKED],
		['locks the open note on merge', [snapshot('synced', 0), log(`Merging conflicted file ${INBOX}`, 1, INBOX)], INBOX_LOCKED],
		[
			'unlocks on "Download complete"',
			[snapshot('synced', 0), log(`Downloading file ${INBOX}`, 1, INBOX), log('Download complete', 2, INBOX)],
			OPEN,
		],
		[
			'unlocks on "Fully synced"',
			[snapshot('synced', 0), log(`Downloading file ${INBOX}`, 1, INBOX), log('Fully synced', 2, INBOX)],
			OPEN,
		],
		[
			'unlocks after syncing then synced',
			[snapshot('synced', 0), log(`Downloading file ${INBOX}`, 1, INBOX), snapshot('syncing', 2), snapshot('synced', 3)],
			OPEN,
		],
		[
			'stays locked on a stale synced snapshot',
			[snapshot('synced', 0), log(`Downloading file ${INBOX}`, 1, INBOX), snapshot('synced', 2)],
			INBOX_LOCKED,
		],
		[
			'stays locked while other files download',
			[snapshot('synced', 0), log(`Downloading file ${INBOX}`, 1, INBOX), log('Downloading file Other.md', 2, INBOX)],
			INBOX_LOCKED,
		],
		[
			'a vault lock wins over a note lock',
			[snapshot('synced', 0), log(`Downloading file ${INBOX}`, 1, INBOX), trigger('resume', 2)],
			VAULT_LOCKED,
		],
		[
			'a download during a vault lock keeps the vault lock',
			[trigger('startup', 0), snapshot('syncing', 1), log(`Downloading file ${INBOX}`, 2, INBOX), log('Download complete', 3, INBOX)],
			VAULT_LOCKED,
		],
	]);

	cases('R3: a change for a different note does not lock', [
		['download of another note', [snapshot('synced', 0), log('Downloading file Other.md', 1, INBOX)], OPEN],
		['download with no open note', [snapshot('synced', 0), log(`Downloading file ${INBOX}`, 1)], OPEN],
		['delete of the open note', [snapshot('synced', 0), log(`Deleting file ${INBOX}`, 1, INBOX)], OPEN],
	]);

	cases('R4: an upload from this device does not lock', [
		['upload of the open note', [snapshot('synced', 0), log(`Uploading file ${INBOX}`, 1, INBOX)], OPEN],
		['upload complete', [snapshot('synced', 0), log('Upload complete', 1, INBOX)], OPEN],
	]);

	cases('R5: offline keeps editing open with a banner', [
		['disconnected snapshot', [snapshot('disconnected', 0)], OFFLINE],
		['startup while disconnected', [snapshot('disconnected', 0), trigger('startup', 1)], OFFLINE],
		['resume while disconnected', [snapshot('disconnected', 0), trigger('resume', 1)], OFFLINE],
		['a vault lock ends when the connection drops', [trigger('startup', 0), snapshot('disconnected', 1)], OFFLINE],
		[
			'a download for the open note while disconnected',
			[snapshot('disconnected', 0), log(`Downloading file ${INBOX}`, 1, INBOX)],
			OFFLINE,
		],
	]);

	cases('R6: network back locks like R1', [
		['locks when the connection returns', [snapshot('disconnected', 0), snapshot('checking', 1)], VAULT_LOCKED],
		['a synced snapshot right after reconnect does not unlock', [snapshot('disconnected', 0), snapshot('synced', 1)], VAULT_LOCKED],
		[
			'unlocks after a fresh "Fully synced"',
			[snapshot('disconnected', 0), snapshot('checking', 1), snapshot('syncing', 2), snapshot('synced', 3)],
			OPEN,
		],
		['unlocks on a new "Fully synced" log entry', [snapshot('disconnected', 0), snapshot('synced', 1), log('Fully synced', 2)], OPEN],
	]);

	cases('R7: no progress for the slow time makes the lock slow', [
		['not slow just before the limit', [trigger('startup', 0), tick(19_999)], VAULT_LOCKED],
		['slow at the limit', [trigger('startup', 0), tick(20_000)], VAULT_LOCKED_SLOW],
		[
			'repeated identical snapshots are not progress',
			[trigger('startup', 0), snapshot('syncing', 1), snapshot('syncing', 15_000), tick(20_001)],
			VAULT_LOCKED_SLOW,
		],
		['a new log entry is progress', [trigger('startup', 0), log('Downloading file Other.md', 10_000), tick(25_000)], VAULT_LOCKED],
		[
			'a new status text is progress',
			[
				trigger('startup', 0),
				snapshot('checking', 1, { lastMessage: 'Connecting to server' }),
				snapshot('checking', 10_000, { lastMessage: 'Detecting changes' }),
				tick(25_000),
			],
			VAULT_LOCKED,
		],
		['an open gate is never slow', [snapshot('synced', 0), tick(60_000)], OPEN],
	]);

	cases('Edit anyway is always available', [
		['ends a vault lock', [trigger('startup', 0), editAnyway()], OPEN],
		['ends a slow vault lock', [trigger('startup', 0), tick(30_000), editAnyway()], OPEN],
		['ends a note lock', [snapshot('synced', 0), log(`Downloading file ${INBOX}`, 1, INBOX), editAnyway()], OPEN],
		[
			'a later change for the open note locks again',
			[snapshot('synced', 0), log(`Downloading file ${INBOX}`, 1, INBOX), editAnyway(), log(`Downloading file ${INBOX}`, 2, INBOX)],
			INBOX_LOCKED,
		],
		['a later resume locks again', [trigger('startup', 0), editAnyway(), trigger('resume', 10)], VAULT_LOCKED],
	]);

	cases('Fail open when the Sync state is unavailable', [
		['unavailable snapshot', [snapshot('unavailable', 0)], UNAVAILABLE],
		['startup lock ends when the first snapshot is unavailable', [trigger('startup', 0), snapshot('unavailable', 1)], UNAVAILABLE],
		['resume while unavailable', [snapshot('unavailable', 0), trigger('resume', 1)], UNAVAILABLE],
		['a download for the open note while unavailable', [snapshot('unavailable', 0), log(`Downloading file ${INBOX}`, 1, INBOX)], UNAVAILABLE],
		['a later readable state removes the banner', [snapshot('unavailable', 0), snapshot('synced', 1)], OPEN],
	]);

	it('applies a new slow time', () => {
		const gate = new Gate({ slowAfterMs: SLOW_AFTER_MS });
		gate.handle(trigger('startup', 0));
		gate.setSlowAfterMs(5_000);
		expect(gate.handle(tick(5_000))).toEqual(VAULT_LOCKED_SLOW);
	});
});

describe('isNoteLocked', () => {
	const ALL: GateCoverage = { kind: 'all-notes' };
	const ONLY_INBOX: GateCoverage = { kind: 'single-note', notePath: INBOX };

	it.each<[string, GateState, string | undefined, GateCoverage, boolean]>([
		['vault lock, all notes', VAULT_LOCKED, 'Other.md', ALL, true],
		['vault lock, protected note', VAULT_LOCKED, INBOX, ONLY_INBOX, true],
		['vault lock, unprotected note', VAULT_LOCKED, 'Other.md', ONLY_INBOX, false],
		['note lock, same note', INBOX_LOCKED, INBOX, ALL, true],
		['note lock, other note', INBOX_LOCKED, 'Other.md', ALL, false],
		['open gate', OPEN, INBOX, ALL, false],
		['no open note', VAULT_LOCKED, undefined, ALL, false],
	])('%s', (_label, state, path, coverage, expected) => {
		expect(isNoteLocked(state, path, coverage)).toBe(expected);
	});
});
