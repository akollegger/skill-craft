/**
 * A read-only zip reader on `node:zlib`, written here because the loop reads one small archive and a dependency (or a
 * shelled-out `unzip`) is not worth that. It reads stored and deflate entries, checks each entry's checksum and size, and
 * refuses everything else: encryption, zip64, other methods, truncation, and names that leave the folder.
 */
import { crc32, inflateRawSync } from "node:zlib";
import { CandidateFailed } from "../harness/errors.js";

const refuse = (why: string): never => {
  throw new CandidateFailed(`the skill download is not a usable zip (${why})`);
};

/** A skill is a few small text files; anything larger is not one, and an archive may not expand beyond these. */
const MAX_ENTRY_BYTES = 1 << 20;
const MAX_TOTAL_BYTES = 4 << 20;

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;

export function readZip(zip: Uint8Array): Record<string, Uint8Array> {
  const buf = Buffer.from(zip.buffer, zip.byteOffset, zip.byteLength);
  try {
    return read(buf);
  } catch (e) {
    if (e instanceof CandidateFailed) throw e;
    return refuse("it is damaged");
  }
}

function read(buf: Buffer): Record<string, Uint8Array> {
  // The end-of-central-directory record is within the last 64 KB plus its own 22 bytes.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
    if (buf.readUInt32LE(i) === EOCD) { eocd = i; break; }
  }
  if (eocd < 0) return refuse("truncated");
  const count = buf.readUInt16LE(eocd + 10);
  const cdSize = buf.readUInt32LE(eocd + 12);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  if (count === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) return refuse("zip64 is not supported");
  if (cdOffset + cdSize > buf.length) return refuse("truncated");

  // First pass: read the directory and refuse anything unusable or oversized before a single byte is inflated.
  const entries: { name: string; method: number; crc: number; compSize: number; size: number; local: number }[] = [];
  let total = 0;
  let p = cdOffset;
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== CENTRAL) return refuse("bad directory");
    const flags = buf.readUInt16LE(p + 8);
    const method = buf.readUInt16LE(p + 10);
    const crc = buf.readUInt32LE(p + 16);
    const compSize = buf.readUInt32LE(p + 20);
    const size = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString("utf8");
    p += 46 + nameLen + extraLen + commentLen;

    if (flags & 1) return refuse("an entry is encrypted");
    if (compSize === 0xffffffff || size === 0xffffffff || local === 0xffffffff) return refuse("zip64 is not supported");
    if (name.startsWith("/") || name.includes("\\") || name.split("/").includes("..")) return refuse("an entry name leaves the folder");
    if (name.endsWith("/")) continue; // a directory
    if (method !== 0 && method !== 8) return refuse("an entry uses an unsupported method");
    if (size > MAX_ENTRY_BYTES || (total += size) > MAX_TOTAL_BYTES) return refuse("an entry is too large");
    entries.push({ name, method, crc, compSize, size, local });
  }

  // Second pass: inflate each entry, capped at the size its header declares.
  const files: Record<string, Uint8Array> = {};
  for (const e of entries) {
    if (buf.readUInt32LE(e.local) !== LOCAL) return refuse("bad entry");
    const start = e.local + 30 + buf.readUInt16LE(e.local + 26) + buf.readUInt16LE(e.local + 28);
    if (start + e.compSize > buf.length) return refuse("truncated");
    const body = buf.subarray(start, start + e.compSize);
    // The output is capped at the declared size, so a small archive cannot expand without limit before the check below.
    const data = e.method === 0 ? Buffer.from(body) : inflateRawSync(body, { maxOutputLength: Math.max(e.size, 1) });
    if (data.length !== e.size || crc32(data) !== e.crc) return refuse("an entry does not match its checksum");
    if (e.name in files) return refuse("a name appears twice");
    files[e.name] = new Uint8Array(data);
  }
  return files;
}
