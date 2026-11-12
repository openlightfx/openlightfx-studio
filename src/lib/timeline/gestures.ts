import type { ItemPlacement } from '$lib/model/edit';
import { editor } from '$lib/state/editor.svelte';
import { hitTest, rectHits, type Hit } from '$lib/timeline/hit';
import { ROW_H, SNAP_PX, xToTime } from '$lib/timeline/geometry';
import { snapTime, type SnapTarget } from '$lib/timeline/snap';

type Phase =
  | { type: 'idle' }
  | {
      type: 'pending';
      pointerId: number;
      x: number;
      y: number;
      hit: Hit;
      shift: boolean;
      ctrl: boolean;
    }
  | { type: 'seek'; pointerId: number }
  | {
      type: 'marquee';
      pointerId: number;
      x0: number;
      y0: number;
      shift: boolean;
      ctrl: boolean;
      baseKf: string[];
      baseFx: string[];
    }
  | {
      type: 'move';
      pointerId: number;
      originX: number;
      originY: number;
      grabId: string;
      originals: ItemPlacement[];
    }
  | { type: 'resize-kf'; pointerId: number; id: string; timestampMs: number; channelId: string }
  | {
      type: 'resize-fx';
      pointerId: number;
      id: string;
      edge: 'start' | 'end';
      start: number;
      duration: number;
      channelId: string;
    }
  | { type: 'pan'; pointerId: number; lastX: number };

