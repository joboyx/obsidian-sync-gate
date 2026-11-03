import { describe, expect, it } from 'vitest';
import { ModeMemory } from '../src/mode-memory';

describe('ModeMemory', () => {
	it('restores the mode from before the lock', () => {
		const memory = new ModeMemory<string>();
		memory.remember('pane', 'source');
		expect(memory.has('pane')).toBe(true);
		expect(memory.restoreTarget('pane')).toBe('source');
		expect(memory.has('pane')).toBe(false);
	});

	it('keeps the first saved mode when the lock applies again', () => {
		const memory = new ModeMemory<string>();
		memory.remember('pane', 'source');
		memory.remember('pane', 'preview');
		expect(memory.restoreTarget('pane')).toBe('source');
	});

	it('saves the mode of a running restore, not Reading view, when the lock starts again', () => {
		const memory = new ModeMemory<string>();
		memory.remember('pane', 'source');
		const target = memory.restoreTarget('pane');
		memory.restoreStarted('pane', 'source');
		memory.remember('pane', 'preview');
		expect(target).toBe('source');
		expect(memory.restoreTarget('pane')).toBe('source');
	});

	it('saves the current mode after the restore finished', () => {
		const memory = new ModeMemory<string>();
		memory.restoreStarted('pane', 'source');
		memory.changeFinished('pane');
		memory.remember('pane', 'preview');
		expect(memory.restoreTarget('pane')).toBe('preview');
	});

	it('returns undefined for a pane with no saved mode', () => {
		expect(new ModeMemory<string>().restoreTarget('pane')).toBeUndefined();
	});

	it('forgets a closed pane, including a running restore', () => {
		const memory = new ModeMemory<string>();
		memory.remember('pane', 'source');
		memory.restoreStarted('pane', 'source');
		memory.forget('pane');
		expect(memory.keys()).toEqual([]);
		memory.remember('pane', 'preview');
		expect(memory.restoreTarget('pane')).toBe('preview');
	});

	it('lists the panes with a saved mode', () => {
		const memory = new ModeMemory<string>();
		memory.remember('a', 'source');
		memory.remember('b', undefined);
		expect(memory.keys()).toEqual(['a', 'b']);
	});
});
