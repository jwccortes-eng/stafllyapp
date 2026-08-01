import { getAppEnv, isNonProdEnv } from "@/lib/env-banner";
import { AlertTriangle } from "lucide-react";

/**
 * Persistent, non-blocking environment badge.
 *
 * Renders ONLY when the build is staging/demo (see `src/lib/env-banner.ts`).
 * In production this component returns null — no badge, no copy, nothing.
 *
 * OX-9.2: se ancla arriba (bajo el notch) y nunca sobre la navegación
 * inferior móvil. No intercepta CTAs y usa tokens semánticos de aviso.
 * Data source is build-time env vars only — it never touches the DB.
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
                 top-[calc(env(safe-area-inset-top)+0.375rem)] select-none"
    >
      <div
        className="flex items-center gap-1.5
                   rounded-full border border-warning/40 bg-warning/95
                   px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-wider
                   text-warning-foreground shadow-lg backdrop-blur"
      >
        <AlertTriangle className="h-3 w-3" />
        <span>{label}</span>
        <span className="hidden sm:inline text-[9.5px] font-medium normal-case tracking-normal opacity-80">
          · Datos de prueba. No es información real.
        </span>
      </div>
    </div>
  );
}

    </div>
  );
}
