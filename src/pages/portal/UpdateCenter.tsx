/**
 * /portal/update-center — Phase 1 read-only Worker Update Center.
 *
 * Lists missing requirements grouped by category, each row with a deep-link
 * to the existing portal flow that resolves it. NO deadlines, NO restrictions,
 * NO backend writes in this phase.
 */
import { Link } from "react-router-dom";
import {
  User,
  Phone,
  Mail,
  MapPin,
  HeartPulse,
  Briefcase,
  Calendar,
  FileText,
  Car,
  ShieldCheck,
  KeyRound,
  Scale,
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
} from "lucide-react";
import { useEffectiveEmployee } from "@/hooks/useEffectiveEmployee";
import { useWorkerCompliance } from "@/hooks/useWorkerCompliance";
import {
  CATEGORY_LABELS,
  type RequirementDef,
} from "@/lib/compliance/requirement-catalog";
import { WorkerSelfServiceSections } from "@/components/portal/WorkerSelfServiceSections";
import { W9EntryCard } from "@/components/portal/W9EntryCard";
import { ConsentCenterCard } from "@/components/portal/ConsentCenterCard";
import { cn } from "@/lib/utils";

const ICONS: Record<RequirementDef["icon"], React.ComponentType<{ className?: string }>> = {
  user: User,
  phone: Phone,
  mail: Mail,
  "map-pin": MapPin,
  "heart-pulse": HeartPulse,
  briefcase: Briefcase,
  calendar: Calendar,
  "file-text": FileText,
  car: Car,
  "shield-check": ShieldCheck,
  key: KeyRound,
  scale: Scale,
};

export default function UpdateCenter() {
  const { effectiveEmployeeId } = useEffectiveEmployee();
  const { loading, items, summary, refresh } = useWorkerCompliance(effectiveEmployeeId);

  return (
    <div className="space-y-4 animate-fade-in pb-28">
      {/* ── Header ── */}
      <div className="px-1">
        <Link
          to="/portal"
          className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Inicio
        </Link>
        <h1 className="mt-2 text-[24px] font-bold tracking-tight text-foreground">
          Completa tu perfil
        </h1>
        <p className="text-[14px] text-muted-foreground mt-1 leading-snug">
          Mantén tu perfil listo para recibir trabajos y cobrar sin problemas.
        </p>
      </div>

      {/* ── Progress card ── */}
      {summary && (
        <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11.5px] font-bold uppercase tracking-wider text-muted-foreground">
                Tu progreso
              </p>
              <p className="mt-1 text-[30px] leading-none font-bold tabular-nums text-foreground">
                {summary.pct}
                <span className="text-[15px] text-muted-foreground font-semibold ml-0.5">%</span>
              </p>
              <p className="text-[12.5px] text-muted-foreground mt-1">
                {summary.completed} de {summary.totalApplicable} completos
              </p>
            </div>
            <div className="text-right">
              <p className="text-[11.5px] font-bold uppercase tracking-wider text-muted-foreground">
                Pendientes
              </p>
              <p className="mt-1 text-[30px] leading-none font-bold tabular-nums text-foreground">
                {summary.pending}
              </p>
            </div>
          </div>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted/60">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${summary.pct}%` }}
            />
          </div>
        </div>
      )}

      {/* ── Self-service editable cards (Phase 1) ── */}
      {effectiveEmployeeId && (
        <WorkerSelfServiceSections
          employeeId={effectiveEmployeeId}
          onUpdated={() => { void refresh(); }}
        />
      )}

      {/* ── W-9 guided form entry ── */}
      <W9EntryCard />

      {/* ── Consent Center (Phase 2 — Parceros data sharing) ── */}
      <ConsentCenterCard />

      {/* ── Loading ── */}
      {loading && (
        <div className="rounded-2xl border border-border/50 bg-card/60 p-6 text-center text-[12px] text-muted-foreground">
          Cargando…
        </div>
      )}

      {/* ── Empty state ── */}
      {!loading && summary && summary.pending === 0 && (
        <div className="rounded-2xl border border-earning/20 bg-earning/5 p-5 text-center">
          <CheckCircle2 className="h-8 w-8 text-earning mx-auto" />
          <p className="mt-2 text-[13.5px] font-semibold text-foreground">
            Tu perfil está al día
          </p>
          <p className="mt-1 text-[11.5px] text-muted-foreground/80">
            Te avisaremos cuando necesitemos algo.
          </p>
        </div>
      )}

      {/* ── Missing items grouped by category ──
          documents.w9 is owned by <W9EntryCard /> above — filter it out so the
          same item never appears twice with a stale "Firmar W-9" label. */}
      {!loading && summary && summary.pending > 0 && (
        <div className="space-y-3">
          {Object.entries(summary.missingByCategory).map(([cat, rawList]) => {
            const list = rawList.filter(({ def }) => def.key !== "documents.w9");
            if (list.length === 0) return null;
            return (
            <section key={cat} className="space-y-1.5">
              <h2 className="px-1 text-[11.5px] font-bold uppercase tracking-wider text-muted-foreground">
                {CATEGORY_LABELS[cat as keyof typeof CATEGORY_LABELS] ?? cat}
              </h2>
              <div className="rounded-2xl border border-border/60 bg-card overflow-hidden divide-y divide-border/50">
                {list.map(({ def }) => {
                  const Icon = ICONS[def.icon] ?? FileText;
                  return (
                    <Link
                      key={def.key}
                      to={def.resolveHref}
                      className="flex items-center gap-3 px-3.5 py-3.5 min-h-[60px] active:bg-muted/50 transition-colors"
                    >
                      <div
                        className={cn(
                          "h-10 w-10 rounded-xl flex items-center justify-center shrink-0",
                          "bg-primary/10 text-primary",
                        )}
                      >
                        <Icon className="h-4.5 w-4.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-semibold text-foreground leading-tight">
                          {def.label}
                        </p>
                        <p className="text-[12.5px] text-muted-foreground mt-0.5 truncate">
                          {def.description}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 text-[13px] font-bold text-primary shrink-0">
                        {def.ctaLabel}
                        <ArrowRight className="h-3.5 w-3.5" />
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
            );
          })}
        </div>
      )}

      {/* ── Footer copy ── */}
      <p className="px-2 pt-1 text-[10.5px] text-muted-foreground/55 leading-snug">
        Tu historial de pago y soporte siempre siguen disponibles, aunque te falten datos.
      </p>
    </div>
  );
}
