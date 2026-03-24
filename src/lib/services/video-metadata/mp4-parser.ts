// ISO BMFF (MP4) container parser (STU-089a)
//
// Reads only the first portion of the file and walks the box structure
// to extract duration, chapter info, and iTunes-style metadata tags.

import type { VideoChapter, VideoContainerMetadata, VideoContainerTags } from '$lib/types/video';
import { readFileSlice } from './format-detector';

// Maximum bytes to read for metadata extraction (STU-088)
const MAX_READ_SIZE = 2 * 1024 * 1024; // 2 MB

// ---------------------------------------------------------------------------
// Box structure helpers
// ---------------------------------------------------------------------------

interface Box {
  type: string;
  dataOffset: number;
  dataSize: number;
  /** Offset immediately after this box */
  endOffset: number;
}

const textDecoder = new TextDecoder('ascii');
const utf8Decoder = new TextDecoder('utf-8');

/**
 * Read a box header at `offset`. Handles both standard (32-bit) and
 * extended (64-bit) size boxes.
 */
function readBoxHeader(view: DataView, offset: number): Box | null {
  if (offset + 8 > view.byteLength) return null;

  let size = view.getUint32(offset);
  const typeBytes = new Uint8Array(view.buffer, view.byteOffset + offset + 4, 4);
  const type = textDecoder.decode(typeBytes);

  let headerSize = 8;

  if (size === 1) {
    // 64-bit extended size
    if (offset + 16 > view.byteLength) return null;
    const hi = view.getUint32(offset + 8);
    const lo = view.getUint32(offset + 12);
    // For metadata purposes hi should be 0 (files < 4 GB header)
    size = hi * 0x100000000 + lo;
    headerSize = 16;
  } else if (size === 0) {
    // Box extends to end of file — use remaining data
    size = view.byteLength - offset;
  }

  return {
    type,
    dataOffset: offset + headerSize,
    dataSize: size - headerSize,
    endOffset: offset + size,
  };
}

/**
 * Iterate over sibling boxes within a region.
 */
function* iterateBoxes(
  view: DataView,
  start: number,
  end: number,
): Generator<Box> {
  let pos = start;
  while (pos < end) {
    const box = readBoxHeader(view, pos);
    if (!box) break;
    // Protect against malformed sizes
    if (box.endOffset <= pos) break;
    yield box;
    pos = box.endOffset;
  }
}

/**
 * Find a child box by type within a region.
 */
function findBox(view: DataView, start: number, end: number, type: string): Box | null {
  for (const box of iterateBoxes(view, start, end)) {
    if (box.type === type) return box;
  }
  return null;
}

// ---------------------------------------------------------------------------
// mvhd parser
// ---------------------------------------------------------------------------

function parseMvhd(view: DataView, box: Box): number {
  const off = box.dataOffset;
  if (off >= view.byteLength) return 0;

  const version = view.getUint8(off);

  let timescale: number;
  let duration: number;

  if (version === 1) {
    // 64-bit fields
    if (off + 28 > view.byteLength) return 0;
    timescale = view.getUint32(off + 20);
    const dHi = view.getUint32(off + 24);
    const dLo = view.getUint32(off + 28);
    duration = dHi * 0x100000000 + dLo;
  } else {
    // 32-bit fields (version 0)
    if (off + 20 > view.byteLength) return 0;
    timescale = view.getUint32(off + 12);
    duration = view.getUint32(off + 16);
  }

  if (timescale <= 0) return 0;
  return (duration / timescale) * 1000;
}

// ---------------------------------------------------------------------------
// iTunes metadata (ilst) parser
// ---------------------------------------------------------------------------

