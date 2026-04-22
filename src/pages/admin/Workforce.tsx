/**
 * Workforce — premium workforce control center for STAFly admins.
 *
 * Live at /app/workforce in parallel with the legacy /app/employees view.
 * Surfaces every employee's onboarding readiness, last activity, documents,
 * and exposes operational actions (open profile, complete onboarding, send
 * reminder via WhatsApp, override status with audit) plus bulk actions
 * (reminders, CSV export, change worker_type).
 *
 * Design rules:
 *   - All colors via semantic tokens (no hardcoded hex/rgb).
 *   - Mobile-first: cards on small screens, table on lg+.
 *   - Strict tenant scoping via useCompany.selectedCompanyId.
 */

import { useEffect, useMemo, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useDebouncedValue } from "@/hooks/useFilters";
import { formatDistanceToNow, parseISO } from "date-fns";
import {
  Users, Search, MessageCircle, ArrowRight, Download, ShieldCheck, ChevronDown,
  RefreshCw, Sparkles, Filter, X, FileText, ClipboardList, Send,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { PageHeader } from "@/components/ui/page-header";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { ProfileStatusBadge } from "@/components/employee/ProfileStatusBadge";
import { EmployeeReviewBadge } from "@/components/reviews/EmployeeReviewBadge";
import { useEmployeeReviewStatsBulk, classifyRisk } from "@/hooks/useEmployeeReviewStats";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatPersonName } from "@/lib/format-helpers";
import { type ProfileStatus, PROFILE_STATUS_LABELS } from "@/lib/onboarding/profile-status";
import { getRequiredDocumentsForCompany } from "@/lib/onboarding/required-documents";

type WorkerType = "employee" | "contractor" | "intern" | "freelance" | "other";

interface Row {
  id: string;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
  gender: string | null;
  phone_number: string | null;
  email: string | null;
  employee_role: string | null;
  has_car: boolean | null;
  profile_status: ProfileStatus;
  is_active: boolean;
  created_at: string;
  last_seen_at?: string | null;
  doc_count: number;
  required_doc_count: number;
}

const WORKER_TYPES: { value: string; label: string }[] = [
  { value: "employee", label: "Employee" },
  { value: "contractor", label: "Contractor (1099)" },
  { value: "intern", label: "Intern" },
  { value: "freelance", label: "Freelance" },
  { value: "other", label: "Other" },
];

const STATUS_FILTERS: { value: "all" | ProfileStatus; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "incomplete", label: "Incomplete" },
  { value: "pending_documents", label: "Missing documents" },
  { value: "ready", label: "Ready" },
  { value: "active", label: "Active" },
];

type SortKey = "recent" | "name" | "score" | "reviews" | "risk";
const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "recent", label: "Most recent" },
  { value: "name", label: "Name (A→Z)" },
  { value: "score", label: "Highest review score" },
  { value: "reviews", label: "Most reviews" },
  { value: "risk", label: "Risk first" },
];

type QualityFilter = "any" | "with_reviews" | "no_reviews" | "at_risk" | "top_rated";
const QUALITY_FILTERS: { value: QualityFilter; label: string }[] = [
  { value: "any", label: "Any quality" },
  { value: "with_reviews", label: "With reviews" },
  { value: "no_reviews", label: "No reviews yet" },
  { value: "at_risk", label: "At risk / watch" },
  { value: "top_rated", label: "Top rated (≥4★, 3+)" },
];

