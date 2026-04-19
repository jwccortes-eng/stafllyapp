import { useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import {
  APP_VERSION,
  APP_BUILD_TIME,
  clearPwaCachesAndUnregister,
} from "@/lib/pwa-runtime";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface BuildVersionBadgeProps {
  className?: string;
}

/**
 * Tappable build/version badge used in the worker portal footer.
 *
 * Two roles:
 *   1. Visible build marker — support can ask "what does the bottom say?"
 *      to know exactly which bundle a user is running.
 *   2. Hidden recovery action — tapping opens "Actualizar app" which wipes
 *      the service worker + CacheStorage and hard-reloads. Designed for the
 *      "Aline iPhone / Safari stale bundle" pattern (Apr 2026): we can guide
 *      a worker over WhatsApp without asking them to touch Safari settings.
 *
 * Scope: worker portal only. Zero impact on other users / backend.
 * The Supabase auth session lives in localStorage under `sb-*-auth-token`
 * and we deliberately preserve it so the worker stays logged in.
 */
export function BuildVersionBadge({ className }: BuildVersionBadgeProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const date = APP_BUILD_TIME ? APP_BUILD_TIME.slice(0, 10) : "";

  async function handleForceUpdate() {
    setBusy(true);
    try {
      // 1) Unregister SW + wipe CacheStorage entries.
      await clearPwaCachesAndUnregister();

      // 2) Wipe sessionStorage (it's safe — never holds the auth session).
      try {
        sessionStorage.clear();
      } catch {
        // ignore
      }

      // 3) Hard reload with a cache-busting param so Safari refetches index.html
      //    from the network instead of disk cache. Preserves the current path.
      const url = new URL(window.location.href);
      url.searchParams.set("_v", String(Date.now()));
      window.location.replace(url.toString());
    } catch {
      // Last resort
      window.location.reload();
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <button
          type="button"
          className={cn(
            "text-[10px] text-muted-foreground/70 font-mono tracking-tight select-none",
            "hover:text-foreground active:scale-95 transition-all px-2 py-1 rounded-md",
            className,
          )}
          title={APP_BUILD_TIME || undefined}
        >
          v{APP_VERSION}
          {date && ` · ${date}`}
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent className="max-w-sm">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4 text-primary" />
            Actualizar app
          </AlertDialogTitle>
          <AlertDialogDescription>
            Esto limpia la caché y recarga la app con la última versión.
            Tu sesión se mantiene. Úsalo si ves información antigua o
            falta una pantalla nueva.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              handleForceUpdate();
            }}
            disabled={busy}
          >
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Actualizando…
              </>
            ) : (
              "Actualizar"
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
