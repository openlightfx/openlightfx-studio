// ============================================================
// Command types — undo/redo command pattern
// ============================================================

/** Base interface for all undoable commands */
export interface Command {
  /** Unique command type identifier */
  readonly type: string;
  /** Human-readable description for the undo/redo UI */
  readonly description: string;
  /** Execute the command (apply the change) */
  execute(): void;
  /** Undo the command (reverse the change) */
  undo(): void;
  /** Serialize for persistence in project file */
  serialize(): SerializedCommandData;
}

/** Serialized form of a command for persistence */
export interface SerializedCommandData {
  type: string;
  description: string;
  payload: unknown;
}

/** Composite command that groups multiple commands into one undo step */
export interface CompositeCommand extends Command {
  readonly commands: Command[];
}

// ============================================================
// Concrete command type discriminators
// ============================================================

export type CommandType =
  | 'ADD_KEYFRAME'
  | 'DELETE_KEYFRAME'
  | 'MOVE_KEYFRAME'
  | 'EDIT_KEYFRAME'
  | 'ADD_CHANNEL'
  | 'DELETE_CHANNEL'
  | 'RENAME_CHANNEL'
  | 'REORDER_CHANNELS'
  | 'EDIT_CHANNEL'
  | 'ADD_EFFECT'
  | 'DELETE_EFFECT'
  | 'EDIT_EFFECT'
  | 'MOVE_EFFECT'
  | 'ADD_SCENE_MARKER'
  | 'DELETE_SCENE_MARKER'
  | 'EDIT_SCENE_MARKER'
  | 'MOVE_SCENE_MARKER'
  | 'EDIT_METADATA'
  | 'ADD_CHANNEL_GROUP'
  | 'DELETE_CHANNEL_GROUP'
  | 'EDIT_CHANNEL_GROUP'
  | 'BULK_EDIT_KEYFRAMES'
  | 'COMPOSITE';

/** Maximum undo stack depth (STU-063) */
export const MAX_UNDO_STACK_SIZE = 200;
