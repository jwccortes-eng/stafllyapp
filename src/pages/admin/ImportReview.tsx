import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { Building2, Inbox } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { FileSearch, Download, Copy, CheckCircle2, AlertTriangle, Info } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import type { ImportWarning, ImportWarningCode } from "@/lib/import/import-warnings";
import { buildReviewModel } from "@/lib/import-review/build-review-model";
import type { DiffStatus, ReviewModel, ReviewShift } from "@/lib/import-review/types";
import { reviewToCsv, downloadCsv } from "@/lib/import-review/csv-export";
import { downloadDiffXlsx } from "@/lib/import-review/xlsx-export";
import { downloadDiffPdf } from "@/lib/import-review/pdf-export";
import { downloadWeeklySchedule } from "@/lib/import-review/weekly-export";
import {
  WARNING_HUMAN_LABEL,
  WORKER_STATUS_HUMAN_LABEL,
  DIFF_STATUS_HUMAN_LABEL,
  workerStatusHelper,
} from "@/lib/import-review/labels";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";

type FilterKey =
  | "all"
  | "needs_review"
  | "possible_duplicate"
  | "missing_workers"
  | "location_issues"
  | "duplicate_workers"
  | "imported_accept"
  | "pay_ride"
  | "placeholder";

const STATUS_LABEL: Record<DiffStatus, string> = {
  matched_exact: "Matched exactly",
  matched_fallback: "Matched by fallback",
  would_create: "Would create new",
  possible_duplicate: "Possible duplicate",
  needs_review: "Needs review",
};

const STATUS_VARIANT: Record<DiffStatus, "default" | "secondary" | "destructive" | "outline"> = {
  matched_exact: "secondary",
  matched_fallback: "default",
  would_create: "outline",
  possible_duplicate: "destructive",
  needs_review: "destructive",
};

const WORKER_STATUS_LABEL: Record<string, string> = {
  matched: "Asignado",
  missing_in_stafly: "Falta en Stafly",
  extra_in_stafly: "Extra en Stafly",
  inactive_matched: "Inactivo detectado",
  placeholder: "Placeholder",
  imported_accept_only: "Importado/no confirmado",
  canonical_duplicate_resolved: "Duplicado resuelto",
  unmatched: "Sin match",
};

const SEVERITY_ICON = {
  info: Info,
  warn: AlertTriangle,
  error: AlertTriangle,
} as const;

