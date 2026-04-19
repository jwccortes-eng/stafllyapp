/**
 * PWA runtime: service worker registration with explicit update flow,
 * version exposure, and cache cleanup on auth boundaries.
 *
 * Why this exists (Apr 2026):
 *   Aline (and other workers on iPhone/Safari) saw a stale frontend bundle:
 *   the desktop showed the new "Available" tab on /portal/shifts with shift
 *   #0192 claimable, but the iPhone kept rendering the previous build with
 *   no Available tab. Root cause: a previously-deployed service worker was
 *   serving cached HTML/JS, and we had no UX to tell users a new version
 *   was available, no version marker to debug it, and no cleanup of caches
 *   at logout / context switch.
 *
 * Strategy:
 *   - Production-only registration (never in iframes, never on preview hosts).
 *   - autoUpdate + skipWaiting + clientsClaim → new SW takes over ASAP.
 *   - Periodic update poll every 60s + on visibilitychange (foreground).
 *   - Surface a "Nueva versión disponible · Recargar" toast to the user.
 *   - clearPwaCachesAndUnregister() called on signOut.
 */
import { toast } from "sonner";

declare global {
  // Injected by Vite `define` in vite.config.ts.
  // eslint-disable-next-line no-var
  var __APP_VERSION__: string | undefined;
  // eslint-disable-next-line no-var
  var __APP_BUILD_TIME__: string | undefined;
}

export const APP_VERSION =
  typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "dev";
export const APP_BUILD_TIME =
  typeof __APP_BUILD_TIME__ === "string" ? __APP_BUILD_TIME__ : "";

function isPreviewOrIframe(): boolean {
  if (typeof window === "undefined") return true;
  let inIframe = false;
  try {
    inIframe = window.self !== window.top;
  } catch {
    inIframe = true;
  }
  const host = window.location.hostname || "";
  const isPreviewHost =
    host.includes("id-preview--") ||
    host.includes("lovableproject.com") ||
    host.endsWith(".lovable.app");
  return inIframe || isPreviewHost;
}

/**
 * Register the service worker (production only).
 * Call once from main.tsx after the React tree mounts.
 */
export async function registerPwa(): Promise<void> {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;
  if (import.meta.env.DEV) return;
  if (isPreviewOrIframe()) return;

  try {
    const { registerSW } = await import("virtual:pwa-register");
    const updateSW = registerSW({
      immediate: true,
      onNeedRefresh() {
        // A new SW is waiting. Notify the user; one tap reloads with new code.
        toast("Nueva versión disponible", {
          description: "Recarga para aplicar las últimas mejoras.",
          duration: Infinity,
          action: {
            label: "Recargar",
            onClick: () => {
              updateSW(true).catch(() => window.location.reload());
            },
          },
        });
      },
      onOfflineReady() {
        // Silent — workers don't need this noise.
      },
      onRegisteredSW(_swUrl, registration) {
        if (!registration) return;
        // Foreground updates: check when the tab becomes visible.
        const checkForUpdate = () => {
          registration.update().catch(() => {});
        };
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") checkForUpdate();
        });
        // And every 60s while the tab stays open.
        setInterval(checkForUpdate, 60_000);
      },
    });
  } catch (err) {
    // Module may not exist in dev or if PWA build is disabled — safe to ignore.
    console.warn("[pwa] registerSW unavailable:", err);
  }
}

/**
 * Wipe every CacheStorage entry and unregister all service workers.
 * Called on signOut so a returning user on the same device never inherits
 * cached responses from a previous identity / build.
 */
export async function clearPwaCachesAndUnregister(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    if (typeof caches !== "undefined") {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k).catch(() => false)));
    }
  } catch {
    // ignore
  }
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister().catch(() => false)));
    }
  } catch {
    // ignore
  }
}
