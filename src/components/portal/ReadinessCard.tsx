/**
 * ReadinessCard — surfaces the worker's onboarding readiness on the portal home.
 *
 * UX rules:
 *   - When status === 'ready' or 'active', renders a discreet success strip.
 *   - Otherwise, renders a checklist with the first 3 missing items + CTA to the wizard.
 *   - All colors come from semantic tokens (no hardcoded values).
 */
import { Link } from "react-router-dom";
import { CheckCircle2, ArrowRight, AlertTriangle, FileWarning, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEmployeeReadiness } from "@/hooks/useEmployeeReadiness";
import { useEffectiveEmployee } from "@/hooks/useEffectiveEmployee";
import { PROFILE_STATUS_LABELS } from "@/lib/onboarding/profile-status";

export function ReadinessCard() {
  const { effectiveEmployeeId } = useEffectiveEmployee();
  const r = useEmployeeReadiness(effectiveEmployeeId);

  if (r.loading || !r.status) return null;

  const isReady = r.status === "ready" || r.status === "active";
  // CTA routing:
  //  • If only documents are missing → go straight to /portal/documents (self-upload).
  //  • Otherwise (personal info still missing) → wizard.
  const onlyDocsMissing = r.missingPersonal.length === 0 && r.missingDocuments.length > 0;
  const ctaHref = onlyDocsMissing ? "/portal/documents" : "/portal/profile/complete";

  if (isReady) {
    return (
      <div className="rounded-2xl border border-earning/20 bg-earning/[0.05] px-4 py-3 flex items-center gap-3">
        <div className="h-9 w-9 rounded-xl bg-earning/12 flex items-center justify-center shrink-0">
          {r.status === "active"
            ? <Sparkles className="h-[18px] w-[18px] text-earning" />
            : <CheckCircle2 className="h-[18px] w-[18px] text-earning" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold text-foreground leading-tight">
            Tu perfil está listo
          </p>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            Puedes recibir turnos.
          </p>
        </div>
      </div>
    );
  }

  const items = [
    ...r.missingPersonal.map((p) => ({ kind: "personal" as const, label: p })),
    ...r.missingDocuments.map((d) => ({ kind: "doc" as const, label: d.label })),
  ];
  const visible = items.slice(0, 3);
  const more = items.length - visible.length;

  const tone =
    r.status === "pending_documents"
      ? "border-warning/25 bg-warning/[0.06]"
      : "border-deduction/25 bg-deduction/[0.05]";
  const accent =
    r.status === "pending_documents" ? "text-warning" : "text-deduction";

  return (
    <Link to={ctaHref} className="block">
      <div className={cn(
        "rounded-2xl border-2 px-4 py-4 active:scale-[0.99] transition-all shadow-sm",
        tone,
      )}>
        <div className="flex items-center gap-3 mb-3">
          <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center shrink-0", "bg-background/60")}>
            {r.status === "pending_documents"
              ? <FileWarning className={cn("h-[18px] w-[18px]", accent)} />
              : <AlertTriangle className={cn("h-[18px] w-[18px]", accent)} />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[16px] font-bold text-foreground leading-tight">
              {onlyDocsMissing ? "Sube tus documentos" : "Completa tu perfil"}
            </p>
            <p className="text-[13px] text-muted-foreground mt-0.5 leading-snug">
              Necesario para que puedas recibir turnos.
            </p>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
        </div>

        {/* Progress */}
        <div className="h-2 w-full rounded-full bg-background/60 overflow-hidden mb-3">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              r.status === "pending_documents" ? "bg-warning" : "bg-deduction",
            )}
            style={{ width: `${r.progressPct}%` }}
          />
        </div>

        <ul className="space-y-2">
          {visible.map((it, i) => (
            <li key={i} className="flex items-center gap-2 text-[14px] text-foreground/90">
              <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", accent.replace("text-", "bg-"))} />
              <span className="truncate">{it.label}</span>
              <span className="ml-auto text-[11px] uppercase tracking-wider text-muted-foreground font-bold">
                {it.kind === "doc" ? "Doc" : "Info"}
              </span>
            </li>
          ))}
          {more > 0 && (
            <li className="text-[13px] text-muted-foreground pl-3.5">
              +{more} {more === 1 ? "más" : "más"}
            </li>
          )}
        </ul>
      </div>
    </Link>
  );
}
