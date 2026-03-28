/**
 * Snapshot serialization worker.
 * Receives a project state object, serializes to JSON, and posts the string back.
 * Used by snapshotStore for large payloads to avoid main-thread jank.
 */
self.onmessage = (e: MessageEvent) => {
  const { project } = e.data;
  const json = JSON.stringify(project);
  self.postMessage({ json });
};
