import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import App from "./App.tsx";
import "./index.css";
import { registerPwa, APP_VERSION, APP_BUILD_TIME } from "./lib/pwa-runtime";
import { installCtx001Forensics, documentInstanceId, appInstanceId } from "./lib/ctx001-forensics";

installCtx001Forensics();

/**
 * Build stamp — visible in EVERY browser, every host (preview, prod, incognito).
 * Lets us confirm whether a given device is on the latest deploy or stuck on a
 * stale cached bundle. If two browsers show different ids, the older one is on
 * a stale SW cache (see vite.config.ts PWA config).
 */
export const APP_BUILD_ID = "tenant-hotfix-2026-05-01-v2";
if (typeof window !== "undefined") {
  // eslint-disable-next-line no-console
  console.info("[stafly-build]", {
    buildId: APP_BUILD_ID,
    version: APP_VERSION,
    buildTime: APP_BUILD_TIME,
    appHost: window.location.host,
    supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
    mode: import.meta.env.MODE,
  });
}

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

  window.onerror = (message, source, lineno, colno, error) => {
    console.error("[window.onerror]", {
      message,
      source,
      lineno,
      colno,
      stack: error instanceof Error ? error.stack : undefined,
    });
    return false;
  };

  window.onunhandledrejection = (event) => {
    const reason = event.reason;
    console.error("[window.onunhandledrejection]", {
      reason,
      message: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
    });
  };
}

createRoot(document.getElementById("root")!).render(
  <HelmetProvider>
    <App />
  </HelmetProvider>
);

// Production-only: register the service worker AFTER mount so the initial
// render is never blocked, and the user gets a "new version available" toast
// when an updated bundle is deployed (fixes Aline / iPhone stale-cache, Apr 2026).
registerPwa();
