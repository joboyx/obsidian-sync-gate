/*
 * Settings data and conversions. Pure: no app API, so tests can import it.
 */

import type { GateCoverage, GateOptions } from './gate';

/**
 * Which notes Sync Gate protects.
 *
 * - `all-notes`: every note in the vault.
 * - `single-note`: only the note at `notePath`.
 */
export type ProtectedScope = 'all-notes' | 'single-note';

/**
 * Settings that the plugin stores in its data file.
 */
export interface SyncGateSettings {
	/**
	 * Which notes Sync Gate protects.
	 */
	scope: ProtectedScope;
	/**
	 * Vault-relative path of the protected note when `scope` is `single-note`.
	 */
	notePath: string;
	/**
	 * When true, only mobile devices lock when the app comes back from the background.
	 */
	lockOnResumeMobileOnly: boolean;
	/**
	 * Seconds without Sync progress before "Edit anyway" becomes prominent.
	 */
	slowAfterSeconds: number;
	/**
	 * Seconds that Sync must stay synced, with no activity, before a lock ends on its own.
	 */
	quietUnlockSeconds: number;
	/**
	 * Seconds that a lock waits for the Sync server connection while the network is up.
	 */
	connectGraceSeconds: number;
	/**
	 * When true, the plugin writes its lock decisions to the developer console
	 * and keeps a diagnostic log that the user can save.
	 */
	debug: boolean;
}

/**
 * Settings fields that hold a number of seconds.
 */
export type SecondsSetting = 'slowAfterSeconds' | 'quietUnlockSeconds' | 'connectGraceSeconds';

/**
 * Default settings for a new install.
 *
 * Resume locks only on mobile by default: desktop Sync keeps running in the background,
 * so desktop locks at startup, on reconnect and for incoming changes to the open note.
 */
export const DEFAULT_SETTINGS: SyncGateSettings = {
	scope: 'all-notes',
	notePath: '',
	lockOnResumeMobileOnly: true,
	slowAfterSeconds: 20,
	quietUnlockSeconds: 15,
	connectGraceSeconds: 10,
	debug: false,
};

const SECONDS_SETTINGS: readonly SecondsSetting[] = ['slowAfterSeconds', 'quietUnlockSeconds', 'connectGraceSeconds'];

/**
 * Parses a positive whole number from user input, for example "15".
 * Returns undefined for anything else, for example "0", "-3", "1.5" or "15s".
 */
export function parsePositiveInteger(value: string): number | undefined {
	const text = value.trim();
	if (!/^\d+$/.test(text)) {
		return undefined;
	}
	const number = Number.parseInt(text, 10);
	return Number.isSafeInteger(number) && number > 0 ? number : undefined;
}

/**
 * Merges stored settings over the defaults. Invalid stored values fall back to the default.
 */
export function loadSettings(stored: unknown): SyncGateSettings {
	const settings: SyncGateSettings = { ...DEFAULT_SETTINGS };
	if (typeof stored !== 'object' || stored === null) {
		return settings;
	}
	const data = stored as Partial<Record<keyof SyncGateSettings, unknown>>;
	if (data.scope === 'all-notes' || data.scope === 'single-note') {
		settings.scope = data.scope;
	}
	if (typeof data.notePath === 'string') {
		settings.notePath = data.notePath;
	}
	if (typeof data.lockOnResumeMobileOnly === 'boolean') {
		settings.lockOnResumeMobileOnly = data.lockOnResumeMobileOnly;
	}
	if (typeof data.debug === 'boolean') {
		settings.debug = data.debug;
	}
	for (const key of SECONDS_SETTINGS) {
		const value = data[key];
		if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) {
			settings[key] = value;
		}
	}
	return settings;
}

/**
 * Converts the settings to the note coverage that the gate uses.
 */
export function toGateCoverage(settings: SyncGateSettings): GateCoverage {
	return settings.scope === 'single-note' ? { kind: 'single-note', notePath: settings.notePath } : { kind: 'all-notes' };
}

/**
 * Converts the settings to the gate options, in milliseconds.
 */
export function toGateOptions(settings: SyncGateSettings): GateOptions {
	return {
		slowAfterMs: settings.slowAfterSeconds * 1000,
		quietUnlockMs: settings.quietUnlockSeconds * 1000,
		connectGraceMs: settings.connectGraceSeconds * 1000,
	};
}
