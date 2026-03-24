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
