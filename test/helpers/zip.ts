/** A minimal zip writer for tests (stored and deflate entries), so the reader is tested against known bytes. */
import { crc32, deflateRawSync } from "node:zlib";

export interface ZipEntry {
  name: string;
  data: string | Uint8Array;
  method?: 0 | 8;
  /** Set the encrypted bit. */
  encrypted?: boolean;
  /** Record this uncompressed size instead of the true one (a lying header). */
  declaredSize?: number;
}

const u16 = (n: number) => { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; };
const u32 = (n: number) => { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0); return b; };

export function makeZip(entries: ZipEntry[], opts: { zip64?: boolean; truncate?: number } = {}): Uint8Array {
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const raw = Buffer.from(e.data);
    const method = e.method ?? 8;
    const body = method === 8 ? deflateRawSync(raw) : raw;
    const name = Buffer.from(e.name);
    const flags = e.encrypted ? 1 : 0;
    const crc = crc32(raw);
    const local = Buffer.concat([u32(0x04034b50), u16(20), u16(flags), u16(method), u16(0), u16(0), u32(crc), u32(body.length), u32(e.declaredSize ?? raw.length), u16(name.length), u16(0), name, body]);
    central.push(Buffer.concat([u32(0x02014b50), u16(20), u16(20), u16(flags), u16(method), u16(0), u16(0), u32(crc), u32(body.length), u32(e.declaredSize ?? raw.length), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), name]));
    parts.push(local);
    offset += local.length;
  }
  const cd = Buffer.concat(central);
  const count = opts.zip64 ? 0xffff : entries.length;
  const eocd = Buffer.concat([u32(0x06054b50), u16(0), u16(0), u16(count), u16(count), u32(cd.length), u32(offset), u16(0)]);
  const all = Buffer.concat([...parts, cd, eocd]);
  return new Uint8Array(opts.truncate === undefined ? all : all.subarray(0, all.length - opts.truncate));
}
