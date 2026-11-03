/**
 * Direction of one Sync log entry, seen from this device.
 *
 * - `upload`: this device sends a change to the server.
 * - `download`: this device gets a change from another device.
 * - `merge`: Sync merges a conflicted file on this device.
 * - `delete`: Sync deletes a file.
 * - `other`: any other message (connection state, indexing, "Fully synced").
 */
export type LogDirection = 'upload' | 'download' | 'merge' | 'delete' | 'other';

/**
 * Result of {@link classifyLogEntry}.
 */
export interface ClassifiedLogEntry {
	/**
	 * What the entry reports.
	 */
	direction: LogDirection;
	/**
	 * Vault-relative path of the file, when the message names one.
	 */
	path?: string;
}

/**
 * Message text that Sync shows when the whole vault is up to date.
 */
export const FULLY_SYNCED_MESSAGE = 'Fully synced';

/**
 * Message shapes that name a file. The Sync log format is not documented,
 * so match case-insensitively and keep everything after the prefix as the path.
 */
const FILE_PATTERNS: ReadonlyArray<{ pattern: RegExp; direction: LogDirection }> = [
	{ pattern: /^uploading file\s+(.+)$/i, direction: 'upload' },
	{ pattern: /^downloading file\s+(.+)$/i, direction: 'download' },
	{ pattern: /^merging conflicted file\s+(.+)$/i, direction: 'merge' },
	{ pattern: /^deleting (?:remote |local )?file\s+(.+)$/i, direction: 'delete' },
];

/**
 * Message shapes that end a transfer but do not name a file.
 */
const COMPLETE_PATTERNS: ReadonlyArray<{ pattern: RegExp; direction: LogDirection }> = [
	{ pattern: /^upload complete\b/i, direction: 'upload' },
	{ pattern: /^download complete\b/i, direction: 'download' },
];

/**
 * Gets the message text of a raw Sync log entry.
 *
 * Accepts a plain string or an object with a string `info` field.
 * Returns an empty string for any other shape.
 */
export function logEntryText(entry: unknown): string {
	if (typeof entry === 'string') {
		return entry.trim();
	}
	if (typeof entry === 'object' && entry !== null) {
		const info = (entry as { info?: unknown }).info;
		if (typeof info === 'string') {
			return info.trim();
		}
	}
	return '';
}

/**
 * Classifies one raw Sync log entry by direction and file path.
 *
 * The input is untrusted: any shape is accepted and the function never throws.
 * Unknown messages give `{ direction: 'other' }`.
 */
export function classifyLogEntry(entry: unknown): ClassifiedLogEntry {
	const text = logEntryText(entry);
	for (const { pattern, direction } of FILE_PATTERNS) {
		const match = pattern.exec(text);
		const path = match?.[1] ? normalizePath(match[1]) : '';
		if (path !== '') {
			return { direction, path };
		}
	}
	for (const { pattern, direction } of COMPLETE_PATTERNS) {
		if (pattern.test(text)) {
			return { direction };
		}
	}
	return { direction: 'other' };
}

/**
 * Tells if a raw Sync log entry reports that the whole vault is up to date.
 */
export function isFullySyncedEntry(entry: unknown): boolean {
	return logEntryText(entry).toLowerCase() === FULLY_SYNCED_MESSAGE.toLowerCase();
}

function normalizePath(raw: string): string {
	return raw.trim().replace(/^\/+/, '');
}
