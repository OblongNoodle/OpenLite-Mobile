// Browser features Android's WebView lacks that the plugin core expects.
// Imported first in main.js.
if (!("Notification" in window)) {
  // Desktop notifications: none on the phone, as if permission were denied.
  window.Notification = class Notification {
    static permission = "denied";
    static requestPermission() {
      return Promise.resolve("denied");
    }
    close() {}
  };
}
