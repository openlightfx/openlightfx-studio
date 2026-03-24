/**
 * Video container metadata extraction.
 * Reads only container headers (first few MB) — supports files up to 50GB.
 * Parses MKV/WebM (EBML), MP4 (ISO BMFF), with HTMLVideoElement fallback.
 */

export interface VideoMetadata {
	durationMs: number;
	chapters: Array<{ timestampMs: number; label: string }>;
	title?: string;
	year?: number;
	imdbId?: string;
}

// ============================================================
// Public API
// ============================================================

export async function extractMetadata(file: File): Promise<VideoMetadata> {
	const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
	const mimeType = file.type.toLowerCase();

	try {
		if (ext === 'mkv' || ext === 'webm' || mimeType.includes('matroska') || mimeType.includes('webm')) {
			return await parseEBML(file);
		}

		if (ext === 'mp4' || ext === 'm4v' || ext === 'mov' || mimeType.includes('mp4') || mimeType.includes('quicktime')) {
			return await parseMp4(file);
		}
	} catch {
		// Fall through to HTMLVideoElement fallback
	}

	return await fallbackExtract(file);
}

// ============================================================
// EBML / Matroska parser
// ============================================================

// Max bytes to read from file for header parsing
const EBML_MAX_READ = 100 * 1024 * 1024; // 100MB

// Well-known EBML Element IDs
const EBML_HEADER_ID = 0x1a45dfa3;
const SEGMENT_ID = 0x18538067;
const SEGMENT_INFO_ID = 0x1549a966;
const CHAPTERS_ID = 0x1043a770;
const TAGS_ID = 0x1254c367;

// SegmentInfo children
const DURATION_ID = 0x4489;
const TIMESCALE_ID = 0x2ad7b1;
const TITLE_ID = 0x7ba9;

// Chapter elements
const EDITION_ENTRY_ID = 0x45b9;
const CHAPTER_ATOM_ID = 0xb6;
const CHAPTER_TIME_START_ID = 0x91;
const CHAPTER_DISPLAY_ID = 0x80;
const CHAP_STRING_ID = 0x85;

// Tag elements
const TAG_ID = 0x7373;
const SIMPLE_TAG_ID = 0x67c8;
const TAG_NAME_ID = 0x45a3;
const TAG_STRING_ID = 0x4487;

class EBMLReader {
	private view: DataView;
	public pos: number;
	public length: number;

	constructor(buffer: ArrayBuffer) {
		this.view = new DataView(buffer);
		this.pos = 0;
		this.length = buffer.byteLength;
	}

	hasData(bytes: number = 1): boolean {
		return this.pos + bytes <= this.length;
	}

	readVint(): number {
		if (!this.hasData()) return -1;
		const first = this.view.getUint8(this.pos);
		let width = 0;
		let mask = 0x80;
		while (width < 8 && (first & mask) === 0) {
			width++;
			mask >>= 1;
		}
		width += 1;
		if (!this.hasData(width)) return -1;

		let value = first & (mask - 1);
		for (let i = 1; i < width; i++) {
			value = value * 256 + this.view.getUint8(this.pos + i);
		}
		this.pos += width;
		return value;
	}

	readElementId(): number {
		if (!this.hasData()) return -1;
		const first = this.view.getUint8(this.pos);
		let width = 0;
		let mask = 0x80;
		while (width < 4 && (first & mask) === 0) {
			width++;
			mask >>= 1;
		}
		width += 1;
		if (!this.hasData(width)) return -1;

		let id = 0;
		for (let i = 0; i < width; i++) {
			id = id * 256 + this.view.getUint8(this.pos + i);
		}
		this.pos += width;
		return id;
	}

	readFloat(size: number): number {
		if (size === 4) return this.view.getFloat32(this.pos);
		if (size === 8) return this.view.getFloat64(this.pos);
		return 0;
	}

	readUint(size: number): number {
		let val = 0;
		for (let i = 0; i < size && i < 8; i++) {
			val = val * 256 + this.view.getUint8(this.pos + i);
		}
		return val;
	}

