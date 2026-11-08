// A small ZIP writer (stored, no compression: WAV and MP3 barely compress). Opens everywhere, MPC card readers included.

const TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(data) {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = TABLE[(c ^ data[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** @param {{name: string, data: Uint8Array}[]} files @returns {Uint8Array} */
export function makeZip(files) {
  const enc = new TextEncoder();
  const parts = [];
  const central = [];
  let offset = 0;
  const push = (u8) => {
    parts.push(u8);
    offset += u8.length;
  };
  for (const f of files) {
    const name = enc.encode(f.name);
    const crc = crc32(f.data);
    const head = new Uint8Array(30 + name.length);
    const v = new DataView(head.buffer);
    v.setUint32(0, 0x04034b50, true);
    v.setUint16(4, 20, true);
    v.setUint16(6, 0x0800, true); // names are UTF-8
    v.setUint16(8, 0, true); // stored
    v.setUint16(10, 0, true);
    v.setUint16(12, 0x21, true); // 1980-01-01
    v.setUint32(14, crc, true);
    v.setUint32(18, f.data.length, true);
    v.setUint32(22, f.data.length, true);
    v.setUint16(26, name.length, true);
    head.set(name, 30);
    central.push({ name, crc, size: f.data.length, offset });
    push(head);
    push(f.data);
  }
  const cdStart = offset;
  for (const c of central) {
    const rec = new Uint8Array(46 + c.name.length);
    const v = new DataView(rec.buffer);
    v.setUint32(0, 0x02014b50, true);
    v.setUint16(4, 20, true);
    v.setUint16(6, 20, true);
    v.setUint16(8, 0x0800, true);
    v.setUint16(10, 0, true);
    v.setUint16(12, 0, true);
    v.setUint16(14, 0x21, true);
    v.setUint32(16, c.crc, true);
    v.setUint32(20, c.size, true);
    v.setUint32(24, c.size, true);
    v.setUint16(28, c.name.length, true);
    v.setUint32(42, c.offset, true);
    rec.set(c.name, 46);
    push(rec);
  }
  const end = new Uint8Array(22);
  const e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, central.length, true);
  e.setUint16(10, central.length, true);
  e.setUint32(12, offset - cdStart, true);
  e.setUint32(16, cdStart, true);
  push(end);
  const out = new Uint8Array(offset);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
