import type { Command, SerializedCommandData } from '$lib/types/commands.js';
import type { TrackMetadata } from '$lib/types/track.js';

export interface MetadataStore {
  getMetadata(): TrackMetadata;
  updateMetadata(patch: Partial<TrackMetadata>): void;
}

export class EditMetadataCommand implements Command {
  readonly type = 'EDIT_METADATA';
  readonly description = 'Edit track metadata';
  private previousValues: Partial<TrackMetadata> = {};
  constructor(private readonly patch: Partial<TrackMetadata>, private readonly store: MetadataStore) {}
  execute(): void {
    const meta = this.store.getMetadata();
    this.previousValues = {};
    for (const key of Object.keys(this.patch) as (keyof TrackMetadata)[]) {
      const val = meta[key];
      (this.previousValues as any)[key] = typeof val === 'object' && val !== null
        ? Array.isArray(val) ? [...val] : { ...val }
        : val;
    }
    this.store.updateMetadata(this.patch);
  }
  undo(): void {
    this.store.updateMetadata(this.previousValues);
  }
  serialize(): SerializedCommandData {
    return { type: this.type, description: this.description, payload: { patch: this.patch } };
  }
}
