import type { UndoableAction } from '$lib/types';

const MAX_STACK_SIZE = 200;

class HistoryStore {
	undoStack: UndoableAction[] = $state([]);
	redoStack: UndoableAction[] = $state([]);

	canUndo: boolean = $derived(this.undoStack.length > 0);
	canRedo: boolean = $derived(this.redoStack.length > 0);

	push(action: UndoableAction) {
		action.redo();
		this.undoStack = [...this.undoStack.slice(-MAX_STACK_SIZE + 1), action];
		this.redoStack = [];
	}

	undo() {
		if (this.undoStack.length === 0) return;
		const action = this.undoStack[this.undoStack.length - 1];
		this.undoStack = this.undoStack.slice(0, -1);
		action.undo();
		this.redoStack = [...this.redoStack, action];
	}

	redo() {
		if (this.redoStack.length === 0) return;
		const action = this.redoStack[this.redoStack.length - 1];
		this.redoStack = this.redoStack.slice(0, -1);
		action.redo();
		this.undoStack = [...this.undoStack, action];
	}

	clear() {
		this.undoStack = [];
		this.redoStack = [];
	}
}

export const historyStore = new HistoryStore();
