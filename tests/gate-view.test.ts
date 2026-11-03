import { describe, expect, it } from 'vitest';
import type { GateBanner, GateReason, GateState } from '../src/gate';
import {
	bannerView,
	indicatorMode,
	indicatorView,
	overlayView,
	showsHeaderIndicator,
	statusText,
	type IndicatorMode,
	type IndicatorView,
	type OverlayView,
} from '../src/gate-view';

function open(reason: GateReason = 'idle', banner: GateBanner = 'none'): GateState {
	return { locked: false, scope: 'none', banner, slow: false, connecting: false, reason };
}

function locked(extra: Partial<GateState> = {}): GateState {
	return { locked: true, scope: 'vault', banner: 'none', slow: false, connecting: false, reason: 'startup', ...extra };
}

const NOTE_LOCK = locked({ scope: 'note', notePath: 'Inbox.md', reason: 'incoming-change' });

describe('indicatorView', () => {
	it.each<[string, GateState, IndicatorView]>([
		['open is icon only', open(), { mode: 'open', icon: 'check-circle-2', label: '', tooltip: 'Sync Gate: editing open', tone: 'muted' }],
		[
			'open after edit anyway',
			open('edit-anyway'),
			{ mode: 'open', icon: 'check-circle-2', label: '', tooltip: 'Sync Gate: editing open', tone: 'muted' },
		],
		['vault lock', locked(), { mode: 'locked', icon: 'lock', label: 'Locked', tooltip: 'Sync Gate: waiting for Sync', tone: 'accent' }],
		[
			'slow lock',
			locked({ slow: true }),
			{ mode: 'locked', icon: 'alert-triangle', label: 'Locked', tooltip: 'Sync Gate: waiting for Sync', tone: 'accent' },
		],
		[
			'note lock',
			NOTE_LOCK,
			{ mode: 'locked', icon: 'lock', label: 'Locked', tooltip: 'Sync Gate: this note is updating from another device', tone: 'accent' },
		],
		[
			'offline',
			open('offline', 'offline'),
			{ mode: 'offline', icon: 'wifi-off', label: 'Offline', tooltip: 'Sync Gate: offline, editing is open', tone: 'warning' },
		],
		[
			'paused',
			open('paused', 'paused'),
			{ mode: 'paused', icon: 'pause-circle', label: 'Paused', tooltip: 'Sync Gate: Sync is paused, editing is open', tone: 'warning' },
		],
		[
			'unavailable',
			open('unavailable', 'unavailable'),
			{
				mode: 'unavailable',
				icon: 'alert-triangle',
				label: 'Unavailable',
				tooltip: 'Sync Gate: Sync status is unavailable, editing is open',
				tone: 'error',
			},
		],
	])('%s', (_label, state, expected) => {
		expect(indicatorView(state)).toEqual(expected);
		expect(indicatorMode(state)).toBe(expected.mode);
	});
});

describe('showsHeaderIndicator', () => {
	it.each<[IndicatorMode, boolean, boolean]>([
		['open', true, true],
		['open', false, false],
		['locked', true, true],
		['locked', false, true],
		['offline', true, true],
		['offline', false, true],
		['paused', true, true],
		['paused', false, true],
		['unavailable', true, true],
		['unavailable', false, true],
	])('%s with show-when-open %s shows %s', (mode, showWhenOpen, expected) => {
		expect(showsHeaderIndicator(mode, showWhenOpen)).toBe(expected);
	});
});

describe('overlayView', () => {
	it.each<[string, GateState, OverlayView | undefined]>([
		['no card while open', open(), undefined],
		['no card with a banner', open('offline', 'offline'), undefined],
		[
			'vault lock',
			locked(),
			{
				icon: 'refresh-cw',
				spin: true,
				title: 'Waiting for Sync',
				text: 'Getting changes from your other devices. Editing opens when Sync finishes.',
				prominentEditAnyway: false,
			},
		],
		[
			'vault lock while connecting',
			locked({ connecting: true }),
			{
				icon: 'refresh-cw',
				spin: true,
				title: 'Waiting for Sync',
				text: 'Connecting to the Sync server. Editing opens when your notes are up to date.',
				prominentEditAnyway: false,
			},
		],
		[
			'note lock',
			NOTE_LOCK,
			{
				icon: 'refresh-cw',
				spin: true,
				title: 'Updating from another device',
				text: 'Sync is bringing in a newer version of this note.',
				prominentEditAnyway: false,
			},
		],
		[
			'slow lock makes "Edit anyway" prominent',
			locked({ slow: true }),
			{
				icon: 'alert-triangle',
				spin: false,
				title: 'Sync is taking longer than usual',
				text: 'You can wait, or edit now and let Sync merge the changes later.',
				prominentEditAnyway: true,
			},
		],
	])('%s', (_label, state, expected) => {
		expect(overlayView(state)).toEqual(expected);
	});
});

describe('bannerView', () => {
	it.each<[GateBanner, string | undefined]>([
		['none', undefined],
		['offline', 'wifi-off'],
		['paused', 'pause-circle'],
		['unavailable', 'alert-triangle'],
	])('%s', (banner, icon) => {
		expect(bannerView(banner)?.icon).toBe(icon);
	});

	it('tells that paused Sync stops incoming changes', () => {
		expect(bannerView('paused')?.text).toBe('Sync is paused. Changes from other devices will not arrive.');
	});
});

describe('statusText', () => {
	it.each<[string, GateState, string]>([
		[
			'vault lock',
			locked(),
			'Sync Gate: editing is locked. The app opened. Sync Gate waits until Sync confirms that your notes are up to date.',
		],
		[
			'connecting and slow',
			locked({ reason: 'resume', connecting: true, slow: true }),
			'Sync Gate: editing is locked. The app came back from the background. Sync Gate waits until Sync confirms that your notes are up to date. Connecting to the Sync server. Sync is taking longer than usual.',
		],
		['note lock', NOTE_LOCK, 'Sync Gate: this note is locked. Sync is bringing in a change to this note from another device.'],
		['open after quiet', open('quiet'), 'Sync Gate: editing is open. Sync stayed up to date with no activity, so the lock ended.'],
		['offline', open('offline', 'offline'), 'Sync Gate: editing is open. There is no connection to the Sync server.'],
		['paused', open('paused', 'paused'), 'Sync Gate: editing is open. Sync is paused. Changes from other devices will not arrive.'],
	])('%s', (_label, state, expected) => {
		expect(statusText(state)).toBe(expected);
	});
});
