// What the PC client's login helper (helpers/userHelper.js) asks Electron
// for, answered by the app (MainActivity's OpenLiteCredentials): saved
// usernames, and passwords kept encrypted by the Android Keystore.
const CHANNELS = {
  "save-username-password": (username, password) => window.OpenLiteCredentials.save(username, password),
  "get-saved-usernames": () => JSON.parse(window.OpenLiteCredentials.usernames()),
  "get-saved-password": (username) => window.OpenLiteCredentials.password(username),
  "delete-username-password": (username) => window.OpenLiteCredentials.remove(username)
};

export function installCredentials() {
  window.electron = {
    ipcRenderer: {
      invoke: async (channel, ...args) => {
        const handler = CHANNELS[channel];
        // Apps installed before saved accounts existed have no bridge.
        if (!handler || !window.OpenLiteCredentials) return channel === "get-saved-usernames" ? [] : undefined;
        return handler(...args);
      },
      send: () => {}
    },
    process: { platform: "android" }
  };
}
