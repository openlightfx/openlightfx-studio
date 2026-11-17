import { describe, expect, it, vi } from 'vitest';
import {
  EDITOR_COMMANDS,
  commandForChord,
  commandEnabledReason,
  dispatchEditorCommand,
} from '../../src/lib/studio/editor-commands';

function fixture() {
  const session = Object.fromEntries(
    [
      'save',
      'undo',
      'redo',
      'togglePlay',
      'addAtPlayhead',
      'nudgeSelection',
      'deleteSelection',
      'copySelection',
      'cutSelection',
      'pasteSelection',
      'duplicateSelection',
      'skip',
      'step',
      'eyedrop',
      'zoomKey',
      'zoomFitSelection',
      'zoomFrameDetail',
      'navigateScene',
      'selectAllKeyframes',
      'clearSelection',
      'toggleOverlay',
    ].map((name) => [name, vi.fn()])
  ) as any;
  session.helpOpen = false;
  session.hostedSaveBlockedReason = '';
  session.selection = [];
  session.activeChannelId = 'left';
  session.clipboardAvailable = false;
  return session;
}
function event(key: string, extra: Partial<KeyboardEvent> = {}) {
  return {
    key,
    preventDefault: vi.fn(),
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    ...extra,
  } as unknown as KeyboardEvent;
}

