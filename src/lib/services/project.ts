import type { ProjectFile } from '$lib/types';

// ============================================================
// Constants
// ============================================================

const PROJECT_FILE_EXTENSION = '.lightfx-project';
const PROJECT_VERSION = 1;
const DEFAULT_AUTO_SAVE_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes

const FILE_PICKER_TYPES = [
	{
		description: 'OpenLightFX Project',
		accept: { 'application/json': [PROJECT_FILE_EXTENSION] }
	}
];

// ============================================================
// File System Access API type augmentation
// ============================================================

interface FileSystemFileHandle {
	createWritable(): Promise<FileSystemWritableFileStream>;
	getFile(): Promise<File>;
}

interface FileSystemWritableFileStream extends WritableStream {
	write(data: string | Uint8Array | Blob): Promise<void>;
	close(): Promise<void>;
}

// ============================================================
// Save
// ============================================================

let lastFileHandle: FileSystemFileHandle | null = null;

/**
 * Save a project file. Uses the File System Access API if available,
 * otherwise falls back to a download link.
 */
export async function saveProject(state: ProjectFile): Promise<void> {
	const json = serializeProject(state);

	if (supportsFileSystemAccess()) {
		try {
			if (!lastFileHandle) {
				lastFileHandle = await (window as any).showSaveFilePicker({
					suggestedName: `project${PROJECT_FILE_EXTENSION}`,
					types: FILE_PICKER_TYPES
				});
			}
			const writable = await lastFileHandle!.createWritable();
			await writable.write(json);
			await writable.close();
			return;
		} catch (err: unknown) {
			// User cancelled the picker
			if (err instanceof DOMException && err.name === 'AbortError') return;
			// Fall through to download fallback
		}
	}

	downloadFallback(json, `project${PROJECT_FILE_EXTENSION}`);
}

/**
 * Save As — always prompts for a new file location.
 */
export async function saveProjectAs(state: ProjectFile): Promise<void> {
	lastFileHandle = null;
	return saveProject(state);
}

// ============================================================
// Load
// ============================================================

/**
 * Load a .lightfx-project file. Uses the File System Access API if available,
 * otherwise falls back to a file input.
 */
export async function loadProject(): Promise<ProjectFile> {
	let file: File;

	if (supportsFileSystemAccess()) {
		try {
			const [handle] = await (window as any).showOpenFilePicker({
				types: FILE_PICKER_TYPES,
				multiple: false
			});
			lastFileHandle = handle;
			file = await handle.getFile();
		} catch (err: unknown) {
			if (err instanceof DOMException && err.name === 'AbortError') {
				throw new ProjectLoadError('File selection cancelled');
			}
			throw new ProjectLoadError('Failed to open file picker');
		}
	} else {
		file = await legacyFilePicker();
	}

	const text = await file.text();
	return deserializeProject(text);
}

// ============================================================
// Auto-save
// ============================================================

let autoSaveTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Start auto-saving at a configurable interval.
 * Returns a stop function to cancel auto-save.
 */
export function autoSave(
	getState: () => ProjectFile,
	intervalMs: number = DEFAULT_AUTO_SAVE_INTERVAL_MS
): () => void {
	stopAutoSave();

	autoSaveTimer = setInterval(() => {
		try {
			const state = getState();
			const json = serializeProject(state);
			localStorage.setItem('openlightfx-studio:autosave', json);
		} catch {
			// localStorage may be full — silently ignore
		}
	}, intervalMs);

	return stopAutoSave;
}

/** Stop the current auto-save timer */
export function stopAutoSave(): void {
	if (autoSaveTimer != null) {
		clearInterval(autoSaveTimer);
		autoSaveTimer = null;
	}
}

/** Load the auto-saved project from localStorage, if any */
export function loadAutoSave(): ProjectFile | null {
	try {
		const raw = localStorage.getItem('openlightfx-studio:autosave');
		if (!raw) return null;
		return deserializeProject(raw);
	} catch {
		return null;
	}
}

/** Clear auto-save data */
export function clearAutoSave(): void {
	try {
		localStorage.removeItem('openlightfx-studio:autosave');
	} catch {
		// ignore
	}
}

// ============================================================
// Serialization
// ============================================================

function serializeProject(state: ProjectFile): string {
	const payload = {
		...state,
		version: PROJECT_VERSION
	};
	return JSON.stringify(payload, null, 2);
}

function deserializeProject(text: string): ProjectFile {
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		throw new ProjectLoadError('Invalid JSON in project file');
	}

	if (typeof parsed !== 'object' || parsed === null) {
		throw new ProjectLoadError('Project file does not contain a valid object');
	}

	const obj = parsed as Record<string, unknown>;

	if (typeof obj.version !== 'number') {
		throw new ProjectLoadError('Missing or invalid project version');
	}
	if (obj.version > PROJECT_VERSION) {
		throw new ProjectLoadError(
			`Project version ${obj.version} is newer than supported version ${PROJECT_VERSION}`
		);
	}
	if (!obj.track || typeof obj.track !== 'object') {
		throw new ProjectLoadError('Project file is missing track data');
	}

	return obj as unknown as ProjectFile;
}

// ============================================================
// Helpers
// ============================================================

function supportsFileSystemAccess(): boolean {
	return typeof window !== 'undefined' && 'showSaveFilePicker' in window;
}

function downloadFallback(content: string, filename: string): void {
	const blob = new Blob([content], { type: 'application/json' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	a.style.display = 'none';
	document.body.appendChild(a);
	a.click();
	setTimeout(() => {
		URL.revokeObjectURL(url);
		a.remove();
	}, 100);
}

function legacyFilePicker(): Promise<File> {
	return new Promise((resolve, reject) => {
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = PROJECT_FILE_EXTENSION;
		input.style.display = 'none';
		input.addEventListener('change', () => {
			const file = input.files?.[0];
			input.remove();
			if (file) {
				resolve(file);
			} else {
				reject(new ProjectLoadError('No file selected'));
			}
		});
		input.addEventListener('cancel', () => {
			input.remove();
			reject(new ProjectLoadError('File selection cancelled'));
		});
		document.body.appendChild(input);
		input.click();
	});
}

export class ProjectLoadError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ProjectLoadError';
	}
}
