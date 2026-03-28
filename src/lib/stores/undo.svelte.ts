import type { Command, SerializedCommandData } from '$lib/types/commands.js';
import { MAX_UNDO_STACK_SIZE } from '$lib/types/commands.js';

class UndoStore {
  undoStack = $state<Command[]>([]);
  redoStack = $state<Command[]>([]);

  get canUndo(): boolean { return this.undoStack.length > 0; }
  get canRedo(): boolean { return this.redoStack.length > 0; }

  execute(command: Command): void {
    command.execute();
    this.undoStack.push(command);
    if (this.undoStack.length > MAX_UNDO_STACK_SIZE) {
      this.undoStack.shift();
    }
    this.redoStack = [];
  }

  undo(): void {
    const cmd = this.undoStack.pop();
    if (!cmd) return;
    cmd.undo();
    this.redoStack.push(cmd);
  }

  redo(): void {
    const cmd = this.redoStack.pop();
    if (!cmd) return;
    cmd.execute();
    this.undoStack.push(cmd);
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }

  serialize(): SerializedCommandData[] {
    return this.undoStack.map((cmd) => cmd.serialize());
  }
}

export const undoStore = new UndoStore();
