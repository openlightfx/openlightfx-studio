import { describe, expect } from 'vitest';
import { createEditTransaction, createHistory, createIdAllocator } from '../../src/lib/domain';
import { requirement } from '../harness/requirement';

describe('editor authored transactions', () => {
  requirement('ED2-005 @unit transient updates become exactly one committed action', () => {
    const persisted: { value: number }[] = [];
    const drafts: ({ value: number } | null)[] = [];
    let committed = { value: 0 };
    let exported = committed;
    const transaction = createEditTransaction<{ value: number }>(
      (snapshot) => {
        committed = structuredClone(snapshot);
        exported = structuredClone(snapshot);
        persisted.push(structuredClone(snapshot));
      },
      (draft) => drafts.push(draft)
    );

    transaction.begin(committed, 'Scrub brightness');
    for (let value = 1; value <= 100; value += 1) expect(transaction.update({ value })).toBe(true);
    expect(transaction.active).toBe(true);
    expect(drafts).toHaveLength(101);
    expect(drafts.at(-1)).toEqual({ value: 100 });
    expect(committed).toEqual({ value: 0 });
    expect(exported).toEqual({ value: 0 });
    expect(persisted).toHaveLength(0);

    expect(transaction.commit()).toBe(true);
    expect(transaction.active).toBe(false);
    expect(drafts.at(-1)).toBeNull();
    expect(committed).toEqual({ value: 100 });
    expect(exported).toEqual({ value: 100 });
    expect(persisted).toEqual([{ value: 100 }]);
  });

  requirement(
    'ED2-027 @unit hydration rebases past current future and active transaction sidecars',
    () => {
      type Snapshot = { label: string; sidecar: { note: string } };
      const history = createHistory<Snapshot>({ label: 'zero', sidecar: { note: 'empty' } });
      history.edit({ label: 'one', sidecar: { note: 'empty' } });
      history.edit({ label: 'two', sidecar: { note: 'empty' } });
      history.edit({ label: 'three', sidecar: { note: 'empty' } });
      history.undo();
      history.undo();

      const committed: Snapshot[] = [];
      const transaction = createEditTransaction<Snapshot>(
        (snapshot) => committed.push(snapshot),
        () => {}
      );
      transaction.begin({ label: 'before draft', sidecar: { note: 'empty' } }, 'Track drag');
      transaction.update({ label: 'active draft', sidecar: { note: 'empty' } });
      const hydrated = { note: 'server metadata' };
      const rebase = (snapshot: Snapshot): Snapshot => ({ ...snapshot, sidecar: hydrated });

      history.mapSnapshots(rebase);
      transaction.mapSnapshots(rebase);
      expect(history.current).toEqual({ label: 'one', sidecar: hydrated });
      expect(history.undo()).toEqual({ label: 'zero', sidecar: hydrated });
      expect(history.redo()).toEqual({ label: 'one', sidecar: hydrated });
      expect(history.redo()).toEqual({ label: 'two', sidecar: hydrated });
      expect(history.redo()).toEqual({ label: 'three', sidecar: hydrated });
      expect(transaction.commit()).toBe(true);
      expect(committed).toEqual([{ label: 'active draft', sidecar: hydrated }]);
    }
  );

  requirement('ED2-005 @unit canceled and no-op drafts do not commit', () => {
    const commits: number[] = [];
    const drafts: (number | null)[] = [];
    const transaction = createEditTransaction<number>(
      (value) => commits.push(value),
      (draft) => drafts.push(draft)
    );

    transaction.begin(4, 'Canceled edit');
    transaction.update(8);
    transaction.cancel();
    expect(transaction.commit()).toBe(false);
    expect(commits).toEqual([]);
    expect(drafts.at(-1)).toBeNull();

    transaction.begin(4, 'No-op edit');
    transaction.update(4);
    expect(transaction.commit()).toBe(false);
    expect(commits).toEqual([]);
  });

  requirement('ED2-005 @unit history branches, bounds, and protects immutable snapshots', () => {
    const original = { nested: { values: [1] } };
    const history = createHistory(original, 2);
    history.edit({ nested: { values: [2] } });
    history.edit({ nested: { values: [3] } });
    history.edit({ nested: { values: [4] } });
    original.nested.values.push(99);
    history.current.nested.values.push(100);

    expect(history.undo()).toEqual({ nested: { values: [3] } });
    expect(history.undo()).toEqual({ nested: { values: [2] } });
    expect(history.canUndo).toBe(false);
    expect(history.undo()).toEqual({ nested: { values: [2] } });
    expect(history.redo()).toEqual({ nested: { values: [3] } });
    history.edit({ nested: { values: [5] } });
    expect(history.canRedo).toBe(false);
    expect(history.redo()).toEqual({ nested: { values: [5] } });
  });

  requirement(
    'ED2-005 @unit loaded key and effect ids are excluded by the injectable allocator',
    () => {
      const usedIds = new Set(['kf-1', 'kf-2']);
      const generated = ['kf-1', 'kf-2', 'kf-3', 'kf-3', 'kf-4'];
      const allocate = createIdAllocator(
        () => usedIds,
        () => generated.shift() ?? 'fallback'
      );

      expect(allocate('kf')).toBe('kf-3');
      usedIds.delete('kf-3'); // undo removes it from the live document, not the allocator reservation
      expect(allocate('kf')).toBe('kf-4');
    }
  );
});
