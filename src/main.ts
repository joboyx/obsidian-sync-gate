import { Platform, Plugin } from 'obsidian';
import { Gate, type GateEvent, type GateState } from './gate';
import { DEFAULT_SETTINGS, SyncGateSettingTab, type SyncGateSettings } from './settings';
import { SyncStatusReader, type SyncEventName } from './sync-status';

// Interval in milliseconds between Sync status polls. Events alone can be missed.
const POLL_INTERVAL_MS = 1000;

/**
 * Sync Gate plugin. Feeds app and Sync events into the gate and keeps the latest gate state.
 */
export default class SyncGatePlugin extends Plugin {
	/**
	 * Current settings.
	 */
	settings: SyncGateSettings = { ...DEFAULT_SETTINGS };

	private gate = new Gate({ slowAfterMs: DEFAULT_SETTINGS.slowAfterSeconds * 1000 });
	private reader: SyncStatusReader | undefined;
	private lastState: GateState | undefined;

	/**
	 * Loads settings and starts to watch Sync once the workspace is ready.
	 */
	async onload(): Promise<void> {
		await this.loadSettings();
		this.addSettingTab(new SyncGateSettingTab(this.app, this));

		this.addCommand({
			id: 'edit-anyway',
			name: 'Edit anyway',
			callback: () => this.apply({ type: 'edit-anyway' }),
		});

		this.app.workspace.onLayoutReady(() => {
			this.reader = new SyncStatusReader(this.app, (event, entry) => this.onSyncEvent(event, entry));
			this.apply({ type: 'lock-trigger', reason: 'startup', at: Date.now() });
			this.pollSync();
			this.registerInterval(window.setInterval(() => this.pollSync(), POLL_INTERVAL_MS));
			this.registerDomEvent(document, 'visibilitychange', () => {
				if (!document.hidden) {
					this.onResume();
				}
			});
		});
	}

	/**
	 * Removes the Sync event subscriptions.
	 */
	onunload(): void {
		this.reader?.detach();
	}

	/**
	 * Saves the settings and applies them to the gate.
	 */
	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		this.gate.setSlowAfterMs(this.settings.slowAfterSeconds * 1000);
	}

	private async loadSettings(): Promise<void> {
		const stored = (await this.loadData()) as Partial<SyncGateSettings> | null;
		this.settings = { ...DEFAULT_SETTINGS, ...stored };
		this.gate.setSlowAfterMs(this.settings.slowAfterSeconds * 1000);
	}

	private onResume(): void {
		if (this.settings.lockOnResumeMobileOnly && !Platform.isMobile) {
			return;
		}
		this.apply({ type: 'lock-trigger', reason: 'resume', at: Date.now() });
		this.pollSync();
	}

	private onSyncEvent(event: SyncEventName, entry: unknown): void {
		const at = Date.now();
		if (event === 'new-log' && entry !== undefined) {
			this.apply({ type: 'log-entry', entry, openPath: this.app.workspace.getActiveFile()?.path, at });
		}
		if (this.reader) {
			this.apply({ type: 'snapshot', snapshot: this.reader.read(), at });
		}
	}

	private pollSync(): void {
		if (!this.reader) {
			return;
		}
		const at = Date.now();
		this.apply({ type: 'snapshot', snapshot: this.reader.read(), at });
		this.apply({ type: 'tick', at });
	}

	private apply(event: GateEvent): void {
		const state = this.gate.handle(event);
		if (this.settings.debug && !sameState(state, this.lastState)) {
			console.debug('[sync-gate]', event.type, state);
		}
		this.lastState = state;
	}
}

function sameState(a: GateState, b: GateState | undefined): boolean {
	return (
		b !== undefined &&
		a.locked === b.locked &&
		a.scope === b.scope &&
		a.notePath === b.notePath &&
		a.banner === b.banner &&
		a.slow === b.slow
	);
}