	readString(size: number): string {
		const bytes = new Uint8Array(this.view.buffer, this.pos, size);
		return new TextDecoder('utf-8').decode(bytes);
	}

	readUtf8(size: number): string {
		return this.readString(size);
	}
}

async function parseEBML(file: File): Promise<VideoMetadata> {
	const readSize = Math.min(file.size, EBML_MAX_READ);
	const slice = file.slice(0, readSize);
	const buffer = await readFileSlice(slice);
	const reader = new EBMLReader(buffer);

	const result: VideoMetadata = { durationMs: 0, chapters: [] };
	let timescaleNs = 1000000; // Default: 1ms

	// Parse EBML header
	const headerId = reader.readElementId();
	if (headerId !== EBML_HEADER_ID) throw new Error('Not a valid EBML file');
	const headerSize = reader.readVint();
	if (headerSize < 0) throw new Error('Invalid EBML header');
	reader.pos += headerSize; // Skip header content

	// Parse Segment
	const segId = reader.readElementId();
	if (segId !== SEGMENT_ID) throw new Error('Missing Segment element');
	reader.readVint(); // Segment size (may be unknown)

	const segmentStart = reader.pos;
	const segmentEnd = reader.length;

	// Iterate top-level segment children
	while (reader.pos < segmentEnd && reader.hasData(2)) {
		const elId = reader.readElementId();
		const elSize = reader.readVint();
		if (elId < 0 || elSize < 0) break;

		const contentStart = reader.pos;

		if (elId === SEGMENT_INFO_ID) {
			parseSegmentInfo(reader, contentStart, contentStart + elSize, result, (ns) => { timescaleNs = ns; });
		} else if (elId === CHAPTERS_ID) {
			parseChapters(reader, contentStart, contentStart + elSize, result, timescaleNs);
		} else if (elId === TAGS_ID) {
			parseTags(reader, contentStart, contentStart + elSize, result);
		}

		reader.pos = contentStart + elSize;
	}

	return result;
}

function parseSegmentInfo(
	reader: EBMLReader,
	start: number,
	end: number,
	result: VideoMetadata,
	setTimescale: (ns: number) => void
): void {
	reader.pos = start;
	let durationRaw = 0;
	let timescaleNs = 1000000;

	while (reader.pos < end && reader.hasData(2)) {
		const id = reader.readElementId();
		const size = reader.readVint();
		if (id < 0 || size < 0) break;
		const contentEnd = reader.pos + size;

		if (id === TIMESCALE_ID) {
			timescaleNs = reader.readUint(size);
			setTimescale(timescaleNs);
		} else if (id === DURATION_ID) {
			durationRaw = reader.readFloat(size);
		} else if (id === TITLE_ID) {
			result.title = reader.readString(size);
		}

		reader.pos = contentEnd;
	}

	if (durationRaw > 0) {
		result.durationMs = (durationRaw * timescaleNs) / 1000000;
	}
}

function parseChapters(
	reader: EBMLReader,
	start: number,
	end: number,
	result: VideoMetadata,
	timescaleNs: number
): void {
	reader.pos = start;

	while (reader.pos < end && reader.hasData(2)) {
		const id = reader.readElementId();
		const size = reader.readVint();
		if (id < 0 || size < 0) break;
		const contentEnd = reader.pos + size;

		if (id === EDITION_ENTRY_ID) {
			parseEditionEntry(reader, reader.pos, contentEnd, result, timescaleNs);
		}

		reader.pos = contentEnd;
	}
}

function parseEditionEntry(
	reader: EBMLReader,
	start: number,
	end: number,
	result: VideoMetadata,
	timescaleNs: number
): void {
	reader.pos = start;

	while (reader.pos < end && reader.hasData(2)) {
		const id = reader.readElementId();
		const size = reader.readVint();
		if (id < 0 || size < 0) break;
		const contentEnd = reader.pos + size;

		if (id === CHAPTER_ATOM_ID) {
			parseChapterAtom(reader, reader.pos, contentEnd, result, timescaleNs);
		}

		reader.pos = contentEnd;
	}
}

