// Touch stand-ins for OpenLite's keyboard controls. The game has its own
// phone controls; these cover our plugins: "Tag" stands in for holding Alt
// (Object Markers' Tag/Untag menu entries).
export function installTouchControls() {
  const bar = document.createElement("div");
  bar.id = "openlite-touch-buttons";
  const tag = document.createElement("button");
  tag.textContent = "Tag";
  tag.title = "Long-press an object while on to tag or untag it";
  tag.addEventListener("click", () => {
    window.openliteTagMode = !window.openliteTagMode;
    tag.classList.toggle("active", window.openliteTagMode);
  });
  bar.appendChild(tag);
  document.body.appendChild(bar);
}

// World taps the OSRS mobile way: a tap does the default action (walk,
// chop, talk...), pressing and holding opens the menu, and dragging turns
// the camera. The game's own phone mode opens the menu on every tap; its
// screen mask handlers call these first (main.js withTouchHooks), and a
// true return skips the game's own handling.
const LONG_PRESS_MS = 450;
// The game's own test for its phone mode (MobileHelper).
const PHONE_MODE = "(height < 48rem) and (orientation: landscape), (width < 48rem) and (orientation: portrait)";

export function installTapActions() {
  let press = null;
  const phoneMode = () => window.matchMedia(PHONE_MODE).matches;
  // The game may reuse its pointer event objects.
  const snapshot = (pointer) => Object.assign(Object.create(Object.getPrototypeOf(pointer)), pointer);

  window.openliteTouch = {
    down(screenMask, pointer) {
      if (pointer.Button !== 0 || !phoneMode()) return false;
      clearTimeout(press?.timer);
      const at = snapshot(pointer);
      press = { menuShown: false };
      press.timer = setTimeout(() => {
        if (!press || screenMask._isHoldingAndMoving || screenMask._screenMask?.getIsPinching?.()) return;
        press.menuShown = true;
        screenMask._stopRotatingCameraWithPointer();
        screenMask._showGameWorldContextMenu(at);
      }, LONG_PRESS_MS);
      // The game still starts its camera drag.
      return false;
    },
    up(screenMask, pointer) {
      if (pointer.Button !== 0 || !press) return false;
      const { menuShown, timer } = press;
      clearTimeout(timer);
      press = null;
      if (menuShown) {
        pointer.StopPropagation = true;
        return true;
      }
      if (screenMask._isHoldingAndMoving || !screenMask._clickStartScreenPoint) return false;
      screenMask._stopRotatingCameraWithPointer();
      screenMask._handleGameWorldAction(pointer);
      pointer.StopPropagation = true;
      return true;
    }
  };
}
