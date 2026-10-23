// The game draws people (players and human NPCs such as bankers and shop
// keepers) by having a web worker paint each one's spritesheet on an
// offscreen canvas, one at a time: SpritesheetManager.draw sends the next
// queued request only once the last one has come back
// (_isAwaitingWorkerResult). On Android the worker or the canvas can stop
// answering after the app has been in the background, and then nobody new
// is ever drawn (nor clickable, as an entity gets its mesh with its sprite)
// until the app restarts. This notices a request that hasn't come back,
// starts a fresh worker and canvas, and sends the request again.
const CHECK_INTERVAL_MS = 1000;
// A spritesheet normally takes well under a second.
const STUCK_AFTER_MS = 6000;

// Game classes by their minified names, which change between client
// versions: found in the client source by what they contain, then checked.
const CLASS_PATTERNS = {
  spritesheets: /class (\w+) \{\s*static get Instance\(\) \{[^}]*\}\s*get ItemSpritesheetInfo\(\)/,
  workers: /class (\w+) \{\s*static get HumanSpriteWorkerObjectURL\(\)/,
  humanSprites: /class (\w+) \{\s*static get OnInitializationCompletedEventListener\(\)/
};

let names = null;

export function findSpriteClassNames(source) {
  names = {};
  for (const [key, pattern] of Object.entries(CLASS_PATTERNS)) names[key] = pattern.exec(source)?.[1] ?? null;
}

// The class named `name` in whichever game module scope has one with
// `member` (short names repeat across modules).
function gameClass(name, member) {
  if (!name) return null;
  for (const scope of window.highliteScopes ?? []) {
    try {
      const found = scope(name);
      if (typeof found === "function" && member in found) return found;
    } catch {}
  }
  return null;
}

function classes() {
  if (!names) return null;
  const spritesheets = gameClass(names.spritesheets, "Instance");
  const workers = gameClass(names.workers, "HumanSpriteWorker");
  const humanSprites = gameClass(names.humanSprites, "OnHumanSpritesheetCreatedEventListener");
  return spritesheets && workers && humanSprites ? { spritesheets, workers, humanSprites } : null;
}

// For the session log: whether the people-sprite queue is moving.
export function spriteQueueSummary() {
  const manager = classes()?.spritesheets.Instance;
  if (!manager) return "sprites ?";
  return `sprites ${manager._isAwaitingWorkerResult ? "waiting" : "idle"}, ${manager._humanSpriteWorkerRequestQueue?.length ?? "?"} queued`;
}

export function installSpriteWatchdog(note) {
  const found = classes();
  if (!found) {
    note(`sprite watchdog off (classes not found: ${JSON.stringify(names)})`);
    return;
  }
  const { spritesheets, workers, humanSprites } = found;
  const manager = spritesheets.Instance;

  // The request in flight, to send again after a restart.
  let lastRequest = null;
  const post = manager._postCreateSpritesheetRequestToWorker;
  manager._postCreateSpritesheetRequestToWorker = function (request) {
    lastRequest = request;
    return post.call(this, request);
  };

  let waitingSince = null;
  let restarting = false;
  setInterval(async () => {
    if (!manager._isAwaitingWorkerResult || document.visibilityState !== "visible") {
      waitingSince = null;
      return;
    }
    waitingSince ??= Date.now();
    if (restarting || Date.now() - waitingSince < STUCK_AFTER_MS) return;
    restarting = true;
    try {
      note(`people sprites stuck (${manager._humanSpriteWorkerRequestQueue.length} queued), restarting`);
      workers._humanSpriteWorker.terminate();
      workers._humanSpriteWorker = new Worker(workers._humanSpriteWorkerURL);
      humanSprites._isCanvasBlobReady = false;
      humanSprites._pendingSpritesheetCreatedArgs = null;
      humanSprites._didInitialize = false;
      await humanSprites.initialize();
      if (lastRequest) manager._humanSpriteWorkerRequestQueue.unshift(lastRequest);
      manager._isAwaitingWorkerResult = false;
    } catch (error) {
      note(`sprite restart failed: ${error.message}`);
    } finally {
      waitingSince = null;
      restarting = false;
    }
  }, CHECK_INTERVAL_MS);
}
