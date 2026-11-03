/*
 * Maps the gate state to the text and icons that the UI shows. Pure: no app API.
 * Icon names are from the Lucide set that the app bundles.
 */

import type { GateBanner, GateReason, GateState } from './gate';

/**
 * Overall gate status, as the state indicator shows it.
 */
export type IndicatorMode = 'open' | 'locked' | 'offline' | 'paused' | 'unavailable';

/**
 * What the state indicator (status bar item or note header icon) shows.
 */
export interface IndicatorView {
	/**
	 * Overall gate status.
	 */
	mode: IndicatorMode;
	/**
	 * Icon name.
	 */
	icon: string;
	/**
	 * Short text next to the icon. Empty when the icon is enough.
	 */
	label: string;
	/**
	 * Tooltip and accessible name.
	 */
	tooltip: string;
}

/**
 * What the lock card on top of a locked note shows.
 */
export interface OverlayView {
	/**
	 * Icon name.
	 */
	icon: string;
	/**
	 * True when the icon shows ongoing work and can spin.
	 */
	spin: boolean;
	/**
	 * Card title.
	 */
	title: string;
	/**
	 * One line of text under the title.
	 */
	text: string;
	/**
	 * True when "Edit anyway" is the prominent button.
	 */
	prominentEditAnyway: boolean;
}

/**
 * What a banner at the top of a note shows.
 */
export interface BannerView {
	/**
	 * Icon name.
	 */
	icon: string;
	/**
	 * Banner text.
	 */
	text: string;
}

/**
 * Text of the button that ends the current lock.
 */
export const EDIT_ANYWAY_LABEL = 'Edit anyway';

const BANNERS: Record<Exclude<GateBanner, 'none'>, BannerView> = {
	offline: { icon: 'wifi-off', text: 'You are offline. You can edit. Sync sends your changes when the connection returns.' },
	paused: { icon: 'pause-circle', text: 'Sync is paused. Changes from other devices will not arrive.' },
	unavailable: { icon: 'alert-triangle', text: 'Sync Gate cannot read the Sync status. Editing is not locked.' },
};

const REASONS: Record<GateReason, string> = {
	startup: 'The app opened. Sync Gate waits until Sync confirms that your notes are up to date.',
	resume: 'The app came back from the background. Sync Gate waits until Sync confirms that your notes are up to date.',
	reconnect: 'The connection came back. Sync Gate waits until Sync confirms that your notes are up to date.',
	'incoming-change': 'Sync is bringing in a change to this note from another device.',
	idle: 'No lock is active.',
	'fully-synced': 'Sync confirmed that your notes are up to date.',
	'download-complete': 'Sync finished bringing in the change to the note.',
	quiet: 'Sync stayed up to date with no activity, so the lock ended.',
	'edit-anyway': 'You chose to edit before Sync finished.',
	offline: 'There is no connection to the Sync server.',
	paused: 'Sync is paused. Changes from other devices will not arrive.',
	unavailable: 'Sync Gate cannot read the Sync status.',
};

/**
 * Gets the overall gate status.
 */
export function indicatorMode(state: GateState): IndicatorMode {
	if (state.locked) {
		return 'locked';
	}
	return state.banner === 'none' ? 'open' : state.banner;
}

/**
 * Gets what the state indicator shows for a gate state.
 */
export function indicatorView(state: GateState): IndicatorView {
	const mode = indicatorMode(state);
	switch (mode) {
		case 'open':
			return { mode, icon: 'unlock', label: '', tooltip: 'Sync Gate: editing is open' };
		case 'locked':
			return {
				mode,
				icon: state.slow ? 'alert-triangle' : 'lock',
				label: 'Locked',
				tooltip: state.scope === 'note' ? 'Sync Gate: this note is updating from another device' : 'Sync Gate: waiting for Sync',
			};
		case 'offline':
			return { mode, icon: 'wifi-off', label: 'Offline', tooltip: 'Sync Gate: offline, editing is open' };
		case 'paused':
			return { mode, icon: 'pause-circle', label: 'Paused', tooltip: 'Sync Gate: Sync is paused, editing is open' };
		case 'unavailable':
			return { mode, icon: 'alert-triangle', label: 'Unavailable', tooltip: 'Sync Gate: Sync status is unavailable, editing is open' };
	}
}

/**
 * Gets what the lock card shows, or undefined when the gate is open.
 */
export function overlayView(state: GateState): OverlayView | undefined {
	if (!state.locked) {
		return undefined;
	}
	if (state.slow) {
		return {
			icon: 'alert-triangle',
			spin: false,
			title: 'Sync is taking longer than usual',
			text: 'You can wait, or edit now and let Sync merge the changes later.',
			prominentEditAnyway: true,
		};
	}
	if (state.scope === 'note') {
		return {
			icon: 'refresh-cw',
			spin: true,
			title: 'Updating from another device',
			text: 'Sync is bringing in a newer version of this note.',
			prominentEditAnyway: false,
		};
	}
	return {
		icon: 'refresh-cw',
		spin: true,
		title: 'Waiting for Sync',
		text: state.connecting
			? 'Connecting to the Sync server. Editing opens when your notes are up to date.'
			: 'Getting changes from your other devices. Editing opens when Sync finishes.',
		prominentEditAnyway: false,
	};
}

/**
 * Gets what the banner shows, or undefined when there is no banner.
 */
export function bannerView(banner: GateBanner): BannerView | undefined {
	return banner === 'none' ? undefined : BANNERS[banner];
}

/**
 * Gets a short description of the gate state and its reason, for a notice.
 */
export function statusText(state: GateState): string {
	const reason = REASONS[state.reason];
	if (!state.locked) {
		return `Sync Gate: editing is open. ${reason}`;
	}
	const what = state.scope === 'note' ? 'this note is locked' : 'editing is locked';
	const slow = state.slow ? ' Sync is taking longer than usual.' : '';
	const connecting = state.connecting ? ' Connecting to the Sync server.' : '';
	return `Sync Gate: ${what}. ${reason}${connecting}${slow}`;
}
