// ============================================================
// Undo Store — Command-pattern undo/redo
// ============================================================

import type { Command, SerializedCommandData } from '$lib/types/index.js';
import { MAX_UNDO_STACK_SIZE } from '$lib/types/index.js';

class UndoStoreClass {
	undoStack = $state<Command[]>([]);
	redoStack = $state<Command[]>([]);

	get canUndo(): boolean {
		return this.undoStack.length > 0;
	}

	get canRedo(): boolean {
		return this.redoStack.length > 0;
	}

	get undoDescription(): string | null {
		const top = this.undoStack[this.undoStack.length - 1];
		return top ? top.description : null;
	}

	get redoDescription(): string | null {
		const top = this.redoStack[this.redoStack.length - 1];
		return top ? top.description : null;
	}

	execute(command: Command): void {
		command.execute();
		this.undoStack = [...this.undoStack, command].slice(-MAX_UNDO_STACK_SIZE);
		this.redoStack = [];
	}

	undo(): void {
		const command = this.undoStack[this.undoStack.length - 1];
		if (!command) return;
		command.undo();
		this.undoStack = this.undoStack.slice(0, -1);
		this.redoStack = [...this.redoStack, command];
	}

	redo(): void {
		const command = this.redoStack[this.redoStack.length - 1];
		if (!command) return;
		command.execute();
		this.redoStack = this.redoStack.slice(0, -1);
		this.undoStack = [...this.undoStack, command].slice(-MAX_UNDO_STACK_SIZE);
	}

	clear(): void {
		this.undoStack = [];
		this.redoStack = [];
	}

	serialize(): { commands: SerializedCommandData[]; pointer: number } {
		const commands = this.undoStack.map((cmd) => cmd.serialize());
		return { commands, pointer: commands.length };
	}
}

export const undoStore = new UndoStoreClass();
