export type EditorCommandScope =
  | 'gesture'
  | 'modal-menu'
  | 'field-native'
  | 'timeline'
  | 'timeline-focused'
  | 'editor';

export interface EditorCommandContext {
  session: {
    hostedSaveBlockedReason: string;
    save(): Promise<unknown>;
    undo(): void;
    redo(): void;
    togglePlay(): void;
    addAtPlayhead(): void;
    addMarker(): void;
    openEffectPicker(channelId?: string | null): void;
    setRangeBoundary(boundary: 'startMs' | 'endMs'): void;
    nudgeSelection(direction: -1 | 1, frames?: number, grouped?: boolean): void;
    deleteSelection(): void;
    copySelection(): void;
    cutSelection(): void;
    pasteSelection(): void;
    duplicateSelection(): void;
    clipboardAvailable: boolean;
    skip(direction: number): void;
    step(direction: number): void;
    navigateKeyframe(direction: number): void;
    canNavigateKeyframe(direction: number): boolean;
    navigateScene(direction: number): void;
    canNavigateScene(direction: number): boolean;
    seekBoundary(end: boolean): void;
    eyedrop(): Promise<unknown>;
    zoomKey(key: string, modified: boolean): void;
    zoomFitSelection(): boolean;
    zoomFrameDetail(): void;
    selectAllKeyframes(): void;
    clearSelection(): void;
    toggleOverlay(): void;
    selection: string[];
    activeChannelId: string | null;
    helpOpen: boolean;
  };
  target: HTMLElement | null;
  modal: boolean;
  menu: boolean;
  activeGesture?: boolean;
}

export interface EditorCommand {
  id: string;
  label: string;
  chords: string[];
  scope: EditorCommandScope;
  enabledReason?: (context: EditorCommandContext) => string | undefined;
  execute: (context: EditorCommandContext) => void | Promise<void>;
}

const inputTarget = (target: HTMLElement | null) =>
  Boolean(
    target?.matches(
      'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]'
    )
  );

