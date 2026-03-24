// Video container metadata extraction service (STU-087 – STU-089d)
//
// Entry point: extractVideoMetadata(file) → VideoContainerMetadata
// Detects format, routes to the appropriate parser, and returns a
// unified result. On unsupported formats, returns minimal metadata
// (the caller can fall back to HTML5 loadedmetadata per STU-089b).

import type { VideoContainerMetadata } from '$lib/types/video';
import { detectFormat } from './format-detector';
import { parseEbml } from './ebml-parser';
import { parseMp4 } from './mp4-parser';

export type { VideoContainerMetadata };

/**
 * Extract metadata from a video file's container headers.
 *
 * - MKV/WebM: EBML parser (duration, chapters, tags)
 * - MP4: ISO BMFF parser (duration, chapters, iTunes tags)
 * - Unknown: returns empty metadata (caller falls back to HTML5 element)
 *
 * Never throws — returns partial/empty results on error.
 */
export async function extractVideoMetadata(file: File): Promise<VideoContainerMetadata> {
  try {
    const format = await detectFormat(file);

    switch (format) {
      case 'mkv':
      case 'webm':
        return await parseEbml(file, format);
      case 'mp4':
        return await parseMp4(file);
      default:
        return emptyMetadata('unknown');
    }
  } catch {
    return emptyMetadata('unknown');
  }
}

function emptyMetadata(format: VideoContainerMetadata['format']): VideoContainerMetadata {
  return {
    durationMs: 0,
    chapters: [],
    tags: {},
    format,
  };
}
