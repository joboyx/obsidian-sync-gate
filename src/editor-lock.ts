/*
 * Applies the gate state to the open notes: Reading view, lock card, banner and,
 * on mobile, a note header icon. All decisions come from gate.ts and gate-view.ts.
 *
 * The lock switches a note to Reading view and covers it with a card that takes
 * all pointer input (for example task checkboxes). It does not filter editor
 * transactions, because that would also block Sync's own updates to the open note.
 */

import { App, MarkdownView, setIcon, setTooltip, type WorkspaceLeaf } from 'obsidian';
import { isNoteCovered, isNoteLocked, type GateCoverage, type GateState } from './gate';
import { bannerView, EDIT_ANYWAY_LABEL, indicatorView, overlayView, type BannerView, type IndicatorView, type OverlayView } from './gate-view';
import { ModeMemory } from './mode-memory';

const READING_MODE = 'preview';

// Marks the elements that Sync Gate made inert, so an unlock does not change other inert elements.
const INERT_MARKER = 'data-sync-gate-inert';

/**
 * Callbacks and options for {@link EditorLock}.
 */
export interface EditorLockOptions {
	/**
	 * Gets the notes that the user protects.
	 */
	coverage: () => GateCoverage;
	/**
	 * Called when the user selects "Edit anyway".
	 */
	onEditAnyway: () => void;
	/**
	 * Called when the user selects the note header icon.
	 */
	onIndicatorClick: () => void;
	/**
	 * True to show the gate state as a note header icon. Used on mobile, where there is no status bar.
	 */
	headerIndicator: boolean;
}

/**
 * Locks and unlocks the open Markdown notes to match the gate state.
 */
export class EditorLock {
	private state: GateState | undefined;
	private readonly modes = new ModeMemory<WorkspaceLeaf>();
	private readonly pendingModes = new Set<WorkspaceLeaf>();
	private readonly hosts = new Set<HTMLElement>();
	private readonly rendered = new WeakMap<HTMLElement, string>();
	private readonly actions = new Map<MarkdownView, { el: HTMLElement; key: string }>();

	/**
	 * @param app The app.
	 * @param options Callbacks and options.
	 */
	constructor(
		private readonly app: App,
		private readonly options: EditorLockOptions,
	) {}

	/**
	 * Applies a new gate state to all open notes.
	 */
	update(state: GateState): void {
		this.state = state;
		this.refresh();
	}

	/**
	 * Applies the current gate state again. Call it when notes open, close or change mode.
	 */
	refresh(): void {
		const state = this.state;
		if (!state) {
			return;
		}
		const coverage = this.options.coverage();
		const leaves = new Set<WorkspaceLeaf>();
		const views = new Set<MarkdownView>();
		for (const leaf of this.app.workspace.getLeavesOfType('markdown')) {
			const view = leaf.view;
			if (!(view instanceof MarkdownView)) {
				continue;
			}
			leaves.add(leaf);
			views.add(view);
			const path = view.file?.path;
			const locked = isNoteLocked(state, path, coverage);
			if (locked) {
				this.showReadingView(leaf);
			} else {
				this.restoreMode(leaf);
			}
			this.renderOverlay(view.contentEl, locked ? overlayView(state) : undefined);
			this.renderBanner(view.contentEl, !locked && isNoteCovered(path, coverage) ? bannerView(state.banner) : undefined);
			if (this.options.headerIndicator) {
				this.renderHeaderAction(view, indicatorView(state));
			}
		}
		this.forgetClosed(leaves, views);
	}

	/**
	 * Restores the previous mode of every locked note and removes all plugin elements.
	 */
	destroy(): void {
		this.state = undefined;
		this.pendingModes.clear();
		for (const leaf of this.modes.keys()) {
			this.restoreMode(leaf);
		}
		for (const host of this.hosts) {
			this.renderOverlay(host, undefined);
			this.renderBanner(host, undefined);
		}
		for (const { el } of this.actions.values()) {
			el.remove();
		}
		this.hosts.clear();
		this.actions.clear();
	}

