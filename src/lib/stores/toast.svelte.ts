import type { Toast, ToastType } from '$lib/types';

function createToastStore() {
	let toasts = $state<Toast[]>([]);

	function add(type: ToastType, message: string, duration = 4000): void {
		const id = crypto.randomUUID();
		toasts.push({ id, type, message, duration });
	}

	function remove(id: string): void {
		toasts = toasts.filter((t) => t.id !== id);
	}

	function success(msg: string): void {
		add('success', msg);
	}

	function error(msg: string): void {
		add('error', msg, 6000);
	}

	function info(msg: string): void {
		add('info', msg);
	}

	function warning(msg: string): void {
		add('warning', msg, 5000);
	}

	return {
		get toasts() {
			return toasts;
		},
		add,
		remove,
		success,
		error,
		info,
		warning
	};
}

export const toastStore = createToastStore();
