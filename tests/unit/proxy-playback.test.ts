import { expect, it } from 'vitest';
import {
  failedProxyMessage,
  formatMinuteSecond,
  horizonLabel,
  proxyPlayReason,
  seekPastHorizon,
} from '$lib/studio/proxy-playback';

it('MEDIA-016 @unit a seek past the encoded horizon waits with a clock', () => {
  expect(seekPastHorizon(20_000, 5_000, true)).toBe(true);
  expect(seekPastHorizon(5_000, 5_000, true)).toBe(false);
  expect(seekPastHorizon(20_000, 5_000, false)).toBe(false);
  expect(formatMinuteSecond(5_000)).toBe('00:05');
  expect(formatMinuteSecond(101 * 60_000)).toBe('101:00');
  expect(horizonLabel(5_000)).toBe('Still encoding to 00:05');
  expect(
    proxyPlayReason({
      hasItem: true,
      blob: false,
      state: 'building',
      encodedThroughMs: 5_000,
      pendingSeek: true,
      videoError: '',
    })
  ).toBe('Still encoding to 00:05');
  expect(
    proxyPlayReason({
      hasItem: true,
      blob: false,
      state: 'building',
      encodedThroughMs: 0,
      pendingSeek: false,
      videoError: '',
    })
  ).toMatch(/prepar/i);
});

it('ERR-001 @unit a failed proxy names the reason instead of preparing forever', () => {
  expect(failedProxyMessage('ffmpeg exited with code 1')).toBe('ffmpeg exited with code 1');
  expect(failedProxyMessage('token api_key=secret')).not.toMatch(/api_key/i);
  expect(
    proxyPlayReason({
      hasItem: true,
      blob: false,
      state: 'failed',
      pendingSeek: false,
      videoError: '',
      reason: 'ffmpeg exited with code 1',
    })
  ).toBe('ffmpeg exited with code 1');
  expect(
    proxyPlayReason({
      hasItem: true,
      blob: false,
      state: 'failed',
      pendingSeek: false,
      videoError: 'The edit proxy failed',
    })
  ).toBe('The edit proxy failed');
});
