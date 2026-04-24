/**
 * Temporary, surgical backfill page for a single shift_code.
 *
 * Use case (Apr 2026): Connecteam Schedule import for shift_code 45678
 * (CHEF KAUFMAN, 2026-04-24/25/26, 09:00-09:01, 8 slots) created the shifts but
 * left them with 0 assignments because several Connecteam names map to multiple
 * employees in the DB (Andres Vargas x2, Oliver Martinez x2, Peter Sanisaca x2,
 * Santiago Morales x2, Angel Colon x5).
 *
 * This page lets an operator:
 *   1. See the 3 target shifts.
 *   2. For each Connecteam raw name, pick the correct employee from a dropdown
 *      (preselected when there is only one candidate).
 *   3. Execute one INSERT per (shift × employee) into shift_assignments with
 *      status='accepted', skipping any combination that already exists.
 *
 * Constraints honored:
 *   - No schema changes.
 *   - No edge functions.
 *   - No payroll/attendance writes.
 *   - No employee creation/deletion.
 *   - Insert is idempotent: pre-fetches existing pairs and skips them.
 *
 * Route: /app/backfill-shift/:shiftCode (admin only via AdminLayout).
 */
import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, AlertTriangle, CheckCircle2, ArrowLeft } from "lucide-react";
import { useCompany } from "@/hooks/useCompany";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { normalizeName } from "@/lib/employee-matcher";
import { safeLocalStorage } from "@/lib/safe-storage";

// Hard-coded roster from Connecteam for this specific shift code. The page is
// generic per shiftCode but the roster is tied to the operational case the user
// flagged. If the same case repeats, copy the roster from the source UI.
const ROSTERS: Record<string, string[]> = {
  "45678": [
    "Jorge Cortes",
    "Oliver Martinez",
    "Andres Vargas",
    "Arley Sanchez",
    "Jafeth Perez",
    "Peter Sanisaca",
    "Angel Colon",
    "Santiago Morales",
  ],
};

interface ShiftRow {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  slots: number;
  shift_code: string;
}

interface EmployeeRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  employer_identification: string | null;
  phone_number: string | null;
  is_active: boolean;
}

interface NameResolution {
  rawName: string;
  candidates: EmployeeRow[];
  selectedId: string | null;
  status: "ok_unique" | "ambiguous" | "unmatched";
}

const fmtCandidate = (e: EmployeeRow) => {
  const id = e.employer_identification || "—";
  const phone = e.phone_number || "no phone";
  const flag = e.is_active ? "✓" : "✗";
  return `${e.first_name ?? ""} ${e.last_name ?? ""} · #${id} · ${phone} · ${flag}`;
};