export default function Workforce() {
  const navigate = useNavigate();
  const { selectedCompanyId, selectedCompany } = useCompany();
  const { user, role } = useAuth();
  const { toast } = useToast();

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | ProfileStatus>("all");
  const [workerFilter, setWorkerFilter] = useState<string>("all");
  const [qualityFilter, setQualityFilter] = useState<QualityFilter>("any");
  const [sortKey, setSortKey] = useState<SortKey>("recent");
  const [requiredCats, setRequiredCats] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reminderOpen, setReminderOpen] = useState(false);
  const [overrideTarget, setOverrideTarget] = useState<Row | null>(null);
  const [bulkRoleOpen, setBulkRoleOpen] = useState(false);

  const debounced = useDebouncedValue(search, 300);

  const load = useCallback(async () => {
    if (!selectedCompanyId) return;
    setLoading(true);

    // Required documents — used to compute the "x/n" badge per row.
    const required = await getRequiredDocumentsForCompany(selectedCompanyId);
    setRequiredCats(required);

    const [{ data: emps, error }, { data: docs }, { data: presence }] = await Promise.all([
      supabase
        .from("employees")
        .select(
          "id, first_name, last_name, avatar_url, gender, phone_number, email, employee_role, has_car, profile_status, is_active, created_at",
        )
        .eq("company_id", selectedCompanyId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(500),
      supabase
        .from("employee_documents" as any)
        .select("employee_id, category")
        .eq("company_id", selectedCompanyId),
      supabase
        .from("employee_status")
        .select("employee_id, last_seen_at")
        .eq("company_id", selectedCompanyId),
    ]);

    if (error) {
      toast({ title: "Failed to load workforce", description: error.message, variant: "destructive" });
      setLoading(false);
      return;
    }

    const docByEmp = new Map<string, Set<string>>();
    for (const d of (docs ?? []) as any[]) {
      if (!docByEmp.has(d.employee_id)) docByEmp.set(d.employee_id, new Set());
      docByEmp.get(d.employee_id)!.add(d.category);
    }
    const seenByEmp = new Map<string, string>();
    for (const p of (presence ?? []) as any[]) {
      if (p.last_seen_at) seenByEmp.set(p.employee_id, p.last_seen_at);
    }

    const mapped: Row[] = (emps ?? []).map((e: any) => {
      const owned = docByEmp.get(e.id) ?? new Set();
      // For drivers, append drivers_license to required set.
      const reqForRow = e.has_car ? Array.from(new Set([...required, "drivers_license"])) : required;
      const have = reqForRow.filter((c) => owned.has(c)).length;
      return {
        id: e.id,
        first_name: e.first_name,
        last_name: e.last_name,
        avatar_url: e.avatar_url,
        gender: e.gender,
        phone_number: e.phone_number,
        email: e.email,
        employee_role: e.employee_role,
        has_car: e.has_car,
        profile_status: (e.profile_status as ProfileStatus) ?? "incomplete",
        is_active: e.is_active,
        created_at: e.created_at,
        last_seen_at: seenByEmp.get(e.id) ?? null,
        doc_count: have,
        required_doc_count: reqForRow.length,
      };
    });

    setRows(mapped);
    setLoading(false);
  }, [selectedCompanyId, toast]);

  useEffect(() => { load(); }, [load]);

  // Counts for the KPI strip.
  const counts = useMemo(() => {
    const c = { total: rows.length, ready: 0, pending_documents: 0, incomplete: 0, active: 0 };
    for (const r of rows) c[r.profile_status]++;
    return c;
  }, [rows]);

  const { stats: reviewStats } = useEmployeeReviewStatsBulk(
    selectedCompanyId,
    useMemo(() => rows.map(r => r.id), [rows]),
  );

  const filtered = useMemo(() => {
    const q = debounced.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== "all" && r.profile_status !== statusFilter) return false;
      if (workerFilter !== "all" && (r.employee_role ?? "") !== workerFilter) return false;
      if (!q) return true;
      const hay = `${r.first_name} ${r.last_name} ${r.phone_number ?? ""} ${r.email ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [rows, debounced, statusFilter, workerFilter]);

  const allVisibleSelected = filtered.length > 0 && filtered.every((r) => selected.has(r.id));
  const toggleAllVisible = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) filtered.forEach((r) => next.delete(r.id));
      else filtered.forEach((r) => next.add(r.id));
      return next;
    });
  };
  const toggleOne = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const clearSelection = () => setSelected(new Set());

  const exportCSV = () => {
    const target = selected.size > 0 ? rows.filter((r) => selected.has(r.id)) : filtered;
    if (target.length === 0) {
      toast({ title: "Nothing to export", variant: "destructive" });
      return;
    }
    const header = ["First name", "Last name", "Phone", "Email", "Worker type", "Profile status", "Documents", "Last seen"];
    const lines = [header.join(",")];
    for (const r of target) {
      const last = r.last_seen_at ? new Date(r.last_seen_at).toISOString() : "";
      lines.push([
        csv(r.first_name), csv(r.last_name), csv(r.phone_number), csv(r.email),
        csv(r.employee_role), csv(r.profile_status),
        `${r.doc_count}/${r.required_doc_count}`, csv(last),
      ].join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `workforce-${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    toast({ title: `Exported ${target.length} rows` });
  };

  return (
    <div className="space-y-4 pb-24">
      <PageHeader
        icon={Users}
        title="Workforce control"
        subtitle="Live readiness, documents and operational actions for every worker."
        rightSlot={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={load} className="gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </Button>
            <Button size="sm" onClick={() => navigate("/app/employees")} className="gap-1.5">
              <ClipboardList className="h-3.5 w-3.5" /> Legacy view
            </Button>
          </div>
        }
      />

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <KpiTile label="Total" value={counts.total} tone="muted" />
        <KpiTile label="Active" value={counts.active} tone="earning" />
        <KpiTile label="Ready" value={counts.ready} tone="primary" />
        <KpiTile label="Missing docs" value={counts.pending_documents} tone="warning" />
        <KpiTile label="Incomplete" value={counts.incomplete} tone="deduction" />
      </div>

      {/* Filters */}
      <div className="rounded-2xl border bg-card p-3 flex flex-col md:flex-row md:items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, phone or email…"
            className="pl-9 h-10"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 rounded-md hover:bg-muted flex items-center justify-center"
              aria-label="Clear"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
          <SelectTrigger className="md:w-[200px] h-10">
            <Filter className="h-3.5 w-3.5 mr-1.5" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_FILTERS.map((s) => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={workerFilter} onValueChange={setWorkerFilter}>
          <SelectTrigger className="md:w-[180px] h-10"><SelectValue placeholder="Worker type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All worker types</SelectItem>
            {WORKER_TYPES.map((w) => (
              <SelectItem key={w.value} value={w.value}>{w.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="rounded-xl border-2 border-primary/30 bg-primary/[0.06] px-3 py-2 flex items-center gap-2 sticky top-2 z-10 backdrop-blur">
          <span className="text-[12px] font-bold text-primary">{selected.size} selected</span>
          <button onClick={clearSelection} className="text-[11px] text-muted-foreground hover:text-foreground">Clear</button>
          <div className="ml-auto flex items-center gap-1.5">
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setReminderOpen(true)}>
              <Send className="h-3.5 w-3.5" /> Send reminders
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={exportCSV}>
              <Download className="h-3.5 w-3.5" /> Export CSV
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setBulkRoleOpen(true)}>
              <Sparkles className="h-3.5 w-3.5" /> Change worker type
            </Button>
          </div>
        </div>
      )}

      {/* Body */}
      {loading ? (
        <PageSkeleton />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No workers match these filters"
          description="Adjust the filters or invite new workers to get started."
        />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden lg:block rounded-2xl border bg-card overflow-hidden">
            <div className="grid grid-cols-[36px_minmax(0,2fr)_140px_120px_140px_140px_60px] px-4 py-2.5 border-b bg-muted/30 text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
              <div className="flex items-center"><Checkbox checked={allVisibleSelected} onCheckedChange={toggleAllVisible} /></div>
              <div>Worker</div>
              <div>Status</div>
              <div>Worker type</div>
              <div>Documents</div>
              <div>Last activity</div>
              <div className="text-right">Actions</div>
            </div>
            {filtered.map((r) => (
              <div
                key={r.id}
                className={cn(
                  "grid grid-cols-[36px_minmax(0,2fr)_140px_120px_140px_140px_60px] px-4 py-3 border-b last:border-0 items-center transition-colors",
                  selected.has(r.id) ? "bg-primary/[0.04]" : "hover:bg-muted/20",
                )}
              >
                <Checkbox checked={selected.has(r.id)} onCheckedChange={() => toggleOne(r.id)} />
                <button
                  onClick={() => navigate(`/app/employees/${r.id}/onboarding`)}
                  className="flex items-center gap-2.5 min-w-0 text-left"
                >
                  <EmployeeAvatar
                    firstName={r.first_name}
                    lastName={r.last_name}
                    avatarUrl={r.avatar_url}
                    gender={r.gender}
                    size="sm"
                  />
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold truncate">
                      {formatPersonName(`${r.first_name} ${r.last_name}`)}
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {r.phone_number || r.email || "—"}
                    </p>
                    <div className="mt-0.5"><EmployeeReviewBadge employeeId={r.id} stats={reviewStats.get(r.id)} size="xs" /></div>
                  </div>
                </button>
                <div><ProfileStatusBadge status={r.profile_status} /></div>
                <div>
                  <span className="text-[11px] font-medium text-foreground/80 capitalize">
                    {r.employee_role || "—"}
                  </span>
                </div>
                <div>
                  <DocBar have={r.doc_count} total={r.required_doc_count} />
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {r.last_seen_at
                    ? formatDistanceToNow(parseISO(r.last_seen_at), { addSuffix: true })
                    : "Never"}
                </div>
                <div className="flex justify-end">
                  <RowActions row={r} onChanged={load} onOverride={() => setOverrideTarget(r)} />
                </div>
              </div>
            ))}
          </div>

          {/* Mobile cards */}
          <div className="lg:hidden space-y-2">
            {filtered.map((r) => (
              <div
                key={r.id}
                className={cn(
                  "rounded-2xl border bg-card p-3 flex items-center gap-3 transition-colors",
                  selected.has(r.id) && "border-primary/40 bg-primary/[0.04]",
                )}
              >
                <Checkbox checked={selected.has(r.id)} onCheckedChange={() => toggleOne(r.id)} />
                <button
                  onClick={() => navigate(`/app/employees/${r.id}/onboarding`)}
                  className="flex-1 min-w-0 text-left flex items-center gap-2.5"
                >
                  <EmployeeAvatar
                    firstName={r.first_name} lastName={r.last_name}
                    avatarUrl={r.avatar_url} gender={r.gender} size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <p className="text-[13px] font-bold truncate">
                        {formatPersonName(`${r.first_name} ${r.last_name}`)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <ProfileStatusBadge status={r.profile_status} size="xs" />
                      <span className="text-[10px] text-muted-foreground">·</span>
                      <DocBar have={r.doc_count} total={r.required_doc_count} compact />
                      <EmployeeReviewBadge employeeId={r.id} stats={reviewStats.get(r.id)} size="xs" />
                    </div>
                  </div>
                </button>
                <RowActions row={r} onChanged={load} onOverride={() => setOverrideTarget(r)} />
              </div>
            ))}
          </div>
        </>
      )}

      {/* Bulk reminder dialog */}
      <BulkReminderDialog
        open={reminderOpen}
        onOpenChange={setReminderOpen}
        rows={rows.filter((r) => selected.has(r.id))}
        companyName={selectedCompany?.name ?? ""}
        onSent={() => { clearSelection(); setReminderOpen(false); }}
      />

      {/* Override status dialog */}
      <OverrideStatusDialog
        target={overrideTarget}
        onClose={() => setOverrideTarget(null)}
        onChanged={load}
        actorId={user?.id ?? null}
        actorRole={role ?? null}
      />

      {/* Bulk worker_type dialog */}
      <BulkWorkerTypeDialog
        open={bulkRoleOpen}
        onOpenChange={setBulkRoleOpen}
        ids={Array.from(selected)}
        onChanged={() => { clearSelection(); setBulkRoleOpen(false); load(); }}
      />
    </div>
  );
}

/* ───────────────────── helpers & subcomponents ───────────────────── */

function csv(v: unknown): string {
  const s = v == null ? "" : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function KpiTile({ label, value, tone }: { label: string; value: number; tone: "muted" | "earning" | "primary" | "warning" | "deduction" }) {
  const map: Record<typeof tone, string> = {
    muted:     "border-border bg-muted/20",
    earning:   "border-earning/20 bg-earning/[0.06]",
    primary:   "border-primary/20 bg-primary/[0.05]",
    warning:   "border-warning/25 bg-warning/[0.06]",
    deduction: "border-deduction/25 bg-deduction/[0.05]",
  } as const;
  return (
    <div className={cn("rounded-xl border px-3 py-2.5", map[tone])}>
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-xl font-bold font-heading tabular-nums leading-tight">{value}</p>
    </div>
  );
}

function DocBar({ have, total, compact }: { have: number; total: number; compact?: boolean }) {
  const pct = total > 0 ? Math.round((have / total) * 100) : 0;
  const tone =
    have === total ? "bg-earning" : have === 0 ? "bg-deduction" : "bg-warning";
  return (
    <div className={cn("flex items-center gap-2", compact ? "" : "")}>
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", tone)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] font-bold tabular-nums text-foreground/70 shrink-0">
        {have}/{total}
      </span>
    </div>
  );
}

function RowActions({ row, onChanged, onOverride }: { row: Row; onChanged: () => void; onOverride: () => void }) {
  const navigate = useNavigate();
  const phone = (row.phone_number ?? "").replace(/\D/g, "");
  const fullPhone = phone.length === 10 ? `1${phone}` : phone;
  const waMessage = encodeURIComponent(
    `Hi ${row.first_name}, please complete your worker profile to be assigned to shifts. Open the app to finish onboarding. Thanks!`,
  );
  const waLink = phone ? `https://wa.me/${fullPhone}?text=${waMessage}` : null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <ChevronDown className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onClick={() => navigate(`/app/employees/${row.id}/onboarding`)}>
          <ArrowRight className="h-3.5 w-3.5 mr-2" /> Complete onboarding
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => navigate(`/app/employees?id=${row.id}`)}>
          <FileText className="h-3.5 w-3.5 mr-2" /> Open profile
        </DropdownMenuItem>
        {waLink && (
          <DropdownMenuItem asChild>
            <a href={waLink} target="_blank" rel="noopener">
              <MessageCircle className="h-3.5 w-3.5 mr-2 text-[#25D366]" /> Send WhatsApp
            </a>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onOverride}>
          <ShieldCheck className="h-3.5 w-3.5 mr-2" /> Override status…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function BulkReminderDialog({
  open, onOpenChange, rows, companyName, onSent,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  rows: Row[];
  companyName: string;
  onSent: () => void;
}) {
  const { toast } = useToast();
  const [sending, setSending] = useState(false);
  const withPhone = rows.filter((r) => !!r.phone_number);
  const withoutPhone = rows.length - withPhone.length;

  const handleSend = () => {
    setSending(true);
    let opened = 0;
    for (const r of withPhone) {
      const phone = (r.phone_number ?? "").replace(/\D/g, "");
      const fullPhone = phone.length === 10 ? `1${phone}` : phone;
      const msg = encodeURIComponent(
        `Hi ${r.first_name}, this is ${companyName || "your team"} — please complete your worker profile to be assigned to shifts. Thanks!`,
      );
      // Open in new tabs (WhatsApp web/app handles the rest).
      window.open(`https://wa.me/${fullPhone}?text=${msg}`, "_blank", "noopener");
      opened++;
    }
    setSending(false);
    toast({
      title: `Opened ${opened} WhatsApp ${opened === 1 ? "chat" : "chats"}`,
      description: withoutPhone > 0 ? `${withoutPhone} workers had no phone number and were skipped.` : undefined,
    });
    onSent();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send onboarding reminders</DialogTitle>
          <DialogDescription>
            Open a WhatsApp chat for each selected worker with a pre-filled message.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-lg bg-muted/30 p-3 text-sm">
          <p><span className="font-bold">{withPhone.length}</span> with phone — will be opened.</p>
          {withoutPhone > 0 && (
            <p className="text-muted-foreground mt-1">
              <span className="font-bold">{withoutPhone}</span> without phone — will be skipped.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSend} disabled={sending || withPhone.length === 0}>
            <Send className="h-3.5 w-3.5 mr-1.5" /> Open chats
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OverrideStatusDialog({
  target, onClose, onChanged, actorId, actorRole,
}: {
  target: Row | null;
  onClose: () => void;
  onChanged: () => void;
  actorId: string | null;
  actorRole: string | null;
}) {
  const { toast } = useToast();
  const [newStatus, setNewStatus] = useState<ProfileStatus>("ready");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (target) { setNewStatus("ready"); setReason(""); }
  }, [target]);

  if (!target) return null;
  const canOverride = !!actorId; // any admin reaching this page can override (route is admin-guarded)

  const submit = async () => {
    if (!reason.trim()) {
      toast({ title: "A reason is required", variant: "destructive" });
      return;
    }
    setSaving(true);
    const oldStatus = target.profile_status;
    const { error } = await supabase
      .from("employees")
      .update({ profile_status: newStatus })
      .eq("id", target.id);

    if (error) {
      toast({ title: "Override failed", description: error.message, variant: "destructive" });
      setSaving(false);
      return;
    }

    // Audit trail — never silently change critical state.
    await supabase.from("activity_log").insert({
      user_id: actorId!,
      action: "profile_status_override",
      entity_type: "employee",
      entity_id: target.id,
      details: { reason, role: actorRole, from: oldStatus, to: newStatus } as any,
    } as any);

    toast({ title: "Status updated", description: `Now ${PROFILE_STATUS_LABELS[newStatus]}` });
    setSaving(false);
    onChanged();
    onClose();
  };

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Override profile status</DialogTitle>
          <DialogDescription>
            Forces {target.first_name}'s profile to a new status, bypassing the automatic checks.
            This is logged to the activity log.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-lg bg-muted/30 p-3 flex items-center gap-2 text-sm">
            <ProfileStatusBadge status={target.profile_status} />
            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
            <ProfileStatusBadge status={newStatus} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">New status</Label>
            <Select value={newStatus} onValueChange={(v) => setNewStatus(v as ProfileStatus)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="incomplete">Incomplete</SelectItem>
                <SelectItem value="pending_documents">Missing documents</SelectItem>
                <SelectItem value="ready">Ready</SelectItem>
                <SelectItem value="active">Active</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Reason (required)</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. W-9 received offline; documents on file from previous engagement."
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={!canOverride || saving || !reason.trim()}>
            <ShieldCheck className="h-3.5 w-3.5 mr-1.5" /> Confirm override
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BulkWorkerTypeDialog({
  open, onOpenChange, ids, onChanged,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  ids: string[];
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [type, setType] = useState<string>("contractor");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("employees")
      .update({ employee_role: type })
      .in("id", ids);
    setSaving(false);
    if (error) {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: `Updated ${ids.length} workers` });
    onChanged();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Change worker type</DialogTitle>
          <DialogDescription>
            Apply a new worker type to {ids.length} selected {ids.length === 1 ? "worker" : "workers"}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label className="text-xs">Worker type</Label>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {WORKER_TYPES.map((w) => (
                <SelectItem key={w.value} value={w.value}>{w.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={saving || ids.length === 0}>Apply</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
