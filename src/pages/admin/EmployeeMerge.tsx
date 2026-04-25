/**
 * Employee Merge Tool — /app/employees/merge
 *
 * Lets an admin/owner consolidate duplicate worker records into a single
 * master profile. Read-only discovery + RPC-based merge — all the heavy
 * lifting happens server-side in `merge_employees(...)`. The UI's job is:
 *
 *   1. Surface duplicate groups (phone / email / normalized name).
 *   2. Let the operator pick the master and which records to fold in.
 *   3. Show a side-by-side preview so they understand what will change.
 *   4. Enforce typed-name confirmation before firing the RPC.
 *   5. Render a clean post-merge summary.
 *
 * Hard guards already live in the database (cross-company, locked payroll,
 * permission, audit log, soft-archive + write-block trigger) — this page
 * trusts them and surfaces friendly messages when they fire.
 */

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  ShieldCheck,
  Users,
  ArrowRight,
  Phone,
  Mail,
  UserCircle2,
  Activity,
  Lock,
} from "lucide-react";

// ---------- Types ----------------------------------------------------------

interface DuplicateGroup {
  group_key: string;
  match_type: "phone" | "email" | "name";
  employee_ids: string[];
}

interface EmployeeRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone_number: string | null;
  email: string | null;
  employer_identification: string | null;
  avatar_url: string | null;
  user_id: string | null;
  is_active: boolean;
  profile_status: string | null;
  onboarding_status: string | null;
  created_at: string;
  merged_into_employee_id: string | null;
  shift_count?: number;
  time_entry_count?: number;
  payroll_locked?: boolean;
}

interface MergeSummary {
  success: boolean;
  master_id: string;
  master_name: string;
  merged_count: number;
  details: Array<{
    duplicate_id: string;
    duplicate_name: string;
    moved: Record<string, number | string>;
  }>;
}

// ---------- Helpers --------------------------------------------------------

const matchTypeLabel = (t: DuplicateGroup["match_type"]) =>
  t === "phone" ? "Same phone" : t === "email" ? "Same email" : "Same name";

const matchTypeIcon = (t: DuplicateGroup["match_type"]) =>
  t === "phone" ? Phone : t === "email" ? Mail : UserCircle2;

const fullName = (e: EmployeeRow) =>
  `${e.first_name ?? ""} ${e.last_name ?? ""}`.trim() || "Unnamed";

// ---------- Page -----------------------------------------------------------

