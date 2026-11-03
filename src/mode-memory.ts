/*
 * Remembers the view mode of each note pane before a lock switched it to Reading view.
 * Pure: no app API. The key is any value that names one pane.
 */

/**
 * Saved view modes, and the restores that still run.
 *
 * A mode change runs asynchronously. When a lock starts again while a restore still runs,
 * the pane still reports Reading view. The memory then keeps the mode of the running
 * restore, so the final unlock does not leave the note in Reading view.
 */
export class ModeMemory<K> {
	private readonly saved = new Map<K, string | undefined>();
	private readonly restoring = new Map<K, string>();

	/**
	 * Saves the mode to restore after the lock. Keeps a mode that is already saved.
	 *
	 * @param key The pane.
	 * @param currentMode The mode that the pane reports now. Ignored while a restore for the pane runs.
	 */
	remember(key: K, currentMode: string | undefined): void {
		if (this.saved.has(key)) {
			return;
		}
		this.saved.set(key, this.restoring.get(key) ?? currentMode);
	}

	/**
	 * Tells if a mode is saved for the pane.
	 */
	has(key: K): boolean {
		return this.saved.has(key);
	}

	/**
	 * Removes the saved mode of the pane and returns it.
	 * Returns undefined when no mode is saved, or when the saved mode was unknown.
	 */
	restoreTarget(key: K): string | undefined {
		const mode = this.saved.get(key);
		this.saved.delete(key);
		return mode;
	}

	/**
	 * Records that a restore to `mode` started for the pane.
	 */
	restoreStarted(key: K, mode: string): void {
		this.restoring.set(key, mode);
	}

	/**
	 * Records that the mode change for the pane ended.
	 */
	changeFinished(key: K): void {
		this.restoring.delete(key);
	}

	/**
	 * Removes all data for a pane that closed.
	 */
	forget(key: K): void {
		this.saved.delete(key);
		this.restoring.delete(key);
	}

	/**
	 * Panes that have a saved mode.
	 */
	keys(): K[] {
		return [...this.saved.keys()];
	}
}
