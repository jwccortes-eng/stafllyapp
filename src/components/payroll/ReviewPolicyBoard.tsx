import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  ChevronDown,
  ChevronRight,
  Eye,
  Copy,
  Printer,
  Scale,
  AlertTriangle,
  ShieldAlert,
  FileText,
  Lock,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { EmptyState } from "@/components/ui/empty-state";

/**
 * Review Policy Board — READ-ONLY
 *
 * Surfaces historical pay periods that still need a human policy decision
 * (replace / merge / skip / document_only) AFTER pilots #124, #128, #129.
 *
 * Data sources:
 *  - Live DB: pay_periods + period_base_pay + imports (read-only).
 *  - Static Connecteam reference (frozen from Phase E diff dataset
 *    `connecteam_phase_b/connecteam-historical-payroll-dryrun-v1.xlsx`).
 *
 * Hard scope:
 *  - No writes / no commit / no delete / no replacement.
 *  - No payroll recalc.
 *  - No actions on #124, #128, #129 (committed) or PASSOVER #126/#127 (blocked).
 */

type Recommendation =
  | "replace_candidate"
  | "merge_candidate"
  | "skip_document_only"
  | "blocked_needs_human_review"
  | "blocked_passover_split";

type RiskLevel = "low" | "medium" | "high" | "blocked";

interface ReviewTarget {
  sequence: number;
  start: string;
  end: string;
  ctRows: number | null;
  ctTotal: number | null;
  // Phase E employee diff totals
  matchedSame: number | null;
  ctMissingInStafly: number | null;
  staflyExtra: number | null;
  amountMismatch: number | null;
  recommendation: Recommendation;
  risk: RiskLevel;
  rationale: string;
}

interface HistoricalReviewDataset {
  companyId: string;
  source: string;
  targets: ReviewTarget[];
}

// Frozen Connecteam reference numbers (from Phase E
// `historical-review-periods-diff.xlsx → summary` sheet, captured 2026-04-30).
const HISTORICAL_REVIEW_DATASET: HistoricalReviewDataset = {
  companyId: "00000000-0000-0000-0000-000000000001",
  source: "connecteam_phase_b/historical-review-periods-diff.xlsx#summary",
  targets: [
  {
    sequence: 121,
    start: "2026-02-25",
    end: "2026-03-03",
    ctRows: 60,
    ctTotal: 21354.91,
    matchedSame: 0,
    ctMissingInStafly: 60,
    staflyExtra: 6,
    amountMismatch: 0,
    recommendation: "blocked_needs_human_review",
    risk: "high",
    rationale:
      "Stafly only holds 6 low-dollar rows ($542.25). Connecteam has 60 employees not yet in Stafly. A blind replace would discard the 6 existing rows with no audit trail.",
  },
  {
    sequence: 122,
    start: "2026-03-04",
    end: "2026-03-10",
    ctRows: 64,
    ctTotal: 46250.07,
    matchedSame: 2,
    ctMissingInStafly: 5,
    staflyExtra: 9,
    amountMismatch: 57,
    recommendation: "merge_candidate",
    risk: "high",
    rationale:
      "Most workers exist in both, but 57 amounts differ. Pure replace would overwrite 9 Stafly-only rows. Needs an explicit merge policy before any preview SQL.",
  },
  {
    sequence: 123,
    start: "2026-03-11",
    end: "2026-03-17",
    ctRows: 90,
    ctTotal: 61401.23,
    matchedSame: 0,
    ctMissingInStafly: 39,
    staflyExtra: 1,
    amountMismatch: 51,
    recommendation: "blocked_needs_human_review",
    risk: "high",
    rationale:
      "Stafly currently $3,566.58 (52 rows of partial drafts). Connecteam $61,401.23 (90 rows) with 51 amount mismatches and 39 missing. Decide replace-vs-merge before any action.",
  },
  {
    sequence: 125,
    start: "2026-03-25",
    end: "2026-03-31",
    ctRows: 51,
    ctTotal: 22888.71,
    matchedSame: 0,
    ctMissingInStafly: 49,
    staflyExtra: 1,
    amountMismatch: 2,
    recommendation: "blocked_needs_human_review",
    risk: "medium",
    rationale:
      "Stafly only $480.00 (3 rows). Likely safe to replace once user confirms the 3 rows are placeholders, but no auto-action without explicit approval.",
  },
  {
    sequence: 126,
    start: "2026-04-01",
    end: "2026-04-07",
    ctRows: null,
    ctTotal: null,
    matchedSame: null,
    ctMissingInStafly: null,
    staflyExtra: null,
    amountMismatch: null,
    recommendation: "blocked_passover_split",
    risk: "blocked",
    rationale:
      "PASSOVER 2026-04-01→04-14 covers #126 + #127. Raw row-date file is missing; cannot split without per-row dates. Re-upload required.",
  },
  {
    sequence: 127,
    start: "2026-04-08",
    end: "2026-04-14",
    ctRows: null,
    ctTotal: null,
    matchedSame: null,
    ctMissingInStafly: null,
    staflyExtra: null,
    amountMismatch: null,
    recommendation: "blocked_passover_split",
    risk: "blocked",
    rationale:
      "Second half of PASSOVER. Same blocker as #126.",
  },
  ],
};

