// Why game sessions end, kept on the device and shown on the login screen
// (the player can't open developer tools on a tablet). Each session records
// when it started and ended, why (the game's own disconnect reason: "ping
// timeout" when the app was paused or the network stalled, "transport close"
// when the connection was closed, "io server disconnect" when the server
// ended it), and when the app was hidden meanwhile. A session still open
// when the page starts again ended with the app closed or restarted (killed
// for memory, crashed, or reopened for an update).
const LOG_KEY = "openlite-session-log";
const OPEN_KEY = "openlite-session-open";
const KEPT = 12;
const SHOWN = 4;

function read(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

const clock = (ms) => new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

function record(session, reason) {
  const log = read(LOG_KEY, []);
  log.unshift({ ...session, end: session.lastSeen ?? Date.now(), reason });
  write(LOG_KEY, log.slice(0, KEPT));
}

export function installSessionLog() {
  const unfinished = read(OPEN_KEY, null);
  if (unfinished) record(unfinished, "the app closed or restarted while logged in");
  write(OPEN_KEY, null);

  let session = null;
  const end = (reason) => {
    if (!session) return;
    session.lastSeen = Date.now();
    record(session, reason);
    session = null;
    write(OPEN_KEY, null);
  };

  // The game and the plugin core report disconnects and logouts in the
  // console; this listens there.
  for (const level of ["log", "info", "warn"]) {
    const original = console[level].bind(console);
    console[level] = (...args) => {
      try {
        const text = args.map((arg) => (typeof arg === "string" ? arg : "")).join(" ");
        const disconnect = /SocketManager - disconnect\. STATE: \w+\. Reason: (.+)/.exec(text);
        if (disconnect) end(`connection lost: ${disconnect[1]}`);
        else if (/Stopping all plugins due to: SocketManager_handleLoggedOut/.test(text)) end("logged out by the server");
      } catch {}
      return original(...args);
    };
  }

  document.addEventListener("visibilitychange", () => {
    session?.events.push(`${document.visibilityState} ${clock(Date.now())}`);
  });

  setInterval(() => {
    const player = document.highlite?.gameHooks?.EntityManager?.Instance?.MainPlayer;
    if (player && !session) session = { start: Date.now(), events: [] };
    else if (!player && session) end("left the game (no reason given)");
    if (session) {
      session.lastSeen = Date.now();
      write(OPEN_KEY, session);
    }
    showOnLoginScreen();
  }, 1000);
}

// Which web bundle is running (see the app's Updater), shown with the log so
// the player can tell an update has taken.
let version = "";
fetch("/__openlite/version").then((r) => r.text()).then((text) => (version = text)).catch(() => {});

// The last few sessions, under the login form.
function showOnLoginScreen() {
  const onLoginScreen = !!document.querySelector("#login-menu-username, #login-menu-password");
  let panel = document.getElementById("openlite-session-log");
  if (!onLoginScreen) {
    panel?.remove();
    return;
  }
  const log = read(LOG_KEY, []);
  if (!panel) {
    panel = document.createElement("div");
    panel.id = "openlite-session-log";
    document.body.appendChild(panel);
  }
  const lines = log.slice(0, SHOWN).map((entry) => {
    const minutes = Math.round((entry.end - entry.start) / 60000);
    const events = entry.events?.length ? ` [${entry.events.slice(-4).join(", ")}]` : "";
    return `${clock(entry.start)}-${clock(entry.end)} (${minutes} min): ${entry.reason}${events}`;
  });
  const text = `OpenLite ${version || "?"}\nRecent sessions:${lines.length ? "\n" + lines.join("\n") : " none yet"}`;
  if (panel.textContent !== text) panel.textContent = text;
}
