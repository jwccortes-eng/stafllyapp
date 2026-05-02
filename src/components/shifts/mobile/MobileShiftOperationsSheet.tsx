import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  X, Clock, MapPin, Building2, Users, Phone, FileEdit, AlertTriangle,
  CheckCircle2, CalendarDays, Sparkles, UserPlus, Share2, ClipboardList,
  ExternalLink, Copy, StickyNote, Hash, Tag, Workflow, ChevronDown,
  ShieldCheck,
} from "lucide-react";
import { format, parseISO, isToday, isTomorrow, isPast } from "date-fns";
import { enUS } from "date-fns/locale";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { isDraftShift, isPublishedShift } from "@/lib/shifts/shift-guards";
import { formatShiftCode, type Shift, type Assignment, type Employee } from "@/components/shifts/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { staffedAssignments } from "@/lib/shifts/assignment-coverage";
import { canManageShifts } from "@/lib/shifts/shift-permissions";
import { AttendanceValidator } from "@/components/shifts/AttendanceValidator";
import {
  TraceabilitySnapshot,
  type TraceRisk,
  type TraceTimelineEvent,
  type TraceLinkedRecord,
  type TraceSourceKind,
} from "@/components/traceability/TraceabilitySnapshot";

/**
 * MobileShiftOperationsSheet — Mobile Shifts Phase 1.5
 *
 * Operations Snapshot for a shift. Frontend-only, READ-ONLY for mutations.
 * No queries — consumes data already loaded by MobileShiftsView.
 * No notifications, no DB writes, no schema/RLS impact.
 */

interface Props {
  shift: Shift | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assignments: Assignment[];
  employees: Employee[];
  clientName: string;
  locationName: string;
  /** Optional — if a meeting point text is available, pass it. */
  meetingPoint?: string | null;
}

function formatTimeShort(t: string): string {
  if (!t) return "—";
  const [h, m] = t.split(":");
  return `${h}:${m}`;
}

function calcHours(start: string, end: string): number {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let mins = (eh * 60 + em) - (sh * 60 + sm);
  if (mins <= 0) mins += 24 * 60;
  return mins / 60;
}

function dateLabel(dateStr: string): string {
  try {
    const d = parseISO(dateStr);
    if (isToday(d)) return "Today";
    if (isTomorrow(d)) return "Tomorrow";
    return format(d, "EEEE, MMM d", { locale: enUS });
  } catch { return dateStr; }
}

function initials(e: Employee): string {
  const a = e.first_name?.[0] ?? "";
  const b = e.last_name?.[0] ?? "";
  return (a + b).toUpperCase() || "·";
}

