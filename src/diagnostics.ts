/*
 * Diagnostic log for bug reports. Pure: no app API.
 *
 * The log keeps gate inputs and decisions only. For Sync internals it keeps
 * member names and types, never values, so a saved log holds no note names or text.
 */

/**
 * One diagnostic log record.
 */
export interface DiagnosticRecord {
	/**
	 * Time of the record in milliseconds since the epoch.
	 */
	at: number;
	/**
	 * Record kind, for example `snapshot` or `decision`.
	 */
	kind: string;
	/**
	 * Plain data for the record. Must not hold note names, note text or Sync values.
	 */
	data: Record<string, unknown>;
}

/**
 * Facts about the device that go at the top of a saved log.
 */
export interface DiagnosticHeader {
	/**
	 * Time of the save in milliseconds since the epoch.
	 */
	savedAt: number;
	/**
	 * Platform name, for example `ios` or `macos`.
	 */
	platform: string;
	/**
	 * Plugin version.
	 */
	pluginVersion: string;
	/**
	 * App API version.
	 */
	apiVersion: string;
}

// Default number of records that the log keeps.
const DIAGNOSTIC_LOG_SIZE = 500;

/**
 * Ring buffer of the most recent diagnostic records.
 */
export class DiagnosticLog {
	private records: DiagnosticRecord[] = [];
	private dropped = 0;

	/**
	 * @param capacity Maximum number of records to keep. Older records are dropped.
	 */
	constructor(private readonly capacity = DIAGNOSTIC_LOG_SIZE) {}

	/**
	 * Adds one record. Drops the oldest record when the log is full.
	 */
	record(at: number, kind: string, data: Record<string, unknown> = {}): void {
		this.records.push({ at, kind, data });
		if (this.records.length > this.capacity) {
			this.records.shift();
			this.dropped += 1;
		}
	}

	/**
	 * Formats the log as a Markdown note, with one JSON line per record.
	 */
	toMarkdown(header: DiagnosticHeader): string {
		const lines = this.records.map((record) =>
			safeStringify({ t: new Date(record.at).toISOString(), kind: record.kind, ...record.data }),
		);
		return [
			'# Sync Gate diagnostic log',
			'',
			`- Saved: ${new Date(header.savedAt).toISOString()}`,
			`- Platform: ${header.platform}`,
			`- Plugin version: ${header.pluginVersion}`,
			`- API version: ${header.apiVersion}`,
			`- Records: ${this.records.length} (max ${this.capacity}, dropped ${this.dropped})`,
			'',
			'```jsonl',
			...lines,
			'```',
			'',
		].join('\n');
	}
}

/**
 * Describes the members of an object by name and type, never by value.
 *
 * Reads property descriptors, so getters never run. Covers own members and up to
 * five prototypes. Returns `{}` for a value that is not an object.
 */
export function describeShape(target: unknown): Record<string, string> {
	const shape: Record<string, string> = {};
	if (typeof target !== 'object' || target === null) {
		return shape;
	}
	let current: object | null = target;
	for (let depth = 0; current !== null && current !== Object.prototype && depth < 6; depth += 1) {
		for (const key of Object.getOwnPropertyNames(current)) {
			if (key !== 'constructor' && !(key in shape)) {
				shape[key] = describeMember(current, key);
			}
		}
		current = Object.getPrototypeOf(current) as object | null;
	}
	return shape;
}

/**
 * Builds a file name for a saved log, for example `sync-gate-ios-20250101-093000-042.md`.
 * The name includes milliseconds, so two saves in the same second get different names.
 */
export function diagnosticFileName(platform: string, savedAt: Date): string {
	const pad = (value: number, length = 2): string => String(value).padStart(length, '0');
	const date = `${savedAt.getFullYear()}${pad(savedAt.getMonth() + 1)}${pad(savedAt.getDate())}`;
	const time = `${pad(savedAt.getHours())}${pad(savedAt.getMinutes())}${pad(savedAt.getSeconds())}`;
	return `sync-gate-${platform}-${date}-${time}-${pad(savedAt.getMilliseconds(), 3)}.md`;
}

function describeMember(target: object, key: string): string {
	const descriptor = Object.getOwnPropertyDescriptor(target, key);
	if (!descriptor) {
		return 'unknown';
	}
	if (descriptor.get || descriptor.set) {
		return 'accessor';
	}
	const value: unknown = descriptor.value;
	if (value === null) {
		return 'null';
	}
	return Array.isArray(value) ? 'array' : typeof value;
}

function safeStringify(value: unknown): string {
	try {
		return JSON.stringify(value);
	} catch {
		return '"[unserializable record]"';
	}
}
