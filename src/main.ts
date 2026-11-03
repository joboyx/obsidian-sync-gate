import { apiVersion, normalizePath, Notice, Platform, Plugin } from 'obsidian';
import { describeShape, diagnosticFileName, DiagnosticLog } from './diagnostics';
import { EditorLock, StatusBarIndicator } from './editor-lock';
import { Gate, type GateEvent, type GateState } from './gate';
import { indicatorView, statusText } from './gate-view';
import { classifyLogEntry, FULLY_SYNCED_MESSAGE } from './log-entry';
import { SyncGateSettingTab } from './settings';
import { DEFAULT_SETTINGS, loadSettings, toGateCoverage, toGateOptions, type SyncGateSettings } from './settings-model';
import { findSyncInstance, latestLogEntry, SyncStatusReader, type SyncEventName, type SyncSnapshot } from './sync-status';

// Interval in milliseconds between Sync status polls. Events alone can be missed.
const POLL_INTERVAL_MS = 1000;

// On resume, mobile apps fire visibilitychange and focus close together. Count them as one resume.
const RESUME_DEBOUNCE_MS = 2000;

const DIAGNOSTICS_FOLDER = 'Sync Gate diagnostics';

/**
 * Sync Gate plugin. Feeds app, network and Sync events into the gate and shows the result.
 */
export default class SyncGatePlugin extends Plugin {
	/**
	 * Current settings.
	 */
	settings: SyncGateSettings = { ...DEFAULT_SETTINGS };

	private gate = new Gate(toGateOptions(DEFAULT_SETTINGS));
	private state: GateState = this.gate.state;
	private reader: SyncStatusReader | undefined;
	private editorLock: EditorLock | undefined;
	private statusBar: StatusBarIndicator | undefined;
	private readonly diagnostics = new DiagnosticLog();
	private lastSnapshotKey = '';
	private lastResumeAt = Number.NEGATIVE_INFINITY;

	/**
	 * Loads settings, sets up the UI and starts to watch Sync once the workspace is ready.
	 */
	async onload(): Promise<void> {
		await this.loadSettings();
		this.addSettingTab(new SyncGateSettingTab(this.app, this));
		this.addCommands();

		this.editorLock = new EditorLock(this.app, {
			coverage: () => toGateCoverage(this.settings),
			onEditAnyway: () => this.apply({ type: 'edit-anyway' }),
			onIndicatorClick: () => this.showStatus(),
			headerIndicator: Platform.isMobile,
		});
		if (!Platform.isMobile) {
			this.statusBar = new StatusBarIndicator(this.addStatusBarItem(), () => this.showStatus());
			this.statusBar.update(indicatorView(this.state));
		}

		this.registerEvent(this.app.workspace.on('file-open', () => this.editorLock?.refresh()));
		this.registerEvent(this.app.workspace.on('active-leaf-change', () => this.editorLock?.refresh()));
		this.registerEvent(this.app.workspace.on('layout-change', () => this.editorLock?.refresh()));

		this.app.workspace.onLayoutReady(() => this.start());
	}

	/**
	 * Removes the Sync event subscriptions, restores the note modes and removes the lock UI.
	 */
	onunload(): void {
		this.reader?.detach();
		this.editorLock?.destroy();
	}

