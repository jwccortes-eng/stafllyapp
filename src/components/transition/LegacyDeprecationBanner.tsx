/**
 * LegacyDeprecationBanner — discreet transition notice for legacy routes
 * being phased out in favor of new canonical hubs (People OS / Operations OS / Growth & Revenue OS).
 *
 * Shown at the top of legacy pages while they coexist with their replacement.
 * Non-blocking; users can dismiss per-session via the close button.
 */
import { Link } from "react-router-dom";
import { useState } from "react";
import { ArrowRight, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface LegacyDeprecationBannerProps {
  /** Where the user should go instead. */
  replacementHref: string;
  /** Human label for the replacement (e.g. "Worker Hub", "Kiosk Hub"). */
  replacementLabel: string;
  /** Optional descriptive text. Falls back to a sensible default. */
  description?: string;
  /** Storage key used to remember dismissal in this session. */
  storageKey?: string;
  /** Visual variant — defaults to subtle "info" tone. */
  tone?: "info" | "warning";
}

export function LegacyDeprecationBanner({
  replacementHref,
  replacementLabel,
  description,
  storageKey,
  tone = "info",
}: LegacyDeprecationBannerProps) {
  const key = storageKey ?? `legacy-banner:${replacementHref}`;
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    return sessionStorage.getItem(key) === "1";
  });

  if (dismissed) return null;

  const handleDismiss = () => {
    try {
      sessionStorage.setItem(key, "1");
    } catch {
      /* ignore */
    }
    setDismissed(true);
  };

  return (
    <div
      className={cn(
        "mb-4 rounded-xl border px-4 py-3 flex items-start gap-3",
        "transition-colors",
        tone === "info" &&
          "border-primary/20 bg-primary/5 text-foreground",
        tone === "warning" &&
          "border-warning/30 bg-warning/5 text-foreground",
      )}
      role="status"
    >
      <div
        className={cn(
          "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
          tone === "info" && "bg-primary/10 text-primary",
          tone === "warning" && "bg-warning/15 text-warning",
        )}
      >
        <Sparkles className="h-4 w-4" />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium leading-tight">
          Esta vista será reemplazada por{" "}
          <span className="font-semibold">{replacementLabel}</span>.
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {description ??
            "La nueva experiencia consolida la información y mejora la operación. Esta vista permanece disponible durante la transición."}
        </p>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <Button
          asChild
          size="sm"
          variant="default"
          className="h-8 gap-1.5 text-xs"
        >
          <Link to={replacementHref}>
            Abrir {replacementLabel}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          onClick={handleDismiss}
          aria-label="Ocultar notificación"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