interface LiveStats {
  staflyRows: number;
  staflyTotal: number;
  status: string;
  importsCount: number;
  hasCommittedImport: boolean;
}

const REC_LABELS: Record<Recommendation, string> = {
  replace_candidate: "Candidato a reemplazar",
  merge_candidate: "Candidato a unir",
  skip_document_only: "Omitir · solo documento",
  blocked_needs_human_review: "Requiere revisión",
  blocked_passover_split: "Bloqueado · división PASSOVER",
};

const RISK_LABELS: Record<RiskLevel, string> = {
  low: "Bajo",
  medium: "Medio",
  high: "Alto",
  blocked: "Bloqueado",
};

const REC_BADGE: Record<Recommendation, string> = {
  replace_candidate: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30",
  merge_candidate: "bg-amber-500/10 text-amber-700 border-amber-500/30",
  skip_document_only: "bg-slate-500/10 text-slate-700 border-slate-500/30",
  blocked_needs_human_review: "bg-red-500/10 text-red-700 border-red-500/30",
  blocked_passover_split: "bg-red-500/10 text-red-700 border-red-500/30",
};

const RISK_BADGE: Record<RiskLevel, string> = {
  low: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30",
  medium: "bg-amber-500/10 text-amber-700 border-amber-500/30",
  high: "bg-red-500/10 text-red-700 border-red-500/30",
  blocked: "bg-slate-500/10 text-slate-700 border-slate-500/30",
};

const fmtMoney = (n: number | null | undefined) =>
  n == null
    ? "—"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
      }).format(n);

interface ReviewPolicyBoardProps {
  companyId: string | null;
  selectedCompanyId?: string | null;
  selectedCompanyName?: string | null;
}