function parseIlst(view: DataView, box: Box): VideoContainerTags {
  const tags: VideoContainerTags = {};
  const end = Math.min(box.dataOffset + box.dataSize, view.byteLength);

  for (const item of iterateBoxes(view, box.dataOffset, end)) {
    const dataBox = findBox(view, item.dataOffset, Math.min(item.endOffset, view.byteLength), 'data');
    if (!dataBox) continue;

    // 'data' box: 4 bytes type indicator + 4 bytes locale, then value
    const valueOffset = dataBox.dataOffset + 8;
    const valueSize = dataBox.dataSize - 8;
    if (valueOffset + valueSize > view.byteLength || valueSize <= 0) continue;

    const value = utf8Decoder.decode(
      new Uint8Array(view.buffer, view.byteOffset + valueOffset, valueSize),
    );

    switch (item.type) {
      case '\u00A9nam': // ©nam — title
        tags.title = value;
        break;
      case '\u00A9day': // ©day — year/date
        tags.dateReleased = value;
        break;
    }
  }

  return tags;
}

// ---------------------------------------------------------------------------
// Chapter parser (chpl — Nero-style chapter list)
// ---------------------------------------------------------------------------

function parseChpl(view: DataView, box: Box): VideoChapter[] {
  const chapters: VideoChapter[] = [];
  let off = box.dataOffset;
  const end = Math.min(off + box.dataSize, view.byteLength);

  if (off + 8 > end) return chapters;

  // Skip version (4 bytes) and unknown (4 bytes)
  off += 8;

  if (off + 1 > end) return chapters;
  const count = view.getUint8(off);
  off += 1;

  for (let i = 0; i < count; i++) {
    if (off + 9 > end) break;

    // Timestamp: 8 bytes (100-nanosecond units)
    const tsHi = view.getUint32(off);
    const tsLo = view.getUint32(off + 4);
    const timestamp100ns = tsHi * 0x100000000 + tsLo;
    const startMs = timestamp100ns / 10_000;
    off += 8;

    // Title length: 1 byte, then UTF-8 string
    const titleLen = view.getUint8(off);
    off += 1;

    let title = '';
    if (off + titleLen <= end) {
      title = utf8Decoder.decode(
        new Uint8Array(view.buffer, view.byteOffset + off, titleLen),
      );
    }
    off += titleLen;

    chapters.push({ startMs, endMs: 0, title });
  }

  // Fill endMs from next chapter's startMs
  for (let i = 0; i < chapters.length - 1; i++) {
    chapters[i].endMs = chapters[i + 1].startMs;
  }

  return chapters;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Parse MP4 container metadata from a File.
 *
 * Reads only the first MAX_READ_SIZE bytes and extracts duration,
 * iTunes-style metadata tags, and chapter markers.
 */
export async function parseMp4(file: File): Promise<VideoContainerMetadata> {
  const result: VideoContainerMetadata = {
    durationMs: 0,
    chapters: [],
    tags: {},
    format: 'mp4',
  };

  try {
    const readSize = Math.min(MAX_READ_SIZE, file.size);
    const buf = await readFileSlice(file, 0, readSize);
    const view = new DataView(buf);

    // Find moov box at the top level
    const moov = findBox(view, 0, view.byteLength, 'moov');
    if (!moov) return result;

    const moovEnd = Math.min(moov.dataOffset + moov.dataSize, view.byteLength);

    for (const child of iterateBoxes(view, moov.dataOffset, moovEnd)) {
      switch (child.type) {
        case 'mvhd':
          result.durationMs = parseMvhd(view, child);
          break;

        case 'udta': {
          // udta → meta → ilst (iTunes metadata)
          const udtaEnd = Math.min(child.dataOffset + child.dataSize, view.byteLength);
          const meta = findBox(view, child.dataOffset, udtaEnd, 'meta');
          if (meta) {
            // 'meta' box has a 4-byte version/flags field before children
            const metaChildStart = meta.dataOffset + 4;
            const metaEnd = Math.min(meta.dataOffset + meta.dataSize, view.byteLength);
            const ilst = findBox(view, metaChildStart, metaEnd, 'ilst');
            if (ilst) {
              result.tags = parseIlst(view, ilst);
            }
          }

          // udta → chpl (Nero-style chapters)
          const chpl = findBox(view, child.dataOffset, udtaEnd, 'chpl');
          if (chpl) {
            result.chapters = parseChpl(view, chpl);
          }
          break;
        }
      }
    }
  } catch {
    // Return partial results on any parse error
  }

  return result;
}
