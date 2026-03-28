import { describe, it, expect } from 'vitest';
import { newProject, projectToJson, jsonToProject } from '../../src/lib/services/project-io.js';

describe('project-io', () => {
  it('creates a new project with given template channels', () => {
    const channels = [
      { id: 'ambient', displayName: 'Ambient', spatialHint: 'SPATIAL_AMBIENT' as const },
    ];
    const project = newProject(channels);
    expect(project.formatVersion).toBe(1);
    expect(project.projectId).toBeTruthy();
    expect(project.track.channels).toHaveLength(1);
    expect(project.track.channels[0].id).toBe('ambient');
    // Black keyframe auto-inserted at t=0
    expect(project.track.keyframes).toHaveLength(1);
    expect(project.track.keyframes[0].timestampMs).toBe(0);
    expect(project.track.keyframes[0].brightness).toBe(0);
    expect(project.track.keyframes[0].powerOn).toBe(false);
  });

  it('round-trips project via JSON', () => {
    const project = newProject([
      { id: 'left', displayName: 'Left', spatialHint: 'SPATIAL_LEFT' as const },
      { id: 'right', displayName: 'Right', spatialHint: 'SPATIAL_RIGHT' as const },
    ]);
    const json = projectToJson(project);
    expect(typeof json).toBe('string');
    const restored = jsonToProject(json);
    expect(restored.projectId).toBe(project.projectId);
    expect(restored.track.channels).toHaveLength(2);
    expect(restored.track.keyframes).toHaveLength(2); // one per channel
  });
});
