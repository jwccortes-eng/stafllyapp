import { getAppEnv, isNonProdEnv } from "@/lib/env-banner";
import { AlertTriangle } from "lucide-react";

/**
 * Persistent, non-blocking environment badge.
 *
 * Renders ONLY when the build is staging/demo (see `src/lib/env-banner.ts`).
 * In production this component returns null — no badge, no copy, nothing.
 *
 * Positioned bottom-center so it never covers top nav, right-side action
 * buttons or the mobile bottom tab bar. Fully non-interactive
 * (`pointer-events-none`) so it can't intercept CTA clicks. Data source is
 * build-time env vars only — it never touches the DB.
 */
export function EnvBadge() {
  if (!isNonProdEnv()) return null;

  const env = getAppEnv();
  const label = env === "demo" ? "DEMO" : "STAGING";

  return (
    <div
      role="status"
      aria-label={`Entorno ${label}. Datos de prueba, no reales.`}
      className="fixed left-1/2 -translate-x-1/2 z-[100] pointer-events-none
                 bottom-3 sm:bottom-4 select-none"
    >
      <div
        className="pointer-events-auto flex items-center gap-1.5
                   rounded-full border border-amber-500/40 bg-amber-500/95
                   px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-wider
                   text-black shadow-lg shadow-amber-900/20 backdrop-blur"
      >
        <AlertTriangle className="h-3 w-3" />
        <span>STAGING / {label === "STAGING" ? "DEMO" : "DEMO"}</span>
        <span className="hidden sm:inline text-[9.5px] font-medium normal-case tracking-normal opacity-80">
          · Datos de prueba. No es información real.
        </span>
      </div>
    </div>
  );
}