	/**
	 * Saves the settings and applies them to the gate and the open notes.
	 */
	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		this.gate.setOptions(toGateOptions(this.settings));
		this.editorLock?.refresh();
	}

	private async loadSettings(): Promise<void> {
		this.settings = loadSettings(await this.loadData());
		this.gate.setOptions(toGateOptions(this.settings));
	}

	private addCommands(): void {
		this.addCommand({
			id: 'show-status',
			name: 'Show gate status',
			callback: () => this.showStatus(),
		});
		this.addCommand({
			id: 'edit-anyway',
			name: 'Unlock editing until next sync check',
			callback: () => this.apply({ type: 'edit-anyway' }),
		});
		this.addCommand({
			id: 'save-diagnostic-log',
			name: 'Save diagnostic log',
			checkCallback: (checking) => {
				if (!this.settings.debug) {
					return false;
				}
				if (!checking) {
					void this.saveDiagnosticLog();
				}
				return true;
			},
		});
	}

	private start(): void {
		this.reader = new SyncStatusReader(this.app, (event, entry) => this.onSyncEvent(event, entry));
		this.diagnostics.record(Date.now(), 'start', { platform: platformName(), isMobile: Platform.isMobile });
		this.pollSync();
		this.apply({ type: 'lock-trigger', reason: 'startup', at: Date.now() });
		this.registerInterval(window.setInterval(() => this.pollSync(), POLL_INTERVAL_MS));
		this.registerDomEvent(document, 'visibilitychange', () => {
			if (!document.hidden) {
				this.onResume('visible');
			}
		});
		if (Platform.isMobile) {
			this.registerDomEvent(window, 'focus', () => this.onResume('focus'));
		}
		this.registerDomEvent(window, 'online', () => this.pollSync());
		this.registerDomEvent(window, 'offline', () => this.pollSync());
	}

	private onResume(source: string): void {
		if (this.settings.lockOnResumeMobileOnly && !Platform.isMobile) {
			return;
		}
		const at = Date.now();
		if (at - this.lastResumeAt < RESUME_DEBOUNCE_MS) {
			return;
		}
		this.lastResumeAt = at;
		this.diagnostics.record(at, 'resume', { source });
		this.pollSync();
		this.apply({ type: 'lock-trigger', reason: 'resume', at });
	}

	private onSyncEvent(event: SyncEventName, entry: unknown): void {
		const at = Date.now();
		if (event === 'new-log' && entry !== undefined) {
			this.apply({ type: 'log-entry', entry, openPath: this.app.workspace.getActiveFile()?.path, at });
		}
		this.applySnapshot(at);
	}

	private pollSync(): void {
		const at = Date.now();
		this.applySnapshot(at);
		this.apply({ type: 'tick', at });
	}

	private applySnapshot(at: number): void {
		if (!this.reader) {
			return;
		}
		this.apply({ type: 'snapshot', snapshot: this.reader.read(), networkOnline: navigator.onLine, at });
	}

	private apply(event: GateEvent): void {
		const at = 'at' in event ? event.at : Date.now();
		this.recordInput(event, at);
		const state = this.gate.handle(event);
		if (sameState(state, this.state)) {
			return;
		}
		this.state = state;
		this.diagnostics.record(at, 'decision', { ...describeState(state), after: event.type });
		if (this.settings.debug) {
			console.debug('[sync-gate]', event.type, state);
		}
		this.editorLock?.update(state);
		this.statusBar?.update(indicatorView(state));
	}

	/**
	 * Records one gate input. Keeps Sync Gate's own mapped values only, never Sync text or note names.
	 */
	private recordInput(event: GateEvent, at: number): void {
		switch (event.type) {
			case 'snapshot': {
				const data = snapshotSummary(event.snapshot, event.networkOnline);
				const key = JSON.stringify(data);
				if (key !== this.lastSnapshotKey) {
					this.lastSnapshotKey = key;
					this.diagnostics.record(at, 'snapshot', data);
				}
				break;
			}
			case 'log-entry': {
				const { direction, path } = classifyLogEntry(event.entry);
				this.diagnostics.record(at, 'log-entry', {
					direction,
					namesFile: path !== undefined,
					isOpenNote: path !== undefined && path === event.openPath,
				});
				break;
			}
			case 'lock-trigger':
				this.diagnostics.record(at, 'lock-trigger', { reason: event.reason });
				break;
			case 'edit-anyway':
				this.diagnostics.record(at, 'edit-anyway');
				break;
			case 'tick':
				break;
		}
	}

	private showStatus(): void {
		new Notice(statusText(this.state));
	}

	private async saveDiagnosticLog(): Promise<void> {
		const now = new Date();
		const sync = findSyncInstance(this.app);
		this.diagnostics.record(now.getTime(), 'sync-shape', { present: sync !== undefined, members: describeShape(sync) });
		this.diagnostics.record(now.getTime(), 'sync-log-entry-shape', { members: describeShape(latestLogEntry(sync)) });
		const content = this.diagnostics.toMarkdown({
			savedAt: now.getTime(),
			platform: platformName(),
			pluginVersion: this.manifest.version,
			apiVersion,
		});
		const folder = normalizePath(DIAGNOSTICS_FOLDER);
		if (!this.app.vault.getAbstractFileByPath(folder)) {
			await this.app.vault.createFolder(folder);
		}
		const path = normalizePath(`${folder}/${diagnosticFileName(platformName(), now)}`);
		await this.app.vault.create(path, content);
		new Notice(`Sync Gate: saved the diagnostic log to ${path}`);
	}
}

function sameState(a: GateState, b: GateState): boolean {
	return (
		a.locked === b.locked &&
		a.scope === b.scope &&
		a.notePath === b.notePath &&
		a.banner === b.banner &&
		a.slow === b.slow &&
		a.connecting === b.connecting &&
		a.reason === b.reason
	);
}

function describeState(state: GateState): Record<string, unknown> {
	return {
		locked: state.locked,
		scope: state.scope,
		banner: state.banner,
		slow: state.slow,
		connecting: state.connecting,
		reason: state.reason,
	};
}

function snapshotSummary(snapshot: SyncSnapshot, networkOnline: boolean): Record<string, unknown> {
	return {
		state: snapshot.state,
		networkOnline,
		hasMessage: snapshot.lastMessage !== undefined,
		messageIsFullySynced: snapshot.lastMessage === FULLY_SYNCED_MESSAGE,
		hasLogEntry: snapshot.lastEntry !== undefined,
	};
}

function platformName(): string {
	if (Platform.isIosApp) {
		return 'ios';
	}
	if (Platform.isAndroidApp) {
		return 'android';
	}
	if (Platform.isMacOS) {
		return 'macos';
	}
	if (Platform.isWin) {
		return 'windows';
	}
	if (Platform.isLinux) {
		return 'linux';
	}
	return 'unknown';
}
