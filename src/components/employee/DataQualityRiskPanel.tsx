/**
 * DataQualityRiskPanel — Phase 1 (read-only, visual-first).
 *
 * Renders a grid of risk cards above the Workers table. Clicking a card
 * filters the table by that risk via the parent's `riskFilter` state.
 *
 * No writes. No payroll changes. Multi-tenant: data comes from the parent's
 * `employees` array which is already scoped by selectedCompanyId.
 */

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  analyzeEmployeeRisks,
  buildRiskReportCsv,
  computePayrollReadiness,
  getRiskMeta,
  RISK_ORDER,
  PRIMARY_RISK_KEYS,
  READINESS_LABEL,
  type PayrollReadiness,
  type RiskKey,
} from "@/lib/data-quality-risks";
import {
  ShieldCheck,
  ShieldAlert,
  Users2,
  Mail,
  Phone,
  MapPin,
  UserCog,
  History,
  FlaskConical,
  Bot,
  ArchiveRestore,
  Download,
  Sparkles,
  FileX2,
  FileClock,
  FileWarning,
  CalendarClock,
  FileMinus,
  PhoneOff,
  MailX,
  ImageOff,
  HeartPulse,
  KeyRound,
} from "lucide-react";

const RISK_ICON: Record<RiskKey, React.ComponentType<{ className?: string }>> = {
  system_placeholder: Bot,
  test_account: FlaskConical,
  duplicate_review: Users2,
  historical_active: History,
  suspicious_email: Mail,
  phone_invalid: Phone,
  missing_role: UserCog,
  missing_location: MapPin,
  inactive_with_payroll: ArchiveRestore,
  missing_phone: PhoneOff,
  missing_email: MailX,
  missing_photo: ImageOff,
  missing_emergency_contact: HeartPulse,
  portal_not_active: KeyRound,
  missing_required_document: FileMinus,
  pending_document_review: FileClock,
  expired_document: FileX2,
  expiring_document: CalendarClock,
  rejected_document: FileWarning,
};

interface Props {
  employees: any[];
  riskFilter: RiskKey | "all";
  onRiskFilterChange: (next: RiskKey | "all") => void;
  /** Optional document signals — when provided, doc-compliance risks (missing/
   * pending/expired/expiring/rejected) are surfaced as cards too. */
  documentSignals?: Map<string, import("@/lib/documents-signals").WorkerDocumentSignals>;
  /** Compact mode: curated subset of risk cards + toggle to reveal the full grid. */
  compact?: boolean;
}

