interface FrameData {
  imageData: ImageData;
  timestampMs: number;
}

interface DetectionConfig {
  sensitivity: 'low' | 'medium' | 'high';
}

const THRESHOLD: Record<string, number> = {
  low: 0.5,
  medium: 0.3,
  high: 0.15,
};

let prevHistogram: Float32Array | null = null;

function computeHistogram(data: Uint8ClampedArray): Float32Array {
  const bins = new Float32Array(64);
  const totalPixels = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    const bin = Math.min(63, Math.floor(lum / 4));
    bins[bin]++;
  }
  for (let i = 0; i < 64; i++) bins[i] /= totalPixels;
  return bins;
}

function chiSquaredDistance(a: Float32Array, b: Float32Array): number {
  let dist = 0;
  for (let i = 0; i < a.length; i++) {
    const sum = a[i] + b[i];
    if (sum > 0) dist += ((a[i] - b[i]) ** 2) / sum;
  }
  return dist;
}

self.onmessage = (e: MessageEvent) => {
  const { type, data } = e.data;

  if (type === 'init') {
    prevHistogram = null;
    return;
  }

  if (type === 'frame') {
    const { imageData, timestampMs } = data as FrameData;
    const histogram = computeHistogram(imageData.data);

    if (prevHistogram) {
      const distance = chiSquaredDistance(prevHistogram, histogram);
      const config = (data as any).config as DetectionConfig;
      const threshold = THRESHOLD[config?.sensitivity ?? 'medium'];

      if (distance > threshold) {
        self.postMessage({ type: 'scene-change', timestampMs, distance });
      }
    }

    prevHistogram = histogram;
    self.postMessage({ type: 'progress', timestampMs });
  }

  if (type === 'done') {
    self.postMessage({ type: 'complete' });
  }
};
