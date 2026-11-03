import { App, PluginSettingTab, Setting } from 'obsidian';
import type SyncGatePlugin from './main';
import { DEFAULT_SETTINGS, parsePositiveInteger, type SecondsSetting } from './settings-model';

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
			.setDesc(
				'Lock when the app comes back from the background only on phones and tablets. Desktop still locks at startup, when the network returns and when a change for the open note arrives.',
			)
			.addToggle((toggle) =>
				toggle.setValue(settings.lockOnResumeMobileOnly).onChange(async (value) => {
					settings.lockOnResumeMobileOnly = value;
					await this.plugin.saveSettings();
				}),
			);

		this.addSecondsSetting(
			'slowAfterSeconds',
			'Slow sync after (seconds)',
			'Time without sync progress before the button to override the lock becomes prominent.',
		);
		this.addSecondsSetting(
			'quietUnlockSeconds',
			'Unlock when sync is quiet (seconds)',
			'Time that sync must stay up to date, with no activity, before the lock ends on its own.',
		);
		this.addSecondsSetting(
			'connectGraceSeconds',
			'Wait for connection (seconds)',
			'Time that the lock waits for the sync server while the network is up. After this time, editing opens with an offline notice.',
		);

		new Setting(containerEl)
			.setName('Show status icon on mobile when editing is open')
			.setDesc('Off: the icon shows only while editing is blocked, offline or paused.')
			.addToggle((toggle) =>
				toggle.setValue(settings.showMobileStatusWhenOpen).onChange(async (value) => {
					settings.showMobileStatusWhenOpen = value;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName('Debug logging')
			.setDesc('Write lock decisions to the developer console and keep a diagnostic log that you can save to a note.')
			.addToggle((toggle) =>
				toggle.setValue(settings.debug).onChange(async (value) => {
					settings.debug = value;
					await this.plugin.saveSettings();
				}),
			);
	}

	private addSecondsSetting(key: SecondsSetting, name: string, description: string): void {
		const settings = this.plugin.settings;
		new Setting(this.containerEl)
			.setName(name)
			.setDesc(description)
			.addText((text) =>
				text
					.setPlaceholder(String(DEFAULT_SETTINGS[key]))
					.setValue(String(settings[key]))
					.onChange(async (value) => {
						const seconds = parsePositiveInteger(value);
						if (seconds !== undefined) {
							settings[key] = seconds;
							await this.plugin.saveSettings();
						}
					}),
			);
	}
}
