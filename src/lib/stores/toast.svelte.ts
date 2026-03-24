// ============================================================
// Toast Store — notification system
// ============================================================

import type { Toast, ToastType } from '$lib/types/index.js';
import { DEFAULT_TOAST_DURATION_MS, ERROR_TOAST_DURATION_MS } from '$lib/types/index.js';

const MAX_TOASTS = 5;

class ToastStoreClass {
	toasts = $state<Toast[]>([]);

	private timers = new Map<string, ReturnType<typeof setTimeout>>();

	private add(message: string, type: ToastType, durationMs?: number): string {
		const resolvedDuration =
			durationMs ?? (type === 'error' ? ERROR_TOAST_DURATION_MS : DEFAULT_TOAST_DURATION_MS);
		const id = crypto.randomUUID();
		const toast: Toast = { id, message, type, durationMs: resolvedDuration };

		// Dismiss oldest if at capacity
		let next = [...this.toasts, toast];
		while (next.length > MAX_TOASTS) {
			const oldest = next[0];
			this.clearTimer(oldest.id);
			next = next.slice(1);
		}
		this.toasts = next;

		const timer = setTimeout(() => {
			this.dismiss(id);
		}, resolvedDuration);
		this.timers.set(id, timer);

		return id;
	}

	info(message: string, durationMs?: number): string {
		return this.add(message, 'info', durationMs);
	}

	success(message: string, durationMs?: number): string {
		return this.add(message, 'success', durationMs);
	}

	warning(message: string, durationMs?: number): string {
		return this.add(message, 'warning', durationMs);
	}

	error(message: string, durationMs?: number): string {
		return this.add(message, 'error', durationMs);
	}

	dismiss(id: string): void {
		this.clearTimer(id);
		this.toasts = this.toasts.filter((t) => t.id !== id);
	}

	private clearTimer(id: string): void {
		const timer = this.timers.get(id);
		if (timer) {
			clearTimeout(timer);
			this.timers.delete(id);
		}
	}
}

export const toastStore = new ToastStoreClass();
