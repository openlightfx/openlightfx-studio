import type { Keyframe } from '$lib/types/track.js';
import type { ChannelGroup } from '$lib/types/channels.js';
import { applyMirror, applySpread, applyAlternate } from './channel-groups.js';

/**
 * Given a keyframe that was just added, returns extra keyframes to propagate
 * to sibling channels in the same group (if any). Returns empty array if
 * the channel isn't in a group.
 */
export function propagateToGroup(
  keyframe: Keyframe,
  groups: ChannelGroup[],
  generateId: () => string,
  roundRobinIndex?: number
): Keyframe[] {
  const group = groups.find((g) => g.channelIds.includes(keyframe.channelId));
  if (!group) return [];

  const siblingIds = group.channelIds.filter((id) => id !== keyframe.channelId);
  if (siblingIds.length === 0) return [];

  switch (group.mode) {
    case 'GROUP_MIRROR':
      return applyMirror(keyframe, siblingIds, generateId);
    case 'GROUP_SPREAD':
      return applySpread(
        keyframe,
        group.offsets.filter((o) => o.channelId !== keyframe.channelId),
        generateId
      );
    case 'GROUP_ALTERNATE':
      return applyAlternate(keyframe, group.channelIds, roundRobinIndex ?? 0, generateId);
    default:
      return [];
  }
}
