package dev.openlite.mobile;

import android.content.Context;
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
import java.nio.file.Files;

// Keeps the web bundle up to date without reinstalling the app. Each update
// is a bundle built from the PC client's plugins by the OpenLite-Mobile
// repo's GitHub Action and published on its GitHub Pages site, listed in
// manifest.json ({ version, files }). On launch the latest is downloaded in
// the background into files/web/<version>; it is used from the next launch.
// The bundle built into the app (assets/web) is used until then, and again
// if an update won't start (rejectCurrent).
final class Updater {
    private static final String TAG = "OpenLite";
    static final String UPDATE_URL = "https://oblongnoodle.github.io/OpenLite-Mobile/";

    private final File root;
    private final File currentFile;
    private final File rejectedFile;

    Updater(Context context) {
        root = new File(context.getFilesDir(), "web");
        currentFile = new File(root, "current.txt");
        rejectedFile = new File(root, "rejected.txt");
    }

    // The version in use, or null for the one built into the app.
    String currentVersion() {
        String version = read(currentFile);
        return version != null && new File(root, version).isDirectory() ? version : null;
    }

    // The folder of the bundle in use, or null for assets/web.
    File currentDir() {
        String version = currentVersion();
        return version == null ? null : new File(root, version);
    }

    // The update in use didn't start: go back to the built-in bundle, and
    // don't download that version again.
    void rejectCurrent() {
        String version = currentVersion();
        if (version != null) write(rejectedFile, version);
        currentFile.delete();
    }

    // Downloads the latest bundle if it's new. Returns its version once ready
    // for the next launch, or null if there was nothing to do.
    String downloadLatest() {
        try {
            JSONObject manifest = new JSONObject(new String(get(UPDATE_URL + "manifest.json"), StandardCharsets.UTF_8));
            String version = manifest.getString("version");
            if (!version.matches("[A-Za-z0-9._-]+")) return null;
            if (version.equals(currentVersion()) || version.equals(read(rejectedFile))) return null;
            File target = new File(root, version);
            if (target.isDirectory()) {
                write(currentFile, version);
                return version;
            }
            File staging = new File(root, version + ".part");
            deleteTree(staging);
            JSONArray files = manifest.getJSONArray("files");
            for (int i = 0; i < files.length(); i++) {
                String path = files.getString(i);
                if (path.contains("..")) throw new IOException("bad path " + path);
                File file = new File(staging, path);
                file.getParentFile().mkdirs();
                try (OutputStream out = new FileOutputStream(file)) {
                    out.write(get(UPDATE_URL + path));
                }
            }
            if (!staging.renameTo(target)) throw new IOException("can't move " + staging);
            String previous = currentVersion();
            write(currentFile, version);
            // Keep only the new version and the one in use until relaunch.
            File[] old = root.listFiles();
            if (old != null) for (File dir : old) {
                if (dir.isDirectory() && !dir.getName().equals(version) && !dir.getName().equals(previous)) deleteTree(dir);
            }
            return version;
        } catch (Exception e) {
            Log.w(TAG, "Update check failed: " + e);
            return null;
        }
    }

    private static byte[] get(String url) throws IOException {
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        connection.setUseCaches(false);
        connection.setConnectTimeout(15000);
        connection.setReadTimeout(30000);
        if (connection.getResponseCode() != 200) throw new IOException(url + ": HTTP " + connection.getResponseCode());
        try (InputStream in = connection.getInputStream()) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buffer = new byte[16384];
            for (int n; (n = in.read(buffer)) > 0; ) out.write(buffer, 0, n);
            return out.toByteArray();
        }
    }

    private static String read(File file) {
        try {
            return file.isFile() ? new String(Files.readAllBytes(file.toPath()), StandardCharsets.UTF_8).trim() : null;
        } catch (IOException e) {
            return null;
        }
    }

    private void write(File file, String text) {
        root.mkdirs();
        try (OutputStream out = new FileOutputStream(file)) {
            out.write(text.getBytes(StandardCharsets.UTF_8));
        } catch (IOException e) {
            Log.w(TAG, "Writing " + file + ": " + e);
        }
    }

    private static void deleteTree(File file) {
        File[] children = file.listFiles();
        if (children != null) for (File child : children) deleteTree(child);
        file.delete();
    }
}
