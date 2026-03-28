import { describe, it, expect } from 'vitest';
import type { Command, SerializedCommandData } from '../../src/lib/types/commands.js';

class MockCommand implements Command {
  readonly type = 'MOCK';
  readonly description: string;
  executed = false;
  undone = false;
  constructor(desc: string) { this.description = desc; }
  execute() { this.executed = true; this.undone = false; }
  undo() { this.undone = true; this.executed = false; }
  serialize(): SerializedCommandData { return { type: 'MOCK', description: this.description, payload: {} }; }
}

describe('Command pattern', () => {
  it('execute sets state, undo reverses it', () => {
    const cmd = new MockCommand('test');
    cmd.execute();
    expect(cmd.executed).toBe(true);
    cmd.undo();
    expect(cmd.undone).toBe(true);
    expect(cmd.executed).toBe(false);
  });
});
