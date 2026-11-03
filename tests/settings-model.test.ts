import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, loadSettings, parsePositiveInteger, toGateCoverage, toGateOptions } from '../src/settings-model';

describe('parsePositiveInteger', () => {
	it.each<[string, number | undefined]>([
		['15', 15],
		[' 7 ', 7],
		['0', undefined],
		['-3', undefined],
		['1.5', undefined],
		['15s', undefined],
		['', undefined],
		['99999999999999999999', undefined],
	])('"%s"', (input, expected) => {
		expect(parsePositiveInteger(input)).toBe(expected);
	});
});

describe('DEFAULT_SETTINGS', () => {
	it('locks on resume on mobile only, shows the mobile status icon and uses the documented times', () => {
		expect(DEFAULT_SETTINGS).toMatchObject({
			lockOnResumeMobileOnly: true,
			showMobileStatusWhenOpen: true,
			slowAfterSeconds: 20,
			quietUnlockSeconds: 15,
			connectGraceSeconds: 10,
		});
	});
});

describe('loadSettings', () => {
	it.each<[string, unknown]>([
		['no data file', null],
		['not an object', 'text'],
		['empty object', {}],
	])('uses the defaults for %s', (_label, stored) => {
		expect(loadSettings(stored)).toEqual(DEFAULT_SETTINGS);
	});

	it('keeps valid stored values', () => {
		const stored = {
			scope: 'single-note',
			notePath: 'Inbox.md',
			lockOnResumeMobileOnly: false,
			slowAfterSeconds: 30,
			quietUnlockSeconds: 5,
			connectGraceSeconds: 3,
			showMobileStatusWhenOpen: false,
			debug: true,
		};
		expect(loadSettings(stored)).toEqual(stored);
	});

	it('falls back to the default for each invalid value', () => {
		const stored = {
			scope: 'some-notes',
			notePath: 42,
			lockOnResumeMobileOnly: 'yes',
			slowAfterSeconds: 0,
			quietUnlockSeconds: -1,
			connectGraceSeconds: 2.5,
			showMobileStatusWhenOpen: 'no',
			debug: 1,
		};
		expect(loadSettings(stored)).toEqual(DEFAULT_SETTINGS);
	});
});

describe('conversions', () => {
	it('converts seconds to gate options in milliseconds', () => {
		expect(toGateOptions(DEFAULT_SETTINGS)).toEqual({ slowAfterMs: 20_000, quietUnlockMs: 15_000, connectGraceMs: 10_000 });
	});

	it.each([
		[{ ...DEFAULT_SETTINGS }, { kind: 'all-notes' }],
		[{ ...DEFAULT_SETTINGS, scope: 'single-note' as const, notePath: 'Inbox.md' }, { kind: 'single-note', notePath: 'Inbox.md' }],
	])('converts the protected scope to gate coverage', (settings, expected) => {
		expect(toGateCoverage(settings)).toEqual(expected);
	});
});
