// ============================================================
// Edit actions — shared clipboard, delete, and selection helpers
// Used by both keyboard shortcuts (+page.svelte) and MenuBar.
// ============================================================

import { projectStore } from '$lib/stores/project.svelte.js';
import { timelineStore } from '$lib/stores/timeline.svelte.js';
import { videoStore } from '$lib/stores/video.svelte.js';
import { clipboardStore } from '$lib/stores/clipboard.svelte.js';
import { toastStore } from '$lib/stores/toast.svelte.js';
import { uiStore } from '$lib/stores/ui.svelte.js';
import { saveProjectFile, loadProjectFile, importLightFXFile } from './project-io.js';
import type { Keyframe } from '$lib/types/index.js';

// ── Clipboard ───────────────────────────────────────────────

function getSelectedKeyframes(): { keyframes: Keyframe[]; channelId: string } | null {
  const ids = timelineStore.selection.keyframeIds;
  if (ids.length === 0) return null;
  const keyframes = ids.map((id) => projectStore.getKeyframe(id)).filter(Boolean) as Keyframe[];
  if (keyframes.length === 0) return null;
  const channelId = keyframes[0].channelId;
  return { keyframes, channelId };
}

export function copySelectedKeyframes(): void {
  const sel = getSelectedKeyframes();
  if (!sel) return;
  clipboardStore.copy(sel.keyframes, sel.channelId);
  toastStore.info(`Copied ${sel.keyframes.length} keyframe${sel.keyframes.length > 1 ? 's' : ''}`);
}

export function cutSelectedKeyframes(): void {
  const sel = getSelectedKeyframes();
  if (!sel) return;
  clipboardStore.cut(sel.keyframes, sel.channelId);
  for (const kf of sel.keyframes) {
    projectStore.removeKeyframe(kf.id);
  }
  timelineStore.clearSelection();
  toastStore.info(`Cut ${sel.keyframes.length} keyframe${sel.keyframes.length > 1 ? 's' : ''}`);
}

export function pasteKeyframes(): void {
  const activeChannelId = timelineStore.selection.activeChannelId;
  if (!activeChannelId || !clipboardStore.hasContent) return;
  const currentTimeMs = videoStore.state.currentTimeMs;
  const result = clipboardStore.paste(activeChannelId, currentTimeMs);
  if (!result) return;

  if (result.type === 'keyframes') {
    for (const kf of result.keyframes) {
      projectStore.addKeyframe(kf.channelId, kf.timestampMs, kf);
    }
    toastStore.info(
      `Pasted ${result.keyframes.length} keyframe${result.keyframes.length > 1 ? 's' : ''}`
    );
  } else if (result.type === 'effect') {
    projectStore.addEffectKeyframe(result.effect);
    toastStore.info('Pasted effect');
  }
}

// ── Selection & Deletion ────────────────────────────────────

export function selectAllInActiveChannel(): void {
  const channelId = timelineStore.selection.activeChannelId;
  if (!channelId) return;
  const keyframeIds = projectStore.keyframesByChannel(channelId).map((kf) => kf.id);
  timelineStore.selectAllInChannel(channelId, keyframeIds);
}

export function deleteSelected(): void {
  const { keyframeIds, effectKeyframeIds, sceneMarkerIds } = timelineStore.selection;
  let count = 0;
  for (const id of keyframeIds) {
    projectStore.removeKeyframe(id);
    count++;
  }
  for (const id of effectKeyframeIds) {
    projectStore.removeEffectKeyframe(id);
    count++;
  }
  for (const id of sceneMarkerIds) {
    projectStore.removeSceneMarker(id);
    count++;
  }
  if (count > 0) {
    timelineStore.clearSelection();
  }
}

// ── Quick-add ───────────────────────────────────────────────

export function addKeyframeAtPlayhead(): void {
  const channelId = timelineStore.selection.activeChannelId;
  if (!channelId) {
    toastStore.warning('Select a channel first');
    return;
  }
  const timestampMs = videoStore.state.currentTimeMs;
  projectStore.addKeyframe(channelId, timestampMs);
}

export function addSceneMarkerAtPlayhead(): void {
  const timestampMs = videoStore.state.currentTimeMs;
  projectStore.addSceneMarker(timestampMs, '');
}

// ── File operations ─────────────────────────────────────────

/** Open a native file picker and return the selected file, or null if cancelled. */
function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}

export async function openProject(): Promise<void> {
  const file = await pickFile('.lightfx-project');
  if (!file) return;
  try {
    const project = await loadProjectFile(file);
    projectStore.loadProject(project);
    toastStore.success('Project opened');
  } catch {
    toastStore.error('Failed to open project file');
  }
}

export async function openVideo(): Promise<void> {
  const file = await pickFile('video/*,.mp4,.mkv,.webm,.mov,.avi');
  if (!file) return;
  videoStore.loadFile(file);
  toastStore.success(`Loaded video: ${file.name}`);
}

export async function saveProject(): Promise<void> {
  try {
    await saveProjectFile(projectStore.project.file);
    projectStore.markClean();
    toastStore.success('Project saved');
  } catch {
    toastStore.error('Save failed');
  }
}

export async function saveProjectAs(): Promise<void> {
  // saveProjectFile already uses showSaveFilePicker which prompts for location
  // For "Save As", we just always call it (no cached handle)
  try {
    await saveProjectFile(projectStore.project.file);
    projectStore.markClean();
    toastStore.success('Project saved');
  } catch {
    toastStore.error('Save failed');
  }
}

export async function importLightFX(): Promise<void> {
  const file = await pickFile('.lightfx');
  if (!file) return;
  try {
    const track = await importLightFXFile(file);
    projectStore.setTrack(track);
    toastStore.success('Imported .lightfx track');
  } catch {
    toastStore.error('Failed to import .lightfx file');
  }
}

// ── Modal shortcuts ─────────────────────────────────────────

export function showAbout(): void {
  uiStore.openModal('about');
}