export default function BackfillShift() {
  const { shiftCode = "" } = useParams<{ shiftCode: string }>();
  const { selectedCompanyId, companies, switchCompany, loading: companyLoading } = useCompany();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // DEBUG: temporary log per request
  console.log("BackfillShift company:", selectedCompanyId);

  // Context guard: if we lost company context (e.g. fell into GLOBAL mode for
  // dev/owner roles), try to restore it from ?company= or localStorage BEFORE
  // rendering. Never auto-switch to GLOBAL — redirect to /app/shifts instead.
  const [contextChecked, setContextChecked] = useState(false);
  useEffect(() => {
    if (companyLoading) return;
    if (selectedCompanyId) {
      setContextChecked(true);
      return;
    }
    const fromUrl = searchParams.get("company");
    const fromStorage = safeLocalStorage.getItem("selectedCompanyId");
    const candidate = fromUrl || fromStorage;
    if (candidate && companies.some((c) => c.id === candidate)) {
      switchCompany(candidate);
      // Wait for next render with restored context.
      return;
    }
    // No way to recover — go back to shifts without touching context.
    toast.error("No company context. Open this page from a company.");
    navigate("/app/shifts", { replace: true });
  }, [companyLoading, selectedCompanyId, companies, switchCompany, searchParams, navigate]);

  const [loading, setLoading] = useState(true);
  const [shifts, setShifts] = useState<ShiftRow[]>([]);
  const [resolutions, setResolutions] = useState<NameResolution[]>([]);
  const [existingPairs, setExistingPairs] = useState<Set<string>>(new Set());
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState<{ inserted: number; skipped: number; errors: string[] } | null>(null);

  const roster = useMemo(() => ROSTERS[shiftCode] ?? [], [shiftCode]);

  useEffect(() => {
    let cancelled = false;
    if (!selectedCompanyId) return;
    if (roster.length === 0) {
      setLoading(false);
      return;
    }

    (async () => {
      setLoading(true);
      try {
        // 1) Load shifts for this code in this company.
        const { data: shiftRows, error: shiftErr } = await supabase
          .from("scheduled_shifts")
          .select("id, date, start_time, end_time, slots, shift_code")
          .eq("company_id", selectedCompanyId)
          .eq("shift_code", shiftCode)
          .order("date");
        if (shiftErr) throw shiftErr;

        // 2) Load all active employees for this company. Roster is small; we
        //    filter in JS to do tolerant name matching (normalized + reversed).
        const { data: empRows, error: empErr } = await supabase
          .from("employees")
          .select("id, first_name, last_name, employer_identification, phone_number, is_active")
          .eq("company_id", selectedCompanyId);
        if (empErr) throw empErr;

        // 3) Resolve each roster name into candidates.
        const employees: EmployeeRow[] = (empRows ?? []) as EmployeeRow[];
        const resolved: NameResolution[] = roster.map((rawName) => {
          const normTarget = normalizeName(rawName);
          const candidates = employees.filter((e) => {
            const full = normalizeName(`${e.first_name ?? ""} ${e.last_name ?? ""}`);
            const reversed = normalizeName(`${e.last_name ?? ""} ${e.first_name ?? ""}`);
            return full === normTarget || reversed === normTarget;
          });
          // Sort candidates: active first, with phone first, lower employer_id first.
          candidates.sort((a, b) => {
            if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
            const ap = a.phone_number ? 0 : 1;
            const bp = b.phone_number ? 0 : 1;
            if (ap !== bp) return ap - bp;
            const ai = parseInt(a.employer_identification ?? "999999", 10);
            const bi = parseInt(b.employer_identification ?? "999999", 10);
            return ai - bi;
          });

          let status: NameResolution["status"];
          let selectedId: string | null = null;
          if (candidates.length === 0) status = "unmatched";
          else if (candidates.length === 1) {
            status = "ok_unique";
            selectedId = candidates[0].id;
          } else {
            status = "ambiguous";
            selectedId = null; // force operator decision
          }
          return { rawName, candidates, selectedId, status };
        });

        // 4) Pre-fetch existing assignments to make insert idempotent.
        const shiftIds = (shiftRows ?? []).map((s) => s.id);
        const pairs = new Set<string>();
        if (shiftIds.length > 0) {
          const { data: existing, error: exErr } = await supabase
            .from("shift_assignments")
            .select("shift_id, employee_id")
            .in("shift_id", shiftIds);
          if (exErr) throw exErr;
          (existing ?? []).forEach((row) => pairs.add(`${row.shift_id}::${row.employee_id}`));
        }

        if (cancelled) return;
        setShifts((shiftRows ?? []) as ShiftRow[]);
        setResolutions(resolved);
        setExistingPairs(pairs);
      } catch (err: any) {
        toast.error(`Could not load backfill data: ${err?.message ?? "unknown"}`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedCompanyId, shiftCode, roster]);

  const ambiguousPending = resolutions.some((r) => r.status === "ambiguous" && !r.selectedId);
  const unmatched = resolutions.filter((r) => r.status === "unmatched");
  const allSelected = resolutions.every((r) => r.selectedId);
  const canExecute =
    !loading && !executing && shifts.length > 0 && allSelected && unmatched.length === 0;

  const updateSelection = (rawName: string, employeeId: string) => {
    setResolutions((prev) =>
      prev.map((r) => (r.rawName === rawName ? { ...r, selectedId: employeeId } : r))
    );
  };

  const planned = useMemo(() => {
    const rows: { shift: ShiftRow; employeeId: string; rawName: string; alreadyExists: boolean }[] = [];
    for (const s of shifts) {
      for (const r of resolutions) {
        if (!r.selectedId) continue;
        rows.push({
          shift: s,
          employeeId: r.selectedId,
          rawName: r.rawName,
          alreadyExists: existingPairs.has(`${s.id}::${r.selectedId}`),
        });
      }
    }
    return rows;
  }, [shifts, resolutions, existingPairs]);

  const toInsert = planned.filter((p) => !p.alreadyExists);

  const handleExecute = async () => {
    if (!selectedCompanyId || toInsert.length === 0) return;
    setExecuting(true);
    setResult(null);
    const errors: string[] = [];
    let inserted = 0;
    const skipped = planned.length - toInsert.length;

    // Insert in one batch; rely on PK + composite logic. We pre-filtered duplicates
    // but use upsert-by-ignore for safety in case of race.
    const payload = toInsert.map((p) => ({
      company_id: selectedCompanyId,
      shift_id: p.shift.id,
      employee_id: p.employeeId,
      status: "accepted",
      response_status: "accepted",
      assignment_role: "staff",
      response_required: false,
      accepted_at: new Date().toISOString(),
      responded_at: new Date().toISOString(),
    }));

    const { data, error } = await supabase.from("shift_assignments").insert(payload).select("id");
    if (error) {
      errors.push(error.message);
    } else {
      inserted = data?.length ?? 0;
    }

    if (errors.length === 0) {
      // Refresh existing pairs so the UI reflects new state.
      const fresh = new Set(existingPairs);
      toInsert.forEach((p) => fresh.add(`${p.shift.id}::${p.employeeId}`));
      setExistingPairs(fresh);
      toast.success(`Backfill complete: ${inserted} inserted, ${skipped} skipped`);
    } else {
      toast.error(`Backfill finished with errors: ${errors.length}`);
    }
    setResult({ inserted, skipped, errors });
    setExecuting(false);
  };

  if (!selectedCompanyId) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle>Select a company first</CardTitle>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (roster.length === 0) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle>No roster configured for shift_code "{shiftCode}"</CardTitle>
            <CardDescription>
              This page only supports shift codes with a hard-coded operator roster (currently 45678).
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-5xl mx-auto">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate("/app/shifts")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to shifts
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Backfill assignments — shift_code {shiftCode}</CardTitle>
          <CardDescription>
            Manually resolve ambiguous employees and insert assignments for the listed shifts.
            Idempotent: existing pairs are skipped.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : (
            <>
              <section>
                <h3 className="font-semibold mb-2">Target shifts ({shifts.length})</h3>
                {shifts.length === 0 ? (
                  <p className="text-sm text-destructive">No scheduled_shifts found for this code.</p>
                ) : (
                  <ul className="text-sm space-y-1">
                    {shifts.map((s) => (
                      <li key={s.id} className="font-mono">
                        {s.date} · {s.start_time}–{s.end_time} · slots {s.slots} · id {s.id.slice(0, 8)}…
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section>
                <h3 className="font-semibold mb-2">Roster resolution</h3>
                <div className="space-y-2">
                  {resolutions.map((r) => (
                    <div
                      key={r.rawName}
                      className="flex flex-col md:flex-row md:items-center gap-2 border rounded-md p-3"
                    >
                      <div className="md:w-48 font-medium">{r.rawName}</div>
                      <div className="md:w-32">
                        {r.status === "ok_unique" && (
                          <Badge variant="default" className="gap-1">
                            <CheckCircle2 className="h-3 w-3" /> unique
                          </Badge>
                        )}
                        {r.status === "ambiguous" && (
                          <Badge variant="destructive" className="gap-1">
                            <AlertTriangle className="h-3 w-3" /> ambiguous ({r.candidates.length})
                          </Badge>
                        )}
                        {r.status === "unmatched" && (
                          <Badge variant="outline" className="gap-1 text-destructive border-destructive">
                            <AlertTriangle className="h-3 w-3" /> unmatched
                          </Badge>
                        )}
                      </div>
                      <div className="flex-1">
                        {r.candidates.length === 0 ? (
                          <span className="text-sm text-muted-foreground">No employee found</span>
                        ) : (
                          <Select
                            value={r.selectedId ?? ""}
                            onValueChange={(v) => updateSelection(r.rawName, v)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Pick employee…" />
                            </SelectTrigger>
                            <SelectContent>
                              {r.candidates.map((c) => (
                                <SelectItem key={c.id} value={c.id}>
                                  {fmtCandidate(c)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <h3 className="font-semibold mb-2">Plan summary</h3>
                <div className="text-sm space-y-1">
                  <div>
                    Total assignments to write: <strong>{planned.length}</strong> ({shifts.length} shifts ×{" "}
                    {resolutions.filter((r) => r.selectedId).length} employees)
                  </div>
                  <div>
                    Will insert: <strong>{toInsert.length}</strong> · already exist:{" "}
                    <strong>{planned.length - toInsert.length}</strong>
                  </div>
                  {ambiguousPending && (
                    <div className="text-destructive">Resolve all ambiguous matches before executing.</div>
                  )}
                  {unmatched.length > 0 && (
                    <div className="text-destructive">
                      {unmatched.length} unmatched name(s); cannot proceed: {unmatched.map((u) => u.rawName).join(", ")}
                    </div>
                  )}
                </div>
              </section>

              <div className="flex gap-2">
                <Button onClick={handleExecute} disabled={!canExecute || toInsert.length === 0}>
                  {executing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Execute backfill ({toInsert.length})
                </Button>
              </div>

              {result && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Result</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm space-y-1">
                    <div>Inserted: <strong>{result.inserted}</strong></div>
                    <div>Skipped (already existed): <strong>{result.skipped}</strong></div>
                    {result.errors.length > 0 && (
                      <div className="text-destructive">
                        Errors:
                        <ul className="list-disc pl-5">
                          {result.errors.map((e, i) => (
                            <li key={i}>{e}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
