// window.osrsCache for the plugins (the PC client's preload provides it from
// main/modules/osrsCache). The app reads and decompresses archives from the
// OSRS cache copied to the phone (MainActivity.cacheArchive); reference
// tables and archive files are split here, as RuneLite's IndexData and
// ArchiveFiles do. Nothing from the cache ships with the app.
const REFERENCE_INDEX = 255;

async function archive(index, id) {
  const response = await fetch(`/__openlite/cache/archive/${index}/${id}`);
  if (!response.ok) return null;
  return new Uint8Array(await response.arrayBuffer());
}

const referenceTables = new Map();

// Which archives an index has and which files each archive holds:
// archive id -> file ids.
function referenceTable(index) {
  if (!referenceTables.has(index)) {
    referenceTables.set(index, archive(REFERENCE_INDEX, index).then((data) => {
      if (!data) throw new Error(`No reference table for index ${index}`);
      const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
      let offset = 0;
      const u8 = () => data[offset++];
      const u16 = () => ((offset += 2), view.getUint16(offset - 2));
      const i32 = () => ((offset += 4), view.getInt32(offset - 4));
      const protocol = u8();
      if (protocol >= 6) i32();
      const flags = u8();
      const named = (flags & 1) !== 0, sized = (flags & 4) !== 0;
      const bigSmart = () => (data[offset] & 0x80 ? i32() & 0x7fffffff : u16());
      const count = protocol >= 7 ? bigSmart : u16;
      const archiveCount = count();
      const ids = [];
      let last = 0;
      for (let i = 0; i < archiveCount; i++) ids.push((last += count()));
      if (named) offset += archiveCount * 4;
      offset += archiveCount * 4; // crc
      if (sized) offset += archiveCount * 8;
      offset += archiveCount * 4; // revision
      const fileCounts = ids.map(() => count());
      const table = new Map();
      ids.forEach((id, i) => {
        const fileIds = [];
        let lastFile = 0;
        for (let f = 0; f < fileCounts[i]; f++) fileIds.push((lastFile += count()));
        table.set(id, fileIds);
      });
      return table;
    }));
  }
  return referenceTables.get(index);
}

async function files(index, id) {
  const fileIds = (await referenceTable(index)).get(id);
  const data = fileIds && (await archive(index, id));
  if (!fileIds || !data) return null;
  const count = fileIds.length;
  if (count === 1) return [{ id: fileIds[0], data }];

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const chunks = data[data.length - 1];
  let offset = data.length - 1 - chunks * count * 4;
  const chunkSizes = fileIds.map(() => []);
  const sizes = new Array(count).fill(0);
  for (let chunk = 0; chunk < chunks; chunk++) {
    let size = 0;
    for (let f = 0; f < count; f++) {
      size += view.getInt32(offset);
      offset += 4;
      chunkSizes[f][chunk] = size;
      sizes[f] += size;
    }
  }
  const contents = sizes.map((size) => new Uint8Array(size));
  const written = new Array(count).fill(0);
  let read = 0;
  for (let chunk = 0; chunk < chunks; chunk++) {
    for (let f = 0; f < count; f++) {
      const size = chunkSizes[f][chunk];
      contents[f].set(data.subarray(read, read + size), written[f]);
      written[f] += size;
      read += size;
    }
  }
  return fileIds.map((fileId, f) => ({ id: fileId, data: contents[f] }));
}

export function installOsrsCache() {
  window.osrsCache = {
    open: async () => {
      const response = await fetch("/__openlite/cache/status");
      return response.ok ? { ok: true, dir: await response.text() } : { ok: false, error: await response.text() };
    },
    archives: async (index) => [...(await referenceTable(index)).keys()],
    files
  };
}
