// EBML / MKV / WebM container parser (STU-089)
//
// Reads only the first portion of the file (header + metadata segments)
// and extracts duration, chapters, and tags from the EBML structure.

import type { VideoChapter, VideoContainerMetadata, VideoContainerTags } from '$lib/types/video';
import { readFileSlice } from './format-detector';

// Maximum bytes to read from the file for metadata extraction (STU-088)
const MAX_READ_SIZE = 1 * 1024 * 1024; // 1 MB

// ---------------------------------------------------------------------------
// EBML element IDs
// ---------------------------------------------------------------------------
const ID_EBML_HEADER = 0x1a45dfa3;
const ID_SEGMENT = 0x18538067;
const ID_SEGMENT_INFO = 0x1549a966;
const ID_TIMECODE_SCALE = 0x2ad7b1;
const ID_DURATION = 0x4489;
const ID_TITLE = 0x7ba9;
const ID_CHAPTERS = 0x1043a770;
const ID_EDITION_ENTRY = 0x45b9;
const ID_CHAPTER_ATOM = 0xb6;
const ID_CHAPTER_TIME_START = 0x91;
const ID_CHAPTER_TIME_END = 0x92;
const ID_CHAPTER_DISPLAY = 0x80;
const ID_CHAP_STRING = 0x85;
const ID_TAGS = 0x1254c367;
const ID_TAG = 0x7373;
const ID_SIMPLE_TAG = 0x67c8;
const ID_TAG_NAME = 0x45a3;
const ID_TAG_STRING = 0x4487;

// Master elements that contain children (need recursive descent)
const MASTER_ELEMENT_IDS = new Set([
  ID_EBML_HEADER,
  ID_SEGMENT,
  ID_SEGMENT_INFO,
  ID_CHAPTERS,
  ID_EDITION_ENTRY,
  ID_CHAPTER_ATOM,
  ID_CHAPTER_DISPLAY,
  ID_TAGS,
  ID_TAG,
  ID_SIMPLE_TAG,
]);

// ---------------------------------------------------------------------------
// VINT reader — EBML variable-length integer encoding
// ---------------------------------------------------------------------------

interface VintResult {
  value: number;
  length: number;
}

/**
 * Read a VINT (variable-length integer) from `view` at `offset`.
 *
 * EBML VINT encoding:
 *   - The number of leading zero bits in the first byte determines the
 *     total width in bytes (1–8).
 *   - The width marker bit (first 1-bit) is part of the encoding but
 *     NOT part of the value (for element sizes). For element IDs the
 *     width marker IS included.
 *
 * `includeMarker` controls whether the leading 1-bit is kept in the
 * returned value (true for IDs, false for sizes/data lengths).
 */
function readVint(view: DataView, offset: number, includeMarker: boolean): VintResult | null {
  if (offset >= view.byteLength) return null;

  const first = view.getUint8(offset);
  if (first === 0) return null;

  // Count leading zeros to determine width
  let width = 1;
  let mask = 0x80;
  while (width <= 8 && (first & mask) === 0) {
    width++;
    mask >>= 1;
  }
  if (width > 8) return null;

  if (offset + width > view.byteLength) return null;

  // Build the value from the bytes
  let value = includeMarker ? first : first & ~mask;
  for (let i = 1; i < width; i++) {
    value = value * 256 + view.getUint8(offset + i);
  }

  return { value, length: width };
}

/**
 * Read a VINT element ID (marker bit included in value).
 */
function readElementId(view: DataView, offset: number): VintResult | null {
  return readVint(view, offset, true);
}

/**
 * Read a VINT element data size (marker bit stripped).
 */
function readElementSize(view: DataView, offset: number): VintResult | null {
  return readVint(view, offset, false);
}

// ---------------------------------------------------------------------------
// Data readers
// ---------------------------------------------------------------------------

function readUint(view: DataView, offset: number, length: number): number {
  let value = 0;
  const end = Math.min(offset + length, view.byteLength);
  for (let i = offset; i < end; i++) {
    value = value * 256 + view.getUint8(i);
  }
  return value;
}

