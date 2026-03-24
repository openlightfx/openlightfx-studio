import type { ProjectFile } from '$lib/types';

const SNAPSHOT_PREFIX = 'openlightfx-studio:snapshot:';

/** Save project state to localStorage, namespaced by project ID. Non-blocking. */
export function saveSnapshot(projectId: string, state: ProjectFile): void {
	queueMicrotask(() => {
		try {
			const key = SNAPSHOT_PREFIX + projectId;
			localStorage.setItem(key, JSON.stringify(state));
		} catch {
			// localStorage may be full or unavailable — silently ignore
		}
	});
}

/** Load a project snapshot from localStorage */
export function loadSnapshot(projectId: string): ProjectFile | null {
	try {
		const key = SNAPSHOT_PREFIX + projectId;
		const raw = localStorage.getItem(key);
		if (raw == null) return null;
		return JSON.parse(raw) as ProjectFile;
	} catch {
		return null;
	}
}

/** Clear snapshot (called on explicit save) */
export function clearSnapshot(projectId: string): void {
	try {
		localStorage.removeItem(SNAPSHOT_PREFIX + projectId);
	} catch {
		// ignore
	}
}

/** Check if a snapshot exists for the given project */
export function hasSnapshot(projectId: string): boolean {
	try {
		return localStorage.getItem(SNAPSHOT_PREFIX + projectId) != null;
	} catch {
		return false;
	}
}

/** Find any existing snapshot project ID in localStorage */
export function getSnapshotProjectId(): string | null {
	try {
		for (let i = 0; i < localStorage.length; i++) {
			const key = localStorage.key(i);
			if (key?.startsWith(SNAPSHOT_PREFIX)) {
				return key.slice(SNAPSHOT_PREFIX.length);
			}
		}
	} catch {
		// ignore
	}
	return null;
}
