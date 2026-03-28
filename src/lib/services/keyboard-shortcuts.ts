import type { ShortcutCategory } from '$lib/types/ui.js';
import { videoStore } from '$lib/stores/video.svelte.js';
import { undoStore } from '$lib/stores/undo.svelte.js';
import { uiStore } from '$lib/stores/ui.svelte.js';
import { timelineStore } from '$lib/stores/timeline.svelte.js';
import { projectStore } from '$lib/stores/project.svelte.js';
import { DeleteKeyframeCommand } from '$lib/commands/delete-keyframe.js';
import { CompositeCommand } from '$lib/commands/composite.js';

// ── Mac detection ─────────────────────────────────────────────────────────────
const isMac =
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPod|iPad/.test(navigator.platform || navigator.userAgent);

const MOD = isMac ? '⌘' : 'Ctrl+';

interface ShortcutDef {
  id: string;
  label: string;
  /** Display string shown in UI (e.g. "⌘K", "Space") */
  keys: string;
  /** KeyboardEvent.key to match (case-sensitive where it matters) */
  key: string;
  /** Match Ctrl (Windows/Linux) or Cmd (Mac) */
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  category: ShortcutCategory;
  action: () => void;
  /** If true, fires even when focus is inside <input> or <textarea> */
  allowInInput?: boolean;
}

// ── Shortcut definitions ──────────────────────────────────────────────────────
// Defined as a factory so actions always close over the live store singletons.
function buildShortcuts(): ShortcutDef[] {
  return [
    // ── Playback ──────────────────────────────────────────────────────────────
    {
      id: 'playback.toggle',
      label: 'Play / Pause',
      keys: 'Space',
      key: ' ',
      category: 'playback',
      action: () => videoStore.togglePlayback(),
    },
    {
      id: 'playback.step-backward',
      label: 'Step Backward',
      keys: '←',
      key: 'ArrowLeft',
      category: 'playback',
      action: () => videoStore.stepBackward(),
    },
    {
      id: 'playback.step-forward',
      label: 'Step Forward',
      keys: '→',
      key: 'ArrowRight',
      category: 'playback',
      action: () => videoStore.stepForward(),
    },

    // ── Edit ─────────────────────────────────────────────────────────────────
    {
      id: 'edit.undo',
      label: 'Undo',
      keys: `${MOD}Z`,
      key: 'z',
      ctrl: true,
      category: 'edit',
      action: () => undoStore.undo(),
    },
    {
      id: 'edit.redo',
      label: 'Redo',
      keys: `${MOD}⇧Z`,
      key: 'z',
      ctrl: true,
      shift: true,
      category: 'edit',
      action: () => undoStore.redo(),
    },
    {
      id: 'edit.select-all',
      label: 'Select All Keyframes',
      keys: `${MOD}A`,
      key: 'a',
      ctrl: true,
      category: 'keyframe',
      action: () => {
        if (!projectStore.file) return;
        const allIds = projectStore.getKeyframes().map((kf) => kf.id);
        timelineStore.selectedKeyframeIds = allIds;
      },
    },
    {
      id: 'edit.delete-selected',
      label: 'Delete Selected Keyframes',
      keys: 'Del / ⌫',
      key: 'Delete',
      category: 'keyframe',
      action: () => {
        const ids = [...timelineStore.selectedKeyframeIds];
        if (ids.length === 0) return;
        if (!projectStore.file) return;
        const cmds = ids.map((id) => new DeleteKeyframeCommand(id, projectStore));
        undoStore.execute(new CompositeCommand(`Delete ${ids.length} keyframe(s)`, cmds));
        timelineStore.clearSelection();
      },
    },
    {
      id: 'edit.delete-selected-backspace',
      label: 'Delete Selected Keyframes',
      keys: '⌫',
      key: 'Backspace',
      category: 'keyframe',
      action: () => {
        const ids = [...timelineStore.selectedKeyframeIds];
        if (ids.length === 0) return;
        if (!projectStore.file) return;
        const cmds = ids.map((id) => new DeleteKeyframeCommand(id, projectStore));
        undoStore.execute(new CompositeCommand(`Delete ${ids.length} keyframe(s)`, cmds));
        timelineStore.clearSelection();
      },
    },

    // ── File ─────────────────────────────────────────────────────────────────
    {
      id: 'file.save',
      label: 'Save',
      keys: `${MOD}S`,
      key: 's',
      ctrl: true,
      category: 'file',
      action: () => uiStore.openModal('export'),
    },
    {
      id: 'file.save-as',
      label: 'Save As',
      keys: `${MOD}⇧S`,
      key: 's',
      ctrl: true,
      shift: true,
      category: 'file',
      action: () => uiStore.openModal('export'),
    },
    {
      id: 'file.new',
      label: 'New Project',
      keys: `${MOD}N`,
      key: 'n',
      ctrl: true,
      category: 'file',
      action: () => uiStore.openModal('new-project'),
    },
    {
      id: 'file.open',
      label: 'Open Project',
      keys: `${MOD}O`,
      key: 'o',
      ctrl: true,
      category: 'file',
      action: () => uiStore.openModal('new-project'),
    },
    {
      id: 'file.export',
      label: 'Export',
      keys: `${MOD}E`,
      key: 'e',
      ctrl: true,
      category: 'file',
      action: () => uiStore.openModal('export'),
    },

    // ── View / UI ─────────────────────────────────────────────────────────────
    {
      id: 'view.command-palette',
      label: 'Command Palette',
      keys: `${MOD}K`,
      key: 'k',
      ctrl: true,
      category: 'view',
      action: () => uiStore.openModal('new-project'), // opened by CommandPalette's own listener; this is a fallback label
    },
    {
      id: 'view.toggle-eyedropper',
      label: 'Toggle Eyedropper',
      keys: 'I',
      key: 'i',
      category: 'view',
      action: () => uiStore.toggleEyedropper(),
    },
    {
      id: 'view.toggle-overlay',
      label: 'Toggle Overlay',
      keys: 'O',
      key: 'o',
      category: 'view',
      action: () => uiStore.toggleOverlay(),
    },
    {
      id: 'view.keyboard-shortcuts',
      label: 'Keyboard Shortcuts',
      keys: '?',
      key: '?',
      category: 'view',
      action: () => uiStore.openModal('keyboard-shortcuts'),
    },
    {
      id: 'view.escape',
      label: 'Clear Selection / Close Modal',
      keys: 'Esc',
      key: 'Escape',
      category: 'view',
      action: () => {
        if (uiStore.activeModal) {
          uiStore.closeModal();
        } else if (uiStore.eyedropperActive) {
          uiStore.toggleEyedropper();
        } else {
          timelineStore.clearSelection();
        }
      },
    },

    // ── Timeline ──────────────────────────────────────────────────────────────
    {
      id: 'timeline.zoom-in',
      label: 'Zoom In',
      keys: '+',
      key: '+',
      category: 'timeline',
      action: () => timelineStore.zoom(1.5),
    },
    {
      id: 'timeline.zoom-in-equals',
      label: 'Zoom In',
      keys: '=',
      key: '=',
      category: 'timeline',
      action: () => timelineStore.zoom(1.5),
    },
    {
      id: 'timeline.zoom-out',
      label: 'Zoom Out',
      keys: '-',
      key: '-',
      category: 'timeline',
      action: () => timelineStore.zoom(1 / 1.5),
    },
    {
      id: 'timeline.zoom-fit',
      label: 'Zoom to Fit',
      keys: `${MOD}0`,
      key: '0',
      ctrl: true,
      category: 'timeline',
      action: () => {
        if (videoStore.durationMs > 0) timelineStore.zoomToFit(videoStore.durationMs);
      },
    },
  ];
}