export default function ReviewPolicyBoard({
  companyId,
  selectedCompanyId,
  selectedCompanyName,
}: ReviewPolicyBoardProps) {
  const [open, setOpen] = useState(true);
  const [stats, setStats] = useState<Record<number, LiveStats>>({});
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const effectiveCompanyId = companyId ?? selectedCompanyId ?? null;
  const datasetSource = HISTORICAL_REVIEW_DATASET.source;
  const canShowHistoricalReviewBoard =
    effectiveCompanyId === HISTORICAL_REVIEW_DATASET.companyId;
  const safeTargets = canShowHistoricalReviewBoard
    ? HISTORICAL_REVIEW_DATASET.targets
    : [];

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!effectiveCompanyId || !canShowHistoricalReviewBoard) {
        setStats({});
        setExpanded({});
        setLoading(false);
        return;
      }
      setLoading(true);
      const seqs = safeTargets.map((t) => t.sequence);

      const { data: periods, error: pErr } = await supabase
        .from("pay_periods")
        .select("id, sequence_number, status")
        .eq("company_id", effectiveCompanyId)
        .in("sequence_number", seqs);

      if (pErr) {
        console.error("ReviewPolicyBoard: pay_periods", pErr);
        if (!cancelled) setLoading(false);
        return;
      }

      const out: Record<number, LiveStats> = {};
      for (const t of safeTargets) {
        out[t.sequence] = {
          staflyRows: 0,
          staflyTotal: 0,
          status: "—",
          importsCount: 0,
          hasCommittedImport: false,
        };
      }

      for (const p of periods ?? []) {
        const seq = p.sequence_number ?? -1;
        if (!(seq in out)) continue;
        out[seq].status = p.status;

        const [{ data: pbp }, { data: imps }] = await Promise.all([
          supabase
            .from("period_base_pay")
            .select("base_total_pay")
            .eq("period_id", p.id),
          supabase
            .from("imports")
            .select("file_name, status")
            .eq("period_id", p.id),
        ]);

        out[seq].staflyRows = pbp?.length ?? 0;
        out[seq].staflyTotal = (pbp ?? []).reduce(
          (s, r) => s + Number(r.base_total_pay ?? 0),
          0,
        );
        out[seq].importsCount = imps?.length ?? 0;
        out[seq].hasCommittedImport = (imps ?? []).some(
          (i) =>
            i.status === "completed" &&
            String(i.file_name ?? "").includes("COMMITTED"),
        );
      }

      if (!cancelled) {
        setStats(out);
        setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [canShowHistoricalReviewBoard, effectiveCompanyId]);

  useEffect(() => {
    console.warn("[ReviewPolicyBoard tenant guard]", {
      selectedCompanyId,
      selectedCompanyName,
      companyIdReceived: companyId,
      effectiveCompanyId,
      datasetSource,
      canShowHistoricalReviewBoard,
      renderedRows: safeTargets.length,
    });
  }, [
    canShowHistoricalReviewBoard,
    companyId,
    datasetSource,
    effectiveCompanyId,
    safeTargets.length,
    selectedCompanyId,
    selectedCompanyName,
  ]);

  const summary = useMemo(() => {
    const blocked = safeTargets.filter((t) =>
      t.recommendation.startsWith("blocked"),
    ).length;
    const merge = safeTargets.filter(
      (t) => t.recommendation === "merge_candidate",
    ).length;
    const replace = safeTargets.filter(
      (t) => t.recommendation === "replace_candidate",
    ).length;
    return { total: safeTargets.length, blocked, merge, replace };
  }, [safeTargets]);

  const copyDecision = (t: ReviewTarget, live?: LiveStats) => {
    const lines = [
      `Pay period #${t.sequence} · ${t.start} → ${t.end}`,
      `Stafly: ${live?.staflyRows ?? "?"} rows · ${fmtMoney(live?.staflyTotal ?? 0)} · status=${live?.status ?? "?"}`,
      `Connecteam: ${t.ctRows ?? "—"} rows · ${fmtMoney(t.ctTotal)}`,
      `Diff: matched_same=${t.matchedSame ?? "—"} · ct_missing=${t.ctMissingInStafly ?? "—"} · stafly_extra=${t.staflyExtra ?? "—"} · amount_mismatch=${t.amountMismatch ?? "—"}`,
      `Recommendation: ${REC_LABELS[t.recommendation]} (risk=${t.risk})`,
      `Rationale: ${t.rationale}`,
    ].join("\n");
    navigator.clipboard.writeText(lines);
    toast.success(`Decision summary copied for #${t.sequence}`);
  };

  const printPeriod = (t: ReviewTarget, live?: LiveStats) => {
    const html = `
      <html><head><title>Period #${t.sequence} review</title>
      <style>body{font-family:system-ui;padding:32px;color:#0f172a}h1{margin:0 0 4px}h2{margin:24px 0 8px;font-size:14px;text-transform:uppercase;letter-spacing:.08em;color:#64748b}table{border-collapse:collapse;width:100%;font-size:14px}td,th{padding:6px 10px;border-bottom:1px solid #e2e8f0;text-align:left}td:nth-child(2){text-align:right;font-variant-numeric:tabular-nums}.tag{display:inline-block;padding:2px 8px;border-radius:9999px;font-size:12px;font-weight:600;border:1px solid #cbd5e1;color:#334155}</style>
      </head><body>
      <h1>Pay period #${t.sequence}</h1>
      <div>${t.start} → ${t.end} · status=${live?.status ?? "—"}</div>
      <h2>Recommendation</h2>
      <div><span class="tag">${REC_LABELS[t.recommendation]}</span> · risk=${t.risk}</div>
      <p>${t.rationale}</p>
      <h2>Numbers</h2>
      <table>
        <tr><th>Metric</th><th>Value</th></tr>
        <tr><td>Stafly rows</td><td>${live?.staflyRows ?? "—"}</td></tr>
        <tr><td>Stafly total</td><td>${fmtMoney(live?.staflyTotal ?? 0)}</td></tr>
        <tr><td>Connecteam rows</td><td>${t.ctRows ?? "—"}</td></tr>
        <tr><td>Connecteam total</td><td>${fmtMoney(t.ctTotal)}</td></tr>
        <tr><td>Delta amount</td><td>${t.ctTotal != null ? fmtMoney(t.ctTotal - (live?.staflyTotal ?? 0)) : "—"}</td></tr>
        <tr><td>matched_same_amount</td><td>${t.matchedSame ?? "—"}</td></tr>
        <tr><td>connecteam_missing_in_stafly</td><td>${t.ctMissingInStafly ?? "—"}</td></tr>
        <tr><td>stafly_extra_not_in_connecteam</td><td>${t.staflyExtra ?? "—"}</td></tr>
        <tr><td>amount_mismatch</td><td>${t.amountMismatch ?? "—"}</td></tr>
        <tr><td>Existing imports</td><td>${live?.importsCount ?? "—"}</td></tr>
      </table>
      <p style="margin-top:24px;color:#64748b;font-size:12px">Generated from Review Policy Board · read-only · Connecteam reference frozen from Phase E diff dataset (2026-04-30).</p>
      </body></html>`;
    const w = window.open("", "_blank", "noopener,noreferrer");
    if (!w) {
      toast.error("Allow pop-ups to print");
      return;
    }
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 250);
  };

  const viewDiff = (t: ReviewTarget) => {
    toast.info(
      `Period #${t.sequence}: ${t.matchedSame ?? "—"} matched · ${t.ctMissingInStafly ?? "—"} CT-only · ${t.staflyExtra ?? "—"} Stafly-only · ${t.amountMismatch ?? "—"} mismatches`,
      { duration: 6000 },
    );
  };

  if (!effectiveCompanyId) return null;

  if (!canShowHistoricalReviewBoard) {
    return (
      <Card className="mb-6 border-border/60 bg-card">
        <CardHeader>
          <CardTitle>Tablero de políticas de revisión</CardTitle>
          <CardDescription>
            No hay dataset histórico de cierre configurado para esta empresa.
          </CardDescription>
        </CardHeader>
        <EmptyState
          icon={Scale}
          title="Sin dataset histórico de revisión"
          description="Esta empresa no tiene un tablero histórico de Connecteam habilitado, así que no se renderizan filas globales ni de respaldo."
          compact
          className="pt-0"
        />
      </Card>
    );
  }

  return (
    <Card
      id="review-policy-board"
      className="mb-6 border-amber-500/30 bg-gradient-to-br from-amber-500/[0.04] to-transparent"
    >
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="w-full flex items-start sm:items-center justify-between gap-2 sm:gap-3 px-3 sm:px-5 py-3 sm:py-4 text-left"
          >
            <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
              <div className="h-9 w-9 rounded-lg bg-amber-500/15 grid place-items-center shrink-0">
                <Scale className="h-4 w-4 text-amber-700" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold tracking-tight">
                  Tablero de políticas de revisión
                </div>
                <div className="text-[11px] sm:text-xs text-muted-foreground leading-tight">
                  Solo lectura · decide reemplazar · unir · omitir · solo documento
                </div>
                <div className="flex flex-wrap items-center gap-1 mt-1.5 sm:hidden">
                  <Badge variant="outline" className="text-[10px] py-0">
                    {summary.total} periodos
                  </Badge>
                  <Badge
                    variant="outline"
                    className="text-[10px] py-0 bg-amber-500/10 text-amber-700 border-amber-500/30"
                  >
                    {summary.merge} a unir
                  </Badge>
                  <Badge
                    variant="outline"
                    className="text-[10px] py-0 bg-red-500/10 text-red-700 border-red-500/30"
                  >
                    {summary.blocked} bloqueado
                  </Badge>
                </div>
              </div>
            </div>
            <div className="hidden sm:flex items-center gap-2 shrink-0">
              <Badge variant="outline" className="text-[11px]">
                {summary.total} periodos
              </Badge>
              <Badge
                variant="outline"
                className="text-[11px] bg-amber-500/10 text-amber-700 border-amber-500/30"
              >
                {summary.merge} a unir
              </Badge>
              <Badge
                variant="outline"
                className="text-[11px] bg-red-500/10 text-red-700 border-red-500/30"
              >
                {summary.blocked} bloqueado
              </Badge>
              {open ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
            <div className="sm:hidden shrink-0 pt-1">
              {open ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="px-3 sm:px-5 pb-5 space-y-3">
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.04] px-3 sm:px-4 py-2.5 text-[11px] sm:text-xs text-emerald-900/80 flex items-start gap-2">
              <Sparkles className="h-3.5 w-3.5 mt-0.5 text-emerald-700 shrink-0" />
              <div>
                Pilotos <strong>#124</strong>, <strong>#128</strong>,{" "}
                <strong>#129</strong> ya comprometidos y validados. No se
                muestran aquí y no serán modificados.
              </div>
            </div>

            {loading ? (
              <div className="text-xs text-muted-foreground py-6 text-center">
                Cargando snapshot en vivo…
              </div>
            ) : (
              <div className="space-y-2">
                {safeTargets.map((t) => {
                  const live = stats[t.sequence];
                  const delta =
                    t.ctTotal != null
                      ? t.ctTotal - (live?.staflyTotal ?? 0)
                      : null;
                  const isOpen = expanded[t.sequence] ?? false;
                  return (
                    <div
                      key={t.sequence}
                      className="rounded-lg border border-border bg-card overflow-hidden"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setExpanded((s) => ({
                            ...s,
                            [t.sequence]: !isOpen,
                          }))
                        }
                        className="w-full px-3 sm:px-4 py-3 flex flex-col md:flex-row md:items-center gap-2 md:gap-3 hover:bg-muted/40 transition-colors text-left"
                      >
                        <div className="flex items-center gap-2 md:min-w-[120px] w-full md:w-auto">
                          {isOpen ? (
                            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          )}
                          <span className="font-mono text-sm font-semibold">
                            #{t.sequence}
                          </span>
                          <span className="text-xs text-muted-foreground truncate">
                            {format(new Date(t.start + "T00:00:00"), "MMM d")}–
                            {format(new Date(t.end + "T00:00:00"), "MMM d")}
                          </span>
                          <div className="ml-auto md:hidden flex flex-wrap items-center gap-1 justify-end">
                            <Badge
                              variant="outline"
                              className={cn("text-[10px] py-0", RISK_BADGE[t.risk])}
                            >
                              {RISK_LABELS[t.risk]}
                            </Badge>
                          </div>
                        </div>
                        <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-x-3 gap-y-1.5 text-xs w-full">
                          <div className="min-w-0">
                            <div className="text-muted-foreground text-[10px] uppercase tracking-wide">Stafly</div>
                            <div className="font-mono tabular-nums truncate">
                              {live?.staflyRows ?? 0} ·{" "}
                              {fmtMoney(live?.staflyTotal ?? 0)}
                            </div>
                          </div>
                          <div className="min-w-0">
                            <div className="text-muted-foreground text-[10px] uppercase tracking-wide">Connecteam</div>
                            <div className="font-mono tabular-nums truncate">
                              {t.ctRows ?? "—"} · {fmtMoney(t.ctTotal)}
                            </div>
                          </div>
                          <div className="min-w-0">
                            <div className="text-muted-foreground text-[10px] uppercase tracking-wide">Δ</div>
                            <div
                              className={cn(
                                "font-mono tabular-nums truncate",
                                delta != null && delta > 0
                                  ? "text-emerald-700"
                                  : delta != null && delta < 0
                                    ? "text-red-700"
                                    : "text-muted-foreground",
                              )}
                            >
                              {delta != null ? fmtMoney(delta) : "—"}
                            </div>
                          </div>
                          <div className="min-w-0">
                            <div className="text-muted-foreground text-[10px] uppercase tracking-wide">Importaciones</div>
                            <div className="font-mono tabular-nums truncate">
                              {live?.importsCount ?? 0}
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 w-full md:w-auto md:justify-end">
                          <Badge
                            variant="outline"
                            className={cn("text-[10px] hidden md:inline-flex", RISK_BADGE[t.risk])}
                          >
                            {RISK_LABELS[t.risk]}
                          </Badge>
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[10px] max-w-full whitespace-normal text-left leading-tight",
                              REC_BADGE[t.recommendation],
                            )}
                          >
                            {REC_LABELS[t.recommendation]}
                          </Badge>
                        </div>
                      </button>

                      {isOpen && (
                        <div className="border-t border-border px-4 py-3 bg-muted/20 space-y-3">
                          <div className="text-xs text-muted-foreground leading-relaxed flex items-start gap-2">
                            {t.risk === "blocked" ? (
                              <Lock className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                            ) : t.risk === "high" ? (
                              <ShieldAlert className="h-3.5 w-3.5 mt-0.5 shrink-0 text-red-700" />
                            ) : (
                              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-700" />
                            )}
                            <span>{t.rationale}</span>
                          </div>

                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                            <Stat label="matched_same" value={t.matchedSame} />
                            <Stat
                              label="ct_missing_in_stafly"
                              value={t.ctMissingInStafly}
                            />
                            <Stat
                              label="stafly_extra"
                              value={t.staflyExtra}
                            />
                            <Stat
                              label="amount_mismatch"
                              value={t.amountMismatch}
                            />
                          </div>

                          <div className="flex flex-wrap gap-2 pt-1">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => viewDiff(t)}
                            >
                              <Eye className="h-3.5 w-3.5 mr-1.5" />
                              View diff
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => copyDecision(t, live)}
                            >
                              <Copy className="h-3.5 w-3.5 mr-1.5" />
                              Copy decision summary
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => printPeriod(t, live)}
                            >
                              <Printer className="h-3.5 w-3.5 mr-1.5" />
                              Print period review
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="rounded-md border border-border/50 bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground flex items-start gap-2">
              <FileText className="h-3 w-3 mt-0.5 shrink-0" />
              <span>
                Connecteam reference frozen from Phase E diff dataset
                (<code>connecteam_phase_b/connecteam-historical-payroll-dryrun-v1.xlsx</code>).
                Stafly numbers refresh live from <code>period_base_pay</code> +{" "}
                <code>imports</code>. Read-only — no writes, no commit, no delete.
              </span>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

function Stat({
  label,
  value,
}: {
  label: string;
  value: number | null;
}) {
  return (
    <div className="rounded-md border border-border bg-background px-2.5 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="font-mono tabular-nums text-sm">{value ?? "—"}</div>
    </div>
  );
}
