package dev.openlite.mobile;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import android.util.Log;
import android.webkit.JavascriptInterface;

import org.json.JSONArray;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.TreeSet;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

// Saved logins for the login helper (web/src/credentials.js), the phone's
// version of the PC client's userPasswordManagement module: usernames with
// passwords encrypted by a key kept in the Android Keystore (it never
// leaves the device's secure hardware). Exposed to the page as
// window.OpenLiteCredentials; the WebView only ever shows openspell.dev
// (MainActivity).
final class Credentials {
    private static final String TAG = "OpenLite";
    private static final String KEY_ALIAS = "openlite-credentials";
    private static final int IV_LENGTH = 12;

    private final SharedPreferences store;

    Credentials(Context context) {
        store = context.getSharedPreferences("credentials", Context.MODE_PRIVATE);
    }

    @JavascriptInterface
    public void save(String username, String password) {
        if (username == null || username.isEmpty() || password == null) return;
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, key());
            byte[] encrypted = cipher.doFinal(password.getBytes(StandardCharsets.UTF_8));
            byte[] stored = ByteBuffer.allocate(IV_LENGTH + encrypted.length).put(cipher.getIV()).put(encrypted).array();
            store.edit().putString(username, Base64.encodeToString(stored, Base64.NO_WRAP)).apply();
        } catch (Exception e) {
            Log.e(TAG, "Saving login failed", e);
        }
    }

    @JavascriptInterface
    public String usernames() {
        return new JSONArray(new TreeSet<>(store.getAll().keySet())).toString();
    }

    @JavascriptInterface
    public String password(String username) {
        String stored = store.getString(username, null);
        if (stored == null) return "";
        try {
            byte[] bytes = Base64.decode(stored, Base64.NO_WRAP);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, bytes, 0, IV_LENGTH));
            return new String(cipher.doFinal(bytes, IV_LENGTH, bytes.length - IV_LENGTH), StandardCharsets.UTF_8);
        } catch (Exception e) {
            Log.e(TAG, "Reading login failed", e);
            return "";
        }
    }

    @JavascriptInterface
    public void remove(String username) {
        store.edit().remove(username).apply();
    }

    private static SecretKey key() throws Exception {
        KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
        keyStore.load(null);
        if (keyStore.containsAlias(KEY_ALIAS)) return (SecretKey) keyStore.getKey(KEY_ALIAS, null);
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .build());
        return generator.generateKey();
    }
}