// ── Singleton shortcut list (built once) ─────────────────────────────────────
let shortcuts: ShortcutDef[] | null = null;

function getShortcutDefs(): ShortcutDef[] {
  if (!shortcuts) shortcuts = buildShortcuts();
  return shortcuts;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns all registered shortcuts for display in the dialog / command palette.
 * The `action` callback is stripped — callers only need `id`, `label`, `keys`,
 * and `category`.
 */
export function getShortcuts(): Array<{
  id: string;
  label: string;
  keys: string;
  category: ShortcutCategory;
}> {
  return getShortcutDefs().map(({ id, label, keys, category }) => ({
    id,
    label,
    keys,
    category,
  }));
}

/**
 * Adds a `keydown` listener to `window` that dispatches registered shortcuts.
 * Returns a cleanup function that removes the listener.
 *
 * Call once during app initialisation (e.g. in `+layout.svelte` `$effect`).
 */
export function initKeyboardShortcuts(): () => void {
  function handleKeydown(e: KeyboardEvent) {
    // Skip when focus is inside a text field (unless explicitly allowed).
    const tag = (document.activeElement as HTMLElement | null)?.tagName ?? '';
    const inInput = tag === 'INPUT' || tag === 'TEXTAREA';

    const defs = getShortcutDefs();

    for (const shortcut of defs) {
      if (inInput && !shortcut.allowInInput) continue;

      const ctrlMatch = shortcut.ctrl
        ? (isMac ? e.metaKey : e.ctrlKey)
        : !(e.metaKey || e.ctrlKey);
      const shiftMatch = shortcut.shift ? e.shiftKey : !e.shiftKey;
      const altMatch = shortcut.alt ? e.altKey : !e.altKey;
      const keyMatch = e.key === shortcut.key || e.key.toLowerCase() === shortcut.key.toLowerCase();

      if (ctrlMatch && shiftMatch && altMatch && keyMatch) {
        e.preventDefault();
        shortcut.action();
        // Don't break — only the first exact match fires. Because we iterate
        // in definition order, more-specific shortcuts (with more modifiers)
        // should be listed earlier.
        break;
      }
    }
  }

  window.addEventListener('keydown', handleKeydown);
  return () => window.removeEventListener('keydown', handleKeydown);
}
