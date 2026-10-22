package dev.openlite.mobile;

import org.apache.commons.compress.compressors.bzip2.BZip2CompressorInputStream;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.io.RandomAccessFile;
import java.io.SequenceInputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import java.util.zip.GZIPInputStream;

// Read-only access to a Jagex (JS5) game cache, ported from the PC client's
// main/modules/osrsCache: archives are read sector by sector and
// decompressed here; the page splits them into files (web/src/osrsCache.js).
final class JagexCache {
    private static final int SECTOR_SIZE = 520;
    private static final int INDEX_ENTRY_LENGTH = 6;

    final File dir;
    private final RandomAccessFile data;
    private final Map<Integer, RandomAccessFile> indexes = new HashMap<>();

    JagexCache(File dir) throws IOException {
        this.dir = dir;
        File dataFile = new File(dir, "main_file_cache.dat2");
        if (!dataFile.isFile()) throw new IOException("missing " + dataFile);
        this.data = new RandomAccessFile(dataFile, "r");
    }

    private RandomAccessFile index(int index) throws IOException {
        if (!indexes.containsKey(index)) {
            File file = new File(dir, "main_file_cache.idx" + index);
            indexes.put(index, file.isFile() ? new RandomAccessFile(file, "r") : null);
        }
        return indexes.get(index);
    }

    // The raw (still compressed) container for one archive: its index entry
    // gives the length and first sector; sectors chain to the next.
    private byte[] readRaw(int index, int archive) throws IOException {
        RandomAccessFile indexFile = index(index);
        if (indexFile == null) return null;
        byte[] entry = new byte[INDEX_ENTRY_LENGTH];
        long entryOffset = (long) archive * INDEX_ENTRY_LENGTH;
        if (entryOffset + INDEX_ENTRY_LENGTH > indexFile.length()) return null;
        indexFile.seek(entryOffset);
        indexFile.readFully(entry);
        int length = u24(entry, 0);
        int sector = u24(entry, 3);
        if (length <= 0 || sector <= 0) return null;

        byte[] output = new byte[length];
        byte[] block = new byte[SECTOR_SIZE];
        boolean large = archive > 0xffff;
        int headerSize = large ? 10 : 8;
        int read = 0;
        for (int part = 0; read < length; part++) {
            int chunk = Math.min(length - read, SECTOR_SIZE - headerSize);
            data.seek((long) sector * SECTOR_SIZE);
            data.readFully(block, 0, headerSize + chunk);
            int currentArchive = large ? u32(block, 0) : u16(block, 0);
            int currentPart = u16(block, large ? 4 : 2);
            int nextSector = u24(block, large ? 6 : 4);
            int currentIndex = block[large ? 9 : 7] & 0xff;
            if (currentArchive != archive || currentPart != part || currentIndex != index) return null;
            System.arraycopy(block, headerSize, output, read, chunk);
            read += chunk;
            sector = nextSector;
        }
        return output;
    }

    // One archive, decompressed: [compression:u8][length:u32] then the data,
    // with a decompressed length first when compressed.
    synchronized byte[] archive(int index, int archive) throws IOException {
        byte[] container = readRaw(index, archive);
        if (container == null) return null;
        int compression = container[0] & 0xff;
        int length = u32(container, 1);
        if (compression == 0) return slice(container, 5, length);
        InputStream compressed = new ByteArrayInputStream(container, 9, length);
        InputStream stream;
        if (compression == 2) {
            stream = new GZIPInputStream(compressed);
        } else if (compression == 1) {
            // The cache strips the bzip2 stream header; put it back.
            stream = new BZip2CompressorInputStream(new SequenceInputStream(
                    new ByteArrayInputStream("BZh1".getBytes(StandardCharsets.US_ASCII)), compressed));
        } else {
            throw new IOException("Unknown compression type " + compression);
        }
        ByteArrayOutputStream out = new ByteArrayOutputStream(u32(container, 5));
        byte[] buffer = new byte[16384];
        for (int n; (n = stream.read(buffer)) > 0; ) out.write(buffer, 0, n);
        return out.toByteArray();
    }

    private static byte[] slice(byte[] bytes, int offset, int length) {
        byte[] out = new byte[length];
        System.arraycopy(bytes, offset, out, 0, length);
        return out;
    }

    private static int u16(byte[] b, int o) {
        return ((b[o] & 0xff) << 8) | (b[o + 1] & 0xff);
    }

    private static int u24(byte[] b, int o) {
        return ((b[o] & 0xff) << 16) | ((b[o + 1] & 0xff) << 8) | (b[o + 2] & 0xff);
    }

    private static int u32(byte[] b, int o) {
        return ((b[o] & 0xff) << 24) | ((b[o + 1] & 0xff) << 16) | ((b[o + 2] & 0xff) << 8) | (b[o + 3] & 0xff);
    }
}