function readFloat(view: DataView, offset: number, length: number): number {
  if (length === 4 && offset + 4 <= view.byteLength) {
    return view.getFloat32(offset);
  }
  if (length === 8 && offset + 8 <= view.byteLength) {
    return view.getFloat64(offset);
  }
  return 0;
}

function readUtf8(view: DataView, offset: number, length: number): string {
  const end = Math.min(offset + length, view.byteLength);
  const bytes = new Uint8Array(view.buffer, view.byteOffset + offset, end - offset);
  return new TextDecoder('utf-8').decode(bytes);
}

// ---------------------------------------------------------------------------
// EBML element iterator
// ---------------------------------------------------------------------------

interface EbmlElement {
  id: number;
  dataOffset: number;
  dataSize: number;
  /** Total size on disk: id VINT + size VINT + data */
  totalSize: number;
}

/**
 * Parse the next EBML element header at `offset`.
 */
function readElementHeader(view: DataView, offset: number): EbmlElement | null {
  const idResult = readElementId(view, offset);
  if (!idResult) return null;

  const sizeResult = readElementSize(view, offset + idResult.length);
  if (!sizeResult) return null;

  const headerLen = idResult.length + sizeResult.length;

  return {
    id: idResult.value,
    dataOffset: offset + headerLen,
    dataSize: sizeResult.value,
    totalSize: headerLen + sizeResult.value,
  };
}

/**
 * Iterate over child elements within a master element's data region.
 */
function* iterateChildren(
  view: DataView,
  dataOffset: number,
  dataSize: number,
): Generator<EbmlElement> {
  let pos = dataOffset;
  const end = Math.min(dataOffset + dataSize, view.byteLength);

  while (pos < end) {
    const el = readElementHeader(view, pos);
    if (!el) break;
    // Sanity: element shouldn't extend wildly past available data
    if (el.dataOffset + el.dataSize > view.byteLength + 1024) break;
    yield el;
    pos = el.dataOffset + el.dataSize;
  }
}

// ---------------------------------------------------------------------------
// High-level parsers
// ---------------------------------------------------------------------------

interface SegmentInfoResult {
  durationMs: number;
  title?: string;
}

function parseSegmentInfo(view: DataView, offset: number, size: number): SegmentInfoResult {
  let timecodeScale = 1_000_000; // default: 1 ms per tick
  let durationTicks = 0;
  let title: string | undefined;

  for (const el of iterateChildren(view, offset, size)) {
    switch (el.id) {
      case ID_TIMECODE_SCALE:
        timecodeScale = readUint(view, el.dataOffset, el.dataSize);
        break;
      case ID_DURATION:
        durationTicks = readFloat(view, el.dataOffset, el.dataSize);
        break;
      case ID_TITLE:
        title = readUtf8(view, el.dataOffset, el.dataSize);
        break;
    }
  }

  // Duration is in timecodeScale units; convert to ms
  const durationMs = durationTicks > 0 ? (durationTicks * timecodeScale) / 1_000_000 : 0;

  return { durationMs, title };
}

function parseChapters(view: DataView, offset: number, size: number): VideoChapter[] {
  const chapters: VideoChapter[] = [];

  for (const edition of iterateChildren(view, offset, size)) {
    if (edition.id !== ID_EDITION_ENTRY) continue;

    for (const atom of iterateChildren(view, edition.dataOffset, edition.dataSize)) {
      if (atom.id !== ID_CHAPTER_ATOM) continue;
      chapters.push(parseChapterAtom(view, atom.dataOffset, atom.dataSize));
    }
  }

  return chapters;
}

