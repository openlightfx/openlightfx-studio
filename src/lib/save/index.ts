import type { SaveProvider } from '$lib/types/save.js';
import { LocalFileSystemProvider } from './local-filesystem.js';
import { DownloadProvider } from './download.js';

export function supportsFileSystemAccess(): boolean {
  return typeof window !== 'undefined' && 'showSaveFilePicker' in window;
}

export function createSaveProvider(): SaveProvider {
  if (supportsFileSystemAccess()) return new LocalFileSystemProvider();
  return new DownloadProvider();
}

export { LocalFileSystemProvider } from './local-filesystem.js';
export { DownloadProvider } from './download.js';