export function attachTimeline(canvas: HTMLCanvasElement): () => void {
  const local = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  let phase: Phase = { type: 'idle' };

  const targets = (exclude: Set<string>): SnapTarget[] => {
    const out: SnapTarget[] = [
      { timeMs: editor.playheadMs, kind: 'playhead' },
      { timeMs: 0, kind: 'marker' }
    ];
    for (const kf of editor.track.keyframes) {
      if (exclude.has(kf.id)) continue;
      out.push({ timeMs: kf.timestampMs, kind: 'keyframe' });
    }
    for (const fx of editor.track.effectKeyframes) {
      if (exclude.has(fx.id)) continue;
      out.push({ timeMs: fx.timestampMs, kind: 'effect' });
      out.push({ timeMs: fx.timestampMs + fx.durationMs, kind: 'effect' });
    }
    for (const marker of editor.markers) {
      if (exclude.has(marker.id)) continue;
      out.push({ timeMs: marker.timestampMs, kind: 'marker' });
    }
    return out;
  };

  const snap = (timeMs: number, exclude: Set<string>) => {
    const view = editor.view();
    return snapTime(timeMs, targets(exclude), SNAP_PX / view.pixelsPerMs, editor.snapEnabled);
  };

  const captureSelection = (): ItemPlacement[] => {
    const ids = editor.selectedIds();
    const items: ItemPlacement[] = [];
    for (const kf of editor.track.keyframes) {
      if (!ids.has(kf.id)) continue;
      items.push({
        kind: 'keyframe',
        id: kf.id,
        channelId: kf.channelId,
        timestampMs: kf.timestampMs,
        durationMs: 0,
        transitionMs: kf.transitionMs
      });
    }
    for (const fx of editor.track.effectKeyframes) {
      if (!ids.has(fx.id)) continue;
      items.push({
        kind: 'effect',
        id: fx.id,
        channelId: fx.channelId,
        timestampMs: fx.timestampMs,
        durationMs: fx.durationMs,
        transitionMs: 0
      });
    }
    for (const marker of editor.markers) {
      if (!ids.has(marker.id)) continue;
      items.push({
        kind: 'marker',
        id: marker.id,
        channelId: '',
        timestampMs: marker.timestampMs,
        durationMs: 0,
        transitionMs: 0
      });
    }
    return items;
  };

  const applyHitSelection = (hit: Hit, shift: boolean, ctrl: boolean) => {
    if (hit.type === 'item') {
      const key = hit.kind === 'keyframe' ? 'keyframes' : 'effects';
      const current = editor.selection[key];
      if (shift) {
        editor.setSelection({
          [key]: current.includes(hit.id) ? current : [...current, hit.id],
          channelId: hit.channelId
        });
      } else if (ctrl) {
        editor.setSelection({
          [key]: current.includes(hit.id) ? current.filter((id) => id !== hit.id) : [...current, hit.id],
          channelId: hit.channelId
        });
      } else if (!editor.selectedIds().has(hit.id)) {
        editor.setSelection({
          keyframes: hit.kind === 'keyframe' ? [hit.id] : [],
          effects: hit.kind === 'effect' ? [hit.id] : [],
          markers: [],
          channelId: hit.channelId
        });
      } else {
        editor.setSelection({ channelId: hit.channelId });
      }
    } else if (hit.type === 'marker') {
      if (shift) {
        const markers = editor.selection.markers.includes(hit.id)
          ? editor.selection.markers
          : [...editor.selection.markers, hit.id];
        editor.setSelection({ markers });
      } else if (!editor.selectedIds().has(hit.id)) {
        editor.setSelection({ keyframes: [], effects: [], markers: [hit.id] });
      }
    }
  };

  const onDown = (event: PointerEvent) => {
    if (event.button === 2) return;
    canvas.setPointerCapture(event.pointerId);
    const { x, y } = local(event);
    if (event.button === 1) {
      phase = { type: 'pan', pointerId: event.pointerId, lastX: x };
      return;
    }
    const hit = hitTest({
      x,
      y,
      view: editor.view(),
      items: editor.placed(),
      markers: editor.markers,
      selected: editor.selectedIds(),
      playheadMs: editor.playheadMs,
      channels: editor.track.channels
    });
    const shift = event.shiftKey;
    const ctrl = event.ctrlKey || event.metaKey;
    if (hit.type === 'lane' && event.detail >= 2) {
      editor.addKeyframeAt(hit.channelId, hit.timeMs);
      phase = { type: 'idle' };
      return;
    }
    if (hit.type === 'handle' && hit.kind === 'keyframe') {
      const kf = editor.track.keyframes.find((k) => k.id === hit.id);
      if (!kf) return;
      phase = {
        type: 'resize-kf',
        pointerId: event.pointerId,
        id: kf.id,
        timestampMs: kf.timestampMs,
        channelId: kf.channelId
      };
      return;
    }
    if (hit.type === 'handle' && hit.kind === 'effect') {
      const fx = editor.track.effectKeyframes.find((e) => e.id === hit.id);
      if (!fx) return;
      phase = {
        type: 'resize-fx',
        pointerId: event.pointerId,
        id: fx.id,
        edge: hit.edge,
        start: fx.timestampMs,
        duration: fx.durationMs,
        channelId: fx.channelId
      };
      return;
    }
    if (hit.type === 'playhead' || hit.type === 'ruler') {
      editor.setPlayhead(hit.type === 'ruler' ? hit.timeMs : xToTime(editor.view(), x));
      phase = { type: 'seek', pointerId: event.pointerId };
      return;
    }
    applyHitSelection(hit, shift, ctrl);
    phase = { type: 'pending', pointerId: event.pointerId, x, y, hit, shift, ctrl };
  };

  const onMove = (event: PointerEvent) => {
    const { x, y } = local(event);
    if (phase.type === 'pan' && phase.pointerId === event.pointerId) {
      editor.panPixels(phase.lastX - x);
      phase = { ...phase, lastX: x };
      return;
    }
    if (phase.type === 'seek' && phase.pointerId === event.pointerId) {
      editor.setPlayhead(Math.max(0, xToTime(editor.view(), x)));
      return;
    }
    if (phase.type === 'pending' && phase.pointerId === event.pointerId) {
      if (Math.hypot(x - phase.x, y - phase.y) < 4) return;
      const hit = phase.hit;
      if (hit.type === 'item' || hit.type === 'marker') {
        const originals = captureSelection();
        if (originals.length === 0) {
          phase = { type: 'idle' };
          return;
        }
        phase = {
          type: 'move',
          pointerId: event.pointerId,
          originX: phase.x,
          originY: phase.y,
          grabId: hit.id,
          originals
        };
      } else if (hit.type === 'lane' || hit.type === 'empty') {
        phase = {
          type: 'marquee',
          pointerId: event.pointerId,
          x0: phase.x,
          y0: phase.y,
          shift: phase.shift,
          ctrl: phase.ctrl,
          baseKf: editor.selection.keyframes.slice(),
          baseFx: editor.selection.effects.slice()
        };
      } else {
        phase = { type: 'idle' };
        return;
      }
    }
    if (phase.type === 'marquee' && phase.pointerId === event.pointerId) {
      editor.marquee = { x0: phase.x0, y0: phase.y0, x1: x, y1: y };
      const hits = rectHits(editor.view(), editor.placed(), phase.x0, phase.y0, x, y);
      if (phase.shift) {
        editor.setSelection({
          keyframes: [...new Set([...phase.baseKf, ...hits.keyframes])],
          effects: [...new Set([...phase.baseFx, ...hits.effects])]
        });
      } else if (phase.ctrl) {
        const kf = new Set(phase.baseKf);
        const fx = new Set(phase.baseFx);
        for (const id of hits.keyframes) kf.has(id) ? kf.delete(id) : kf.add(id);
        for (const id of hits.effects) fx.has(id) ? fx.delete(id) : fx.add(id);
        editor.setSelection({ keyframes: [...kf], effects: [...fx] });
      } else {
        editor.setSelection({ keyframes: hits.keyframes, effects: hits.effects, markers: [] });
      }
      return;
    }
    if (phase.type === 'move' && phase.pointerId === event.pointerId) {
      const moving = phase;
      const view = editor.view();
      const dt = xToTime(view, x) - xToTime(view, moving.originX);
      const grab = moving.originals.find((item) => item.id === moving.grabId) ?? moving.originals[0];
      const exclude = new Set(moving.originals.map((item) => item.id));
      const snapped = snap(grab.timestampMs + dt, exclude);
      let applied = snapped.timeMs - grab.timestampMs;
      const minOrigin = Math.min(...moving.originals.map((item) => item.timestampMs));
      if (minOrigin + applied < 0) applied = -minOrigin;
      const channels = editor.track.channels;
      const indexes = moving.originals
        .filter((item) => item.kind !== 'marker')
        .map((item) => channels.findIndex((c) => c.id === item.channelId))
        .filter((index) => index >= 0);
      let rowDelta = Math.round((y - moving.originY) / ROW_H);
      if (indexes.length) {
        const min = Math.min(...indexes);
        const max = Math.max(...indexes);
        rowDelta = Math.max(-min, Math.min(channels.length - 1 - max, rowDelta));
      } else rowDelta = 0;
      const items = moving.originals.map((item) => {
        if (item.kind === 'marker') {
          return { ...item, timestampMs: item.timestampMs + applied };
        }
        const index = channels.findIndex((c) => c.id === item.channelId);
        const channelId = index >= 0 ? channels[index + rowDelta].id : item.channelId;
        return { ...item, channelId, timestampMs: item.timestampMs + applied };
      });
      editor.setDrag(items, snapped.guide ? snapped.timeMs : null);
      return;
    }
    if (phase.type === 'resize-kf' && phase.pointerId === event.pointerId) {
      const time = snap(Math.max(0, xToTime(editor.view(), x)), new Set([phase.id])).timeMs;
      const transition = Math.max(0, Math.min(phase.timestampMs, phase.timestampMs - time));
      editor.setDrag(
        [
          {
            kind: 'keyframe',
            id: phase.id,
            channelId: phase.channelId,
            timestampMs: phase.timestampMs,
            durationMs: 0,
            transitionMs: transition
          }
        ],
        time
      );
      return;
    }
    if (phase.type === 'resize-fx' && phase.pointerId === event.pointerId) {
      const time = snap(Math.max(0, xToTime(editor.view(), x)), new Set([phase.id])).timeMs;
      let start = phase.start;
      let duration = phase.duration;
      if (phase.edge === 'start') {
        const end = phase.start + phase.duration;
        start = Math.max(0, Math.min(time, end - 50));
        duration = end - start;
      } else {
        duration = Math.max(50, time - phase.start);
      }
      editor.setDrag(
        [
          {
            kind: 'effect',
            id: phase.id,
            channelId: phase.channelId,
            timestampMs: start,
            durationMs: duration,
            transitionMs: 0
          }
        ],
        phase.edge === 'start' ? start : start + duration
      );
    }
  };

  const finish = (event: PointerEvent) => {
    if (phase.type === 'idle' || ('pointerId' in phase && phase.pointerId !== event.pointerId)) return;
    if (phase.type === 'pending') {
      const hit = phase.hit;
      if (hit.type === 'item' && !phase.shift && !phase.ctrl) {
        editor.setSelection({
          keyframes: hit.kind === 'keyframe' ? [hit.id] : [],
          effects: hit.kind === 'effect' ? [hit.id] : [],
          markers: [],
          channelId: hit.channelId
        });
      } else if (hit.type === 'marker' && !phase.shift && !phase.ctrl) {
        editor.setSelection({ keyframes: [], effects: [], markers: [hit.id] });
      } else if (hit.type === 'lane') {
        editor.setPlayhead(hit.timeMs);
        editor.selectChannel(hit.channelId);
      }
      phase = { type: 'idle' };
      return;
    }
    if (phase.type === 'move' || phase.type === 'resize-kf' || phase.type === 'resize-fx') {
      editor.commitDrag();
    } else {
      editor.marquee = null;
    }
    phase = { type: 'idle' };
  };

  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && phase.type !== 'idle') {
      editor.cancelDrag();
      phase = { type: 'idle' };
    }
  };

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', finish);
  canvas.addEventListener('pointercancel', (event) => {
    editor.cancelDrag();
    phase = { type: 'idle' };
    void event;
  });
  window.addEventListener('keydown', onKey);
  return () => {
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerup', finish);
    window.removeEventListener('keydown', onKey);
  };
}
