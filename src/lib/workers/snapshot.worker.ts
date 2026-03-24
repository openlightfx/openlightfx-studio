// ============================================================
// Snapshot Serialization Web Worker
// Serializes project state to JSON off the main thread to
// avoid UI jank during auto-snapshot writes (STU-067).
// ============================================================

// --- Message types: Main thread → Worker ---

export interface SerializeRequest {
  type: 'serialize';
  projectState: unknown;
}

export type InboundMessage = SerializeRequest;

// --- Message types: Worker → Main thread ---

export interface SerializeResult {
  type: 'result';
  json: string;
}

export interface SerializeError {
  type: 'error';
  message: string;
}

export type OutboundMessage = SerializeResult | SerializeError;

// --- Message handler ---

self.onmessage = (event: MessageEvent<InboundMessage>) => {
  try {
    const msg = event.data;
    if (msg.type !== 'serialize') return;

    const json = JSON.stringify(msg.projectState);

    const result: SerializeResult = {
      type: 'result',
      json,
    };
    self.postMessage(result);
  } catch (err) {
    const error: SerializeError = {
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
    };
    self.postMessage(error);
  }
};
