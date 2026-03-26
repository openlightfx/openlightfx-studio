/// <reference types="@sveltejs/kit" />

// Raw file imports (proto, etc.)
declare module '*.proto?raw' {
  const content: string;
  export default content;
}

declare module '*.proto' {
  const content: string;
  export default content;
}

// Web Worker types
declare module '*?worker' {
  const workerConstructor: new () => Worker;
  export default workerConstructor;
}

// Browser APIs not yet in lib.dom.d.ts
interface HTMLVideoElement {
  captureStream(): MediaStream;
}

interface ImageCapture {
  /** Capture a single frame as an ImageBitmap (Chrome/Edge; not in all spec drafts). */
  grabFrame(): Promise<ImageBitmap>;
}
