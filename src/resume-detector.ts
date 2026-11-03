/*
 * Decides when a window focus event means that the app came back from the background.
 * Pure: no DOM access. The plugin feeds in page and window events with a monotonic time.
 *
 * On mobile, a window gets focus for many reasons that are not a resume: the
 * notification shade, a system dialog, split screen or an embedded frame.
 */

// Minimum time in milliseconds that the window must stay without focus before a focus counts as a resume.
const MIN_BLUR_MS = 3000;

/**
 * Tracks page visibility and window focus between resumes.
 *
 * A page that becomes visible is always a resume. A window focus is a resume only when
 * the page was hidden since the last resume, or when the window had no focus for at least 3 seconds.
 */
export class ResumeDetector {
	private hiddenSinceResume = false;
	private blurredAt: number | undefined = undefined;

	/**
	 * Records that the page became hidden.
	 */
	hidden(): void {
		this.hiddenSinceResume = true;
	}

	/**
	 * Records that the page became visible. This is always a resume.
	 */
	visible(): void {
		this.reset();
	}

	/**
	 * Records that the window lost focus.
	 *
	 * @param at Monotonic time in milliseconds, for example `performance.now()`.
	 */
	blur(at: number): void {
		this.blurredAt = at;
	}

	/**
	 * Records that the window got focus and tells if this focus is a resume.
	 *
	 * @param at Monotonic time in milliseconds, for example `performance.now()`.
	 */
	focus(at: number): boolean {
		const longBlur = this.blurredAt !== undefined && at - this.blurredAt >= MIN_BLUR_MS;
		this.blurredAt = undefined;
		if (!this.hiddenSinceResume && !longBlur) {
			return false;
		}
		this.reset();
		return true;
	}

	private reset(): void {
		this.hiddenSinceResume = false;
		this.blurredAt = undefined;
	}
}
