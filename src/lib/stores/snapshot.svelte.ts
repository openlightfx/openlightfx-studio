import type { ProjectFile } from '$lib/types/project.js';
import { LS_KEY_SNAPSHOT_PREFIX, AUTO_SAVE_INTERVAL_MS } from '$lib/types/ui.js';
import { projectToJson, jsonToProject } from '$lib/services/project-io.js';
import { undoStore } from './undo.svelte.js';

/** Threshold above which serialization is offloaded to a worker (bytes). */
const WORKER_THRESHOLD = 500 * 1024; // 500 KB

class SnapshotStore {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private worker: Worker | null = null;
  isRestored = $state(false);

  startAutoSave(getProject: () => ProjectFile): void {
    this.stopAutoSave();
    this.intervalId = setInterval(() => {
      this.save(getProject());
    }, AUTO_SAVE_INTERVAL_MS);
  }

  stopAutoSave(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private getWorker(): Worker {
    if (!this.worker) {
      this.worker = new Worker(new URL('$lib/workers/snapshot.worker.ts', import.meta.url), {
        type: 'module',
      });
    }
    return this.worker;
  }

  save(project: ProjectFile): void {
    try {
      const withUndo: ProjectFile = {
        ...project,
        undoHistory: undoStore.serialize(),
        undoPointer: undoStore.undoStack.length,
      };
      const key = LS_KEY_SNAPSHOT_PREFIX + withUndo.projectId;
      const json = projectToJson(withUndo);

      // For large payloads, offload serialization to worker
      if (json.length > WORKER_THRESHOLD) {
        const w = this.getWorker();
        w.onmessage = (e: MessageEvent) => {
          try {
            localStorage.setItem(key, e.data.json);
          } catch {
            /* localStorage full */
          }
        };
        w.postMessage({ project: withUndo });
      } else {
        localStorage.setItem(key, json);
      }
    } catch {
      /* localStorage full — silently ignore */
    }
  }

  restore(projectId: string): ProjectFile | null {
    const key = LS_KEY_SNAPSHOT_PREFIX + projectId;
    const data = localStorage.getItem(key);
    if (!data) return null;
    try {
      const project = jsonToProject(data);
      this.isRestored = true;
      return project;
    } catch {
      return null;
    }
  }

  clear(projectId: string): void {
    localStorage.removeItem(LS_KEY_SNAPSHOT_PREFIX + projectId);
  }

  destroy(): void {
    this.stopAutoSave();
    this.worker?.terminate();
    this.worker = null;
  }
}

export const snapshotStore = new SnapshotStore();
