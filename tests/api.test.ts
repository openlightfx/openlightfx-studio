import { describe, expect, it } from 'vitest';
import { createMockApi } from '$lib/api/mock';
import { detectServerRoot, findAccessToken, joinServer, resolveStreamUrl } from '$lib/api/urls';
import { encodeTrack } from '$lib/proto/codec';
import { emptyTrack } from '$lib/model/types';

describe('studio API client', () => {
  it('resolves a plugin sub-path and the emby token', () => {
    expect(
      detectServerRoot({ origin: 'http://host:8096', pathname: '/emby/OpenLightFX/studio/index.html' })
    ).toBe('http://host:8096/emby');
    expect(joinServer('http://host:8096/emby/', '/OpenLightFX/Studio/Bulbs')).toBe(
      'http://host:8096/emby/OpenLightFX/Studio/Bulbs'
    );
    const stream = resolveStreamUrl('http://host:8096/emby', '/Videos/1/stream', 'tok');
    expect(stream).toContain('api_key=tok');
    expect(resolveStreamUrl('http://host:8096', 'http://cdn/v?api_key=keep', 'tok')).toBe(
      'http://cdn/v?api_key=keep'
    );
    expect(findAccessToken({ Servers: [{ AccessToken: 'abc123456789' }] })).toBe('abc123456789');
  });

  it('stores tracks and preview frames in the mock backend', async () => {
    const track = emptyTrack();
    track.metadata.title = 'Saved';
    track.metadata.durationMs = 2000;
    const bytes = encodeTrack(track);
    const { api, state } = createMockApi();
    const bulbs = await api.getBulbs();
    expect(bulbs.length).toBeGreaterThan(0);
    const items = await api.searchItems('glass');
    expect(items.map((item) => item.name)).toEqual(['Glass Harbor']);
    expect(await api.getStreamUrl('item-glass-harbor')).toEqual({ url: '' });
    await api.putTrack('track-1', 'item-glass-harbor', bytes);
    const listed = await api.listTracks('item-glass-harbor');
    expect(listed[0].title).toBe('Saved');
    const loaded = await api.getTrack('track-1');
    expect(Array.from(loaded)).toEqual(Array.from(bytes));
    await api.previewStart({ mapping: { main: [bulbs[0].id] } });
    await api.previewFrame({
      states: [{ bulbId: bulbs[0].id, r: 1, g: 2, b: 3, brightness: 40, transitionMs: 100 }]
    });
    expect(state.running).toBe(true);
    expect(state.frames[0][0].brightness).toBe(40);
    await api.previewStop();
    expect(state.running).toBe(false);
  });
});
