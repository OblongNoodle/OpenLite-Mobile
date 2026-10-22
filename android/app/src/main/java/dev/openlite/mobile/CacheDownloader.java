package dev.openlite.mobile;

import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

// Fetches an OSRS cache on first launch, so a new phone or tablet needs no
// PC: the newest complete live cache from the OpenRS2 archive (the cache
// RuneLite would have), unzipped into the app's private storage. Nothing
// from the cache ships with the app or its repo.
final class CacheDownloader {
    private static final String TAG = "OpenLite";
    private static final String ARCHIVE = "https://archive.openrs2.org/";

    private final File target;
    private volatile String state = "idle"; // idle, downloading, done, failed
    private volatile long bytes;
    private volatile long expected;
    private volatile String error = "";

    CacheDownloader(File target) {
        this.target = target;
    }

    synchronized void start(Runnable onDone) {
        if (state.equals("downloading") || state.equals("done")) return;
        state = "downloading";
        bytes = 0;
        error = "";
        new Thread(() -> {
            try {
                download();
                state = "done";
                onDone.run();
            } catch (Exception e) {
                Log.e(TAG, "OSRS cache download failed", e);
                error = String.valueOf(e.getMessage());
                state = "failed";
            }
        }, "OpenLite cache download").start();
    }

    String progressJson() {
        try {
            return new JSONObject().put("state", state).put("bytes", bytes).put("expected", expected).put("error", error).toString();
        } catch (Exception e) {
            return "{}";
        }
    }

    private void download() throws Exception {
        JSONObject cache = newestCache();
        expected = cache.optLong("size", 0);
        int id = cache.getInt("id");
        File staging = new File(target.getParentFile(), target.getName() + ".part");
        deleteTree(staging);
        staging.mkdirs();
        HttpURLConnection connection = open(ARCHIVE + "caches/runescape/" + id + "/disk.zip");
        int files = 0;
        try (ZipInputStream zip = new ZipInputStream(connection.getInputStream())) {
            byte[] buffer = new byte[65536];
            for (ZipEntry entry; (entry = zip.getNextEntry()) != null; ) {
                String name = new File(entry.getName()).getName();
                if (entry.isDirectory() || !name.startsWith("main_file_cache.")) continue;
                try (OutputStream out = new FileOutputStream(new File(staging, name))) {
                    for (int n; (n = zip.read(buffer)) > 0; ) {
                        out.write(buffer, 0, n);
                        bytes += n;
                    }
                }
                files++;
            }
        }
        if (files == 0 || !new File(staging, "main_file_cache.dat2").isFile()) throw new IOException("The download had no cache in it");
        deleteTree(target);
        if (!staging.renameTo(target)) throw new IOException("Can't move the cache into place");
        Log.i(TAG, "OSRS cache " + id + " downloaded: " + files + " files");
    }

    // The newest live English OSRS cache with every index and group present.
    private static JSONObject newestCache() throws Exception {
        JSONArray caches = new JSONArray(new String(readAll(open(ARCHIVE + "caches.json").getInputStream()), StandardCharsets.UTF_8));
        JSONObject best = null;
        for (int i = 0; i < caches.length(); i++) {
            JSONObject cache = caches.getJSONObject(i);
            if (!"oldschool".equals(cache.optString("game")) || !"live".equals(cache.optString("environment"))) continue;
            if (!"en".equals(cache.optString("language")) || cache.optBoolean("hidden", false)) continue;
            if (cache.isNull("timestamp") || cache.optLong("valid_indexes") != cache.optLong("indexes")) continue;
            if (cache.optLong("valid_groups") != cache.optLong("groups") || !cache.optBoolean("disk_store_valid", true)) continue;
            if (best == null || cache.getString("timestamp").compareTo(best.getString("timestamp")) > 0) best = cache;
        }
        if (best == null) throw new IOException("No OSRS cache found on OpenRS2");
        return best;
    }

    private static HttpURLConnection open(String url) throws IOException {
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        connection.setConnectTimeout(20000);
        connection.setReadTimeout(60000);
        connection.setRequestProperty("User-Agent", "OpenLite-Mobile");
        if (connection.getResponseCode() != 200) throw new IOException(url + ": HTTP " + connection.getResponseCode());
        return connection;
    }

    private static byte[] readAll(InputStream in) throws IOException {
        try (in) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buffer = new byte[65536];
            for (int n; (n = in.read(buffer)) > 0; ) out.write(buffer, 0, n);
            return out.toByteArray();
        }
    }

    private static void deleteTree(File file) {
        File[] children = file.listFiles();
        if (children != null) for (File child : children) deleteTree(child);
        file.delete();
    }
}
