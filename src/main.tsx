import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { registerPwa } from "./lib/pwa-runtime";

/**
 * Cross-browser SW hygiene.
 *
 * 1) In Lovable preview iframes / *.lovable.app preview hosts, unregister any
 *    leftover service worker so a stale cached bundle from a previous deploy
 *    can never serve broken JS to Safari/Firefox/etc.
 *
 * 2) Also clear the CacheStorage entries the previous SW may have written.
 *
 * This runs before render so a corrupted SW can't intercept the first nav.
 */
(function cleanupStaleServiceWorker() {
  if (typeof window === "undefined") return;

  let inIframe = false;
  try {
    inIframe = window.self !== window.top;
  } catch {
    inIframe = true; // cross-origin block → treat as iframe
  }

  const host = window.location.hostname || "";
  const isPreviewHost =
    host.includes("id-preview--") ||
    host.includes("lovableproject.com") ||
    host.endsWith(".lovable.app");

  if (!inIframe && !isPreviewHost) return;

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker
      .getRegistrations()
      .then((regs) => regs.forEach((r) => r.unregister().catch(() => {})))
      .catch(() => {});
  }
  if (typeof caches !== "undefined") {
    caches
      .keys()
      .then((keys) => keys.forEach((k) => caches.delete(k).catch(() => {})))
      .catch(() => {});
  }
})();

/**
 * Recover from stale dynamic-import chunks after a deploy.
 *
 * Vite emits `vite:preloadError` when a lazy() chunk 404s because the user is
 * still on an old HTML/manifest after a rebuild. Default behavior throws an
 * uncaught error and crashes the route. We swallow it and force a single
 * full reload so the new manifest is fetched.
 *
 * Guarded by sessionStorage so a genuinely broken module can't infinite-loop.
 */
if (typeof window !== "undefined") {
  window.addEventListener("vite:preloadError", (event) => {
    event.preventDefault();
    const RELOAD_KEY = "vite-preload-reload-at";
    const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
    const now = Date.now();
    if (now - last < 10_000) {
      // Already reloaded once recently — don't loop. Surface the error.
      console.error("[vite:preloadError] reload already attempted, giving up", event);
      return;
    }
    sessionStorage.setItem(RELOAD_KEY, String(now));
    console.warn("[vite:preloadError] stale chunk detected, reloading", event);
    window.location.reload();
  });
}

createRoot(document.getElementById("root")!).render(<App />);

// Production-only: register the service worker AFTER mount so the initial
// render is never blocked, and the user gets a "new version available" toast
// when an updated bundle is deployed (fixes Aline / iPhone stale-cache, Apr 2026).
registerPwa();