function WarningChip({ w }: { w: ImportWarning }) {
  const Icon = SEVERITY_ICON[w.severity];
  const tone =
    w.severity === "error" ? "bg-destructive/10 text-destructive border-destructive/30" :
    w.severity === "warn" ? "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30" :
    "bg-muted text-muted-foreground border-border";
  return (
    <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-mono ${tone}`}>
      <Icon className="h-3 w-3" />{w.code}
    </span>
  );
}

function reviewedKey(batchId: string, sig: string) { return `import-review:${batchId}:${sig}`; }

export default function ImportReview() {
  const { selectedCompanyId, selectedCompany } = useCompany();
  const [batches, setBatches] = useState<Array<{ id: string; schedule_file_name: string | null; created_at: string }>>([]);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [model, setModel] = useState<ReviewModel | null>(null);
  const [loading, setLoading] = useState(false);
  const [openShift, setOpenShift] = useState<ReviewShift | null>(null);
  const [reviewedTick, setReviewedTick] = useState(0);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [clientFilter, setClientFilter] = useState<string>("");
  const [dateFilter, setDateFilter] = useState<string>("");
  const [weekFrom, setWeekFrom] = useState<string>("");
  const [weekTo, setWeekTo] = useState<string>("");
  const [exportingWeek, setExportingWeek] = useState(false);

  // Load recent dry-run batches
  useEffect(() => {
    if (!selectedCompanyId) return;
    (async () => {
      const { data } = await supabase
        .from("import_batches")
        .select("id, schedule_file_name, created_at")
        .eq("company_id", selectedCompanyId)
        .eq("status", "dry_run")
        .order("created_at", { ascending: false })
        .limit(10);
      setBatches(data ?? []);
      if (data?.[0] && !batchId) setBatchId(data[0].id);
    })();
  }, [selectedCompanyId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Build review model for selected batch
  useEffect(() => {
    if (!selectedCompanyId || !batchId) { setModel(null); return; }
    setLoading(true);
    (async () => {
      try {
        const [{ data: batch }, { data: normalized }, { data: raw }] = await Promise.all([
          supabase.from("import_batches").select("id, schedule_file_name, status, date_range_from, date_range_to, warnings").eq("id", batchId).maybeSingle(),
          supabase.from("normalized_schedule_rows").select("id, raw_row_id, matched_employee_id, employee_name_raw, employee_match_method, employee_match_confidence, work_date, start_time, end_time, client_name, location_name, shift_title, external_shift_id, notes").eq("batch_id", batchId).eq("company_id", selectedCompanyId),
          supabase.from("raw_schedule_import_rows").select("id, raw_data").eq("batch_id", batchId).eq("company_id", selectedCompanyId),
        ]);
        if (!batch) { setModel(null); return; }

        const from = batch.date_range_from || "1900-01-01";
        const to = batch.date_range_to || "2100-12-31";
        const [{ data: shifts }, { data: clients }, { data: locations }] = await Promise.all([
          supabase.from("scheduled_shifts").select("id, shift_code, date, start_time, end_time, slots, client_id, location_id, meeting_point, meeting_time").eq("company_id", selectedCompanyId).is("deleted_at", null).gte("date", from).lte("date", to),
          supabase.from("clients").select("id, name").eq("company_id", selectedCompanyId).is("deleted_at", null),
          supabase.from("locations").select("id, name").eq("company_id", selectedCompanyId).is("deleted_at", null),
        ]);

        const shiftIds = (shifts ?? []).map(s => s.id);
        let assignments: any[] = [];
        let employees: any[] = [];
        if (shiftIds.length) {
          const { data: a } = await supabase
            .from("shift_assignments")
            .select("shift_id, employee_id, employee:employees(first_name,last_name,employer_identification,is_active)")
            .in("shift_id", shiftIds);
          assignments = a ?? [];
        }
        const empIds = new Set<string>();
        (normalized ?? []).forEach(r => r.matched_employee_id && empIds.add(r.matched_employee_id));
        assignments.forEach(a => empIds.add(a.employee_id));
        if (empIds.size) {
          const { data: e } = await supabase
            .from("employees")
            .select("id, first_name, last_name, employer_identification, is_active, phone_number, email, user_id")
            .in("id", Array.from(empIds));
          employees = e ?? [];
        }

        const built = buildReviewModel({
          batch: batch as any,
          normalized: (normalized ?? []) as any,
          raw: (raw ?? []) as any,
          scheduledShifts: (shifts ?? []) as any,
          assignments: assignments as any,
          employees: employees as any,
          clients: (clients ?? []) as any,
          locations: (locations ?? []) as any,
        });
        setModel(built);
      } finally {
        setLoading(false);
      }
    })();
  }, [batchId, selectedCompanyId]);

  const reviewedSet = useMemo(() => {
    if (!model) return new Set<string>();
    const out = new Set<string>();
    for (const s of model.shifts) {
      if (localStorage.getItem(reviewedKey(model.batchId, s.signature)) === "1") out.add(s.signature);
    }
    return out;
  }, [model, reviewedTick]);

  const toggleReviewed = (sig: string) => {
    if (!model) return;
    const k = reviewedKey(model.batchId, sig);
    if (localStorage.getItem(k)) localStorage.removeItem(k); else localStorage.setItem(k, "1");
    setReviewedTick(t => t + 1);
  };

  const copyShiftSummary = (s: ReviewShift) => {
    const lines = [
      `# ${s.job ?? "Shift"} · ${s.date} · ${s.startTime}–${s.endTime}`,
      `Status: ${STATUS_LABEL[s.status]}`,
      s.staflyShiftId ? `Stafly: #${s.staflyShiftCode ?? "—"} (${s.staflyShiftId})` : "Stafly: (no match)",
      "",
      "Expected workers:",
      ...s.workers.filter(w => w.status !== "extra_in_stafly").map(w => `- ${w.displayName} [${w.status}]`),
      "",
      "Currently in Stafly:",
      ...s.staflyAssignedWorkers.map(w => `- ${w.name}`),
      "",
      `Address: ${s.sourceAddress ?? "—"}`,
      `Note: ${s.sourceNote ?? "—"}`,
      "",
      "Warnings:",
      ...s.warnings.map(w => `- ${w.code} (${w.severity})`),
    ].join("\n");
    navigator.clipboard.writeText(lines);
    toast({ title: "Copied", description: "Shift summary copied to clipboard." });
  };

  const exportCsv = () => {
    if (!model) return;
    downloadCsv(`import-review-${model.batchId.slice(0, 8)}.csv`, reviewToCsv(model));
  };

  const exportXlsx = async () => {
    if (!model) return;
    await downloadDiffXlsx(model, `import-review-${model.batchId.slice(0, 8)}.xlsx`);
  };

  const exportPdf = () => {
    if (!model) return;
    downloadDiffPdf(model, `import-review-${model.batchId.slice(0, 8)}.pdf`);
  };

  const exportWeek = async () => {
    if (!selectedCompanyId) return;
    const from = weekFrom || model?.dateRangeFrom || "";
    const to = weekTo || model?.dateRangeTo || "";
    if (!from || !to) {
      toast({ title: "Pick a range", description: "Select both From and To dates." });
      return;
    }
    setExportingWeek(true);
    try {
      await downloadWeeklySchedule({ companyId: selectedCompanyId, from, to });
      toast({ title: "Exported", description: `Weekly schedule ${from} → ${to}` });
    } catch (e: any) {
      toast({ title: "Export failed", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setExportingWeek(false);
    }
  };

  const filteredShifts = useMemo(() => {
    if (!model) return [];
    return model.shifts.filter(s => {
      if (clientFilter && !(s.job ?? "").toLowerCase().includes(clientFilter.toLowerCase())) return false;
      if (dateFilter && s.date !== dateFilter) return false;
      switch (filter) {
        case "all": return true;
        case "needs_review": return s.status === "needs_review";
        case "possible_duplicate": return s.status === "possible_duplicate";
        case "missing_workers": {
          const expectedIds = new Set(s.workers.filter(w => w.matchedEmployeeId).map(w => w.matchedEmployeeId));
          const staflyIds = new Set(s.staflyAssignedWorkers.map(w => w.employeeId));
          return [...expectedIds].some(id => id && !staflyIds.has(id));
        }
        case "location_issues": return s.location.willCreate || (!!s.sourceAddress && !s.location.currentLocationId);
        case "duplicate_workers": return s.warnings.some(w =>
          w.code === "MULTIPLE_ACTIVE_DUPLICATES_NEED_REVIEW" ||
          w.code === "EMPLOYEE_MATCHED_TO_CANONICAL_ACTIVE_DUPLICATE");
        case "imported_accept": return s.warnings.some(w => w.code === "IMPORTED_ACCEPT_NOT_STAFLY_RESPONSE");
        case "pay_ride": return s.warnings.some(w => w.code === "PAY_RIDE_DETECTED");
        case "placeholder": return s.warnings.some(w => w.code === "PLACEHOLDER_SYSTEM_EXCLUDED");
      }
    });
  }, [model, filter, clientFilter, dateFilter]);

  return (
    <div className="container mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <FileSearch className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Import Review</h1>
            <p className="text-sm text-muted-foreground">Read-only diff between Connecteam dry-run and current Stafly schedule</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={batchId ?? undefined} onValueChange={v => setBatchId(v)}>
            <SelectTrigger className="w-[360px]"><SelectValue placeholder="Select dry-run batch" /></SelectTrigger>
            <SelectContent>
              {batches.map(b => (
                <SelectItem key={b.id} value={b.id}>
                  {(b.schedule_file_name ?? b.id.slice(0, 8))} · {new Date(b.created_at).toLocaleString()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!model}>
            <Download className="h-4 w-4 mr-1" />CSV
          </Button>
          <Button variant="outline" size="sm" onClick={exportXlsx} disabled={!model}>
            <Download className="h-4 w-4 mr-1" />Diff XLSX
          </Button>
          <Button variant="outline" size="sm" onClick={exportPdf} disabled={!model}>
            <Download className="h-4 w-4 mr-1" />PDF
          </Button>
        </div>
      </div>

      {loading && <div className="space-y-2"><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></div>}

      {!loading && batches.length === 0 && (
        <Card className="mx-auto max-w-xl mt-8">
          <CardContent className="p-6 sm:p-8 flex flex-col items-center text-center gap-3">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
              <Inbox className="h-6 w-6 text-muted-foreground" />
            </div>
            <h2 className="text-lg font-semibold">No hay auditorías de importación para esta compañía</h2>
            <p className="text-sm text-muted-foreground max-w-md">
              Estás viendo la compañía activa actual. Los dry-runs de importación solo aparecen para la compañía donde fueron ejecutados.
            </p>
            {selectedCompany?.name && (
              <div className="inline-flex items-center gap-2 rounded-full border bg-muted/40 px-3 py-1 text-xs">
                <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">Compañía actual:</span>
                <span className="font-medium truncate max-w-[180px]">{selectedCompany.name}</span>
              </div>
            )}
            <p className="text-xs text-muted-foreground max-w-md">
              Para revisar los batches de Quality Staff, cambia a Quality Staff desde el selector de compañía y completa el código de confirmación.
            </p>
            <p className="text-xs text-muted-foreground">Luego vuelve a /app/import-review.</p>
          </CardContent>
        </Card>
      )}

      {!loading && batches.length > 0 && !batchId && (
        <Card className="mx-auto max-w-xl mt-8">
          <CardContent className="p-6 sm:p-8 flex flex-col items-center text-center gap-3">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
              <FileSearch className="h-6 w-6 text-muted-foreground" />
            </div>
            <h2 className="text-lg font-semibold">Selecciona una auditoría</h2>
            <p className="text-sm text-muted-foreground max-w-md">
              Elige un dry-run para comparar Connecteam vs Stafly.
            </p>
          </CardContent>
        </Card>
      )}

      {!loading && model && (
        <>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Summary · {model.fileName ?? model.batchId.slice(0, 8)} · {model.dateRangeFrom} → {model.dateRangeTo}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">{model.totalParsedShifts} parsed</Badge>
                <Badge variant="secondary">Matched exact: {model.totals.matchedExact}</Badge>
                <Badge>Matched fallback: {model.totals.matchedFallback}</Badge>
                <Badge variant="outline">Would create: {model.totals.wouldCreate}</Badge>
                <Badge variant="destructive">Possible duplicate: {model.totals.possibleDuplicate}</Badge>
                <Badge variant="destructive">Needs review: {model.totals.needsReview}</Badge>
              </div>
              <div className="flex flex-wrap gap-1 pt-1">
                {Object.entries(model.warningCounts).sort((a, b) => b[1] - a[1]).map(([code, n]) => (
                  <span key={code} className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-mono bg-muted/50">
                    {code} · {n}
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Weekly Stafly Export</CardTitle></CardHeader>
            <CardContent className="flex flex-wrap items-end gap-2 text-sm">
              <div>
                <label className="text-xs text-muted-foreground">From</label>
                <Input type="date" value={weekFrom || (model?.dateRangeFrom ?? "")} onChange={e => setWeekFrom(e.target.value)} className="h-8 w-40" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">To</label>
                <Input type="date" value={weekTo || (model?.dateRangeTo ?? "")} onChange={e => setWeekTo(e.target.value)} className="h-8 w-40" />
              </div>
              <Button size="sm" variant="outline" onClick={exportWeek} disabled={exportingWeek || !selectedCompanyId}>
                <Download className="h-4 w-4 mr-1" />{exportingWeek ? "Exporting…" : "Export week XLSX"}
              </Button>
              <p className="text-xs text-muted-foreground ml-auto">Plan hours only — not payroll/worked hours.</p>
            </CardContent>
          </Card>

          <Tabs defaultValue="shifts">
            <TabsList>
              <TabsTrigger value="shifts">Shifts ({filteredShifts.length}/{model.shifts.length})</TabsTrigger>
              <TabsTrigger value="warnings">Warnings ({Object.values(model.warningCounts).reduce((a, b) => a + b, 0)})</TabsTrigger>
            </TabsList>

            <TabsContent value="shifts" className="space-y-2">
              <Card>
                <CardContent className="p-3 flex flex-wrap items-end gap-2">
                  <Select value={filter} onValueChange={v => setFilter(v as FilterKey)}>
                    <SelectTrigger className="h-8 w-[200px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="needs_review">Needs review</SelectItem>
                      <SelectItem value="possible_duplicate">Possible duplicates</SelectItem>
                      <SelectItem value="missing_workers">Missing workers</SelectItem>
                      <SelectItem value="location_issues">Location issues</SelectItem>
                      <SelectItem value="duplicate_workers">Duplicate workers</SelectItem>
                      <SelectItem value="imported_accept">Imported accept</SelectItem>
                      <SelectItem value="pay_ride">PAY RIDE</SelectItem>
                      <SelectItem value="placeholder">Placeholders</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input placeholder="Client contains…" value={clientFilter} onChange={e => setClientFilter(e.target.value)} className="h-8 w-56" />
                  <Input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)} className="h-8 w-40" />
                  <Button variant="ghost" size="sm" onClick={() => { setFilter("all"); setClientFilter(""); setDateFilter(""); }}>Clear</Button>
                </CardContent>
              </Card>

              {filteredShifts.map(s => {
                const reviewed = reviewedSet.has(s.signature);
                return (
                  <Card key={s.signature} className={reviewed ? "opacity-60" : ""}>
                    <CardContent className="p-3 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs text-muted-foreground">{s.date}</span>
                          <span className="font-medium truncate">{s.job ?? "—"}</span>
                          <span className="text-sm text-muted-foreground">{s.startTime}–{s.endTime}</span>
                          {s.sourceShiftCode && <span className="font-mono text-xs">#{s.sourceShiftCode}</span>}
                          {s.staflyShiftCode && s.staflyShiftCode !== s.sourceShiftCode && (
                            <span className="font-mono text-xs text-primary">→ Stafly #{s.staflyShiftCode}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 mt-1 flex-wrap">
                          <Badge variant={STATUS_VARIANT[s.status]}>{STATUS_LABEL[s.status]}</Badge>
                          <span className="text-xs text-muted-foreground">{s.workers.filter(w => w.status !== "extra_in_stafly").length} workers</span>
                          {s.warnings.slice(0, 4).map((w, i) => <WarningChip key={i} w={w} />)}
                          {s.warnings.length > 4 && <span className="text-xs text-muted-foreground">+{s.warnings.length - 4}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" onClick={() => copyShiftSummary(s)} title="Copy summary"><Copy className="h-4 w-4" /></Button>
                        <Button variant={reviewed ? "secondary" : "ghost"} size="sm" onClick={() => toggleReviewed(s.signature)} title="Mark reviewed">
                          <CheckCircle2 className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setOpenShift(s)}>View</Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
              {filteredShifts.length === 0 && <p className="text-sm text-muted-foreground p-4 text-center">No shifts match the current filter.</p>}
            </TabsContent>

            <TabsContent value="warnings" className="space-y-2">
              {Object.entries(model.warningCounts).sort((a, b) => b[1] - a[1]).map(([code, n]) => {
                const items = model.shifts.flatMap(s => s.warnings.filter(w => w.code === code).map(w => ({ s, w })));
                return (
                  <Card key={code}>
                    <CardHeader className="pb-1">
                      <CardTitle className="text-xs font-mono flex items-center gap-2">
                        {code}
                        <Badge variant="outline">{n}</Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-1 text-xs">
                      {items.slice(0, 25).map(({ s, w }, i) => (
                        <div key={i} className="flex items-start gap-2 py-1 border-b last:border-0">
                          <span className="font-mono text-muted-foreground w-44 shrink-0">{s.date} {s.startTime}–{s.endTime}</span>
                          <span className="flex-1 truncate">{s.job ?? "—"}{w.raw_employee_name ? ` · ${w.raw_employee_name}` : ""}</span>
                          <Button variant="ghost" size="sm" className="h-6 px-2" onClick={() => setOpenShift(s)}>Open</Button>
                        </div>
                      ))}
                      {items.length > 25 && <p className="text-muted-foreground">+{items.length - 25} more…</p>}
                    </CardContent>
                  </Card>
                );
              })}
              {Object.keys(model.warningCounts).length === 0 && <p className="text-sm text-muted-foreground p-4 text-center">No warnings in this batch.</p>}
            </TabsContent>
          </Tabs>
        </>
      )}

      <Sheet open={!!openShift} onOpenChange={o => !o && setOpenShift(null)}>
        <SheetContent className="w-full sm:max-w-3xl overflow-y-auto">
          {openShift && (
            <>
              <SheetHeader>
                <SheetTitle>{openShift.job ?? "Shift"} · {openShift.date} · {openShift.startTime}–{openShift.endTime}</SheetTitle>
              </SheetHeader>
              <div className="space-y-4 mt-4 text-sm">
                <div className="grid grid-cols-3 gap-3">
                  <Card><CardHeader className="pb-2"><CardTitle className="text-xs uppercase text-muted-foreground">Connecteam</CardTitle></CardHeader>
                    <CardContent className="space-y-1 text-xs">
                      <div>Title: <span className="font-mono">{openShift.sourceShiftTitle ?? "—"}</span></div>
                      <div>Code: <span className="font-mono">{openShift.sourceShiftCode ?? "—"}</span></div>
                      <div>Address: {openShift.sourceAddress ?? "—"}</div>
                      <div>Note: {openShift.sourceNote ?? "—"}</div>
                    </CardContent>
                  </Card>
                  <Card><CardHeader className="pb-2"><CardTitle className="text-xs uppercase text-muted-foreground">Stafly</CardTitle></CardHeader>
                    <CardContent className="space-y-1 text-xs">
                      <div>Shift: <span className="font-mono">{openShift.staflyShiftCode ? `#${openShift.staflyShiftCode}` : "—"}</span></div>
                      <div className="font-mono text-[10px] text-muted-foreground break-all">{openShift.staflyShiftId ?? "—"}</div>
                      <div>Slots: {openShift.staflySlots ?? "—"}</div>
                      <div>Client: {openShift.staflyClientName ?? "—"}</div>
                      <div>Location: {openShift.location.currentLocationName ?? "—"}</div>
                      <div>Meeting: {openShift.note.currentMeetingPoint ?? "—"} {openShift.note.currentMeetingTime ?? ""}</div>
                    </CardContent>
                  </Card>
                  <Card><CardHeader className="pb-2"><CardTitle className="text-xs uppercase text-muted-foreground">Proposal</CardTitle></CardHeader>
                    <CardContent className="space-y-1 text-xs">
                      <div><Badge variant={STATUS_VARIANT[openShift.status]}>{STATUS_LABEL[openShift.status]}</Badge></div>
                      <div>Location: {openShift.location.preserved ? "Preserve current" : openShift.location.willCreate ? "Create job-site" : "—"}</div>
                      <div>Note: {openShift.note.preserved ? "Preserve current" : openShift.note.parsed ? `Parse → ${openShift.note.parsed.meetingPoint ?? "—"} @ ${openShift.note.parsed.meetingTime ?? "—"}` : openShift.note.needsReview ? "Needs review" : "—"}</div>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-xs uppercase text-muted-foreground">Workers</CardTitle></CardHeader>
                  <CardContent className="space-y-1">
                    {openShift.workers.map((w, i) => {
                      const variant: "default" | "secondary" | "destructive" | "outline" =
                        w.status === "matched" ? "secondary"
                        : w.status === "canonical_duplicate_resolved" ? "default"
                        : w.status === "extra_in_stafly" ? "outline"
                        : "destructive";
                      return (
                        <div key={i} className="flex items-center gap-2 py-1 border-b last:border-0 text-xs flex-wrap">
                          <span className="flex-1 min-w-0">
                            {w.rawName && w.rawName !== w.displayName && (
                              <span className="text-muted-foreground">{w.rawName} → </span>
                            )}
                            {w.displayName} {w.employerId && <span className="font-mono text-muted-foreground">#{w.employerId}</span>}
                            {w.status === "canonical_duplicate_resolved" && w.sourceMatchedEmployerId && (
                              <span className="ml-2 font-mono text-[10px] text-muted-foreground">
                                (source matched {w.sourceMatchedReason ?? ""} #{w.sourceMatchedEmployerId})
                              </span>
                            )}
                          </span>
                          <Badge variant={variant} className="text-[10px]">{WORKER_STATUS_LABEL[w.status] ?? w.status}</Badge>
                          {w.warnings.map((ww, j) => <WarningChip key={j} w={ww} />)}
                        </div>
                      );
                    })}
                    {openShift.workers.length === 0 && <p className="text-xs text-muted-foreground">No workers.</p>}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-xs uppercase text-muted-foreground">Warnings ({openShift.warnings.length})</CardTitle></CardHeader>
                  <CardContent className="space-y-1">
                    {openShift.warnings.map((w, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs py-1">
                        <WarningChip w={w} />
                        <div className="flex-1">
                          {w.raw_employee_name && <div className="text-muted-foreground">{w.raw_employee_name}</div>}
                          <div>{w.recommended_action}</div>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
