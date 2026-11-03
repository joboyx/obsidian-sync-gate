import { describe, expect, it } from 'vitest';
import { describeShape, diagnosticFileName, DiagnosticLog } from '../src/diagnostics';

describe('DiagnosticLog', () => {
	it('keeps only the most recent records', () => {
		const log = new DiagnosticLog(3);
		for (let n = 1; n <= 5; n += 1) {
			log.record(n * 1_000, 'tick', { n });
		}
		const text = log.toMarkdown({ savedAt: 6_000, platform: 'ios', pluginVersion: '0.1.0', apiVersion: '1.5.0' });
		expect(text).toContain('- Records: 3 (max 3, dropped 2)');
		expect(text.split('\n').filter((line) => line.startsWith('{"t"'))).toEqual([
			'{"t":"1970-01-01T00:00:03.000Z","kind":"tick","n":3}',
			'{"t":"1970-01-01T00:00:04.000Z","kind":"tick","n":4}',
			'{"t":"1970-01-01T00:00:05.000Z","kind":"tick","n":5}',
		]);
	});

	it('keeps 500 records by default', () => {
		const log = new DiagnosticLog();
		for (let n = 1; n <= 501; n += 1) {
			log.record(n, 'tick');
		}
		const text = log.toMarkdown({ savedAt: 0, platform: 'ios', pluginVersion: '0.1.0', apiVersion: '1.5.0' });
		expect(text).toContain('- Records: 500 (max 500, dropped 1)');
	});

	it('formats a Markdown note with one JSON line per record', () => {
		const log = new DiagnosticLog(2);
		log.record(0, 'start');
		log.record(1_000, 'decision', { locked: true });
		log.record(2_000, 'decision', { locked: false });
		const text = log.toMarkdown({ savedAt: 3_000, platform: 'ios', pluginVersion: '0.1.0', apiVersion: '1.5.0' });
		expect(text.split('\n')).toEqual([
			'# Sync Gate diagnostic log',
			'',
			'- Saved: 1970-01-01T00:00:03.000Z',
			'- Platform: ios',
			'- Plugin version: 0.1.0',
			'- API version: 1.5.0',
			'- Records: 2 (max 2, dropped 1)',
			'',
			'```jsonl',
			'{"t":"1970-01-01T00:00:01.000Z","kind":"decision","locked":true}',
			'{"t":"1970-01-01T00:00:02.000Z","kind":"decision","locked":false}',
			'```',
			'',
		]);
	});
});

describe('describeShape', () => {
	class SyncLike {
		syncStatus = 'Downloading file Private.md';
		syncLog = ['Downloading file Private.md'];
		server = null;
		get secret(): string {
			throw new Error('a getter must not run');
		}
		getStatus(): string {
			return 'synced';
		}
	}

	it('gives member names and types, never values, and never runs getters', () => {
		const shape = describeShape(new SyncLike());
		expect(shape).toEqual({
			syncStatus: 'string',
			syncLog: 'array',
			server: 'null',
			secret: 'accessor',
			getStatus: 'function',
		});
		expect(JSON.stringify(shape)).not.toContain('Private.md');
	});

	it.each([undefined, null, 'text', 3])('gives an empty shape for %s', (value) => {
		expect(describeShape(value)).toEqual({});
	});
});

describe('diagnosticFileName', () => {
	it('names the file by platform and local time, with milliseconds', () => {
		expect(diagnosticFileName('macos', new Date(2025, 0, 2, 3, 4, 5, 6))).toBe('sync-gate-macos-20250102-030405-006.md');
	});

	it('gives two saves in the same second different names', () => {
		const first = diagnosticFileName('ios', new Date(2025, 0, 2, 3, 4, 5, 100));
		const second = diagnosticFileName('ios', new Date(2025, 0, 2, 3, 4, 5, 101));
		expect(first).not.toBe(second);
	});
});