export function MobileShiftOperationsSheet({
  shift, open, onOpenChange, assignments, employees,
  clientName, locationName, meetingPoint,
}: Props) {
  const navigate = useNavigate();
  const [traceOpen, setTraceOpen] = useState(false);

  const data = useMemo(() => {
    if (!shift) return null;

    const empById = new Map(employees.map(e => [e.id, e]));
    const shiftAsgns = assignments.filter(a => a.shift_id === shift.id);
    const confirmed = shiftAsgns.filter(a => a.status === "confirmed");
    const assignedWorkers = confirmed
      .map(a => empById.get(a.employee_id))
      .filter(Boolean) as Employee[];

    const slots = shift.slots ?? 0;
    const assignedCount = confirmed.length;
    const coverage = slots > 0 ? Math.round((assignedCount / slots) * 100) : (assignedCount > 0 ? 100 : 0);
    const understaffed = slots > 0 && assignedCount < slots;
    const fullyStaffed = slots > 0 && assignedCount >= slots;
    const draft = isDraftShift(shift);
    const published = isPublishedShift(shift);
    const noClient = !shift.client_id;
    const noLocation = !shift.location_id;
    const hours = calcHours(shift.start_time, shift.end_time);

    let dateBucket: "today" | "tomorrow" | "past" | "future" = "future";
    try {
      const d = parseISO(shift.date);
      if (isToday(d)) dateBucket = "today";
      else if (isTomorrow(d)) dateBucket = "tomorrow";
      else if (isPast(d)) dateBucket = "past";
    } catch { /* noop */ }

    return {
      shiftAsgns, confirmed, assignedWorkers, slots, assignedCount, coverage,
      understaffed, fullyStaffed, draft, published, noClient, noLocation,
      hours, dateBucket,
    };
  }, [shift, assignments, employees]);

  if (!shift || !data) return null;

  const {
    assignedWorkers, slots, assignedCount, coverage, understaffed, fullyStaffed,
    draft, published, noClient, noLocation, hours, dateBucket,
  } = data;

  // ── Smart brief (deterministic)
  const briefMessages: { tone: "good" | "warn" | "bad" | "info"; text: string }[] = [];
  if (draft) briefMessages.push({ tone: "warn", text: "Draft — workers won't see this yet" });
  if (published && understaffed) {
    const missing = slots - assignedCount;
    briefMessages.push({ tone: "bad", text: `Needs ${missing} more worker${missing === 1 ? "" : "s"}` });
  }
  if (published && fullyStaffed) briefMessages.push({ tone: "good", text: "Fully staffed and published" });
  if (draft && fullyStaffed) briefMessages.push({ tone: "info", text: "Ready to publish" });
  if (assignedCount === 0) briefMessages.push({ tone: "bad", text: "No workers assigned" });
  if (noClient) briefMessages.push({ tone: "warn", text: "No client linked" });
  if (noLocation) briefMessages.push({ tone: "warn", text: "No location linked" });
  if (dateBucket === "today") briefMessages.push({ tone: "info", text: "Starts today" });
  else if (dateBucket === "tomorrow") briefMessages.push({ tone: "info", text: "Upcoming tomorrow" });
  if (briefMessages.length === 0) briefMessages.push({ tone: "good", text: "Looks good — no action needed" });

  // ── Snapshot text
  const snapshot = (() => {
    const when = dateBucket === "today" ? "Today"
      : dateBucket === "tomorrow" ? "Tomorrow"
      : dateBucket === "past" ? `On ${format(parseISO(shift.date), "MMM d", { locale: enUS })}`
      : `On ${format(parseISO(shift.date), "EEE MMM d", { locale: enUS })}`;
    const where = locationName ? ` at ${locationName}` : (clientName && clientName !== "—" ? ` for ${clientName}` : "");
    const cov = slots > 0 ? `Coverage is ${assignedCount}/${slots} workers.` : `${assignedCount} worker${assignedCount === 1 ? "" : "s"} assigned.`;
    const pubText = draft ? "It is still a draft" : published ? "It is published" : "Status pending";
    const tail = published && understaffed
      ? ` and needs ${slots - assignedCount} more worker${slots - assignedCount === 1 ? "" : "s"} before start time.`
      : draft ? " — workers will not see it until published." : ".";
    return `This shift is scheduled for ${when}, ${formatTimeShort(shift.start_time)}–${formatTimeShort(shift.end_time)}${where}. ${cov} ${pubText}${tail}`;
  })();

  // ── Actions
  const summaryText = (() => {
    const code = shift.shift_code ? `Shift #${formatShiftCode(shift.shift_code)} · ` : "";
    const placeBits = [locationName, clientName && clientName !== "—" ? clientName : null].filter(Boolean).join(" · ");
    const dateBit = (() => {
      try { return format(parseISO(shift.date), "MMM d", { locale: enUS }); } catch { return shift.date; }
    })();
    const cov = slots > 0
      ? `Assigned ${assignedCount}/${slots}${understaffed ? ` · Needs ${slots - assignedCount} worker${slots - assignedCount === 1 ? "" : "s"}` : ""}`
      : `Assigned ${assignedCount}`;
    return `${code}${placeBits || "Shift"} · ${dateBit} · ${formatTimeShort(shift.start_time)}–${formatTimeShort(shift.end_time)} · ${cov}`;
  })();

  const handleCopySummary = async () => {
    try {
      await navigator.clipboard.writeText(summaryText);
      toast.success("Shift summary copied");
    } catch {
      toast.error("Couldn't copy to clipboard");
    }
  };

  const handleShare = async () => {
    if (typeof navigator !== "undefined" && (navigator as any).share) {
      try {
        await (navigator as any).share({ title: "Shift", text: summaryText });
        return;
      } catch { /* user cancelled or unsupported */ }
    }
    handleCopySummary();
  };

  const handleOpenFullEditor = () => {
    onOpenChange(false);
    // Phase 1: surface a guidance toast — desktop is the safe edit path.
    toast.info("Open from desktop for full editing", {
      description: "Mobile editing arrives in Phase 2.",
    });
  };

  const handleAssign = () => {
    toast.info("Assignment editing coming in Phase 2", {
      description: "Use desktop to add or remove workers for now.",
    });
  };

  const handleViewAttendance = () => {
    onOpenChange(false);
    navigate(`/app/attendance?shift=${shift.id}`);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="h-[92vh] p-0 rounded-t-3xl flex flex-col overflow-hidden bg-background"
      >
        {/* Sticky Header */}
        <div className="px-5 pt-4 pb-3 border-b border-border/40 bg-background/95 backdrop-blur-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1.5">
                {shift.shift_code && (
                  <span className="inline-flex items-center gap-1 text-xs font-mono font-semibold text-muted-foreground">
                    <Hash className="h-3.5 w-3.5" />
                    {formatShiftCode(shift.shift_code)}
                  </span>
                )}
                <StatusPill draft={draft} published={published} understaffed={understaffed} />
              </div>
              <h2 className="text-xl font-semibold tracking-tight leading-tight line-clamp-2">
                {clientName && clientName !== "—" ? clientName : (shift.title || "Shift")}
              </h2>
              {locationName && (
                <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1 truncate">
                  <MapPin className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{locationName}</span>
                </div>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-full shrink-0 -mt-1 -mr-1"
              onClick={() => onOpenChange(false)}
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* Date + time hero */}
          <div className="mt-3 flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-3 h-9 rounded-lg bg-muted/60">
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">{dateLabel(shift.date)}</span>
            </div>
            <div className="flex items-center gap-1.5 px-3 h-9 rounded-lg bg-muted/60">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-base font-mono font-semibold tabular-nums">
                {formatTimeShort(shift.start_time)}–{formatTimeShort(shift.end_time)}
              </span>
            </div>
          </div>
        </div>

        {/* Scroll area */}
        <div className="flex-1 overflow-y-auto px-5 pt-4 pb-4 space-y-5">
          {/* Operations summary */}
          <section>
            <SectionTitle icon={ClipboardList}>Operations summary</SectionTitle>
            <div className="grid grid-cols-2 gap-2">
              <StatCard label="Slots" value={slots > 0 ? `${assignedCount}/${slots}` : `${assignedCount}`} />
              <StatCard
                label="Coverage"
                value={`${coverage}%`}
                accent={coverage >= 100 ? "good" : coverage >= 60 ? "warn" : "bad"}
              />
              <StatCard label="Workers" value={assignedCount} />
              <StatCard label="Hours / slot" value={hours ? hours.toFixed(1) : "—"} />
            </div>
          </section>

          {/* Smart brief */}
          <section>
            <SectionTitle icon={Sparkles}>What needs attention</SectionTitle>
            <div className="space-y-1.5">
              {briefMessages.map((m, i) => (
                <BriefRow key={i} tone={m.tone} text={m.text} />
              ))}
            </div>
          </section>

          {/* Operations snapshot */}
          <section>
            <SectionTitle icon={Sparkles}>Operations snapshot</SectionTitle>
            <div className="rounded-2xl border border-border/50 bg-muted/30 p-4">
              <p className="text-sm leading-relaxed text-foreground/90">{snapshot}</p>
            </div>
          </section>

          {/* Traceability (collapsed by default to keep sheet light) */}
          <section>
            <button
              type="button"
              onClick={() => setTraceOpen(v => !v)}
              className="w-full flex items-center justify-between gap-2 mb-2.5 px-0.5 text-left"
              aria-expanded={traceOpen}
            >
              <div className="flex items-center gap-1.5">
                <Workflow className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Traceability
                </span>
              </div>
              <ChevronDown
                className={cn(
                  "h-4 w-4 text-muted-foreground transition-transform",
                  traceOpen && "rotate-180"
                )}
              />
            </button>
            {traceOpen ? (
              <TraceabilitySnapshot
                compact
                source={shiftTraceSource(draft, published)}
                sourceNote="Scheduled shift · payroll uses real clock entries only"
                timeline={buildShiftTimeline(shift)}
                linked={buildShiftLinked({
                  shift, clientName, locationName, assignedCount, slots,
                })}
                risks={buildShiftRisks({
                  draft, published, understaffed, assignedCount,
                  noClient, noLocation, hasShiftCode: !!shift.shift_code,
                  imported: !!shift.import_batch_id,
                })}
                audit={buildShiftAudit(shift)}
              />
            ) : (
              <p className="px-0.5 text-xs text-muted-foreground">
                Tap to see source, timeline, linked records and audit.
              </p>
            )}
            <p className="mt-2 px-0.5 text-[11px] text-muted-foreground">
              Clock entries are reviewed from Time Clock.{" "}
              <button
                type="button"
                onClick={handleViewAttendance}
                className="font-semibold text-primary underline-offset-2 hover:underline"
              >
                View attendance
              </button>
            </p>
          </section>

          {/* Assigned workers */}
          <section>
            <SectionTitle icon={Users}>
              Assigned workers
              <span className="ml-1.5 text-xs font-normal text-muted-foreground normal-case tracking-normal">
                ({assignedCount}{slots > 0 ? `/${slots}` : ""})
              </span>
            </SectionTitle>

            {assignedWorkers.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-4 py-6 text-center">
                <Users className="h-5 w-5 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No workers assigned yet</p>
              </div>
            ) : (
              <div className="space-y-1.5 max-h-[260px] overflow-y-auto pr-1 -mr-1">
                {assignedWorkers.map(w => (
                  <WorkerRow key={w.id} worker={w} />
                ))}
              </div>
            )}

            {understaffed && (
              <div className="mt-2.5 rounded-2xl border border-rose-500/30 bg-rose-500/5 p-3.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-rose-700 dark:text-rose-400">
                    {slots - assignedCount} spot{slots - assignedCount === 1 ? "" : "s"} open
                  </div>
                  <div className="text-xs text-rose-600/80 dark:text-rose-400/70 mt-0.5">
                    Add workers to reach full coverage
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0 h-9 rounded-xl border-rose-500/40 text-rose-700 dark:text-rose-400 hover:bg-rose-500/10 text-sm font-medium"
                  onClick={handleAssign}
                >
                  <UserPlus className="h-3.5 w-3.5 mr-1" />
                  Assign
                </Button>
              </div>
            )}
          </section>

          {/* Operational details */}
          <section>
            <SectionTitle icon={Tag}>Details</SectionTitle>
            <div className="rounded-2xl border border-border/50 bg-card divide-y divide-border/40">
              <DetailRow icon={CalendarDays} label="Date" value={(() => {
                try { return format(parseISO(shift.date), "EEEE, MMMM d, yyyy", { locale: enUS }); } catch { return shift.date; }
              })()} />
              <DetailRow icon={Clock} label="Start" value={formatTimeShort(shift.start_time)} />
              <DetailRow icon={Clock} label="End" value={formatTimeShort(shift.end_time)} />
              <DetailRow icon={Building2} label="Client" value={clientName && clientName !== "—" ? clientName : "—"} muted={!clientName || clientName === "—"} />
              <DetailRow icon={MapPin} label="Location" value={locationName || "—"} muted={!locationName} />
              {meetingPoint && <DetailRow icon={MapPin} label="Meeting point" value={meetingPoint} />}
              <DetailRow
                icon={FileEdit}
                label="Publication"
                value={draft ? "Draft" : published ? "Published" : (shift.publication_status ?? "—")}
              />
              {shift.claimable && (
                <DetailRow icon={Sparkles} label="Claimable" value="Open to worker claims" />
              )}
              {shift.notes && (
                <div className="px-4 py-3">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground mb-1.5">
                    <StickyNote className="h-3.5 w-3.5" />
                    Notes
                  </div>
                  <p className="text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap">
                    {shift.notes}
                  </p>
                </div>
              )}
            </div>
          </section>

          {/* Inline secondary actions */}
          <section className="grid grid-cols-2 gap-2">
            <Button variant="outline" className="h-12 rounded-xl justify-start gap-2 text-sm font-medium" onClick={handleCopySummary}>
              <Copy className="h-4 w-4" />
              <span>Copy summary</span>
            </Button>
            <Button variant="outline" className="h-12 rounded-xl justify-start gap-2 text-sm font-medium" onClick={handleShare}>
              <Share2 className="h-4 w-4" />
              <span>Share shift</span>
            </Button>
            <Button variant="outline" className="h-12 rounded-xl justify-start gap-2 text-sm font-medium" onClick={handleViewAttendance}>
              <ClipboardList className="h-4 w-4" />
              <span>Attendance</span>
            </Button>
            <Button variant="outline" className="h-12 rounded-xl justify-start gap-2 text-sm font-medium" onClick={handleAssign}>
              <UserPlus className="h-4 w-4" />
              <span>Assign workers</span>
            </Button>
          </section>
        </div>

        {/* Sticky footer */}
        <div className="px-5 pt-3 pb-[max(env(safe-area-inset-bottom,0px),12px)] border-t border-border/40 bg-background/95 backdrop-blur-sm">
          <Button
            className="w-full h-12 rounded-xl text-sm font-semibold gap-2"
            onClick={handleOpenFullEditor}
          >
            <ExternalLink className="h-4 w-4" />
            Open full editor
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/* ───── Subcomponents ───── */

function SectionTitle({ icon: Icon, children }: { icon: any; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 mb-2.5 px-0.5">
      <Icon className="h-4 w-4 text-muted-foreground" />
      <span className="text-sm font-semibold text-foreground">
        {children}
      </span>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: number | string; accent?: "good" | "warn" | "bad" }) {
  const cls =
    accent === "good" ? "text-emerald-600 dark:text-emerald-400" :
    accent === "warn" ? "text-amber-600 dark:text-amber-400" :
    accent === "bad"  ? "text-rose-600 dark:text-rose-400" :
    "text-foreground";
  return (
    <div className="rounded-2xl border border-border/50 bg-card px-3.5 py-3.5 shadow-sm">
      <div className={cn("text-2xl font-semibold tabular-nums leading-none", cls)}>{value}</div>
      <div className="text-xs text-muted-foreground mt-2 font-medium">{label}</div>
    </div>
  );
}

function BriefRow({ tone, text }: { tone: "good" | "warn" | "bad" | "info"; text: string }) {
  const map = {
    good: { cls: "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400", Icon: CheckCircle2 },
    warn: { cls: "border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-400", Icon: AlertTriangle },
    bad:  { cls: "border-rose-500/30 bg-rose-500/5 text-rose-700 dark:text-rose-400", Icon: AlertTriangle },
    info: { cls: "border-border bg-muted/30 text-foreground/80", Icon: Sparkles },
  } as const;
  const { cls, Icon } = map[tone];
  return (
    <div className={cn("flex items-center gap-2 rounded-xl border px-3 py-2.5", cls)}>
      <Icon className="h-4 w-4 shrink-0" />
      <span className="text-sm font-medium leading-snug">{text}</span>
    </div>
  );
}

function WorkerRow({ worker }: { worker: Employee }) {
  const phone = worker.phone_number?.trim();
  const initialsStr = (worker.first_name?.[0] ?? "").toUpperCase() + (worker.last_name?.[0] ?? "").toUpperCase();
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border/50 bg-card px-3 py-2.5">
      <Avatar className="h-10 w-10 shrink-0">
        {worker.avatar_url ? <AvatarImage src={worker.avatar_url} alt="" /> : null}
        <AvatarFallback className="text-xs font-semibold bg-muted">
          {initialsStr || "·"}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium truncate leading-snug">
          {worker.first_name} {worker.last_name}
        </div>
        <div className="text-xs text-muted-foreground truncate mt-0.5">
          {phone ? phone : "No phone on file"}
        </div>
      </div>
      {phone ? (
        <a
          href={`tel:${phone}`}
          className="shrink-0 inline-flex items-center justify-center h-10 w-10 rounded-xl bg-primary/10 text-primary hover:bg-primary/15 active:scale-95 transition"
          aria-label={`Call ${worker.first_name}`}
        >
          <Phone className="h-4 w-4" />
        </a>
      ) : null}
    </div>
  );
}

function DetailRow({ icon: Icon, label, value, muted }: { icon: any; label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
      <div className="text-xs font-medium text-muted-foreground w-24 shrink-0">
        {label}
      </div>
      <div className={cn("text-sm font-medium truncate text-right flex-1", muted && "text-muted-foreground")}>
        {value}
      </div>
    </div>
  );
}

function StatusPill({ draft, published, understaffed }: { draft: boolean; published: boolean; understaffed: boolean }) {
  const base = "text-[11px] font-medium h-[22px] px-2 leading-none";
  if (draft) {
    return <Badge variant="outline" className={cn(base, "border-amber-500/40 text-amber-700 dark:text-amber-400 bg-amber-500/10")}>Draft</Badge>;
  }
  if (published && understaffed) {
    return <Badge variant="outline" className={cn(base, "border-rose-500/40 text-rose-700 dark:text-rose-400 bg-rose-500/10")}>Unstaffed</Badge>;
  }
  if (published) {
    return <Badge variant="outline" className={cn(base, "border-emerald-500/40 text-emerald-700 dark:text-emerald-400 bg-emerald-500/10")}>Published</Badge>;
  }
  return <Badge variant="outline" className={cn(base)}>Shift</Badge>;
}

/* ───── Traceability builders (pure, read-only) ───── */

function shiftTraceSource(draft: boolean, _published: boolean): TraceSourceKind {
  // Scheduled shifts are NOT a paid source — surface as "scheduled_only".
  // Drafts get the same kind (the warning tone is reinforced via risks).
  return "scheduled_only";
}

function buildShiftTimeline(shift: Shift): TraceTimelineEvent[] {
  // Synthesize start/end from date + time so the timeline is meaningful even
  // if no created_at/published_at is present in the row.
  const startISO = shift.date && shift.start_time
    ? `${shift.date}T${shift.start_time}`
    : null;
  const endISO = shift.date && shift.end_time
    ? `${shift.date}T${shift.end_time}`
    : null;

  const events: TraceTimelineEvent[] = [];
  if (shift.created_at) events.push({ label: "Created", at: shift.created_at });
  if (shift.published_at) events.push({ label: "Published", at: shift.published_at });
  if (shift.updated_at) events.push({ label: "Last updated", at: shift.updated_at });
  events.push({ label: "Scheduled start", at: startISO });
  events.push({ label: "Scheduled end", at: endISO });
  return events;
}

function buildShiftLinked(args: {
  shift: Shift;
  clientName: string;
  locationName: string;
  assignedCount: number;
  slots: number;
}): TraceLinkedRecord[] {
  const { shift, clientName, locationName, assignedCount, slots } = args;
  const open = slots > 0 ? Math.max(0, slots - assignedCount) : 0;
  return [
    { label: "Shift ID", value: shift.id.slice(0, 8) + "…", hint: shift.id },
    { label: "Shift code", value: shift.shift_code ? formatShiftCode(shift.shift_code) : null },
    { label: "Client", value: clientName && clientName !== "—" ? clientName : null },
    { label: "Location", value: locationName || null },
    { label: "Assignments", value: String(assignedCount) },
    { label: "Open slots", value: slots > 0 ? String(open) : "—" },
    {
      label: "Publication",
      value: shift.publication_status ?? (shift.status || null),
    },
  ];
}

function buildShiftRisks(args: {
  draft: boolean;
  published: boolean;
  understaffed: boolean;
  assignedCount: number;
  noClient: boolean;
  noLocation: boolean;
  hasShiftCode: boolean;
  imported: boolean;
}): TraceRisk[] {
  const risks: TraceRisk[] = [];
  // Always-on payroll guardrail
  risks.push({
    label: "Scheduled hours are not used for pay — payroll uses real clock entries only",
    tone: "info",
  });
  if (args.draft) risks.push({ label: "Draft shift — workers won't see it yet", tone: "warn" });
  if (args.published && args.understaffed) risks.push({ label: "Needs more staff", tone: "warn" });
  if (args.assignedCount === 0) risks.push({ label: "No workers assigned", tone: "bad" });
  if (args.noClient) risks.push({ label: "No client linked", tone: "warn" });
  if (args.noLocation) risks.push({ label: "No location linked", tone: "warn" });
  if (!args.hasShiftCode) risks.push({ label: "No shift code", tone: "warn" });
  if (args.imported) risks.push({ label: "Imported from a batch", tone: "info" });
  return risks;
}

function buildShiftAudit(shift: Shift): TraceLinkedRecord[] {
  const fmtTs = (ts: string | null | undefined) => {
    if (!ts) return null;
    try { return format(parseISO(ts), "MMM d, yyyy · HH:mm", { locale: enUS }); }
    catch { return ts; }
  };
  return [
    { label: "Created at", value: fmtTs(shift.created_at), hint: shift.created_at ?? undefined },
    { label: "Created by", value: shift.created_by ? shift.created_by.slice(0, 8) + "…" : null, hint: shift.created_by ?? undefined },
    { label: "Published by", value: shift.published_by ? shift.published_by.slice(0, 8) + "…" : null, hint: shift.published_by ?? undefined },
    { label: "Updated at", value: fmtTs(shift.updated_at), hint: shift.updated_at ?? undefined },
    { label: "Import batch", value: shift.import_batch_id ? shift.import_batch_id.slice(0, 8) + "…" : null, hint: shift.import_batch_id ?? undefined },
    { label: "Reconciliation hash", value: shift.reconciliation_hash ? shift.reconciliation_hash.slice(0, 10) + "…" : null, hint: shift.reconciliation_hash ?? undefined },
  ];
}
