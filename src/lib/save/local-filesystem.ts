import type { SaveProvider, SaveProviderType } from '$lib/types/save.js';
import type { ProjectFile } from '$lib/types/project.js';
import { projectToJson, jsonToProject } from '$lib/services/project-io.js';

export class LocalFileSystemProvider implements SaveProvider {
  readonly type: SaveProviderType = 'local-filesystem';
  readonly displayName = 'Local file';
  readonly canAutoSave = true;
  private fileHandle: FileSystemFileHandle | null = null;

  hasFile(): boolean { return this.fileHandle !== null; }

  async save(project: ProjectFile): Promise<void> {
    if (!this.fileHandle) return this.saveAs(project);
    const writable = await this.fileHandle.createWritable();
    await writable.write(projectToJson(project));
    await writable.close();
  }

  async saveAs(project: ProjectFile): Promise<void> {
    const handle = await (window as any).showSaveFilePicker({
      suggestedName: `${project.track.metadata.title || 'untitled'}.lightfx-project`,
      types: [{
        description: 'OpenLightFX Project',
        accept: { 'application/json': ['.lightfx-project'] },
      }],
    });
    this.fileHandle = handle;
    await this.save(project);
  }

  async load(): Promise<ProjectFile> {
    const [handle] = await (window as any).showOpenFilePicker({
      types: [{
        description: 'OpenLightFX Project',
        accept: { 'application/json': ['.lightfx-project'] },
      }],
    });
    this.fileHandle = handle;
    const file = await handle.getFile();
    const text = await file.text();
    return jsonToProject(text);
  }
}
