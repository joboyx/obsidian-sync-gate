import { App, PluginSettingTab, Setting } from 'obsidian';
import type { GateCoverage } from './gate';
import type SyncGatePlugin from './main';

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
	 * When true, the plugin writes its lock decisions to the developer console.
	 */
	debug: boolean;
}

/**
 * Default settings for a new install.
 */
export const DEFAULT_SETTINGS: SyncGateSettings = {
	scope: 'all-notes',
	notePath: '',
	lockOnResumeMobileOnly: false,
	slowAfterSeconds: 20,
	debug: false,
};

/**
 * Converts the settings to the note coverage that the gate uses.
 */
export function toGateCoverage(settings: SyncGateSettings): GateCoverage {
	return settings.scope === 'single-note' ? { kind: 'single-note', notePath: settings.notePath } : { kind: 'all-notes' };
}

/**
 * Settings tab for Sync Gate.
 *
 * Uses display() because the declarative settings API needs app version 1.13.0,
 * and the plugin supports versions from 1.5.0.
 */
export class SyncGateSettingTab extends PluginSettingTab {
	/**
	 * @param app The app.
	 * @param plugin The plugin that owns the settings.
	 */
	constructor(
		app: App,
		private readonly plugin: SyncGatePlugin,
	) {
		super(app, plugin);
	}

	/**
	 * Renders the settings.
	 */
	display(): void {
		const { containerEl } = this;
		const settings = this.plugin.settings;
		containerEl.empty();

		new Setting(containerEl)
			.setName('Protected notes')
			.setDesc('Lock every note, or only one note that you edit on more than one device.')
			.addDropdown((dropdown) =>
				dropdown
					.addOption('all-notes', 'All notes')
					.addOption('single-note', 'One note')
					.setValue(settings.scope)
					.onChange(async (value) => {
						settings.scope = value === 'single-note' ? 'single-note' : 'all-notes';
						await this.plugin.saveSettings();
						this.display();
					}),
			);

		if (settings.scope === 'single-note') {
			new Setting(containerEl)
				.setName('Note path')
				.setDesc('Vault-relative path of the protected note.')
				.addText((text) =>
					text
						.setPlaceholder('Inbox.md')
						.setValue(settings.notePath)
						.onChange(async (value) => {
							settings.notePath = value.trim();
							await this.plugin.saveSettings();
						}),
				);
		}

		new Setting(containerEl)
			.setName('Lock on resume on mobile only')
			.setDesc('Lock when the app comes back from the background only on phones and tablets.')
			.addToggle((toggle) =>
				toggle.setValue(settings.lockOnResumeMobileOnly).onChange(async (value) => {
					settings.lockOnResumeMobileOnly = value;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName('Slow sync after (seconds)')
			.setDesc('Time without sync progress before the button to override the lock becomes prominent.')
			.addText((text) =>
				text
					.setPlaceholder(String(DEFAULT_SETTINGS.slowAfterSeconds))
					.setValue(String(settings.slowAfterSeconds))
					.onChange(async (value) => {
						const seconds = Number.parseInt(value, 10);
						if (Number.isFinite(seconds) && seconds > 0) {
							settings.slowAfterSeconds = seconds;
							await this.plugin.saveSettings();
						}
					}),
			);

		new Setting(containerEl)
			.setName('Debug logging')
			.setDesc('Write lock decisions to the developer console.')
			.addToggle((toggle) =>
				toggle.setValue(settings.debug).onChange(async (value) => {
					settings.debug = value;
					await this.plugin.saveSettings();
				}),
			);
	}
}
