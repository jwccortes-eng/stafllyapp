/**
 * WorkerHero — premium emotional hero card for the Worker Portal home.
 *
 * Pure presentational. Receives the worker identity + a derived status
 * (on_shift / ready / incomplete) and renders a large avatar, greeting,
 * company pill and an emotional one-liner.
 *
 * No business logic — caller is responsible for resolving status from
 * the live `clockStatus` + `readiness.status` pair.
 */
import { CheckCircle2, Sparkles, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDisplayName } from "@/lib/format-helpers";

export type WorkerHeroStatus = "on_shift" | "ready" | "incomplete";

interface Props {
  firstName: string;
  lastName: string;
  greeting: string;
  companyName: string | null;
  avatarUrl: string | null;
  status: WorkerHeroStatus;
}

const STATUS_COPY: Record<WorkerHeroStatus, { label: string; trust: string | null }> = {
  on_shift: { label: "En turno", trust: "Fichado · turno en curso" },
  ready: { label: "Listo para trabajar", trust: "Perfil completo · Portal activo" },
  incomplete: { label: "Perfil incompleto", trust: null },
};

const STATUS_PILL: Record<WorkerHeroStatus, string> = {
  on_shift: "bg-[hsl(var(--status-confirmed)/0.14)] text-[hsl(var(--status-confirmed))] border-[hsl(var(--status-confirmed)/0.25)]",
  ready: "bg-primary/12 text-primary border-primary/22",
  incomplete: "bg-warning/12 text-warning border-warning/25",
};

const STATUS_ICON: Record<WorkerHeroStatus, React.ComponentType<{ className?: string }>> = {
  on_shift: Sparkles,
  ready: CheckCircle2,
  incomplete: AlertTriangle,
};

function initialsFor(first: string, last: string): string {
  const a = (first ?? "").trim().charAt(0);
  const b = (last ?? "").trim().charAt(0);
  return (a + b || a || "?").toUpperCase();
}

export function WorkerHero({ firstName, lastName, greeting, companyName, avatarUrl, status }: Props) {
  const StatusIcon = STATUS_ICON[status];
  const copy = STATUS_COPY[status];

  return (
    <section
      aria-label="Worker hero"
      className="relative overflow-hidden rounded-3xl border border-border/50 bg-card shadow-[0_8px_28px_-18px_hsl(var(--primary)/0.35)]"
    >
      {/* Soft Stafly blue wash — premium "passport" feel without being loud */}
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-br from-primary/[0.08] via-primary/[0.02] to-transparent pointer-events-none"
      />
      <div className="relative px-4 py-4 flex items-center gap-3.5">
        {/* Avatar — larger for passport hierarchy */}
        <div className="relative shrink-0">
          <div
            className={cn(
              "h-14 w-14 rounded-2xl overflow-hidden ring-2 ring-background",
              "border border-border/50 shadow-sm",
            )}
          >
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={`${firstName} ${lastName}`}
                className="h-full w-full object-cover"
                draggable={false}
              />
            ) : (
              <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-primary/25 to-primary/5">
                <span className="text-base font-bold font-heading text-primary tracking-tight">
                  {initialsFor(firstName, lastName)}
                </span>
              </div>
            )}
          </div>
          {status === "on_shift" && (
            <span className="absolute bottom-0 right-0 flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[hsl(var(--status-confirmed))] opacity-60" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-[hsl(var(--status-confirmed))] ring-2 ring-card" />
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium text-muted-foreground/75 leading-tight">
            {greeting},
          </p>
          <h1 className="text-[18px] font-bold font-heading tracking-tight leading-tight text-foreground truncate">
            {firstName || "Hola"}
          </h1>
          {companyName && (
            <p className="text-[11px] text-muted-foreground/70 truncate mt-0.5">
              {formatDisplayName(companyName)}
            </p>
          )}
          <span
            className={cn(
              "mt-1.5 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold",
              STATUS_PILL[status],
            )}
          >
            <StatusIcon className="h-2.5 w-2.5" />
            {copy.label}
          </span>
          {copy.trust && (
            <p className="text-[10px] text-muted-foreground/60 mt-1 truncate">
              {copy.trust}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
