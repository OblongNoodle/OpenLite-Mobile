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

// The game uses its touch controls and phone layout only on small screens
// (MobileHelper's media query). On a tablet, or any touchscreen device, it
// should use them too: the query reports a match whenever the main pointer
// is a finger. touch.js asks the same question.
export const PHONE_MODE_QUERY = "(height < 48rem) and (orientation: landscape), (width < 48rem) and (orientation: portrait)";
if (window.matchMedia("(pointer: coarse)").matches) {
  const matchMedia = window.matchMedia.bind(window);
  window.matchMedia = (query) => matchMedia(query === PHONE_MODE_QUERY ? "all" : query);
}
