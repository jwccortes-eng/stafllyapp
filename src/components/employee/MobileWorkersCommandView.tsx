/**
 * MobileWorkersCommandView — dedicated mobile branch for /app/workers.
 *
 * Replaces the desktop Employees layout on phones. No DB / RLS / payroll
 * changes — purely a presentation surface that consumes data already
 * fetched by the parent Employees page.
 *
 * Goals:
 *  - No noisy admin chrome (Activation Campaign, Detect duplicates, Import,
 *    Export, Update, Bulk rates, full Data Quality grid).
 *  - Compact mobile header + status summary + simple worker cards.
 *  - Inline Call / WhatsApp / Resend invite per row.
 *  - Optional "Desktop tools" sheet for advanced actions.
 */

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Users, Search, Plus, Filter, MoreHorizontal, Phone, MessageCircle,
  Send, Copy as CopyIcon, ChevronRight, Wrench, Building2, ShieldAlert,
  CheckCircle2, KeyRound, Rocket, Download, Upload, ArrowUpDown,
  UserSearch, Settings2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { QuickAddInviteWizard } from "@/components/employee/QuickAddInviteWizard";
import MobileDataQualitySummary from "@/components/employee/MobileDataQualitySummary";
import DataQualityRiskPanel from "@/components/employee/DataQualityRiskPanel";
import { analyzeEmployeeRisks, computePayrollReadiness, type RiskKey } from "@/lib/data-quality-risks";
import { canInviteWorker } from "@/lib/worker-actions";
import { normalizePhone } from "@/lib/phone";
import { formatPersonName, formatDisplayText } from "@/lib/format-helpers";
import { cn } from "@/lib/utils";
import type { InvitationMap } from "@/hooks/useEmployeeInvitations";

type StatusFilter = "all" | "active" | "invited" | "pending" | "no_portal";

interface Props {
  employees: any[];
  invitations: InvitationMap;
  documentSignals: any;
  selectedCompany: { id: string; name: string } | null;
  isPrivileged: boolean;
  onOpenProfile: (e: any) => void;
  onInvite: (e: any) => void;
  onCopyInviteLink: (token: string) => void;
  onOpenCampaign: () => void;
  onOpenOnboardingSettings: () => void;
  onRefetch: () => void;
}

