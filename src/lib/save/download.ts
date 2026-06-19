import type { SaveProvider, SaveProviderType } from '$lib/types/save.js';
import type { ProjectFile } from '$lib/types/project.js';
import { projectToJson, jsonToProject, trackToProject } from '$lib/services/project-io.js';
import { decodeLightFXTrack } from '$lib/services/protobuf.js';

export class DownloadProvider implements SaveProvider {
  readonly type: SaveProviderType = 'download';
  readonly displayName = 'Download';
  readonly canAutoSave = false;

  hasFile(): boolean {
    return false;
  }

  async save(project: ProjectFile): Promise<void> {
    return this.saveAs(project);
  }

  async saveAs(project: ProjectFile): Promise<void> {
    const json = projectToJson(project);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.track.metadata.title || 'untitled'}.lightfx-project`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async load(): Promise<ProjectFile> {
    return new Promise((resolve, reject) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.lightfx-project,.lightfx';
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) {
          reject(new Error('No file selected'));
          return;
        }
        if (file.name.endsWith('.lightfx')) {
          const bytes = new Uint8Array(await file.arrayBuffer());
          const track = await decodeLightFXTrack(bytes);
          resolve(trackToProject(track));
        } else {
          const text = await file.text();
          resolve(jsonToProject(text));
        }
      };
      input.click();
    });
  }
}
