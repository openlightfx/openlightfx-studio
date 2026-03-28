export interface Command {
  readonly type: string;
  readonly description: string;
  execute(): void;
  undo(): void;
  serialize(): SerializedCommandData;
}

export interface SerializedCommandData {
  type: string;
  description: string;
  payload: unknown;
}

export type CommandType =
  | 'ADD_KEYFRAME' | 'DELETE_KEYFRAME' | 'MOVE_KEYFRAME' | 'EDIT_KEYFRAME'
  | 'ADD_CHANNEL' | 'DELETE_CHANNEL' | 'EDIT_CHANNEL' | 'REORDER_CHANNELS'
  | 'EDIT_METADATA' | 'COMPOSITE';

export const MAX_UNDO_STACK_SIZE = 200;
