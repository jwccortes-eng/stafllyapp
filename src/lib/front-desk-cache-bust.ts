/**
 * Front Desk cache-busting.
 *
 * Why this exists:
 *   The kiosk runs on a tablet that stays open for hours/days at the same
 *   URL. After a deploy, the Lovable hosting layer serves a fresh HTML with
 *   a new <script src="/assets/index-XXXX.js"> hash, but if the tablet has
 *   the old bundle cached (browser cache + service worker), it keeps
 *   rendering the old UI (e.g. the "Front Desk interno" intermediate screen)
 *   even after Publish → Update.
 *
 * Strategy:
 *   1. On mount of /front-desk, fetch the current /front-desk HTML with
 *      `cache: "no-store"` so we bypass every layer of cache.
 *   2. Extract the hashed bundle URL from the served HTML.
 *   3. Compare it to the bundle URL the running app was loaded from
 *      (`document.currentScript`-style lookup via <script src> in the live
 *      DOM). If they differ → the tablet is on an old build.
 *   4. Wipe CacheStorage, unregister all service workers, then hard-reload
 *      with a cache-buster query param. A sessionStorage guard prevents
 *      reload loops.
 */

const RELOAD_GUARD_KEY = "fd-cache-bust-reload-at";
const RELOAD_COOLDOWN_MS = 30_000;

function getLoadedBundleHref(): string | null {
  if (typeof document === "undefined") return null;
  // Vite emits exactly one entry script in /assets/index-*.js
  const scripts = Array.from(document.querySelectorAll<HTMLScriptElement>("script[src]"));
  const entry = scripts
    .map((s) => s.getAttribute("src") || "")
    .find((src) => /\/assets\/index-[\w-]+\.js/.test(src));
  return entry || null;
}

function extractBundleFromHtml(html: string): string | null {
  const match = html.match(/\/assets\/index-[\w-]+\.js/);
  return match ? match[0] : null;
}

async function clearAllCaches(): Promise<void> {
  try {
    if (typeof caches !== "undefined") {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k).catch(() => false)));
    }
  } catch {
    /* ignore */
  }
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister().catch(() => false)));
    }
  } catch {
    /* ignore */
  }
}

function hardReloadWithBuster(): void {
  const url = new URL(window.location.href);
  url.searchParams.set("v", Date.now().toString(36));
  window.location.replace(url.toString());
}

function inSafeEnvironment(): boolean {
  if (typeof window === "undefined") return false;
  // Skip in dev — Vite serves fresh modules every reload.
  // We rely on the bundled flag: the production HTML always contains
  // /assets/index-XXXX.js, while dev has /src/main.tsx.
  const loaded = getLoadedBundleHref();
  if (!loaded) return false;
  // Skip inside iframes / preview hosts — main.tsx already nukes the SW
  // there and reloading would fight the parent shell.
  let inIframe = false;
  try {
    inIframe = window.self !== window.top;
  } catch {
    inIframe = true;
  }
  if (inIframe) return false;
  const host = window.location.hostname || "";
  if (
    host.includes("id-preview--") ||
    host.includes("lovableproject.com") ||
    host.endsWith(".lovable.app")
  ) {
    // Allow on staflyapp.lovable.app published host? It's the real published
    // surface, so yes — only reject the preview / project subdomain.
    if (host.includes("id-preview--") || host.includes("lovableproject.com")) {
      return false;
    }
  }
  return true;
}

/**
 * Run the freshness check. Call once on /front-desk mount.
 * Resolves silently — never throws into the React tree.
 */
export async function ensureFrontDeskBundleFresh(): Promise<void> {
  if (!inSafeEnvironment()) return;

  // Anti-loop guard.
  const last = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) || 0);
  if (Date.now() - last < RELOAD_COOLDOWN_MS) return;

  const loaded = getLoadedBundleHref();
  if (!loaded) return;

  let html: string;
  try {
    const res = await fetch("/front-desk", {
      cache: "no-store",
      headers: { "cache-control": "no-cache", pragma: "no-cache" },
      credentials: "same-origin",
    });
    if (!res.ok) return;
    html = await res.text();
  } catch {
    return; // offline / network error — never break the kiosk
  }

  const fresh = extractBundleFromHtml(html);
  if (!fresh) return;
  if (fresh === loaded) return; // already on the latest bundle

  // Stale build detected — wipe & reload once.
  console.warn("[front-desk:cache-bust] stale bundle detected", { loaded, fresh });
  sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()));
  await clearAllCaches();
  hardReloadWithBuster();
}