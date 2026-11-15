// A pending Studio target is not a native seek. Read the settled media clock,
// including while paused or when a growing proxy cannot yet reach that target.
export async function framePosition(
  video: HTMLVideoElement | null,
  fallbackMs: number,
  signal: AbortSignal
): Promise<number> {
  signal.throwIfAborted();
  if (video?.seeking) {
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        video.removeEventListener('seeked', complete);
        video.removeEventListener('error', fail);
        video.removeEventListener('emptied', fail);
        signal.removeEventListener('abort', abort);
      };
      const complete = () => {
        if (video.seeking) return;
        cleanup();
        resolve();
      };
      const fail = () => {
        cleanup();
        reject(new Error('The movie position could not be read'));
      };
      const abort = () => {
        cleanup();
        reject(signal.reason);
      };
      const timer = setTimeout(fail, 8000);
      video.addEventListener('seeked', complete);
      video.addEventListener('error', fail);
      video.addEventListener('emptied', fail);
      signal.addEventListener('abort', abort, { once: true });
    });
  }
  signal.throwIfAborted();
  const ms = video && video.readyState >= 2 ? video.currentTime * 1000 : fallbackMs;
  // Never round across a cut. Allow only the sub-microsecond representation
  // error seen in native setters (e.g. 2.999999 instead of 3 seconds).
  return Math.max(0, Math.floor(ms + 0.001));
}
