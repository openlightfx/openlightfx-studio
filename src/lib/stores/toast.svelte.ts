import type { Toast, ToastType } from '$lib/types';

const DEFAULT_DURATION = 4000;
const ERROR_DURATION = 6000;

class ToastStore {
	toasts: Toast[] = $state([]);

	add(type: ToastType, message: string, duration?: number) {
		const resolvedDuration = duration ?? (type === 'error' ? ERROR_DURATION : DEFAULT_DURATION);
		const toast: Toast = {
			id: crypto.randomUUID(),
			type,
			message,
			duration: resolvedDuration
		};
		this.toasts = [...this.toasts, toast];
		setTimeout(() => this.remove(toast.id), resolvedDuration);
	}

	remove(id: string) {
		this.toasts = this.toasts.filter((t) => t.id !== id);
	}

	success(message: string, duration?: number) {
		this.add('success', message, duration);
	}

	error(message: string, duration?: number) {
		this.add('error', message, duration);
	}

	info(message: string, duration?: number) {
		this.add('info', message, duration);
	}

	warning(message: string, duration?: number) {
		this.add('warning', message, duration);
	}
}

export const toastStore = new ToastStore();
