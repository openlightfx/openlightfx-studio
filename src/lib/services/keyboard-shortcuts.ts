// ============================================================
// Keyboard Shortcuts Service — global keyboard shortcut handling
// ============================================================

import type { KeyboardShortcut, ShortcutCategory } from '$lib/types/index.js';

interface ParsedShortcut {
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  meta: boolean;
  key: string;
}

const INPUT_ELEMENTS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

function isMac(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Mac|iPod|iPhone|iPad/.test(navigator.platform ?? '');
}

/**
 * Parse a shortcut string like "Ctrl+S", "Cmd+Z", "Shift+Delete".
 * Normalizes Cmd to Ctrl on non-Mac platforms and vice versa.
 */
function parseShortcut(keys: string): ParsedShortcut {
  const parts = keys.split('+').map((p) => p.trim());
  const mac = isMac();

  const result: ParsedShortcut = {
    ctrl: false,
    shift: false,
    alt: false,
    meta: false,
    key: '',
  };

  for (const part of parts) {
    const lower = part.toLowerCase();
    if (lower === 'ctrl' || lower === 'control') {
      if (mac) {
        result.meta = true;
      } else {
        result.ctrl = true;
      }
    } else if (lower === 'cmd' || lower === 'command' || lower === 'meta') {
      if (mac) {
        result.meta = true;
      } else {
        result.ctrl = true;
      }
    } else if (lower === 'shift') {
      result.shift = true;
    } else if (lower === 'alt' || lower === 'option') {
      result.alt = true;
    } else {
      result.key = lower;
    }
  }

  return result;
}

function eventMatchesParsed(event: KeyboardEvent, parsed: ParsedShortcut): boolean {
  const mac = isMac();
  const ctrlMatch = mac ? event.metaKey === parsed.meta : event.ctrlKey === parsed.ctrl;
  const metaMatch = mac ? true : event.metaKey === parsed.meta;

  return (
    ctrlMatch &&
    metaMatch &&
    event.shiftKey === parsed.shift &&
    event.altKey === parsed.alt &&
    event.key.toLowerCase() === parsed.key
  );
}

export class KeyboardShortcutManager {
  private shortcuts: Map<string, { shortcut: KeyboardShortcut; parsed: ParsedShortcut }> =
    new Map();

  register(shortcut: KeyboardShortcut): void {
    this.shortcuts.set(shortcut.id, {
      shortcut,
      parsed: parseShortcut(shortcut.keys),
    });
  }

  unregister(id: string): void {
    this.shortcuts.delete(id);
  }

  /**
   * Handle a keydown event. Returns true if a matching shortcut was found and executed.
   * Skips processing when focus is in an input/textarea element.
   */
  handleKeyDown(event: KeyboardEvent): boolean {
    const target = event.target as Element | null;
    if (target && INPUT_ELEMENTS.has(target.tagName)) {
      return false;
    }

    // Also skip if the element is contentEditable
    if (target && (target as HTMLElement).isContentEditable) {
      return false;
    }

    for (const { shortcut, parsed } of this.shortcuts.values()) {
      if (eventMatchesParsed(event, parsed)) {
        event.preventDefault();
        event.stopPropagation();
        shortcut.action();
        return true;
      }
    }

    return false;
  }

  getAll(): KeyboardShortcut[] {
    return Array.from(this.shortcuts.values()).map((entry) => entry.shortcut);
  }

  getByCategory(category: ShortcutCategory): KeyboardShortcut[] {
    return this.getAll().filter((s) => s.category === category);
  }
}
