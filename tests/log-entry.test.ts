import { describe, expect, it } from 'vitest';
import { classifyLogEntry, isFullySyncedEntry, logEntryText } from '../src/log-entry';

describe('classifyLogEntry', () => {
	it.each([
		['Uploading file Notes/Inbox.md', { direction: 'upload', path: 'Notes/Inbox.md' }],
		['Downloading file Notes/Inbox.md', { direction: 'download', path: 'Notes/Inbox.md' }],
		['Merging conflicted file Notes/Inbox.md', { direction: 'merge', path: 'Notes/Inbox.md' }],
		['Deleting file Old note.md', { direction: 'delete', path: 'Old note.md' }],
		['Deleting remote file Old note.md', { direction: 'delete', path: 'Old note.md' }],
		['Upload complete', { direction: 'upload' }],
		['Download complete', { direction: 'download' }],
		['Fully synced', { direction: 'other' }],
		['Connecting to server', { direction: 'other' }],
		['Detecting changes', { direction: 'other' }],
		['Indexing', { direction: 'other' }],
		['Disconnected from server', { direction: 'other' }],
		['Unable to connect to server', { direction: 'other' }],
	])('classifies "%s"', (info, expected) => {
		expect(classifyLogEntry({ info })).toEqual(expected);
	});

	it.each([
		['path with spaces', 'Downloading file Daily notes/2026-01-01 plan.md', 'Daily notes/2026-01-01 plan.md'],
		['leading slash', 'Downloading file /Inbox.md', 'Inbox.md'],
		['surrounding spaces', '  Downloading file Inbox.md  ', 'Inbox.md'],
		['lower case message', 'downloading file Inbox.md', 'Inbox.md'],
	])('keeps the path for a %s', (_label, info, path) => {
		expect(classifyLogEntry({ info })).toEqual({ direction: 'download', path });
	});

	it('accepts a plain string entry', () => {
		expect(classifyLogEntry('Uploading file Inbox.md')).toEqual({ direction: 'upload', path: 'Inbox.md' });
	});

	it.each([
		['undefined', undefined],
		['null', null],
		['a number', 42],
		['an object without info', { message: 'Downloading file Inbox.md' }],
		['a non-string info', { info: 7 }],
		['a file message without a path', { info: 'Downloading file ' }],
	])('returns other for %s', (_label, entry) => {
		expect(classifyLogEntry(entry)).toEqual({ direction: 'other' });
	});
});

describe('isFullySyncedEntry', () => {
	it.each([
		[{ info: 'Fully synced' }, true],
		[{ info: 'fully synced ' }, true],
		['Fully synced', true],
		[{ info: 'Download complete' }, false],
		[{ info: 'Not fully synced' }, false],
		[undefined, false],
	])('returns the expected result for %j', (entry, expected) => {
		expect(isFullySyncedEntry(entry)).toBe(expected);
	});
});

describe('logEntryText', () => {
	it('returns an empty string for an unknown shape', () => {
		expect(logEntryText({ text: 'Fully synced' })).toBe('');
	});
});
