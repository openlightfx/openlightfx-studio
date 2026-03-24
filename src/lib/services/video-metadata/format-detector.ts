// Format detection from magic bytes (STU-087)

export type VideoFormat = 'mkv' | 'webm' | 'mp4' | 'unknown';

const EBML_MAGIC = [0x1a, 0x45, 0xdf, 0xa3];
const FTYP_SIGNATURE = [0x66, 0x74, 0x79, 0x70]; // 'ftyp' at offset 4

/**
 * Read the first `size` bytes of a File as an ArrayBuffer.
 * Returns fewer bytes if the file is smaller than `size`.
 */
export function readFileSlice(file: File, offset: number, size: number): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const end = Math.min(offset + size, file.size);
    const slice = file.slice(offset, end);
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(slice);
  });
}

/**
 * Detect video container format from magic bytes and file extension.
 *
 * MKV/WebM both start with the EBML header (0x1A45DFA3). To distinguish
 * them we parse the DocType string inside the EBML header element.
 *
 * MP4 files contain 'ftyp' at byte offset 4.
 */
export async function detectFormat(file: File): Promise<VideoFormat> {
  // We need enough bytes to check magic + EBML DocType string
  const headerSize = Math.min(64, file.size);
  if (headerSize < 4) return 'unknown';

  const buf = await readFileSlice(file, 0, headerSize);
  const bytes = new Uint8Array(buf);

  // Check EBML magic (MKV / WebM)
  if (matchesBytes(bytes, EBML_MAGIC, 0)) {
    return detectEbmlDocType(bytes);
  }

  // Check MP4 'ftyp' box at offset 4
  if (bytes.length >= 8 && matchesBytes(bytes, FTYP_SIGNATURE, 4)) {
    return 'mp4';
  }

  // Fallback: use file extension
  return formatFromExtension(file.name);
}

function matchesBytes(data: Uint8Array, signature: number[], offset: number): boolean {
  if (data.length < offset + signature.length) return false;
  for (let i = 0; i < signature.length; i++) {
    if (data[offset + i] !== signature[i]) return false;
  }
  return true;
}

/**
 * Scan the first bytes of the EBML header element for DocType ('matroska' or 'webm').
 * This is a lightweight scan — we look for the ASCII strings rather than
 * fully parsing the EBML VINT structure, which is fine for detection.
 */
function detectEbmlDocType(bytes: Uint8Array): VideoFormat {
  const text = new TextDecoder('ascii').decode(bytes);
  if (text.includes('webm')) return 'webm';
  if (text.includes('matroska')) return 'mkv';
  // Default to MKV if EBML header present but DocType not found in first bytes
  return 'mkv';
}

function formatFromExtension(name: string): VideoFormat {
  const ext = name.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'mkv':
      return 'mkv';
    case 'webm':
      return 'webm';
    case 'mp4':
    case 'm4v':
      return 'mp4';
    default:
      return 'unknown';
  }
}
