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
  | 'EDIT_METADATA' | 'COMPOSITE'
  | 'ADD_EFFECT' | 'DELETE_EFFECT' | 'MOVE_EFFECT' | 'EDIT_EFFECT'
  | 'ADD_SCENE_MARKER' | 'DELETE_SCENE_MARKER'
  | 'PASTE_KEYFRAMES'
  | 'ADD_CHANNEL_GROUP' | 'DELETE_CHANNEL_GROUP' | 'EDIT_CHANNEL_GROUP';

export const MAX_UNDO_STACK_SIZE = 200;
