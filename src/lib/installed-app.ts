/**
 * Detects whether the app is running inside an installed shell
 * (Capacitor native build OR installed PWA / standalone display mode).
 *
 * Presentation-only helper — used to swap the public marketing landing
 * for an operational mobile entry screen. Does NOT touch auth, routing
 * guards, RLS, or any business logic.
 */
export function isInstalledAppShell(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const cap = (window as any).Capacitor;
    if (cap && typeof cap.isNativePlatform === "function" && cap.isNativePlatform()) {
      return true;
    }
    if (cap?.isNative === true) return true;

    if (window.matchMedia?.("(display-mode: standalone)")?.matches) return true;
    if ((window.navigator as any).standalone === true) return true;
  } catch {
    /* noop */
  }
  return false;
}