export default function MobileWorkersCommandView({
  employees, invitations, documentSignals, selectedCompany, isPrivileged,
  onOpenProfile, onInvite, onCopyInviteLink, onOpenCampaign,
  onOpenOnboardingSettings, onRefetch,
}: Props) {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [toolsSheetOpen, setToolsSheetOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [riskFilter, setRiskFilter] = useState<RiskKey | "all">("all");

  // Data quality "needs review" count (matches desktop readiness math).
  const needReview = useMemo(() => {
    const { byId } = analyzeEmployeeRisks(employees, documentSignals);
    let n = 0;
    for (const e of employees) {
      const risks = byId.get(e.id) ?? [];
      const r = computePayrollReadiness(risks);
      if (r === "needs_review" || r === "blocked_visual") n += 1;
    }
    return n;
  }, [employees, documentSignals]);

  const counts = useMemo(() => ({
    total: employees.length,
    active: employees.filter(e => e.is_active !== false && !!e.user_id).length,
    invited: employees.filter(e => e.is_active !== false && !e.user_id && !!invitations[e.id]).length,
    pending: employees.filter(e => e.is_active !== false && !e.user_id && !invitations[e.id]).length,
    no_portal: employees.filter(e => e.is_active !== false && !e.user_id).length,
  }), [employees, invitations]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return employees.filter((e) => {
      if (statusFilter === "active" && !(e.is_active !== false && !!e.user_id)) return false;
      if (statusFilter === "invited" && !(e.is_active !== false && !e.user_id && !!invitations[e.id])) return false;
      if (statusFilter === "pending" && !(e.is_active !== false && !e.user_id && !invitations[e.id])) return false;
      if (statusFilter === "no_portal" && !(e.is_active !== false && !e.user_id)) return false;
      if (!q) return true;
      const hay = `${e.first_name ?? ""} ${e.last_name ?? ""} ${e.email ?? ""} ${e.phone_number ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [employees, invitations, search, statusFilter]);

  const isDev = typeof import.meta !== "undefined" && (import.meta as any)?.env?.DEV;

  return (
    <div className="md:hidden space-y-3 overflow-x-hidden max-w-full">
      {isDev && (
        <div className="text-[10px] uppercase tracking-wider font-mono text-muted-foreground bg-muted/50 border border-dashed border-border rounded px-2 py-1">
          MobileWorkersCommandView active
        </div>
      )}

      {/* ── Header ── */}
      <div className="px-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              <h1 className="text-lg font-bold font-heading leading-none">Workers</h1>
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground flex-wrap">
              <span>{counts.total} registered</span>
              {selectedCompany && (
                <span className="inline-flex items-center gap-1 rounded border border-border/50 bg-muted/40 px-1.5 py-0.5 font-mono">
                  <Building2 className="h-2.5 w-2.5" />
                  <span className="text-foreground font-semibold">{selectedCompany.name}</span>
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Button size="sm" className="h-8 px-2.5 text-xs" onClick={() => setQuickAddOpen(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Invite
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="h-8 w-8">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  More
                </DropdownMenuLabel>
                <DropdownMenuItem onClick={() => setToolsSheetOpen(true)}>
                  <Wrench className="h-3.5 w-3.5 mr-2" /> Desktop tools
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onRefetch}>
                  <ArrowUpDown className="h-3.5 w-3.5 mr-2" /> Refresh list
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* ── Search + filter ── */}
      <div className="flex items-center gap-2 px-1">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search workers"
            className="h-9 pl-8 text-sm"
          />
        </div>
        <Button
          variant="outline"
          size="icon"
          className={cn("h-9 w-9 shrink-0", statusFilter !== "all" && "border-primary text-primary")}
          onClick={() => setFilterSheetOpen(true)}
          aria-label="Filter"
        >
          <Filter className="h-4 w-4" />
        </Button>
      </div>

      {/* ── Compact status strip ── */}
      <div className="grid grid-cols-4 gap-1.5 px-1">
        <StatusChip label="Total" value={counts.total} active={statusFilter === "all"} onClick={() => setStatusFilter("all")} />
        <StatusChip label="Active" value={counts.active} active={statusFilter === "active"} tone="success" onClick={() => setStatusFilter(statusFilter === "active" ? "all" : "active")} />
        <StatusChip label="Pending" value={counts.pending} active={statusFilter === "pending"} tone="warning" onClick={() => setStatusFilter(statusFilter === "pending" ? "all" : "pending")} />
        <StatusChip label="Invited" value={counts.invited} active={statusFilter === "invited"} tone="info" onClick={() => setStatusFilter(statusFilter === "invited" ? "all" : "invited")} />
      </div>

      {/* ── Compact data quality entry only ── */}
      <div className="px-1">
        <MobileDataQualitySummary
          needReview={needReview}
          employees={employees}
          documentSignals={documentSignals}
          riskFilter={riskFilter}
          onRiskFilterChange={setRiskFilter}
        />
      </div>

      {/* ── Worker cards ── */}
      <div className="space-y-1.5 px-1">
        {filtered.length === 0 && (
          <Card className="p-6 text-center text-sm text-muted-foreground">
            No workers match the current filter.
          </Card>
        )}
        {filtered.map((e) => (
          <WorkerRow
            key={e.id}
            e={e}
            invitation={invitations[e.id]}
            onOpenProfile={() => onOpenProfile(e)}
            onInvite={() => onInvite(e)}
            onCopyInviteLink={onCopyInviteLink}
          />
        ))}
      </div>

      {/* ── QuickAdd dialog ── */}
      <QuickAddInviteWizard
        open={quickAddOpen}
        onOpenChange={setQuickAddOpen}
        onEmployeeCreated={() => onRefetch()}
      />

      {/* ── Filter sheet ── */}
      <Sheet open={filterSheetOpen} onOpenChange={setFilterSheetOpen}>
        <SheetContent side="bottom" className="rounded-t-3xl">
          <SheetHeader className="text-left">
            <SheetTitle className="text-base font-bold font-heading">Filter workers</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-1.5">
            {(["all", "active", "invited", "pending", "no_portal"] as StatusFilter[]).map((s) => (
              <button
                key={s}
                onClick={() => { setStatusFilter(s); setFilterSheetOpen(false); }}
                className={cn(
                  "w-full flex items-center justify-between rounded-lg border px-3 py-2.5 text-sm",
                  statusFilter === s
                    ? "border-primary bg-primary/5 text-foreground"
                    : "border-border bg-card text-foreground hover:bg-muted/40",
                )}
              >
                <span className="font-medium capitalize">{s.replace("_", " ")}</span>
                <Badge variant="outline" className="text-[10px]">{counts[s as keyof typeof counts] ?? 0}</Badge>
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      {/* ── Desktop tools sheet ── */}
      <Sheet open={toolsSheetOpen} onOpenChange={setToolsSheetOpen}>
        <SheetContent side="bottom" className="rounded-t-3xl max-h-[80vh] overflow-y-auto">
          <SheetHeader className="text-left">
            <SheetTitle className="text-base font-bold font-heading">Desktop tools</SheetTitle>
            <p className="text-xs text-muted-foreground">
              These actions are recommended on desktop. Mobile support is rolling out.
            </p>
          </SheetHeader>
          <div className="mt-4 space-y-1.5">
            {isPrivileged && (
              <ToolRow
                icon={Rocket}
                title="Activation Campaign"
                hint="Bulk-activate eligible workers"
                onClick={() => { setToolsSheetOpen(false); onOpenCampaign(); }}
              />
            )}
            {isPrivileged && (
              <ToolRow
                icon={UserSearch}
                title="Detect duplicates"
                hint="Desktop recommended"
                onClick={() => { setToolsSheetOpen(false); navigate("/app/workers/duplicates"); }}
              />
            )}
            <ToolRow icon={Upload} title="Import workers" hint="Desktop recommended" disabled />
            <ToolRow icon={ArrowUpDown} title="Update via file" hint="Desktop recommended" disabled />
            <ToolRow icon={Download} title="Export" hint="Desktop recommended" disabled />
            <ToolRow icon={Settings2} title="Onboarding settings" hint="Open settings" onClick={() => { setToolsSheetOpen(false); onOpenOnboardingSettings(); }} />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

/* ─────────────────────────── helpers ─────────────────────────── */

function StatusChip({
  label, value, active, tone = "neutral", onClick,
}: {
  label: string; value: number; active: boolean;
  tone?: "neutral" | "success" | "warning" | "info";
  onClick: () => void;
}) {
  const toneCls =
    tone === "success" ? "text-emerald-600" :
    tone === "warning" ? "text-amber-600" :
    tone === "info"    ? "text-sky-600" :
    "text-foreground";
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-lg border bg-card px-2 py-1.5 text-left transition active:scale-[0.98]",
        active ? "border-primary ring-1 ring-primary/30" : "border-border",
      )}
    >
      <div className={cn("text-base font-bold tabular-nums leading-tight", toneCls)}>{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground leading-tight">{label}</div>
    </button>
  );
}

function ToolRow({
  icon: Icon, title, hint, onClick, disabled,
}: {
  icon: any; title: string; hint?: string; onClick?: () => void; disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 text-left",
        disabled ? "opacity-60" : "hover:bg-muted/40 active:scale-[0.99]",
      )}
    >
      <div className="h-8 w-8 rounded-md bg-muted flex items-center justify-center text-foreground shrink-0">
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-foreground">{title}</div>
        {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
      </div>
      {!disabled && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
    </button>
  );
}

function WorkerRow({
  e, invitation, onOpenProfile, onInvite, onCopyInviteLink,
}: {
  e: any;
  invitation: any;
  onOpenProfile: () => void;
  onInvite: () => void;
  onCopyInviteLink: (token: string) => void;
}) {
  const phone10 = normalizePhone(e.phone_number ?? "");
  const isActive = e.is_active !== false;
  const hasPortal = !!e.user_id;
  const inviteToken = invitation?.invite_token as string | undefined;
  const inviteDecision = canInviteWorker(e, invitation);

  const statusLabel = !isActive
    ? "Inactive"
    : hasPortal
    ? "Portal active"
    : invitation
    ? "Invited"
    : "Needs invite";
  const statusTone =
    !isActive ? "bg-muted text-muted-foreground" :
    hasPortal ? "bg-emerald-500/10 text-emerald-700" :
    invitation ? "bg-sky-500/10 text-sky-700" :
    "bg-amber-500/10 text-amber-700";

  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={onOpenProfile}
      onKeyDown={(ev) => { if (ev.key === "Enter") onOpenProfile(); }}
      className="px-3 py-2.5 flex items-center gap-3 active:scale-[0.99] transition cursor-pointer"
    >
      <EmployeeAvatar
        firstName={e.first_name ?? ""}
        lastName={e.last_name ?? ""}
        avatarUrl={e.avatar_url}
        gender={e.gender}
        size="md"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="text-sm font-semibold text-foreground truncate">
            {formatPersonName(`${e.first_name ?? ""} ${e.last_name ?? ""}`)}
          </div>
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 flex-wrap">
          <span className={cn("inline-flex items-center rounded px-1.5 py-px text-[9.5px] font-medium", statusTone)}>
            {statusLabel}
          </span>
          {e.employee_role && (
            <span className="text-[10.5px] text-muted-foreground">
              {formatDisplayText(e.employee_role, "label")}
            </span>
          )}
          {phone10 && (
            <span className="text-[10.5px] text-muted-foreground font-mono">· {phone10}</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-0.5 shrink-0">
        {phone10 && (
          <a
            href={`tel:${phone10}`}
            onClick={(ev) => ev.stopPropagation()}
            aria-label="Call"
            className="h-8 w-8 rounded-md inline-flex items-center justify-center text-foreground hover:bg-muted/60"
          >
            <Phone className="h-3.5 w-3.5" />
          </a>
        )}
        {phone10 && (
          <a
            href={`https://wa.me/1${phone10}`}
            target="_blank" rel="noreferrer noopener"
            onClick={(ev) => ev.stopPropagation()}
            aria-label="WhatsApp"
            className="h-8 w-8 rounded-md inline-flex items-center justify-center text-emerald-600 hover:bg-emerald-500/10"
          >
            <MessageCircle className="h-3.5 w-3.5" />
          </a>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={(ev) => ev.stopPropagation()}
              aria-label="Worker actions"
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52" onClick={(ev) => ev.stopPropagation()}>
            <DropdownMenuItem onClick={onOpenProfile}>
              <ChevronRight className="h-3.5 w-3.5 mr-2" /> Open profile
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={!inviteDecision.allowed}
              onClick={onInvite}
              title={inviteDecision.reason}
            >
              <Send className="h-3.5 w-3.5 mr-2" /> Resend invite
            </DropdownMenuItem>
            {inviteToken && (
              <DropdownMenuItem onClick={() => onCopyInviteLink(inviteToken)}>
                <CopyIcon className="h-3.5 w-3.5 mr-2" /> Copy invite link
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </Card>
  );
}