export const EDITOR_COMMANDS: readonly EditorCommand[] = [
  {
    id: 'save',
    label: 'Save',
    chords: ['Ctrl/⌘ S'],
    scope: 'editor',
    enabledReason: ({ session }) => session.hostedSaveBlockedReason || undefined,
    execute: ({ session, target }) => {
      target?.blur();
      target?.focus({ preventScroll: true });
      void session.save();
    },
  },
  {
    id: 'undo',
    label: 'Undo',
    chords: ['Ctrl/⌘ Z'],
    scope: 'editor',
    execute: ({ session }) => session.undo(),
  },
  {
    id: 'redo',
    label: 'Redo',
    chords: ['Ctrl/⌘ Shift Z'],
    scope: 'editor',
    execute: ({ session }) => session.redo(),
  },
  {
    id: 'play-pause',
    label: 'Play / pause',
    chords: ['Space'],
    scope: 'editor',
    execute: ({ session }) => session.togglePlay(),
  },
  {
    id: 'add-keyframe',
    label: 'Add keyframe',
    chords: ['K'],
    scope: 'timeline',
    enabledReason: ({ session }) =>
      session.activeChannelId ? undefined : 'Select a lane before adding a keyframe',
    execute: ({ session }) => session.addAtPlayhead(),
  },
  {
    id: 'range-start',
    label: 'Set range start',
    chords: ['Shift+I'],
    scope: 'timeline',
    execute: ({ session }) => session.setRangeBoundary('startMs'),
  },
  {
    id: 'range-end',
    label: 'Set range end',
    chords: ['Shift+O'],
    scope: 'timeline',
    execute: ({ session }) => session.setRangeBoundary('endMs'),
  },
  {
    id: 'add-marker',
    label: 'Add scene marker',
    chords: ['M'],
    scope: 'timeline',
    execute: ({ session }) => session.addMarker(),
  },
  {
    id: 'effect-picker',
    label: 'Add effect',
    chords: ['E'],
    scope: 'editor',
    execute: ({ session }) => session.openEffectPicker(),
  },
  {
    id: 'nudge-earlier',
    label: 'Nudge earlier',
    chords: [','],
    scope: 'timeline',
    enabledReason: ({ session }) =>
      session.selection.length ? undefined : 'Select one or more keyframes to nudge',
    execute: ({ session }) => session.nudgeSelection(-1),
  },
  {
    id: 'nudge-later',
    label: 'Nudge later',
    chords: ['.'],
    scope: 'timeline',
    enabledReason: ({ session }) =>
      session.selection.length ? undefined : 'Select one or more keyframes to nudge',
    execute: ({ session }) => session.nudgeSelection(1),
  },
  {
    id: 'nudge-earlier-ten',
    label: 'Nudge earlier ten frames',
    chords: ['Shift+,'],
    scope: 'timeline',
    enabledReason: ({ session }) =>
      session.selection.length ? undefined : 'Select one or more keyframes to nudge',
    execute: ({ session }) => session.nudgeSelection(-1, 10),
  },
  {
    id: 'nudge-later-ten',
    label: 'Nudge later ten frames',
    chords: ['Shift+.'],
    scope: 'timeline',
    enabledReason: ({ session }) =>
      session.selection.length ? undefined : 'Select one or more keyframes to nudge',
    execute: ({ session }) => session.nudgeSelection(1, 10),
  },
  {
    id: 'delete',
    label: 'Delete keyframe',
    chords: ['Delete', 'Backspace'],
    scope: 'timeline',
    execute: ({ session }) => session.deleteSelection(),
  },
  ...(['copy', 'cut', 'paste', 'duplicate'] as const).map(
    (id): EditorCommand => ({
      id,
      label: {
        copy: 'Copy keyframes',
        cut: 'Cut keyframes',
        paste: 'Paste keyframes',
        duplicate: 'Duplicate keyframes',
      }[id],
      chords:
        id === 'duplicate' ? ['Shift+D'] : [`Ctrl/⌘ ${{ copy: 'C', cut: 'X', paste: 'V' }[id]}`],
      scope: 'timeline-focused',
      enabledReason: ({ session }) =>
        id === 'paste'
          ? session.clipboardAvailable
            ? undefined
            : 'Copy keyframes before pasting'
          : session.selection.length
            ? undefined
            : 'Select keyframes first',
      execute: ({ session }) => session[`${id}Selection`](),
    })
  ),
  {
    id: 'step-back',
    label: 'Previous frame',
    chords: ['←'],
    scope: 'editor',
    execute: ({ session }) => session.step(-1),
  },
  {
    id: 'step-forward',
    label: 'Next frame',
    chords: ['→'],
    scope: 'editor',
    execute: ({ session }) => session.step(1),
  },
  {
    id: 'skip-back',
    label: 'Back 5 seconds',
    chords: ['Shift+←'],
    scope: 'editor',
    execute: ({ session }) => session.skip(-1),
  },
  {
    id: 'skip-forward',
    label: 'Forward 5 seconds',
    chords: ['Shift+→'],
    scope: 'editor',
    execute: ({ session }) => session.skip(1),
  },
  {
    id: 'previous-keyframe',
    label: 'Previous keyframe',
    chords: ['PageUp'],
    scope: 'timeline',
    enabledReason: ({ session }) =>
      session.canNavigateKeyframe(-1) ? undefined : 'No earlier keyframe in this lane',
    execute: ({ session }) => session.navigateKeyframe(-1),
  },
  {
    id: 'next-keyframe',
    label: 'Next keyframe',
    chords: ['PageDown'],
    scope: 'timeline',
    enabledReason: ({ session }) =>
      session.canNavigateKeyframe(1) ? undefined : 'No later keyframe in this lane',
    execute: ({ session }) => session.navigateKeyframe(1),
  },
  {
    id: 'previous-scene',
    label: 'Previous scene',
    chords: ['Shift+PageUp'],
    scope: 'editor',
    execute: ({ session }) => session.navigateScene(-1),
  },
  {
    id: 'next-scene',
    label: 'Next scene',
    chords: ['Shift+PageDown'],
    scope: 'editor',
    execute: ({ session }) => session.navigateScene(1),
  },
  {
    id: 'movie-start',
    label: 'Go to movie start',
    chords: ['Home'],
    scope: 'timeline',
    execute: ({ session }) => session.seekBoundary(false),
  },
  {
    id: 'movie-end',
    label: 'Go to movie end',
    chords: ['End'],
    scope: 'timeline',
    execute: ({ session }) => session.seekBoundary(true),
  },
  {
    id: 'zoom-in',
    label: 'Zoom in',
    chords: [']'],
    scope: 'timeline',
    execute: ({ session }) => session.zoomKey(']', false),
  },
  {
    id: 'zoom-out',
    label: 'Zoom out',
    chords: ['['],
    scope: 'timeline',
    execute: ({ session }) => session.zoomKey('[', false),
  },
  {
    id: 'zoom-fit',
    label: 'Fit movie',
    chords: ['\\'],
    scope: 'timeline',
    execute: ({ session }) => session.zoomKey('\\', false),
  },
  {
    id: 'select-all',
    label: 'Select all keyframes',
    chords: ['Ctrl/⌘ A'],
    scope: 'timeline-focused',
    execute: ({ session }) => session.selectAllKeyframes(),
  },
  {
    id: 'clear-selection',
    label: 'Clear selection',
    chords: ['Escape'],
    scope: 'timeline-focused',
    execute: ({ session }) => session.clearSelection(),
  },
  {
    id: 'zoom-fit-selection',
    label: 'Fit selection',
    chords: [],
    scope: 'timeline',
    enabledReason: ({ session }) =>
      session.selection.length ? undefined : 'Select one or more keyframes first',
    execute: ({ session }) => {
      session.zoomFitSelection();
    },
  },
  {
    id: 'zoom-frame-detail',
    label: 'Frame detail',
    chords: [],
    scope: 'timeline',
    execute: ({ session }) => session.zoomFrameDetail(),
  },
  {
    id: 'overlay-toggle',
    label: 'Toggle visual overlay',
    chords: ['V'],
    scope: 'editor',
    execute: ({ session }) => session.toggleOverlay(),
  },
  {
    id: 'eyedropper',
    label: 'Eyedropper / pick color from frame',
    chords: ['I'],
    scope: 'editor',
    execute: ({ session }) => {
      void session.eyedrop();
    },
  },
  {
    id: 'shortcut-help',
    label: 'Keyboard shortcuts',
    chords: ['?'],
    scope: 'editor',
    execute: ({ session }) => {
      session.helpOpen = true;
    },
  },
];

