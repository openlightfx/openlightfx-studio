import type { ProjectFile } from '$lib/types/project.js';
import { LS_KEY_SNAPSHOT_PREFIX, AUTO_SAVE_INTERVAL_MS } from '$lib/types/ui.js';
import { projectToJson, jsonToProject } from '$lib/services/project-io.js';

class SnapshotStore {
  private intervalId: ReturnType<typeof setInterval> | null = null;
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

  save(project: ProjectFile): void {
    try {
      const key = LS_KEY_SNAPSHOT_PREFIX + project.projectId;
      localStorage.setItem(key, projectToJson(project));
    } catch { /* localStorage full — silently ignore */ }
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

  destroy(): void { this.stopAutoSave(); }
}

export const snapshotStore = new SnapshotStore();
