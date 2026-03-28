// ============================================================
// Snapshot Store — auto-save to localStorage (STU-064, STU-065)
// ============================================================

import type { ProjectFile } from '$lib/types/index.js';
import { AUTO_SAVE_INTERVAL_MS, LS_KEY_SNAPSHOT_PREFIX } from '$lib/types/index.js';
import { projectStore } from './project.svelte.js';

class SnapshotStoreClass {
  private intervalId: ReturnType<typeof setInterval> | null = null;

  private get snapshotKey(): string {
    return `${LS_KEY_SNAPSHOT_PREFIX}${projectStore.projectId}`;
  }

  startAutoSave(): void {
    this.stopAutoSave();
    this.intervalId = setInterval(() => {
      this.saveNow();
    }, AUTO_SAVE_INTERVAL_MS);
  }

  stopAutoSave(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  saveNow(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const data = JSON.stringify(projectStore.project.file);
      localStorage.setItem(this.snapshotKey, data);
    } catch {
      // localStorage may be full; silently ignore
    }
  }

  restore(): ProjectFile | null {
    if (typeof localStorage === 'undefined') return null;
    try {
      const data = localStorage.getItem(this.snapshotKey);
      if (!data) return null;
      return JSON.parse(data) as ProjectFile;
    } catch {
      return null;
    }
  }

  hasSnapshot(): boolean {
    if (typeof localStorage === 'undefined') return false;
    return localStorage.getItem(this.snapshotKey) !== null;
  }

  /** Find any snapshot in localStorage regardless of projectId */
  findAnySnapshot(): ProjectFile | null {
    if (typeof localStorage === 'undefined') return null;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(LS_KEY_SNAPSHOT_PREFIX)) {
          const data = localStorage.getItem(key);
          if (data) return JSON.parse(data) as ProjectFile;
        }
      }
    } catch {
      // ignore
    }
    return null;
  }

  clearSnapshot(projectId?: string): void {
    if (typeof localStorage === 'undefined') return;
    const key = projectId ? `${LS_KEY_SNAPSHOT_PREFIX}${projectId}` : this.snapshotKey;
    localStorage.removeItem(key);
  }
}

export const snapshotStore = new SnapshotStoreClass();