function parseChapterAtom(
	reader: EBMLReader,
	start: number,
	end: number,
	result: VideoMetadata,
	timescaleNs: number
): void {
	reader.pos = start;
	let timestampNs = 0;
	let label = '';

	while (reader.pos < end && reader.hasData(2)) {
		const id = reader.readElementId();
		const size = reader.readVint();
		if (id < 0 || size < 0) break;
		const contentEnd = reader.pos + size;

		if (id === CHAPTER_TIME_START_ID) {
			timestampNs = reader.readUint(size);
		} else if (id === CHAPTER_DISPLAY_ID) {
			// Parse ChapterDisplay for ChapString
			const displayEnd = contentEnd;
			while (reader.pos < displayEnd && reader.hasData(2)) {
				const dId = reader.readElementId();
				const dSize = reader.readVint();
				if (dId < 0 || dSize < 0) break;
				if (dId === CHAP_STRING_ID) {
					label = reader.readUtf8(dSize);
				}
				reader.pos = reader.pos + dSize;
			}
		}

		reader.pos = contentEnd;
	}

	const timestampMs = timestampNs / 1000000;
	result.chapters.push({ timestampMs, label: label || `Chapter ${result.chapters.length + 1}` });
}

function parseTags(
	reader: EBMLReader,
	start: number,
	end: number,
	result: VideoMetadata
): void {
	reader.pos = start;

	while (reader.pos < end && reader.hasData(2)) {
		const id = reader.readElementId();
		const size = reader.readVint();
		if (id < 0 || size < 0) break;
		const contentEnd = reader.pos + size;

		if (id === TAG_ID) {
			parseTag(reader, reader.pos, contentEnd, result);
		}

		reader.pos = contentEnd;
	}
}

function parseTag(
	reader: EBMLReader,
	start: number,
	end: number,
	result: VideoMetadata
): void {
	reader.pos = start;

	while (reader.pos < end && reader.hasData(2)) {
		const id = reader.readElementId();
		const size = reader.readVint();
		if (id < 0 || size < 0) break;
		const contentEnd = reader.pos + size;

		if (id === SIMPLE_TAG_ID) {
			parseSimpleTag(reader, reader.pos, contentEnd, result);
		}

		reader.pos = contentEnd;
	}
}

function parseSimpleTag(
	reader: EBMLReader,
	start: number,
	end: number,
	result: VideoMetadata
): void {
	reader.pos = start;
	let name = '';
	let value = '';

	while (reader.pos < end && reader.hasData(2)) {
		const id = reader.readElementId();
		const size = reader.readVint();
		if (id < 0 || size < 0) break;
		const contentEnd = reader.pos + size;

		if (id === TAG_NAME_ID) {
			name = reader.readString(size);
		} else if (id === TAG_STRING_ID) {
			value = reader.readString(size);
		}

		reader.pos = contentEnd;
	}

	const upperName = name.toUpperCase();
	if (upperName === 'TITLE' && !result.title) {
		result.title = value;
	} else if (upperName === 'DATE_RELEASED' || upperName === 'YEAR') {
		const year = parseInt(value, 10);
		if (!isNaN(year)) result.year = year;
	} else if (upperName === 'IMDB' || upperName === 'IMDB_ID') {
		result.imdbId = value;
	}
}

// ============================================================
// MP4 / ISO BMFF parser
// ============================================================

const MP4_MAX_READ = 50 * 1024 * 1024; // 50MB

async function parseMp4(file: File): Promise<VideoMetadata> {
	const readSize = Math.min(file.size, MP4_MAX_READ);
	const slice = file.slice(0, readSize);
	const buffer = await readFileSlice(slice);
	const view = new DataView(buffer);

	const result: VideoMetadata = { durationMs: 0, chapters: [] };

	parseAtoms(view, 0, buffer.byteLength, result);

	return result;
}

