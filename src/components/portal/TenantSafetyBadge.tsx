import { AlertTriangle, FlaskConical, ShieldCheck } from "lucide-react";
import type { TenantSafetyFlags } from "@/lib/qa-mode";
import { cn } from "@/lib/utils";

interface TenantSafetyBadgeProps {
  flags: TenantSafetyFlags;
  companyName?: string | null;
  qaMode?: boolean;
  className?: string;
}

/**
 * Always-on badge that tells the worker which tenant they are clocking into.
 * - DEMO TENANT (amber) when company.is_demo
 * - TEST TENANT (sky) when company.is_test
 * - TENANT REAL (slate) otherwise
 * Plus a small QA-mode pill when the session is flagged as QA.
 */
export function TenantSafetyBadge({
  flags,
  companyName,
  qaMode,
  className,
}: TenantSafetyBadgeProps) {
  const { isDemo, isTest, isReal } = flags;

  const tone = isDemo
    ? "bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-300"
    : isTest
      ? "bg-sky-500/10 text-sky-700 border-sky-500/30 dark:text-sky-300"
      : "bg-muted text-foreground/80 border-border";

  const Icon = isDemo ? FlaskConical : isTest ? FlaskConical : ShieldCheck;
  const label = isDemo
    ? "DEMO TENANT"
    : isTest
      ? "TEST TENANT"
      : "TENANT REAL";

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10.5px] font-semibold tracking-wide uppercase",
          tone,
        )}
        title={companyName ?? undefined}
        aria-label={`Tenant: ${label}${companyName ? ` — ${companyName}` : ""}`}
      >
        <Icon className="h-3 w-3" />
        {label}
        {companyName ? (
          <span className="hidden sm:inline text-foreground/60 font-normal normal-case tracking-normal">
            · {companyName}
          </span>
        ) : null}
      </span>

      {qaMode ? (
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide",
            "bg-purple-500/10 text-purple-700 border-purple-500/30 dark:text-purple-300",
          )}
        >
          QA mode
        </span>
      ) : null}

      {qaMode && isReal ? (
        <span className="inline-flex items-center gap-1 text-[10.5px] text-destructive font-semibold">
          <AlertTriangle className="h-3 w-3" /> Real tenant in QA mode
        </span>
      ) : null}
    </div>
  );
}

/**
 * Persistent banner shown when QA mode is active. Renders inside the
 * page body so it does not disrupt navigation chrome.
 */
export function QaModeBanner({ isReal }: { isReal: boolean }) {
  return (
    <div
      role="status"
      className={cn(
        "mb-3 rounded-xl border p-3 flex items-start gap-2.5",
        isReal
          ? "border-destructive/40 bg-destructive/[0.06]"
          : "border-purple-500/30 bg-purple-500/[0.06]",
      )}
    >
      <AlertTriangle
        className={cn(
          "h-4 w-4 mt-0.5 shrink-0",
          isReal ? "text-destructive" : "text-purple-600 dark:text-purple-300",
        )}
      />
      <div className="min-w-0">
        <p className="text-[12.5px] font-semibold text-foreground leading-tight">
          QA mode: only use demo/test tenant
        </p>
        <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
          {isReal
            ? "You are currently on a REAL tenant. Clock entries will appear in operational queues. Switch to Stafly Demo Company before testing."
            : "You are safely on a demo/test tenant. Clock entries here will not affect payroll."}
        </p>
      </div>
    </div>
  );
}
