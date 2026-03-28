// ============================================================
// Snapshot Controller
// Manages the snapshot serialization Web Worker, providing
// a Promise-based API for off-main-thread JSON.stringify
// of project state (STU-067).
// ============================================================

import type { ProjectFile } from '../types/project.js';
import type { OutboundMessage } from './snapshot.worker.js';

export class SnapshotController {
  private worker: Worker | null = null;

  private getWorker(): Worker {
    if (!this.worker) {
      this.worker = new Worker(new URL('./snapshot.worker.ts', import.meta.url), {
        type: 'module',
      });
    }
    return this.worker;
  }

  serialize(projectState: ProjectFile): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const worker = this.getWorker();

      const onMessage = (event: MessageEvent<OutboundMessage>) => {
        worker.removeEventListener('message', onMessage);
        worker.removeEventListener('error', onError);

        const msg = event.data;
        if (msg.type === 'result') {
          resolve(msg.json);
        } else if (msg.type === 'error') {
          reject(new Error(msg.message));
        }
      };

      const onError = (event: ErrorEvent) => {
        worker.removeEventListener('message', onMessage);
        worker.removeEventListener('error', onError);
        reject(new Error(event.message || 'Snapshot worker error'));
      };

      worker.addEventListener('message', onMessage);
      worker.addEventListener('error', onError);

      worker.postMessage({ type: 'serialize', projectState });
    });
  }

  terminate(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }
}
