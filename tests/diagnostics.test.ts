import { describe, expect, it } from 'vitest';
import { describeShape, diagnosticFileName, DiagnosticLog } from '../src/diagnostics';

describe('DiagnosticLog', () => {
	it('keeps only the most recent records', () => {
		const log = new DiagnosticLog(3);
		for (let at = 1; at <= 5; at += 1) {
			log.record(at, 'tick', { n: at });
		}
		expect(log.entries.map((record) => record.at)).toEqual([3, 4, 5]);
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
	it('names the file by platform and local time', () => {
		expect(diagnosticFileName('macos', new Date(2025, 0, 2, 3, 4, 5))).toBe('sync-gate-macos-20250102-030405.md');
	});
});
