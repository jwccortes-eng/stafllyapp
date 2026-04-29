/**
 * ProfileReadinessStrip — compact strip showing readiness state.
 *
 * Renders ONLY when the NBA is *not* already surfacing readiness
 * (missing_docs / missing_profile). Falls back to a calm success strip
 * when the worker is ready/active. Auto-hides when loading or no status.
 */
import { Link } from "react-router-dom";
import { CheckCircle2, ArrowRight, Sparkles } from "lucide-react";
import { useEmployeeReadiness } from "@/hooks/useEmployeeReadiness";
import { useEffectiveEmployee } from "@/hooks/useEffectiveEmployee";
import { PROFILE_STATUS_LABELS } from "@/lib/onboarding/profile-status";
import type { NbaKind } from "@/lib/portal/next-best-action";

interface Props {
  nbaKind: NbaKind;
}

export function ProfileReadinessStrip({ nbaKind }: Props) {
  const { effectiveEmployeeId } = useEffectiveEmployee();
  const r = useEmployeeReadiness(effectiveEmployeeId);

  // The NBA already covers readiness — don't double up.
  if (nbaKind === "missing_docs" || nbaKind === "missing_profile") return null;
  if (r.loading || !r.status) return null;

  const isReady = r.status === "ready" || r.status === "active";

  if (isReady) {
    return (
      <div className="rounded-xl border border-earning/20 bg-earning/[0.05] px-3.5 py-2 flex items-center gap-3">
        <div className="h-7 w-7 rounded-lg bg-earning/12 flex items-center justify-center shrink-0">
          {r.status === "active"
            ? <Sparkles className="h-3.5 w-3.5 text-earning" />
            : <CheckCircle2 className="h-3.5 w-3.5 text-earning" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-semibold text-foreground leading-tight">
            Profile {PROFILE_STATUS_LABELS[r.status].toLowerCase()}
          </p>
          <p className="text-[10px] text-muted-foreground/70 leading-tight mt-0.5">
            {r.progressPct}% complete · ready for shifts
          </p>
        </div>
      </div>
    );
  }

  // Pending but NBA chose another priority (e.g., today's shift wins).
  // Show a discreet reminder with the progress bar.
  const onlyDocsMissing = r.missingPersonal.length === 0 && r.missingDocuments.length > 0;
  const ctaHref = onlyDocsMissing ? "/portal/documents" : "/portal/profile/complete";

  return (
    <Link to={ctaHref} className="block">
      <div className="rounded-xl border border-border/40 bg-card px-3.5 py-2.5 active:scale-[0.99] transition-all shadow-sm">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-semibold text-foreground leading-tight">
              {onlyDocsMissing ? "Documents pending" : "Profile in progress"}
            </p>
            <p className="text-[10px] text-muted-foreground/70 mt-0.5">
              {r.progressPct}% complete · {r.totalRequirements - r.completedRequirements} item
              {r.totalRequirements - r.completedRequirements === 1 ? "" : "s"} left
            </p>
          </div>
          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
        </div>
        <div className="h-1 w-full rounded-full bg-muted/60 overflow-hidden mt-2">
          <div
            className="h-full rounded-full bg-warning transition-all"
            style={{ width: `${r.progressPct}%` }}
          />
        </div>
      </div>
    </Link>
  );
}
