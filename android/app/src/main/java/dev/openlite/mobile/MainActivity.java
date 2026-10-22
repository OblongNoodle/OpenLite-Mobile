package dev.openlite.mobile;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

// One full-screen WebView. OpenLite's page (web/, built into assets/web) is
// served at https://openspell.dev/__openlite/ so it has OpenSpell's origin;
// it loads the game itself, as the PC client does. Paths under /__openlite/
// never reach the network:
//   /__openlite/proxy?url=...            GET from *.openspell.dev (no CORS there)
//   /__openlite/cache/status             whether an OSRS cache is on the phone
//   /__openlite/cache/archive/<i>/<a>    one decompressed cache archive
//   /__openlite/cache/download           fetch a cache (first launch; CacheDownloader)
//   /__openlite/cache/progress           how that is going
//   /__openlite/version                  the web bundle in use (see Updater)
//   /__openlite/use-builtin              drop an update that won't start
//   anything else                        a file of the web bundle
public class MainActivity extends Activity {
    private static final String TAG = "OpenLite";
    private static final String ORIGIN = "https://openspell.dev";
    private static final String PREFIX = "/__openlite/";

    private WebView webView;
    private JagexCache cache;
    private Updater updater;
    private CacheDownloader cacheDownloader;
    // The web bundle for this launch (null: the one built into the app).
    // An update downloaded meanwhile waits for the next launch.
    private File webDir;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        WebView.setWebContentsDebuggingEnabled(true);
        updater = new Updater(this);
        cacheDownloader = new CacheDownloader(cacheDir());
        webDir = updater.currentDir();
        new Thread(() -> {
            String version = updater.downloadLatest();
            if (version != null) runOnUiThread(() -> Toast.makeText(this,
                    "OpenLite update downloaded. It applies next time you open the app.", Toast.LENGTH_LONG).show());
        }, "OpenLite update").start();

        webView = new WebView(this);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setSupportZoom(false);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true);

        // Saved logins for the login helper (see Credentials).
        webView.addJavascriptInterface(new Credentials(this), "OpenLiteCredentials");
        webView.setWebViewClient(new WebViewClient() {
            // Only OpenSpell is shown here; other links open in the browser.
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String host = request.getUrl().getHost();
                if (host != null && (host.equals("openspell.dev") || host.endsWith(".openspell.dev"))) return false;
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, request.getUrl()));
                } catch (Exception e) {
                    Log.w(TAG, "No app for " + request.getUrl());
                }
                return true;
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                if (!"openspell.dev".equals(url.getHost()) || url.getPath() == null || !url.getPath().startsWith(PREFIX)) return null;
                try {
                    return serve(url);
                } catch (Exception e) {
                    Log.e(TAG, "Serving " + url, e);
                    return text(500, String.valueOf(e));
                }
            }
        });
        setContentView(webView);
        hideSystemBars();
        webView.loadUrl(ORIGIN + PREFIX + "index.html");
    }

    private WebResourceResponse serve(Uri url) throws IOException {
        String path = url.getPath().substring(PREFIX.length());
        if (path.equals("proxy")) return proxy(url.getQueryParameter("url"));
        if (path.equals("cache/status")) {
            JagexCache opened = cache();
            return opened != null ? text(200, opened.dir.getPath()) : text(404, "No OSRS cache at " + cacheDir().getPath());
        }
        if (path.equals("cache/download")) {
            cacheDownloader.start(() -> {
                synchronized (this) {
                    cache = null;
                }
            });
            return text(200, "started");
        }
        if (path.equals("cache/progress")) return bytes(200, "application/json", cacheDownloader.progressJson().getBytes(StandardCharsets.UTF_8));
        if (path.startsWith("cache/archive/")) {
            String[] parts = path.substring("cache/archive/".length()).split("/");
            JagexCache opened = cache();
            byte[] data = opened == null ? null : opened.archive(Integer.parseInt(parts[0]), Integer.parseInt(parts[1]));
            return data == null ? text(404, "missing") : bytes(200, "application/octet-stream", data);
        }
        if (path.equals("version")) {
            String version = webDir == null ? "built-in" : webDir.getName();
            return text(200, version);
        }
        if (path.equals("use-builtin")) {
            if (webDir != null) {
                updater.rejectCurrent();
                webDir = null;
            }
            return text(200, "ok");
        }
        if (path.contains("..")) return text(403, "bad path");
        InputStream file = webDir != null ? new FileInputStream(new File(webDir, path)) : getAssets().open("web/" + path);
        return new WebResourceResponse(mimeType(path), "utf-8", file);
    }

    private WebResourceResponse proxy(String target) throws IOException {
        Uri uri = Uri.parse(target);
        String host = uri.getHost();
        if (!"https".equals(uri.getScheme()) || host == null || !(host.equals("openspell.dev") || host.endsWith(".openspell.dev"))) {
            return text(403, "Not an OpenSpell address");
        }
        HttpURLConnection connection = (HttpURLConnection) new URL(target).openConnection();
        connection.setRequestProperty("Origin", ORIGIN);
        int status = connection.getResponseCode();
        InputStream body = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
        String type = connection.getContentType();
        String mime = type == null ? "application/octet-stream" : type.split(";")[0].trim();
        WebResourceResponse response = new WebResourceResponse(mime, "utf-8", body);
        response.setStatusCodeAndReasonPhrase(status, status >= 400 ? "Error" : "OK");
        return response;
    }

    // The OSRS cache copied to the phone, in the app's private storage
    // (files/osrs-cache; copied in with adb run-as, as files pushed to
    // Android/data belong to the shell user and the app can't read them):
    // the folder RuneLite keeps at ~/.runelite/jagexcache/oldschool/LIVE.
    private File cacheDir() {
        return new File(getFilesDir(), "osrs-cache");
    }

    private synchronized JagexCache cache() {
        if (cache == null) {
            try {
                cache = new JagexCache(cacheDir());
            } catch (IOException e) {
                Log.w(TAG, "No OSRS cache: " + e);
            }
        }
        return cache;
    }

    private static String mimeType(String path) {
        if (path.endsWith(".html")) return "text/html";
        if (path.endsWith(".js")) return "text/javascript";
        if (path.endsWith(".css")) return "text/css";
        if (path.endsWith(".png")) return "image/png";
        if (path.endsWith(".svg")) return "image/svg+xml";
        if (path.endsWith(".json")) return "application/json";
        return "application/octet-stream";
    }

    private static WebResourceResponse text(int status, String text) {
        return bytes(status, "text/plain", text.getBytes(StandardCharsets.UTF_8));
    }

    private static WebResourceResponse bytes(int status, String mime, byte[] data) {
        Map<String, String> headers = new HashMap<>();
        headers.put("Cache-Control", "no-store");
        return new WebResourceResponse(mime, "utf-8", status, status >= 400 ? "Error" : "OK", headers, new ByteArrayInputStream(data));
    }

    private void hideSystemBars() {
        webView.setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemBars();
    }

    @Override
    protected void onPause() {
        super.onPause();
        webView.onPause();
        CookieManager.getInstance().flush();
    }

    @Override
    protected void onResume() {
        super.onResume();
        webView.onResume();
    }

    // Back does nothing: leaving the page would log you out.
    @Override
    public void onBackPressed() {
    }
}