function parseAtoms(
	view: DataView,
	start: number,
	end: number,
	result: VideoMetadata
): void {
	let pos = start;

	while (pos + 8 <= end) {
		let size = view.getUint32(pos);
		const type = String.fromCharCode(
			view.getUint8(pos + 4),
			view.getUint8(pos + 5),
			view.getUint8(pos + 6),
			view.getUint8(pos + 7)
		);

		if (size === 0) break; // Atom extends to end of file — stop parsing
		if (size === 1) {
			// 64-bit extended size
			if (pos + 16 > end) break;
			const hi = view.getUint32(pos + 8);
			const lo = view.getUint32(pos + 12);
			size = hi * 0x100000000 + lo;
			if (size < 16) break;
		}

		if (size < 8 || pos + size > end) break;

		const headerSize = size > 0xffffffff ? 16 : 8;
		const contentStart = pos + headerSize;
		const contentEnd = pos + size;

		if (type === 'moov' || type === 'trak' || type === 'mdia' || type === 'udta') {
			parseAtoms(view, contentStart, contentEnd, result);
		} else if (type === 'mvhd') {
			parseMvhd(view, contentStart, contentEnd, result);
		} else if (type === 'chpl') {
			parseChpl(view, contentStart, contentEnd, result);
		}

		pos += size;
	}
}

function parseMvhd(
	view: DataView,
	start: number,
	end: number,
	result: VideoMetadata
): void {
	if (start >= end) return;
	const version = view.getUint8(start);

	let timescale: number;
	let duration: number;

	if (version === 1) {
		// 64-bit fields
		if (start + 28 > end) return;
		timescale = view.getUint32(start + 20);
		const hi = view.getUint32(start + 24);
		const lo = view.getUint32(start + 28);
		duration = hi * 0x100000000 + lo;
	} else {
		// 32-bit fields
		if (start + 20 > end) return;
		timescale = view.getUint32(start + 12);
		duration = view.getUint32(start + 16);
	}

	if (timescale > 0) {
		result.durationMs = (duration / timescale) * 1000;
	}
}

function parseChpl(
	view: DataView,
	start: number,
	end: number,
	result: VideoMetadata
): void {
	// Nero-style chapter list
	if (start + 5 > end) return;
	const count = view.getUint8(start + 4);
	let pos = start + 5;

	for (let i = 0; i < count && pos + 9 <= end; i++) {
		// 64-bit timestamp in 100ns units
		const hi = view.getUint32(pos);
		const lo = view.getUint32(pos + 4);
		const timestamp100ns = hi * 0x100000000 + lo;
		const timestampMs = timestamp100ns / 10000;
		pos += 8;

		const titleLen = view.getUint8(pos);
		pos += 1;

		let label = `Chapter ${i + 1}`;
		if (pos + titleLen <= end) {
			const bytes = new Uint8Array(view.buffer, pos, titleLen);
			label = new TextDecoder('utf-8').decode(bytes);
			pos += titleLen;
		}

		result.chapters.push({ timestampMs, label });
	}
}

// ============================================================
// HTMLVideoElement fallback
// ============================================================

async function fallbackExtract(file: File): Promise<VideoMetadata> {
	return new Promise((resolve) => {
		const video = document.createElement('video');
		video.preload = 'metadata';

		const url = URL.createObjectURL(file);
		video.src = url;

		const cleanup = () => {
			URL.revokeObjectURL(url);
			video.remove();
		};

		video.addEventListener('loadedmetadata', () => {
			const durationMs = (video.duration || 0) * 1000;
			cleanup();
			resolve({ durationMs, chapters: [] });
		});

		video.addEventListener('error', () => {
			cleanup();
			resolve({ durationMs: 0, chapters: [] });
		});

		// Timeout after 10 seconds
		setTimeout(() => {
			cleanup();
			resolve({ durationMs: 0, chapters: [] });
		}, 10000);
	});
}

// ============================================================
// Helpers
// ============================================================

function readFileSlice(blob: Blob): Promise<ArrayBuffer> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result as ArrayBuffer);
		reader.onerror = () => reject(reader.error);
		reader.readAsArrayBuffer(blob);
	});
}
