import type { Toast, ToastType } from '$lib/types/ui.js';
import { DEFAULT_TOAST_DURATION_MS, ERROR_TOAST_DURATION_MS } from '$lib/types/ui.js';
import { generateId } from '$lib/services/id.js';

class ToastStore {
  toasts = $state<Toast[]>([]);

  private add(message: string, type: ToastType, durationMs?: number): void {
    const duration = durationMs ?? (type === 'error' ? ERROR_TOAST_DURATION_MS : DEFAULT_TOAST_DURATION_MS);
    const toast: Toast = { id: generateId(), message, type, durationMs: duration };
    this.toasts.push(toast);
    setTimeout(() => this.dismiss(toast.id), duration);
  }

  info(message: string): void { this.add(message, 'info'); }
  success(message: string): void { this.add(message, 'success'); }
  warning(message: string): void { this.add(message, 'warning'); }
  error(message: string): void { this.add(message, 'error'); }

  dismiss(id: string): void {
    this.toasts = this.toasts.filter((t) => t.id !== id);
  }
}

export const toastStore = new ToastStore();
