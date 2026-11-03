import { describe, expect, it } from 'vitest';
import { ResumeDetector } from '../src/resume-detector';

type Step = ['hidden'] | ['visible'] | ['blur', number] | ['focus', number];

/**
 * Runs the steps and returns the result of each focus step, in order.
 */
function focusResults(steps: Step[]): boolean[] {
	const detector = new ResumeDetector();
	const results: boolean[] = [];
	for (const step of steps) {
		switch (step[0]) {
			case 'hidden':
				detector.hidden();
				break;
			case 'visible':
				detector.visible();
				break;
			case 'blur':
				detector.blur(step[1]);
				break;
			case 'focus':
				results.push(detector.focus(step[1]));
				break;
		}
	}
	return results;
}

describe('ResumeDetector', () => {
	it.each<[string, Step[], boolean[]]>([
		['a focus with no blur and no hidden page', [['focus', 0]], [false]],
		['a focus after a short blur, for example the notification shade', [['blur', 0], ['focus', 2_999]], [false]],
		['a focus after a blur of 3 seconds', [['blur', 0], ['focus', 3_000]], [true]],
		['a focus after the page was hidden', [['blur', 0], ['hidden'], ['focus', 100]], [true]],
		['a focus before the page becomes visible', [['hidden'], ['focus', 100], ['visible']], [true]],
		['a focus right after the page became visible', [['blur', 0], ['hidden'], ['visible'], ['focus', 10_000]], [false]],
		['only the first of two focus events after a hidden page', [['hidden'], ['focus', 100], ['focus', 200]], [true, false]],
		['each long blur counts once', [['blur', 0], ['focus', 5_000], ['blur', 6_000], ['focus', 7_000], ['blur', 8_000], ['focus', 12_000]], [true, false, true]],
	])('%s', (_label, steps, expected) => {
		expect(focusResults(steps)).toEqual(expected);
	});
});