export default function EmployeeMerge() {
  const { selectedCompanyId } = useCompany();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [loadingGroups, setLoadingGroups] = useState(false);
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  const [employeesById, setEmployeesById] = useState<Record<string, EmployeeRow>>({});

  const [activeGroupKey, setActiveGroupKey] = useState<string | null>(null);
  const [masterId, setMasterId] = useState<string | null>(null);
  const [duplicateIds, setDuplicateIds] = useState<Set<string>>(new Set());

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [reason, setReason] = useState("");
  const [merging, setMerging] = useState(false);

  const [postMergeSummary, setPostMergeSummary] = useState<MergeSummary | null>(null);

  // ---------- Loaders ------------------------------------------------------

  useEffect(() => {
    if (!selectedCompanyId) return;
    void loadDuplicateGroups();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCompanyId]);

  async function loadDuplicateGroups() {
    if (!selectedCompanyId) return;
    setLoadingGroups(true);
    setActiveGroupKey(null);
    setMasterId(null);
    setDuplicateIds(new Set());

    try {
      const { data, error } = await supabase.rpc("find_employee_duplicate_groups", {
        _company_id: selectedCompanyId,
      });
      if (error) throw error;

      const grouped: DuplicateGroup[] = (data ?? []) as DuplicateGroup[];
      setGroups(grouped);

      // Pre-load every employee referenced by any group, plus per-id stats.
      const allIds = Array.from(
        new Set(grouped.flatMap((g) => g.employee_ids)),
      );
      if (allIds.length === 0) {
        setEmployeesById({});
        return;
      }

      const { data: emps, error: empErr } = await supabase
        .from("employees")
        .select(
          "id, first_name, last_name, phone_number, email, employer_identification, avatar_url, user_id, is_active, profile_status, onboarding_status, created_at, merged_into_employee_id",
        )
        .in("id", allIds);
      if (empErr) throw empErr;

      const byId: Record<string, EmployeeRow> = {};
      for (const e of emps ?? []) byId[e.id] = e as EmployeeRow;

      // Lightweight stats per employee — counts of shift assignments,
      // time entries, and a payroll-locked check via the SQL helper.
      await Promise.all(
        allIds.map(async (id) => {
          const [shifts, entries, locked] = await Promise.all([
            supabase
              .from("shift_assignments")
              .select("id", { count: "exact", head: true })
              .eq("employee_id", id),
            supabase
              .from("time_entries")
              .select("id", { count: "exact", head: true })
              .eq("employee_id", id),
            supabase.rpc("employee_has_locked_payroll", { _employee_id: id }),
          ]);
          if (byId[id]) {
            byId[id].shift_count = shifts.count ?? 0;
            byId[id].time_entry_count = entries.count ?? 0;
            byId[id].payroll_locked = !!locked.data;
          }
        }),
      );

      setEmployeesById({ ...byId });
    } catch (err: any) {
      console.error("[EmployeeMerge] loadDuplicateGroups failed", err);
      toast({
        title: "Could not load duplicate groups",
        description: err?.message ?? "Unexpected error",
        variant: "destructive",
      });
    } finally {
      setLoadingGroups(false);
    }
  }

  // ---------- Derived ------------------------------------------------------

  const activeGroup = useMemo(
    () => groups.find((g) => `${g.match_type}:${g.group_key}` === activeGroupKey) ?? null,
    [groups, activeGroupKey],
  );

  const groupEmployees: EmployeeRow[] = useMemo(() => {
    if (!activeGroup) return [];
    return activeGroup.employee_ids
      .map((id) => employeesById[id])
      .filter((e): e is EmployeeRow => !!e);
  }, [activeGroup, employeesById]);

  const master = masterId ? employeesById[masterId] ?? null : null;
  const selectedDuplicates = Array.from(duplicateIds)
    .map((id) => employeesById[id])
    .filter((e): e is EmployeeRow => !!e);

  const anyDuplicateLocked = selectedDuplicates.some((d) => d.payroll_locked);

  // ---------- Actions ------------------------------------------------------

  function chooseGroup(g: DuplicateGroup) {
    const key = `${g.match_type}:${g.group_key}`;
    setActiveGroupKey(key);
    setMasterId(null);
    setDuplicateIds(new Set());
  }

  function chooseMaster(id: string) {
    setMasterId(id);
    // Reset duplicates that include the new master
    setDuplicateIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  function toggleDuplicate(id: string) {
    if (id === masterId) return;
    setDuplicateIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openConfirm() {
    if (!master || duplicateIds.size === 0) return;
    setConfirmName("");
    setReason("");
    setConfirmOpen(true);
  }

  async function executeMerge() {
    if (!master || duplicateIds.size === 0) return;
    setMerging(true);
    try {
      const { data, error } = await supabase.rpc("merge_employees", {
        _master_id: master.id,
        _duplicate_ids: Array.from(duplicateIds),
        _confirm_master_name: confirmName,
        _reason: reason || null,
      });
      if (error) throw error;

      const summary = data as unknown as MergeSummary;
      setPostMergeSummary(summary);
      setConfirmOpen(false);
      toast({
        title: "Merge completed",
        description: `${summary.merged_count} record(s) consolidated into ${summary.master_name}.`,
      });
      // Refresh — the duplicates should disappear from future groupings.
      await loadDuplicateGroups();
    } catch (err: any) {
      const raw = err?.message ?? "Unknown error";
      const friendly = humanizeMergeError(raw);
      toast({
        title: "Merge failed",
        description: friendly,
        variant: "destructive",
      });
    } finally {
      setMerging(false);
    }
  }

  // ---------- Render -------------------------------------------------------

  return (
    <div className="space-y-6 p-4 md:p-6">
      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <Users className="h-7 w-7 text-primary" />
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
            Merge duplicate employees
          </h1>
        </div>
        <p className="text-sm text-muted-foreground max-w-2xl">
          Consolidate duplicate worker records into a single master profile.
          Operational data (shifts, clock-ins, open payroll) is moved over,
          conflicting records are dropped, and the duplicate is archived
          and locked against future writes. Closed payroll periods are
          protected — the merge will refuse to proceed if any duplicate has
          base pay or movements in a closed/published/paid period.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-6">
        {/* ---- Left: groups list ------------------------------------- */}
        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-base">Detected groups</CardTitle>
            <CardDescription>
              {loadingGroups
                ? "Scanning…"
                : groups.length === 0
                  ? "No duplicates found in this company."
                  : `${groups.length} group${groups.length === 1 ? "" : "s"} need review`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {loadingGroups && (
              <>
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
              </>
            )}
            {!loadingGroups && groups.length === 0 && (
              <Alert>
                <CheckCircle2 className="h-4 w-4" />
                <AlertTitle>All clean</AlertTitle>
                <AlertDescription>
                  No duplicate phone, email or name groups detected.
                </AlertDescription>
              </Alert>
            )}
            {groups.map((g) => {
              const key = `${g.match_type}:${g.group_key}`;
              const Icon = matchTypeIcon(g.match_type);
              const isActive = activeGroupKey === key;
              const previewIds = g.employee_ids.slice(0, 3);
              const previewNames = previewIds
                .map((id) => employeesById[id])
                .filter(Boolean)
                .map((e) => fullName(e!))
                .join(", ");
              return (
                <button
                  key={key}
                  onClick={() => chooseGroup(g)}
                  className={`w-full text-left rounded-lg border p-3 transition-colors ${
                    isActive
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-muted/40"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {matchTypeLabel(g.match_type)}
                      </span>
                    </div>
                    <Badge variant="secondary">{g.employee_ids.length}</Badge>
                  </div>
                  <p className="text-sm font-medium truncate">
                    {previewNames || g.group_key}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {g.match_type === "phone"
                      ? `+${g.group_key}`
                      : g.match_type === "email"
                        ? g.group_key
                        : "Normalized name match"}
                  </p>
                </button>
              );
            })}
          </CardContent>
        </Card>

        {/* ---- Right: workspace -------------------------------------- */}
        <div className="space-y-4">
          {!activeGroup && (
            <Card>
              <CardContent className="p-10 text-center text-muted-foreground">
                Select a group on the left to start a merge.
              </CardContent>
            </Card>
          )}

          {activeGroup && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    Pick the master profile
                  </CardTitle>
                  <CardDescription>
                    The master keeps its data on every conflict. Empty fields on
                    the master will be back-filled from the duplicates.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <RadioGroup
                    value={masterId ?? ""}
                    onValueChange={chooseMaster}
                    className="space-y-2"
                  >
                    {groupEmployees.map((e) => (
                      <EmployeeChoiceRow
                        key={e.id}
                        employee={e}
                        kind="master"
                        selected={masterId === e.id}
                      />
                    ))}
                  </RadioGroup>
                </CardContent>
              </Card>

              {master && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">
                      Pick records to merge into{" "}
                      <span className="text-primary">{fullName(master)}</span>
                    </CardTitle>
                    <CardDescription>
                      All shifts, clock-ins, open payroll and notifications from
                      the selected duplicates will be re-pointed to the master.
                      Each duplicate will be archived and write-locked.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {groupEmployees
                      .filter((e) => e.id !== master.id)
                      .map((e) => (
                        <EmployeeChoiceRow
                          key={e.id}
                          employee={e}
                          kind="duplicate"
                          selected={duplicateIds.has(e.id)}
                          onToggle={() => toggleDuplicate(e.id)}
                        />
                      ))}
                  </CardContent>
                </Card>
              )}

              {master && duplicateIds.size > 0 && (
                <Card className="border-primary/40">
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <ShieldCheck className="h-5 w-5 text-primary" />
                      Merge preview
                    </CardTitle>
                    <CardDescription>
                      Review what will move before confirming.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <MergePreview
                      master={master}
                      duplicates={selectedDuplicates}
                    />

                    {anyDuplicateLocked && (
                      <Alert variant="destructive">
                        <Lock className="h-4 w-4" />
                        <AlertTitle>Payroll lock detected</AlertTitle>
                        <AlertDescription>
                          One or more selected duplicates have movements or base
                          pay in a closed / published / paid pay period. The
                          merge will be refused by the database. Reopen the
                          period or de-select that record before continuing.
                        </AlertDescription>
                      </Alert>
                    )}

                    <div className="flex flex-wrap gap-2 justify-end pt-2">
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setMasterId(null);
                          setDuplicateIds(new Set());
                        }}
                      >
                        Reset
                      </Button>
                      <Button
                        onClick={openConfirm}
                        disabled={anyDuplicateLocked}
                      >
                        Continue to confirmation
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      </div>

      {/* ---- 2-step confirmation dialog ---------------------------------- */}
      <Dialog open={confirmOpen} onOpenChange={(o) => !merging && setConfirmOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Confirm merge
            </DialogTitle>
            <DialogDescription>
              This action consolidates {duplicateIds.size} record(s) into{" "}
              <span className="font-medium">{master ? fullName(master) : ""}</span>{" "}
              and cannot be undone from the UI. Type the master's full name to
              proceed.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="confirm-name">
                Type:{" "}
                <span className="font-mono text-foreground">
                  {master ? fullName(master) : ""}
                </span>
              </Label>
              <Input
                id="confirm-name"
                value={confirmName}
                onChange={(e) => setConfirmName(e.target.value)}
                placeholder="Master full name"
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reason">Reason (optional, for audit log)</Label>
              <Textarea
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Same person re-imported during Apr 24 batch"
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setConfirmOpen(false)}
              disabled={merging}
            >
              Cancel
            </Button>
            <Button
              onClick={executeMerge}
              disabled={
                merging ||
                !master ||
                confirmName.trim().toLowerCase() !==
                  fullName(master).toLowerCase()
              }
            >
              {merging && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm merge
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---- Post-merge summary dialog ---------------------------------- */}
      <Dialog
        open={!!postMergeSummary}
        onOpenChange={(o) => !o && setPostMergeSummary(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              Merge completed
            </DialogTitle>
            <DialogDescription>
              {postMergeSummary?.merged_count} employee(s) consolidated into{" "}
              <span className="font-medium">
                {postMergeSummary?.master_name}
              </span>
              .
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
            {postMergeSummary?.details.map((d) => (
              <div
                key={d.duplicate_id}
                className="rounded-lg border p-3 text-sm"
              >
                <p className="font-medium mb-1">{d.duplicate_name}</p>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(d.moved).length === 0 && (
                    <Badge variant="secondary">No data moved</Badge>
                  )}
                  {Object.entries(d.moved).map(([table, count]) => (
                    <Badge key={table} variant="outline" className="font-mono">
                      {table}: {String(count)}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="ghost"
              onClick={() => setPostMergeSummary(null)}
            >
              Close
            </Button>
            {postMergeSummary && (
              <Button
                onClick={() =>
                  navigate(`/app/people/${postMergeSummary.master_id}`)
                }
              >
                Open master profile
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------- Sub-components -------------------------------------------------

function EmployeeChoiceRow({
  employee,
  kind,
  selected,
  onToggle,
}: {
  employee: EmployeeRow;
  kind: "master" | "duplicate";
  selected: boolean;
  onToggle?: () => void;
}) {
  const inactive = employee.is_active === false;
  const noPortal = !employee.user_id;
  const incomplete =
    employee.profile_status === "incomplete" ||
    employee.onboarding_status === "pending";

  const Wrapper: any = kind === "master" ? "label" : "div";

  return (
    <Wrapper
      htmlFor={kind === "master" ? `master-${employee.id}` : undefined}
      onClick={kind === "duplicate" ? onToggle : undefined}
      className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
        selected
          ? "border-primary bg-primary/5"
          : "border-border hover:bg-muted/40"
      }`}
    >
      {kind === "master" ? (
        <RadioGroupItem
          id={`master-${employee.id}`}
          value={employee.id}
          className="mt-1"
        />
      ) : (
        <Checkbox checked={selected} className="mt-1" />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-medium">{fullName(employee)}</p>
          {employee.employer_identification && (
            <Badge variant="outline" className="font-mono text-xs">
              #{employee.employer_identification}
            </Badge>
          )}
          {inactive && <Badge variant="secondary">Inactive</Badge>}
          {noPortal && (
            <Badge
              variant="outline"
              className="border-amber-500/40 text-amber-700 dark:text-amber-400"
            >
              No portal
            </Badge>
          )}
          {incomplete && (
            <Badge
              variant="outline"
              className="border-amber-500/40 text-amber-700 dark:text-amber-400"
            >
              Incomplete
            </Badge>
          )}
          {employee.payroll_locked && (
            <Badge variant="destructive" className="gap-1">
              <Lock className="h-3 w-3" /> Closed payroll
            </Badge>
          )}
        </div>
        <div className="mt-1 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5 truncate">
            <Phone className="h-3 w-3" />
            {employee.phone_number ?? "—"}
          </span>
          <span className="flex items-center gap-1.5 truncate">
            <Mail className="h-3 w-3" />
            {employee.email ?? "—"}
          </span>
          <span className="flex items-center gap-1.5">
            <Activity className="h-3 w-3" />
            {employee.shift_count ?? 0} shifts ·{" "}
            {employee.time_entry_count ?? 0} clock-ins
          </span>
          <span className="truncate">
            Created {new Date(employee.created_at).toLocaleDateString()}
          </span>
        </div>
      </div>
    </Wrapper>
  );
}

function MergePreview({
  master,
  duplicates,
}: {
  master: EmployeeRow;
  duplicates: EmployeeRow[];
}) {
  // Show fields that differ across the picked records, so the operator knows
  // exactly which value will survive (master wins) and which will only be
  // used to back-fill empty master fields.
  const fields: { key: keyof EmployeeRow; label: string }[] = [
    { key: "phone_number", label: "Phone" },
    { key: "email", label: "Email" },
    { key: "employer_identification", label: "Employee #" },
    { key: "user_id", label: "Portal user" },
  ];

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-muted/60">
          <tr>
            <th className="text-left px-3 py-2 font-medium">Field</th>
            <th className="text-left px-3 py-2 font-medium">
              Master · {fullName(master)}
            </th>
            {duplicates.map((d) => (
              <th key={d.id} className="text-left px-3 py-2 font-medium">
                {fullName(d)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {fields.map(({ key, label }) => {
            const masterValue = (master as any)[key];
            return (
              <tr key={String(key)} className="border-t">
                <td className="px-3 py-2 text-muted-foreground">{label}</td>
                <td className="px-3 py-2 font-medium">
                  {formatVal(masterValue)}
                </td>
                {duplicates.map((d) => {
                  const dv = (d as any)[key];
                  const willBackfill =
                    (masterValue == null || masterValue === "") &&
                    dv != null &&
                    dv !== "";
                  return (
                    <td key={d.id} className="px-3 py-2">
                      <span
                        className={
                          willBackfill
                            ? "text-emerald-600 dark:text-emerald-400 font-medium"
                            : "text-muted-foreground line-through"
                        }
                        title={
                          willBackfill
                            ? "Will be copied into the master (master is empty)"
                            : "Discarded — master keeps its own value"
                        }
                      >
                        {formatVal(dv)}
                      </span>
                    </td>
                  );
                })}
              </tr>
            );
          })}
          <tr className="border-t bg-muted/30">
            <td className="px-3 py-2 text-muted-foreground">Operational</td>
            <td className="px-3 py-2">
              <Badge variant="secondary">
                {master.shift_count ?? 0} shifts · {master.time_entry_count ?? 0} clock-ins
              </Badge>
            </td>
            {duplicates.map((d) => (
              <td key={d.id} className="px-3 py-2">
                <Badge variant="outline" className="gap-1">
                  + {d.shift_count ?? 0} shifts · {d.time_entry_count ?? 0} clock-ins
                </Badge>
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function formatVal(v: unknown): string {
  if (v == null || v === "") return "—";
  if (typeof v === "string" && v.length > 28) return v.slice(0, 26) + "…";
  return String(v);
}

// ---------- Error humanizer -----------------------------------------------

function humanizeMergeError(raw: string): string {
  if (raw.includes("EMPLOYEE_MERGE_LOCKED_PAYROLL"))
    return "One of the duplicates has payroll in a closed/published/paid period. Reopen the period or exclude that record.";
  if (raw.includes("EMPLOYEE_MERGE_CROSS_COMPANY"))
    return "Employees belong to different companies — cross-company merges are not allowed.";
  if (raw.includes("EMPLOYEE_MERGE_BAD_CONFIRMATION"))
    return "The confirmation name doesn't match the master. Type it exactly as displayed.";
  if (raw.includes("EMPLOYEE_MERGE_DENIED"))
    return "You don't have permission to merge employees in this company, or the input was invalid.";
  if (raw.includes("EMPLOYEE_MERGED"))
    return "One of the records was already merged in another session. Refresh and try again.";
  return raw;
}
