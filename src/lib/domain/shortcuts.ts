import { EDITOR_COMMANDS } from '../studio/editor-commands';

export interface ShortcutBinding {
  action: string;
  keys: string[];
  button: boolean;
}

const legacyAction: Record<string, string> = {
  'play-pause': 'play-pause',
  'add-keyframe': 'add-keyframe',
  delete: 'delete',
  'step-back': 'step-back',
  'step-forward': 'step-forward',
  'skip-back': 'skip-back',
  'skip-forward': 'skip-forward',
  'previous-keyframe': 'previous-keyframe',
  'next-keyframe': 'next-keyframe',
  'previous-scene': 'previous-scene',
  'next-scene': 'next-scene',
  'movie-start': 'movie-start',
  'movie-end': 'movie-end',
  'zoom-in': 'zoom-in',
  'zoom-out': 'zoom-out',
  'zoom-fit': 'zoom-fit',
  'overlay-toggle': 'overlay-toggle',
  eyedropper: 'eyedropper',
  'shortcut-help': 'shortcut-help',
  save: 'save',
  undo: 'undo',
  redo: 'redo',
};

function legacyChords(chords: string[]): string[] {
  return chords.flatMap((chord) => {
    if (chord.startsWith('Ctrl/⌘ Shift ')) {
      const key = chord.slice('Ctrl/⌘ Shift '.length);
      return [`Ctrl+Shift+${key}`, `Cmd+Shift+${key}`];
    }
    if (chord.startsWith('Ctrl/⌘ ')) {
      const key = chord.slice('Ctrl/⌘ '.length);
      return [`Ctrl+${key}`, `Cmd+${key}`];
    }
    return [
      chord === '←'
        ? 'Left'
        : chord === '→'
          ? 'Right'
          : chord.startsWith('Shift+←')
            ? 'Shift+Left'
            : chord.startsWith('Shift+→')
              ? 'Shift+Right'
              : chord,
    ];
  });
}

/** Compatibility view; editor-commands.ts is the authoritative registry. */
export const L1_SHORTCUTS: ShortcutBinding[] = EDITOR_COMMANDS.filter(
  (command) => command.chords.length
).map((command) => ({
  action: legacyAction[command.id] ?? command.id,
  keys: legacyChords(command.chords),
  button: [
    'save',
    'undo',
    'redo',
    'play-pause',
    'step-back',
    'step-forward',
    'skip-back',
    'skip-forward',
    'previous-keyframe',
    'next-keyframe',
    'previous-scene',
    'next-scene',
    'movie-start',
    'movie-end',
    'zoom-in',
    'zoom-out',
    'zoom-fit',
    'eyedropper',
    'shortcut-help',
  ].includes(command.id),
}));

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
  return EDITOR_COMMANDS.find((command) => command.id === 'overlay-toggle')?.chords[0] ?? '';
}
