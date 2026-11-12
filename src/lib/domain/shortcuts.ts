export interface ShortcutBinding {
  action: string;
  keys: string[];
  button: boolean;
}

/** L1 map from KEYB-001. Browser chrome chords are absent. */
export const L1_SHORTCUTS: ShortcutBinding[] = [
  { action: 'save', keys: ['Ctrl+S', 'Cmd+S'], button: true },
  { action: 'undo', keys: ['Ctrl+Z', 'Cmd+Z'], button: true },
  { action: 'redo', keys: ['Ctrl+Shift+Z', 'Cmd+Shift+Z'], button: true },
  { action: 'play-pause', keys: ['Space'], button: true },
  { action: 'add-keyframe', keys: ['K'], button: false },
  { action: 'delete', keys: ['Delete', 'Backspace'], button: false },
  { action: 'step-back', keys: ['Left'], button: true },
  { action: 'step-forward', keys: ['Right'], button: true },
  { action: 'skip-back', keys: ['Shift+Left'], button: true },
  { action: 'skip-forward', keys: ['Shift+Right'], button: true },
  { action: 'zoom-in', keys: [']'], button: true },
  { action: 'zoom-out', keys: ['['], button: true },
  { action: 'zoom-fit', keys: ['\\'], button: true },
  { action: 'overlay', keys: ['V'], button: true },
  { action: 'eyedropper', keys: ['I'], button: true },
  { action: 'shortcut-help', keys: ['?'], button: true },
];

const FORBIDDEN = new Set([
  'Ctrl+L',
  'Cmd+L',
  'Ctrl+D',
  'Cmd+D',
  'Ctrl+K',
  'Cmd+K',
  'Ctrl++',
  'Cmd++',
  'Ctrl+-',
  'Cmd+-',
  'Ctrl+=',
  'Cmd+=',
  'Ctrl+0',
  'Cmd+0',
  'Ctrl+Shift+D',
  'Cmd+Shift+D',
  'Ctrl+Shift+P',
  'Cmd+Shift+P',
]);

export function shortcutChords(): string[] {
  return L1_SHORTCUTS.flatMap((binding) => binding.keys);
}

export function bindingFor(chord: string): ShortcutBinding | undefined {
  return L1_SHORTCUTS.find((binding) => binding.keys.includes(chord));
}

export function forbiddenChordsInRegistry(): string[] {
  return shortcutChords().filter((chord) => FORBIDDEN.has(chord));
}

export function isForbiddenChord(chord: string): boolean {
  return FORBIDDEN.has(chord);
}

export function zoomChords(): string[] {
  return ['[', ']', '\\'];
}

export function overlayChord(): string {
  return 'V';
}