	private showReadingView(leaf: WorkspaceLeaf): void {
		const mode = currentMode(leaf);
		this.modes.remember(leaf, mode);
		if (mode !== READING_MODE) {
			// While another mode change runs, setMode() skips. Its completion applies the lock again.
			this.setMode(leaf, READING_MODE);
		}
	}

	private restoreMode(leaf: WorkspaceLeaf): void {
		if (!this.modes.has(leaf) || this.pendingModes.has(leaf)) {
			// A mode change is still running. Its completion restores the mode.
			return;
		}
		const saved = this.modes.restoreTarget(leaf);
		if (saved !== undefined && currentMode(leaf) !== saved) {
			this.modes.restoreStarted(leaf, saved);
			this.setMode(leaf, saved);
		}
	}

	private setMode(leaf: WorkspaceLeaf, mode: string): void {
		if (this.pendingModes.has(leaf)) {
			return;
		}
		const viewState = leaf.getViewState();
		this.pendingModes.add(leaf);
		void leaf.setViewState({ ...viewState, state: { ...viewState.state, mode } }).finally(() => {
			this.pendingModes.delete(leaf);
			this.modes.changeFinished(leaf);
			// The gate can lock or open while the mode change runs, and the change above
			// skipped the leaf then. Apply the current gate state to the leaf now.
			if (this.isLeafLocked(leaf)) {
				this.showReadingView(leaf);
			} else {
				this.restoreMode(leaf);
			}
		});
	}

	private isLeafLocked(leaf: WorkspaceLeaf): boolean {
		const view = leaf.view;
		if (!this.state || !(view instanceof MarkdownView)) {
			return false;
		}
		return isNoteLocked(this.state, view.file?.path, this.options.coverage());
	}

	private renderOverlay(host: HTMLElement, view: OverlayView | undefined): void {
		const existing = childWithClass(host, 'sync-gate-overlay');
		setContentInert(host, view !== undefined);
		if (!view) {
			existing?.remove();
			this.updateHost(host);
			return;
		}
		const key = JSON.stringify(view);
		if (existing && this.rendered.get(existing) === key) {
			return;
		}
		existing?.remove();
		this.hosts.add(host);
		host.addClass('sync-gate-host');
		const overlay = host.createDiv({ cls: 'sync-gate-overlay' });
		const card = overlay.createDiv({ cls: 'sync-gate-card', attr: { role: 'status', 'aria-live': 'polite' } });
		const icon = card.createDiv({ cls: 'sync-gate-card-icon' });
		icon.toggleClass('is-spinning', view.spin);
		setIcon(icon, view.icon);
		card.createDiv({ cls: 'sync-gate-card-title', text: view.title });
		card.createDiv({ cls: 'sync-gate-card-text', text: view.text });
		const button = card.createEl('button', { text: EDIT_ANYWAY_LABEL });
		button.toggleClass('mod-cta', view.prominentEditAnyway);
		button.addEventListener('click', (event) => {
			event.preventDefault();
			event.stopPropagation();
			this.options.onEditAnyway();
		});
		this.rendered.set(overlay, key);
	}

	private renderBanner(host: HTMLElement, view: BannerView | undefined): void {
		const existing = childWithClass(host, 'sync-gate-banner');
		if (!view) {
			existing?.remove();
			this.updateHost(host);
			return;
		}
		const key = JSON.stringify(view);
		if (existing && this.rendered.get(existing) === key) {
			return;
		}
		existing?.remove();
		this.hosts.add(host);
		host.addClasses(['sync-gate-host', 'sync-gate-has-banner']);
		const banner = host.createDiv({ cls: 'sync-gate-banner', attr: { role: 'status' } });
		setIcon(banner.createSpan({ cls: 'sync-gate-banner-icon' }), view.icon);
		banner.createSpan({ cls: 'sync-gate-banner-text', text: view.text });
		host.prepend(banner);
		this.rendered.set(banner, key);
	}

	private updateHost(host: HTMLElement): void {
		const hasOverlay = childWithClass(host, 'sync-gate-overlay') !== undefined;
		const hasBanner = childWithClass(host, 'sync-gate-banner') !== undefined;
		host.toggleClass('sync-gate-has-banner', hasBanner);
		if (!hasOverlay && !hasBanner) {
			host.removeClass('sync-gate-host');
			this.hosts.delete(host);
		}
	}