export function commandForChord(chord: string): EditorCommand | undefined {
  return EDITOR_COMMANDS.find((command) => command.chords.includes(chord));
}

export function commandForId(id: string): EditorCommand | undefined {
  return EDITOR_COMMANDS.find((command) => command.id === id);
}

/** Dispatch obeys the documented outer-to-inner scope precedence. Returns true if consumed. */
export function dispatchEditorCommand(
  event: KeyboardEvent,
  context: EditorCommandContext
): boolean {
  const key = event.key;
  const modified = event.ctrlKey || event.metaKey;
  const chord = modified
    ? `${event.shiftKey ? 'Ctrl/⌘ Shift' : 'Ctrl/⌘'} ${key.toUpperCase()}`
    : event.shiftKey && (key === ',' || key === '.' || key === '<' || key === '>')
      ? `Shift+${key === '<' ? ',' : key === '>' ? '.' : key}`
      : event.shiftKey && ['d', 'i', 'o'].includes(key.toLowerCase())
        ? `Shift+${key.toUpperCase()}`
        : event.shiftKey && (key === 'ArrowLeft' || key === 'ArrowRight')
          ? `Shift+${key === 'ArrowLeft' ? '←' : '→'}`
          : event.shiftKey && (key === 'PageUp' || key === 'PageDown')
            ? `Shift+${key}`
            : key === 'ArrowLeft'
              ? '←'
              : key === 'ArrowRight'
                ? '→'
                : key === ' ' || key === 'Spacebar'
                  ? 'Space'
                  : key === '/' && event.shiftKey
                    ? '?'
                    : key.length === 1
                      ? key.toUpperCase()
                      : key;
  const command = commandForChord(chord);
  if (!command) return false;
  if (context.activeGesture || context.modal || context.menu) return false;
  if (inputTarget(context.target)) {
    if (command.id !== 'save' || !modified) return false;
  }
  if (command.scope === 'timeline' || command.scope === 'timeline-focused') {
    const target = context.target;
    const inTimeline = Boolean(target?.closest('.timeline'));
    const editorDefaultFocus =
      command.scope === 'timeline' &&
      (!target || target.tagName === 'BODY' || Boolean(target.matches('.editor')));
    if (!inTimeline && !editorDefaultFocus) return false;
  }
  if (command.enabledReason?.(context)) {
    if (command.id === 'save') event.preventDefault();
    return false;
  }
  if (
    command.id === 'save' ||
    command.id === 'undo' ||
    command.id === 'redo' ||
    command.id === 'delete' ||
    ['copy', 'cut', 'paste', 'duplicate'].includes(command.id) ||
    command.id === 'select-all' ||
    command.id === 'clear-selection' ||
    command.id.startsWith('nudge-') ||
    command.id.startsWith('step-') ||
    command.id.startsWith('skip-') ||
    command.id === 'play-pause' ||
    command.id === 'effect-picker' ||
    command.id === 'previous-keyframe' ||
    command.id === 'next-keyframe' ||
    command.id === 'previous-scene' ||
    command.id === 'next-scene' ||
    command.id === 'movie-start' ||
    command.id === 'movie-end'
  )
    event.preventDefault();
  if (command.id.startsWith('nudge-')) {
    context.session.nudgeSelection(
      command.id.includes('earlier') ? -1 : 1,
      command.id.endsWith('-ten') ? 10 : 1,
      true
    );
  } else void command.execute(context);
  return true;
}

export const commandEnabledReason = (command: EditorCommand, context: EditorCommandContext) =>
  command.enabledReason?.(context);
