#!/usr/bin/env node
/**
 * Build a tiny Presentation Graphic Stream (.sup) so a clip can carry
 * an hdmv_pgs_subtitle track. This ffmpeg build has a PGS decoder and no encoder.
 */
import fs from 'node:fs';

function segment(type, pts, data) {
  const buf = Buffer.alloc(13 + data.length);
  buf.writeUInt16BE(0x5047, 0);
  buf.writeUInt32BE(pts >>> 0, 2);
  buf.writeUInt32BE(0, 6);
  buf.writeUInt8(type, 10);
  buf.writeUInt16BE(data.length, 11);
  data.copy(buf, 13);
  return buf;
}

function u16(n) {
  const b = Buffer.alloc(2);
  b.writeUInt16BE(n);
  return b;
}

function displaySet(width, height, pts) {
  const pcs = Buffer.concat([
    u16(width),
    u16(height),
    Buffer.from([0x10]),
    u16(0),
    Buffer.from([0x80, 0x00, 0x00, 0x01]),
    u16(0),
    Buffer.from([0x00, 0x00]),
    u16(8),
    u16(8),
  ]);
  const wds = Buffer.concat([Buffer.from([0x01, 0x00]), u16(8), u16(8), u16(1), u16(1)]);
  const pds = Buffer.from([0x00, 0x00, 0x01, 0x80, 0x80, 0x80, 0xff]);
  const rle = Buffer.from([0x01, 0x00, 0x00]);
  const objectDataLength = 4 + rle.length;
  const ods = Buffer.concat([
    u16(0),
    Buffer.from([0x00, 0xc0]),
    Buffer.from([(objectDataLength >> 16) & 0xff, (objectDataLength >> 8) & 0xff, objectDataLength & 0xff]),
    u16(1),
    u16(1),
    rle,
  ]);
  return Buffer.concat([
    segment(0x16, pts, pcs),
    segment(0x17, pts, wds),
    segment(0x14, pts, pds),
    segment(0x15, pts, ods),
    segment(0x80, pts, Buffer.alloc(0)),
  ]);
}

const [width, height, out] = process.argv.slice(2);
if (!width || !height || !out) {
  console.error('usage: pgs.mjs <width> <height> <out.sup>');
  process.exit(1);
}
fs.writeFileSync(out, displaySet(Number(width), Number(height), 0));