function parseChapterAtom(view: DataView, offset: number, size: number): VideoChapter {
  let startNs = 0;
  let endNs = 0;
  let title = '';

  for (const el of iterateChildren(view, offset, size)) {
    switch (el.id) {
      case ID_CHAPTER_TIME_START:
        startNs = readUint(view, el.dataOffset, el.dataSize);
        break;
      case ID_CHAPTER_TIME_END:
        endNs = readUint(view, el.dataOffset, el.dataSize);
        break;
      case ID_CHAPTER_DISPLAY:
        // Parse ChapterDisplay for ChapString
        for (const disp of iterateChildren(view, el.dataOffset, el.dataSize)) {
          if (disp.id === ID_CHAP_STRING) {
            title = readUtf8(view, disp.dataOffset, disp.dataSize);
          }
        }
        break;
    }
  }

  return {
    startMs: startNs / 1_000_000,
    endMs: endNs / 1_000_000,
    title,
  };
}

function parseTags(view: DataView, offset: number, size: number): VideoContainerTags {
  const tags: VideoContainerTags = {};

  for (const tagEl of iterateChildren(view, offset, size)) {
    if (tagEl.id !== ID_TAG) continue;

    for (const simpleTag of iterateChildren(view, tagEl.dataOffset, tagEl.dataSize)) {
      if (simpleTag.id !== ID_SIMPLE_TAG) continue;
      applySimpleTag(view, simpleTag.dataOffset, simpleTag.dataSize, tags);
    }
  }

  return tags;
}

function applySimpleTag(
  view: DataView,
  offset: number,
  size: number,
  tags: VideoContainerTags,
): void {
  let name = '';
  let value = '';

  for (const el of iterateChildren(view, offset, size)) {
    switch (el.id) {
      case ID_TAG_NAME:
        name = readUtf8(view, el.dataOffset, el.dataSize).toUpperCase();
        break;
      case ID_TAG_STRING:
        value = readUtf8(view, el.dataOffset, el.dataSize);
        break;
    }
  }

  switch (name) {
    case 'TITLE':
      tags.title = value;
      break;
    case 'DATE_RELEASED':
      tags.dateReleased = value;
      break;
    case 'IMDB':
      tags.imdbId = value;
      break;
  }
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Parse MKV/WebM container metadata from a File.
 *
 * Reads only the first MAX_READ_SIZE bytes, parses the EBML header,
 * then walks Segment children for SegmentInfo, Chapters, and Tags.
 */
export async function parseEbml(
  file: File,
  format: 'mkv' | 'webm',
): Promise<VideoContainerMetadata> {
  const result: VideoContainerMetadata = {
    durationMs: 0,
    chapters: [],
    tags: {},
    format,
  };

  try {
    const readSize = Math.min(MAX_READ_SIZE, file.size);
    const buf = await readFileSlice(file, 0, readSize);
    const view = new DataView(buf);

    let pos = 0;

    // 1. Parse EBML header (skip over it)
    const ebmlHeader = readElementHeader(view, pos);
    if (!ebmlHeader || ebmlHeader.id !== ID_EBML_HEADER) return result;
    pos = ebmlHeader.dataOffset + ebmlHeader.dataSize;

    // 2. Parse Segment
    const segment = readElementHeader(view, pos);
    if (!segment || segment.id !== ID_SEGMENT) return result;

    // Walk Segment's children — the segment data size can be huge (entire file),
    // so we only iterate through what we actually read.
    const segmentDataEnd = Math.min(segment.dataOffset + segment.dataSize, view.byteLength);

    for (const child of iterateChildren(view, segment.dataOffset, segmentDataEnd - segment.dataOffset)) {
      switch (child.id) {
        case ID_SEGMENT_INFO: {
          const info = parseSegmentInfo(view, child.dataOffset, child.dataSize);
          result.durationMs = info.durationMs;
          if (info.title) {
            result.tags.title = info.title;
          }
          break;
        }
        case ID_CHAPTERS:
          result.chapters = parseChapters(view, child.dataOffset, child.dataSize);
          break;
        case ID_TAGS: {
          const tagData = parseTags(view, child.dataOffset, child.dataSize);
          result.tags = { ...result.tags, ...tagData };
          break;
        }
      }
    }
  } catch {
    // Return partial results on any parse error (STU-087 graceful degradation)
  }

  return result;
}
