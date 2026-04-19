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

createRoot(document.getElementById("root")!).render(<App />);

// Production-only: register the service worker AFTER mount so the initial
// render is never blocked, and the user gets a "new version available" toast
// when an updated bundle is deployed (fixes Aline / iPhone stale-cache, Apr 2026).
registerPwa();