	private renderHeaderAction(view: MarkdownView, indicator: IndicatorView): void {
		const existing = this.actions.get(view);
		if (indicator.mode === 'open') {
			existing?.el.remove();
			this.actions.delete(view);
			return;
		}
		const key = `${indicator.icon}|${indicator.tooltip}`;
		if (existing?.key === key) {
			return;
		}
		if (existing) {
			setIcon(existing.el, indicator.icon);
			setTooltip(existing.el, indicator.tooltip);
			existing.el.setAttribute('aria-label', indicator.tooltip);
			existing.key = key;
			return;
		}
		const el = view.addAction(indicator.icon, indicator.tooltip, () => this.options.onIndicatorClick());
		el.addClass('sync-gate-header-action');
		this.actions.set(view, { el, key });
	}

	private forgetClosed(leaves: Set<WorkspaceLeaf>, views: Set<MarkdownView>): void {
		for (const leaf of this.modes.keys()) {
			if (!leaves.has(leaf)) {
				this.modes.forget(leaf);
			}
		}
		for (const [view, action] of this.actions) {
			if (!views.has(view)) {
				action.el.remove();
				this.actions.delete(view);
			}
		}
		for (const host of this.hosts) {
			if (!host.isConnected) {
				this.hosts.delete(host);
			}
		}
	}
}

/**
 * Status bar item that shows the gate state on desktop.
 */
export class StatusBarIndicator {
	private readonly iconEl: HTMLElement;
	private readonly labelEl: HTMLElement;
	private key = '';

	/**
	 * @param el The status bar item, from `addStatusBarItem()`.
	 * @param onClick Called when the user selects the item.
	 */
	constructor(
		private readonly el: HTMLElement,
		onClick: () => void,
	) {
		el.addClasses(['sync-gate-status', 'mod-clickable']);
		el.setAttribute('role', 'button');
		this.iconEl = el.createSpan({ cls: 'sync-gate-status-icon' });
		this.labelEl = el.createSpan({ cls: 'sync-gate-status-label' });
		el.addEventListener('click', onClick);
	}

	/**
	 * Shows a new indicator state.
	 */
	update(indicator: IndicatorView): void {
		const key = `${indicator.icon}|${indicator.label}|${indicator.tooltip}`;
		if (key === this.key) {
			return;
		}
		this.key = key;
		this.el.dataset.syncGateMode = indicator.mode;
		setIcon(this.iconEl, indicator.icon);
		this.labelEl.setText(indicator.label);
		this.labelEl.toggleClass('sync-gate-hidden', indicator.label === '');
		setTooltip(this.el, indicator.tooltip, { placement: 'top' });
		this.el.setAttribute('aria-label', indicator.tooltip);
	}
}

/**
 * Makes the note content behind the lock card inert, or makes it usable again.
 * The card blocks pointer input only. `inert` also blocks keyboard focus, for example
 * Tab to a property or a link. The card and the banner stay usable.
 * Only elements that this function made inert are changed back.
 */
function setContentInert(host: HTMLElement, inert: boolean): void {
	for (const child of Array.from(host.children)) {
		if (child.classList.contains('sync-gate-overlay') || child.classList.contains('sync-gate-banner')) {
			continue;
		}
		if (inert && !child.hasAttribute('inert')) {
			child.setAttribute('inert', '');
			child.setAttribute(INERT_MARKER, '');
		} else if (!inert && child.hasAttribute(INERT_MARKER)) {
			child.removeAttribute('inert');
			child.removeAttribute(INERT_MARKER);
		}
	}
}

function currentMode(leaf: WorkspaceLeaf): string | undefined {
	const mode: unknown = leaf.getViewState().state?.mode;
	return typeof mode === 'string' ? mode : undefined;
}

function childWithClass(host: HTMLElement, cls: string): HTMLElement | undefined {
	// Checks classes, not instanceof: notes in a pop-out window use that window's HTMLElement.
	for (const child of Array.from(host.children)) {
		if (child.classList.contains(cls)) {
			return child as HTMLElement;
		}
	}
	return undefined;
}
