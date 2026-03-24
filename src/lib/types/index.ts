export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
	id: string;
	type: ToastType;
	message: string;
	duration: number;
}

export interface ContextMenuItem {
	label: string;
	action?: () => void;
	disabled?: boolean;
	separator?: boolean;
	submenu?: ContextMenuItem[];
	icon?: string;
}
