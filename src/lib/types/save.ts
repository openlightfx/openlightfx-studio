import type { ProjectFile } from './project.js';

export interface SaveProvider {
  readonly type: SaveProviderType;
  readonly displayName: string;
  readonly canAutoSave: boolean;
  save(project: ProjectFile): Promise<void>;
  load(): Promise<ProjectFile>;
  saveAs(project: ProjectFile): Promise<void>;
  hasFile(): boolean;
}

export type SaveProviderType = 'local-filesystem' | 'download' | 'cloud';
