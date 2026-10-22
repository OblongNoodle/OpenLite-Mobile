// OpenLite Mobile's page. The Android app serves it at
// https://openspell.dev/__openlite/index.html (see MainActivity), so it runs
// with OpenSpell's own origin: it loads the game the way the PC client's
// client.ts does, then starts the plugins.
import "./polyfills.js";
import { Highlite, Reflector } from "@ryelite/core";
import "@iconify/iconify";
import indexCss from "./css/index.css?inline";
import overridesCss from "./css/overrides.css?inline";
import tooltipCss from "./css/item-tooltip.css?inline";
import mobileCss from "./css/mobile.css?inline";
import { ensureOsrsCache, installOsrsCache } from "./osrsCache.js";
import { installCredentials } from "./credentials.js";
import { createUserHelper } from "./helpers/userHelper.js";
import { installTouchControls, installTapActions } from "./touch.js";

// Requests the page can't make itself (other origins without CORS) go
// through the app (MainActivity.proxy).
const proxied = (url) => `/__openlite/proxy?url=${encodeURIComponent(url)}`;

function status(text) {
  let element = document.getElementById("openlite-status");
  if (!element) {
    element = document.createElement("div");
    element.id = "openlite-status";
    document.body.appendChild(element);
  }
  element.textContent = text;
  element.style.display = text ? "" : "none";
}

// Hook handlers put into the game's modules (as client.ts does): each strict
// module gets a scope-capturing probe, and document.client.get/set search
// every scope.
const HOOK_CODE = `window.highliteScopes = window.highliteScopes || [];
window.highliteScopes.push(function (a) { return eval(a); });
if (!document.client) {
  document.client = {};
  document.client.get = function (a) {
    for (let i = 0; i < window.highliteScopes.length; i++) {
      try { let res = window.highliteScopes[i](a); if (res !== undefined) return res; } catch (e) {}
    }
  };
  document.client.set = function (a, b) {
    for (let i = 0; i < window.highliteScopes.length; i++) {
      try { window.highliteScopes[i](a + " = " + b); return; } catch (e) {}
    }
  };
}`;

async function obtainGameClient() {
  const assets = await fetch(proxied("https://api.openspell.dev/assetsClient")).then((r) => r.json());
  const version = assets.data.latestClientVersion;
  status(`Downloading game client v${version}...`);
  const source = await fetch(proxied(`https://cdn.openspell.dev/js/client/client.${version}.js`)).then((r) => r.text());
  await Reflector.loadHooksFromSource(source);
  return withHooks(withTouchHooks(source));
}

// Lets touch.js decide what a world tap does (tap: default action,
// press and hold: the menu). The game binds these handlers when it starts,
// so they can't be patched afterwards.
function withTouchHooks(source) {
  let hooked = 0;
  source = source.replace(/_handleScreenMaskPointerDown\((\w+),\s*(\w+)\)\s*\{/, (match, _event, pointer) => (hooked++, `${match}if(window.openliteTouch?.down(this,${pointer}))return;`));
  source = source.replace(/_handleScreenMaskPointerUp\((\w+),\s*(\w+)\)\s*\{/, (match, _event, pointer) => (hooked++, `${match}if(window.openliteTouch?.up(this,${pointer}))return;`));
  if (hooked !== 2) console.warn("[OpenLite] Touch hooks not found in the game client; taps open the menu");
  return source;
}

function withHooks(source) {
  return source.includes('"use strict";') ? source.replace(/"use strict";/g, '"use strict";' + HOOK_CODE) : source.replace(/\{/, "{" + HOOK_CODE);
}

// The game page for World 1, from OpenSpell's play form (as client.ts).
async function loadGamePage() {
  status("Connecting to OpenSpell...");
  const play = new DOMParser().parseFromString(await (await fetch("/play", { credentials: "include" })).text(), "text/html");
  const csrf = play.querySelector('input[name="_csrf"]')?.getAttribute("value");
  const form = new URLSearchParams();
  if (csrf) form.append("_csrf", csrf);
  form.append("submit", "World+1");
  form.append("serverid", "1");
  form.append("serverurl", "https://server1.openspell.dev");
  const response = await fetch("/game", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
    credentials: "include"
  });
  const page = new DOMParser().parseFromString(await response.text(), "text/html");
  page.querySelector('script[src*="/js/client/client"]')?.remove();
  for (const part of [page.head, page.body]) {
    for (const child of part.children) {
      if (child.tagName === "SCRIPT") continue;
      const href = child.getAttribute("href");
      if (href?.startsWith("/")) child.setAttribute("href", "https://openspell.dev" + href);
      (part === page.head ? document.head : document.body).appendChild(child.cloneNode(true));
    }
  }
  for (const script of page.querySelectorAll("script")) {
    const copy = document.createElement("script");
    for (const attribute of script.attributes) copy.setAttribute(attribute.name, attribute.value);
    copy.textContent = script.textContent;
    (script.parentNode === page.head ? document.head : document.body).appendChild(copy);
  }
}

function addStyles() {
  for (const css of [indexCss, overridesCss, tooltipCss, mobileCss]) {
    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);
  }
}

async function main() {
  addStyles();
  installOsrsCache();
  installCredentials();
  installTapActions();
  await ensureOsrsCache(status);
  await loadGamePage();
  const client = await obtainGameClient();
  status("Starting...");
  const script = document.createElement("script");
  script.id = "highspellClientScript";
  script.textContent = client;
  document.body.append(script);
  createUserHelper();

  const highlite = new Highlite();
  const modules = import.meta.glob("./plugins/*.js", { eager: true });
  for (const [path, module] of Object.entries(modules)) {
    try {
      if (module.default) highlite.pluginManager.registerPlugin(module.default);
    } catch (error) {
      console.error(`[OpenLite] Failed to load plugin ${path}`, error);
    }
  }
  await highlite.start();
  installTouchControls();
  status("");
  document.dispatchEvent(new Event("DOMContentLoaded", { bubbles: true, cancelable: true }));
}

// An update (see the app's Updater) that won't start can be dropped for the
// version built into the app.
async function offerBuiltIn() {
  const version = await fetch("/__openlite/version").then((r) => r.text()).catch(() => "built-in");
  if (version === "built-in") return;
  const button = document.createElement("button");
  button.id = "openlite-use-builtin";
  button.textContent = `Update ${version} won't start: use the built-in version`;
  button.addEventListener("click", async () => {
    await fetch("/__openlite/use-builtin");
    location.reload();
  });
  document.body.appendChild(button);
}

main().catch((error) => {
  console.error("[OpenLite] Startup failed", error);
  status(`Startup failed: ${error?.message ?? error}`);
  offerBuiltIn();
});