export default function DataQualityRiskPanel({ employees, documentSignals, riskFilter, onRiskFilterChange, compact = false }: Props) {
  const [expanded, setExpanded] = useState(!compact);
  const { byId, counts } = useMemo(
    () => analyzeEmployeeRisks(employees, documentSignals),
    [employees, documentSignals],
  );

  const readinessTotals = useMemo(() => {
    const totals: Record<PayrollReadiness, number> = { ready: 0, needs_review: 0, blocked_visual: 0 };
    for (const e of employees) {
      const risks = byId.get(e.id) ?? [];
      totals[computePayrollReadiness(risks)] += 1;
    }
    return totals;
  }, [employees, byId]);

  const handleExport = () => {
    const csv = buildRiskReportCsv(employees, byId);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `worker_risk_report_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const totalAtRisk = readinessTotals.needs_review + readinessTotals.blocked_visual;

  return (
    <Card className="border-amber-200/50 bg-gradient-to-br from-amber-50/40 via-background to-background shadow-sm">
      <div className="p-3 sm:p-4 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-2.5 min-w-0">
            <div className="mt-0.5 rounded-md bg-amber-100/70 text-amber-700 p-1.5">
              <Sparkles className="h-3.5 w-3.5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-xs font-semibold tracking-wide uppercase text-foreground/80">
                  Calidad de datos · Revisión pre-payroll
                </h3>
                <Badge variant="outline" className="text-[9px] uppercase tracking-wider border-amber-300/60 text-amber-700 bg-amber-50">
                  Beta
                </Badge>
              </div>
              {!compact && (
                <p className="text-[11px] text-muted-foreground mt-0.5 max-w-xl">
                  Solo señales de preparación — no cambia los cálculos de payroll. Usa
                  estas tarjetas para limpiar registros antes de payroll, invitaciones
                  masivas o asignaciones críticas.
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <ReadinessChip
              icon={ShieldCheck}
              label={READINESS_LABEL.ready}
              value={readinessTotals.ready}
              tone="success"
            />
            <ReadinessChip
              icon={Sparkles}
              label={READINESS_LABEL.needs_review}
              value={readinessTotals.needs_review}
              tone="warning"
            />
            <ReadinessChip
              icon={ShieldAlert}
              label={READINESS_LABEL.blocked_visual}
              value={readinessTotals.blocked_visual}
              tone="destructive"
            />
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-[11px]"
              onClick={handleExport}
              disabled={totalAtRisk === 0}
              title={totalAtRisk === 0 ? "Sin riesgos para exportar" : "Descargar riesgos visibles como CSV"}
            >
              <Download className="h-3 w-3 mr-1" />
              Exportar riesgos
            </Button>
            {compact && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-[11px]"
                onClick={() => setExpanded((v) => !v)}
              >
                {expanded ? "Ocultar diagnóstico" : "Ver diagnóstico completo"}
              </Button>
            )}
          </div>
        </div>

        {/* Risk cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          <RiskCard
            label="Todos los trabajadores"
            value={employees.length}
            active={riskFilter === "all"}
            onClick={() => onRiskFilterChange("all")}
            tone="muted"
            icon={Users2}
          />
          {(compact && !expanded ? PRIMARY_RISK_KEYS : RISK_ORDER).map((key) => {
            const meta = getRiskMeta(key);
            const Icon = RISK_ICON[key];
            return (
              <RiskCard
                key={key}
                label={meta.label}
                value={counts[key]}
                active={riskFilter === key}
                onClick={() => onRiskFilterChange(riskFilter === key ? "all" : key)}
                tone={meta.tone}
                icon={Icon}
                description={meta.description}
              />
            );
          })}
        </div>
      </div>
    </Card>
  );
}

function RiskCard({
  label,
  value,
  active,
  onClick,
  tone,
  icon: Icon,
  description,
}: {
  label: string;
  value: number;
  active: boolean;
  onClick: () => void;
  tone: "warning" | "destructive" | "muted";
  icon: React.ComponentType<{ className?: string }>;
  description?: string;
}) {
  const isZero = value === 0;
  const toneClass =
    tone === "destructive"
      ? "text-rose-600 bg-rose-50 border-rose-100"
      : tone === "warning"
      ? "text-amber-700 bg-amber-50 border-amber-100"
      : "text-muted-foreground bg-muted/40 border-border/60";

  return (
    <button
      type="button"
      onClick={onClick}
      title={description ?? label}
      className={cn(
        "group text-left rounded-lg border bg-card/70 backdrop-blur-sm p-2.5 transition-all",
        "hover:border-foreground/20 hover:shadow-sm",
        active && "ring-1 ring-foreground/30 border-foreground/30 shadow-sm",
        isZero && "opacity-60",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className={cn("inline-flex items-center justify-center rounded-md p-1 border", toneClass)}>
          <Icon className="h-3 w-3" />
        </div>
        <span className={cn("text-base font-semibold tabular-nums", isZero && "text-muted-foreground/60")}>
          {value}
        </span>
      </div>
      <div className="mt-1.5 text-[10.5px] font-medium text-foreground/85 leading-tight line-clamp-2">
        {label}
      </div>
    </button>
  );
}

function ReadinessChip({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  tone: "success" | "warning" | "destructive";
}) {
  const cls =
    tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : tone === "warning"
      ? "border-amber-200 bg-amber-50 text-amber-700"
      : "border-rose-200 bg-rose-50 text-rose-700";
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10.5px] font-medium", cls)}>
      <Icon className="h-3 w-3" />
      <span className="font-mono tabular-nums font-semibold">{value}</span>
      <span className="opacity-80">{label}</span>
    </span>
  );
}

/**
 * Compact inline risk-tag list — used in the Workers table name cell.
 */
export function WorkerRiskTags({
  risks,
  max = 3,
  className,
}: {
  risks: RiskKey[];
  max?: number;
  className?: string;
}) {
  if (!risks || risks.length === 0) return null;

  // Severity-first ordering: destructive > warning > muted, with RISK_ORDER as
  // a stable tie-breaker so the list stays deterministic across renders.
  const TONE_RANK: Record<"destructive" | "warning" | "muted", number> = {
    destructive: 0,
    warning: 1,
    muted: 2,
  };
  const orderIndex = (k: RiskKey) => RISK_ORDER.indexOf(k);
  const ordered = [...new Set(risks)].sort((a, b) => {
    const ta = getRiskMeta(a).tone;
    const tb = getRiskMeta(b).tone;
    if (TONE_RANK[ta] !== TONE_RANK[tb]) return TONE_RANK[ta] - TONE_RANK[tb];
    return orderIndex(a) - orderIndex(b);
  });

  const visible = ordered.slice(0, max);
  const overflow = ordered.slice(max);

  const toneCls = (tone: "destructive" | "warning" | "muted") =>
    tone === "destructive"
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : tone === "warning"
      ? "border-amber-200 bg-amber-50 text-amber-700"
      : "border-border/60 bg-muted/40 text-muted-foreground";

  return (
    <span className={cn("inline-flex items-center gap-1 flex-wrap", className)}>
      {visible.map((k) => {
        const meta = getRiskMeta(k);
        return (
          <span
            key={k}
            title={meta.description}
            className={cn(
              "inline-flex items-center rounded-sm border px-1 py-px text-[9px] font-medium leading-none",
              toneCls(meta.tone),
            )}
          >
            {meta.label}
          </span>
        );
      })}
      {overflow.length > 0 && (
        <span
          // Tooltip lists remaining risks ordered by severity, prefixed by tone.
          title={overflow
            .map((k) => {
              const m = getRiskMeta(k);
              const dot = m.tone === "destructive" ? "●" : m.tone === "warning" ? "▲" : "·";
              return `${dot} ${m.label}`;
            })
            .join("\n")}
          className="inline-flex items-center rounded-sm border border-border/60 bg-muted/40 px-1 py-px text-[9px] font-medium leading-none text-muted-foreground"
        >
          +{overflow.length}
        </span>
      )}
    </span>
  );
}