describe('ED2-006 @unit editor command registry', () => {
  it('ED2-018 @unit shifted punctuation nudges ten frames and never consumes field text', () => {
    const session = fixture();
    session.selection = ['a'];
    const target = { closest: () => ({}), matches: () => false } as unknown as HTMLElement;
    const context = { session, target, modal: false, menu: false };
    const earlier = event('<', { shiftKey: true });
    expect(dispatchEditorCommand(earlier, context)).toBe(true);
    expect(earlier.preventDefault).toHaveBeenCalled();
    expect(session.nudgeSelection).toHaveBeenLastCalledWith(-1, 10, true);
    expect(dispatchEditorCommand(event('.'), context)).toBe(true);
    expect(session.nudgeSelection).toHaveBeenLastCalledWith(1, 1, true);
    expect(
      dispatchEditorCommand(event('.'), {
        ...context,
        target: { matches: () => true } as unknown as HTMLElement,
      })
    ).toBe(false);
    expect(session.nudgeSelection).toHaveBeenCalledTimes(2);
  });

  it('advertises only implemented commands and has no chord collision', () => {
    const chords = EDITOR_COMMANDS.flatMap((command) => command.chords);
    expect(new Set(chords).size).toBe(chords.length);
    expect(commandForChord('V')?.id).toBe('overlay-toggle');
    expect(commandForChord('K')?.id).toBe('add-keyframe');
    expect(commandForChord('I')?.id).toBe('eyedropper');
    expect(commandForChord('Ctrl/⌘ A')?.id).toBe('select-all');
    expect(commandForChord('Escape')?.id).toBe('clear-selection');
    expect(commandForChord('Shift+PageUp')?.id).toBe('previous-scene');
    expect(commandForChord('Shift+PageDown')?.id).toBe('next-scene');
    expect(commandForChord('PageUp')?.id).toBe('previous-keyframe');
  });

  it('Shift+PageUp seeks the previous scene without taking PageUp from keyframes', () => {
    const session = fixture();
    const context = {
      session,
      target: {
        tagName: 'BODY',
        closest: () => null,
        matches: () => false,
      } as unknown as HTMLElement,
      modal: false,
      menu: false,
    };
    const scene = event('PageUp', { shiftKey: true });
    expect(dispatchEditorCommand(scene, context)).toBe(true);
    expect(scene.preventDefault).toHaveBeenCalled();
    expect(session.navigateScene).toHaveBeenCalledWith(-1);
    expect(dispatchEditorCommand(event('PageDown', { shiftKey: true }), context)).toBe(true);
    expect(session.navigateScene).toHaveBeenLastCalledWith(1);
  });

  it('dispatches V only as a visual preference action, outside native/modal scopes', () => {
    const session = fixture();
    const body = {
      tagName: 'BODY',
      closest: () => null,
      matches: () => false,
    } as unknown as HTMLElement;
    expect(
      dispatchEditorCommand(event('v'), { session, target: body, modal: false, menu: false })
    ).toBe(true);
    expect(session.toggleOverlay).toHaveBeenCalledTimes(1);
    expect(
      dispatchEditorCommand(event('v'), { session, target: body, modal: true, menu: false })
    ).toBe(false);
    expect(
      dispatchEditorCommand(event('v'), {
        session,
        target: {
          matches: (selector: string) => selector.startsWith('input'),
        } as unknown as HTMLElement,
        modal: false,
        menu: false,
      })
    ).toBe(false);
    expect(session.toggleOverlay).toHaveBeenCalledTimes(1);
  });

  it('dispatches only in scope and leaves native, modal, menu, and reserved keys alone', () => {
    const session = fixture();
    const timeline = {
      closest: (selector: string) => (selector === '.timeline' ? timeline : null),
    } as unknown as HTMLElement;
    const target = {
      closest: (selector: string) => (selector === '.timeline' ? timeline : null),
      matches: () => false,
      blur: vi.fn(),
      focus: vi.fn(),
    } as unknown as HTMLElement;
    const context = { session, target, modal: false, menu: false };
    expect(dispatchEditorCommand(event('k'), context)).toBe(true);
    expect(session.addAtPlayhead).toHaveBeenCalledTimes(1);
    expect(
      dispatchEditorCommand(event('k'), {
        ...context,
        target: {
          matches: (selector: string) => selector.startsWith('input'),
        } as unknown as HTMLElement,
      })
    ).toBe(false);
    expect(dispatchEditorCommand(event(' '), { ...context, modal: true })).toBe(false);
    expect(dispatchEditorCommand(event('Delete'), { ...context, menu: true })).toBe(false);
    expect(
      dispatchEditorCommand(event('k'), {
        ...context,
        target: {
          tagName: 'BUTTON',
          closest: () => null,
          matches: () => false,
        } as unknown as HTMLElement,
      })
    ).toBe(false);
    expect(
      dispatchEditorCommand(event('k'), {
        ...context,
        target: {
          tagName: 'BODY',
          closest: () => null,
          matches: () => false,
        } as unknown as HTMLElement,
      })
    ).toBe(true);
    expect(dispatchEditorCommand(event('k'), { ...context, activeGesture: true })).toBe(false);
    expect(
      dispatchEditorCommand(event(' '), {
        ...context,
        target: {
          matches: (selector: string) => selector.startsWith('input'),
        } as unknown as HTMLElement,
      })
    ).toBe(false);
    expect(
      dispatchEditorCommand(event('z', { ctrlKey: true }), {
        ...context,
        target: {
          matches: (selector: string) => selector.includes('[contenteditable'),
        } as unknown as HTMLElement,
      })
    ).toBe(false);
    expect(
      dispatchEditorCommand(event('z', { ctrlKey: true }), {
        ...context,
        target: {
          matches: (selector: string) => selector.startsWith('input'),
        } as unknown as HTMLElement,
      })
    ).toBe(false);
    for (const key of ['l', 'd', 'k', '+', '-', '0']) {
      expect(dispatchEditorCommand(event(key, { ctrlKey: true }), context)).toBe(false);
    }
    expect(session.deleteSelection).not.toHaveBeenCalled();
    expect(session.togglePlay).not.toHaveBeenCalled();
  });

  it('blocks Save in the command registry while the hosted sidecar baseline is unknown', () => {
    const session = fixture();
    session.hostedSaveBlockedReason =
      'Project sidecar could not be loaded. Retry loading the project before saving.';
    const saveCommand = EDITOR_COMMANDS.find((command) => command.id === 'save')!;
    const context = { session, target: null, modal: false, menu: false };
    expect(commandEnabledReason(saveCommand, context)).toBe(session.hostedSaveBlockedReason);
    expect(dispatchEditorCommand(event('s', { ctrlKey: true }), context)).toBe(false);
    expect(session.save).not.toHaveBeenCalled();
  });

  it('scopes Select All and Escape to timeline focus and preserves native text selection', () => {
    const session = fixture();
    const timeline = {
      closest: (selector: string) => (selector === '.timeline' ? timeline : null),
      matches: () => false,
    } as unknown as HTMLElement;
    const context = { session, target: timeline, modal: false, menu: false };
    const selectAll = event('a', { ctrlKey: true });
    expect(dispatchEditorCommand(selectAll, context)).toBe(true);
    expect(selectAll.preventDefault).toHaveBeenCalledTimes(1);
    expect(session.selectAllKeyframes).toHaveBeenCalledTimes(1);
    expect(dispatchEditorCommand(event('Escape'), context)).toBe(true);
    expect(session.clearSelection).toHaveBeenCalledTimes(1);

    const input = {
      tagName: 'INPUT',
      closest: () => null,
      matches: (selector: string) => selector.includes('input'),
    } as unknown as HTMLElement;
    expect(
      dispatchEditorCommand(event('a', { ctrlKey: true }), { ...context, target: input })
    ).toBe(false);
    expect(dispatchEditorCommand(event('Escape'), { ...context, target: input })).toBe(false);
    expect(dispatchEditorCommand(event('a', { ctrlKey: true }), { ...context, target: null })).toBe(
      false
    );
  });

  it('ED2-020 @unit keeps lighting clipboard scoped, native fields native and bookmark unclaimed', () => {
    const session = fixture();
    session.selection = ['a'];
    const target = { closest: () => ({}), matches: () => false } as unknown as HTMLElement;
    const context = { session, target, modal: false, menu: false };
    for (const [key, method] of [
      ['c', 'copySelection'],
      ['x', 'cutSelection'],
    ] as const) {
      const chord = event(key, { ctrlKey: true });
      expect(dispatchEditorCommand(chord, context)).toBe(true);
      expect(chord.preventDefault).toHaveBeenCalledOnce();
      expect(session[method]).toHaveBeenCalledOnce();
    }
    expect(dispatchEditorCommand(event('v', { metaKey: true }), context)).toBe(false);
    session.clipboardAvailable = true;
    expect(dispatchEditorCommand(event('v', { metaKey: true }), context)).toBe(true);
    expect(session.pasteSelection).toHaveBeenCalledOnce();
    expect(dispatchEditorCommand(event('d', { ctrlKey: true }), context)).toBe(false);
    expect(dispatchEditorCommand(event('D', { shiftKey: true }), context)).toBe(true);
    expect(session.duplicateSelection).toHaveBeenCalledOnce();
    const input = { matches: () => true } as unknown as HTMLElement;
    const outside = {
      matches: () => false,
      closest: () => null,
      tagName: 'BODY',
    } as unknown as HTMLElement;
    for (const scopedTarget of [input, outside]) {
      for (const key of ['c', 'x', 'v'])
        expect(
          dispatchEditorCommand(event(key, { ctrlKey: true }), { ...context, target: scopedTarget })
        ).toBe(false);
    }
  });

  it('registers Fit selection as disabled without selected keyframes', () => {
    const command = EDITOR_COMMANDS.find((entry) => entry.id === 'zoom-fit-selection')!;
    const session = fixture();
    const context = { session, target: null, modal: false, menu: false };
    expect(commandEnabledReason(command, context)).toBe('Select one or more keyframes first');
    session.selection = ['kf'];
    expect(commandEnabledReason(command, context)).toBeUndefined();
  });

  it('permits Save in a valid ordinary field and uses a single registry execution', () => {
    const session = fixture();
    const input = {
      matches: (selector: string) => selector.startsWith('input'),
      blur: vi.fn(),
      focus: vi.fn(),
    } as unknown as HTMLElement;
    const save = event('s', { ctrlKey: true });
    expect(dispatchEditorCommand(save, { session, target: input, modal: false, menu: false })).toBe(
      true
    );
    expect(session.save).toHaveBeenCalledTimes(1);
    expect(save.preventDefault).toHaveBeenCalledTimes(1);
  });
});
