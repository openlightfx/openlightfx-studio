import type { Command, SerializedCommandData } from '$lib/types/commands.js';

export class CompositeCommand implements Command {
  readonly type = 'COMPOSITE';
  readonly description: string;
  readonly commands: Command[];
  constructor(description: string, commands: Command[]) {
    this.description = description;
    this.commands = commands;
  }
  execute(): void {
    for (const cmd of this.commands) cmd.execute();
  }
  undo(): void {
    for (let i = this.commands.length - 1; i >= 0; i--) this.commands[i].undo();
  }
  serialize(): SerializedCommandData {
    return { type: this.type, description: this.description, payload: { commands: this.commands.map((c) => c.serialize()) } };
  }
}
