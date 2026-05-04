import { Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { startOfDay, endOfDay, format, differenceInHours } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { OpsStatusChip, type OpsStatusTone } from "@/components/operations/OpsStatusChip";
import { EmptyState } from "@/components/ui/empty-state";
import { useCompany } from "@/hooks/useCompany";
import { supabase } from "@/integrations/supabase/client";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CalendarCheck2,
  ClipboardList,
  Clock,
  Users,
  ListChecks,
} from "lucide-react";

/**
 * /app/today — Operations Workbench (read-only)
 *
 * Sin writes, sin schema, sin notificaciones, sin payroll.
 * Solo lecturas a scheduled_shifts / shift_assignments / time_entries
 * filtradas por selectedCompanyId. CTAs solo navegan.
 *
 * Detectores implementados (read-only):
 *  A. Open clock-ins > 16h
 *  B. Shifts operables hoy con staffing incompleto
 *  C. Shifts operables hoy sin ningún assignment
 *  D. Time entries con status = 'pending' del día
 *  E. Drafts de hoy con assignments (publication_status='draft')
 */

const NON_OPERABLE_STATUS = new Set(["draft", "cancelled", "canceled", "archived"]);
const ACTIVE_ASG = new Set(["accepted", "confirmed", "pending"]);
const shiftOpsHref = (shiftId: string) => `/app/shift-ops?id=${shiftId}`;

type ShiftRow = {
  id: string;
  title: string | null;
  start_time: string | null;
  end_time: string | null;
  slots: number | null;
  status: string | null;
  publication_status: string | null;
  client_id: string | null;
};

type AsgRow = { shift_id: string; status: string; employee_id: string | null };
type TeRow = {
  id: string;
  clock_in: string | null;
  clock_out: string | null;
  shift_id: string | null;
  employee_id: string | null;
  status: string | null;
};

type ShiftCard = {
  id: string;
  title: string;
  time: string;
  shiftStatus: string;
  pubStatus: string;
  slots: number;
  assigned: number;
  clockIns: number;
  risk: { tone: OpsStatusTone; label: string };
};

type QueueItem = {
  key: string;
  type: string;
  description: string;
  entity: string;
  priority: "high" | "medium" | "low";
  href: string;
};

type DayHealth = "ok" | "review";

export default function Today() {
  const { selectedCompanyId, selectedCompany } = useCompany();
  const [loading, setLoading] = useState(true);
  const [shifts, setShifts] = useState<ShiftRow[]>([]);
  const [assignments, setAssignments] = useState<AsgRow[]>([]);
  const [entries, setEntries] = useState<TeRow[]>([]);
  const [openEntries, setOpenEntries] = useState<TeRow[]>([]);
  const [clientNames, setClientNames] = useState<Record<string, string>>({});
  const [employeeNames, setEmployeeNames] = useState<Record<string, string>>({});

  const today = useMemo(() => new Date(), []);
  const dayKey = format(today, "yyyy-MM-dd");

  useEffect(() => {
    let cancelled = false;
    if (!selectedCompanyId) {
      setLoading(false);
      setShifts([]); setAssignments([]); setEntries([]); setOpenEntries([]);
      return;
    }
    setLoading(true);

    (async () => {
      try {
        const dayStart = startOfDay(today).toISOString();
        const dayEnd = endOfDay(today).toISOString();

        // Q1: scheduled_shifts hoy
        const { data: sData } = await supabase
          .from("scheduled_shifts")
          .select("id, title, start_time, end_time, slots, status, publication_status, client_id")
          .eq("company_id", selectedCompanyId)
          .eq("date", dayKey)
          .is("deleted_at", null)
          .order("start_time", { ascending: true });
        const shiftRows = (sData ?? []) as ShiftRow[];

        // Q2: shift_assignments por shift_id
        const shiftIds = shiftRows.map((s) => s.id);
        let asgRows: AsgRow[] = [];
        if (shiftIds.length > 0) {
          const { data } = await supabase
            .from("shift_assignments")
            .select("shift_id, status, employee_id")
            .in("shift_id", shiftIds);
          asgRows = (data ?? []) as AsgRow[];
        }

        // Q3: time_entries del día (por shift) y open entries (clock_out null) globales
        let teRows: TeRow[] = [];
        if (shiftIds.length > 0) {
          const { data } = await supabase
            .from("time_entries")
            .select("id, clock_in, clock_out, shift_id, employee_id, status")
            .eq("company_id", selectedCompanyId)
            .in("shift_id", shiftIds);
          teRows = (data ?? []) as TeRow[];
        }
        const { data: openData } = await supabase
          .from("time_entries")
          .select("id, clock_in, clock_out, shift_id, employee_id, status")
          .eq("company_id", selectedCompanyId)
          .is("clock_out", null);
        const openRows = (openData ?? []) as TeRow[];

        // Lookups: clients + employees (open entries)
        const clientIds = Array.from(new Set(shiftRows.map((s) => s.client_id).filter(Boolean))) as string[];
        const empIds = Array.from(new Set(openRows.map((e) => e.employee_id).filter(Boolean))) as string[];

        const [clientsRes, empRes] = await Promise.all([
          clientIds.length
            ? supabase.from("clients").select("id, name").in("id", clientIds)
            : Promise.resolve({ data: [] as any[] }),
          empIds.length
            ? supabase.from("employees").select("id, first_name, last_name").in("id", empIds)
            : Promise.resolve({ data: [] as any[] }),
        ]);
        const cMap: Record<string, string> = {};
        (clientsRes.data ?? []).forEach((c: any) => { cMap[c.id] = c.name ?? "Cliente"; });
        const eMap: Record<string, string> = {};
        (empRes.data ?? []).forEach((e: any) => {
          eMap[e.id] = `${e.first_name ?? ""} ${e.last_name ?? ""}`.trim() || "Trabajador";
        });

        if (cancelled) return;
        setShifts(shiftRows);
        setAssignments(asgRows);
        setEntries(teRows);
        setOpenEntries(openRows);
        setClientNames(cMap);
        setEmployeeNames(eMap);
        setLoading(false);
      } catch {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [selectedCompanyId, dayKey, today]);

  // ---- Derived: shift cards
  const shiftCards: ShiftCard[] = useMemo(() => {
    const asgByShift = new Map<string, AsgRow[]>();
    assignments.forEach((a) => {
      const arr = asgByShift.get(a.shift_id) ?? [];
      arr.push(a);
      asgByShift.set(a.shift_id, arr);
    });
    const teByShift = new Map<string, TeRow[]>();
    entries.forEach((e) => {
      if (!e.shift_id) return;
      const arr = teByShift.get(e.shift_id) ?? [];
      arr.push(e);
      teByShift.set(e.shift_id, arr);
    });

    return shifts.map((s) => {
      const asg = asgByShift.get(s.id) ?? [];
      const assigned = asg.filter((a) => ACTIVE_ASG.has(String(a.status))).length;
      const slots = Number(s.slots ?? 0);
      const te = teByShift.get(s.id) ?? [];
      const clockIns = te.length;
      const openHere = te.filter((t) => !t.clock_out).length;

      const status = String(s.status ?? "").toLowerCase();
      const pub = String(s.publication_status ?? "").toLowerCase();
      const operable = !NON_OPERABLE_STATUS.has(status) && pub !== "draft";

      let risk: { tone: OpsStatusTone; label: string } = { tone: "success", label: "OK" };
      if (operable && slots > 0 && assigned < slots) {
        risk = { tone: "critical", label: "Staffing gap" };
      } else if (openHere > 0) {
        risk = { tone: "warning", label: "Clock-in abierto" };
      } else if (operable && clockIns === 0) {
        const startedHoursAgo = s.start_time
          ? differenceInHours(today, new Date(`${dayKey}T${s.start_time}`))
          : -1;
        if (startedHoursAgo > 0) risk = { tone: "warning", label: "Sin actividad" };
      }
      if (!operable) risk = { tone: "muted", label: pub === "draft" ? "Borrador" : status || "—" };

      const time = s.start_time ? s.start_time.slice(0, 5) : "—";
      const clientName = s.client_id ? clientNames[s.client_id] : null;
      const title = s.title || clientName || "Turno";

      return {
        id: s.id,
        title,
        time,
        shiftStatus: status || "scheduled",
        pubStatus: pub || "—",
        slots,
        assigned,
        clockIns,
        risk,
      };
    });
  }, [shifts, assignments, entries, clientNames, today, dayKey]);

  // ---- Work Queue detectors
  const queue: QueueItem[] = useMemo(() => {
    const items: QueueItem[] = [];

    // A) Open clock-ins > 16h
    openEntries.forEach((e) => {
      if (!e.clock_in) return;
      const h = differenceInHours(today, new Date(e.clock_in));
      if (h > 16) {
        const who = e.employee_id ? employeeNames[e.employee_id] ?? "Trabajador" : "Trabajador";
        items.push({
          key: `stale-${e.id}`,
          type: "Clock-in abierto",
          description: `${who} sigue clocked-in hace ${h}h`,
          entity: who,
          priority: "high",
          href: "/app/timeclock",
        });
      }
    });

    // B/C/E shift-based
    shifts.forEach((s) => {
      const status = String(s.status ?? "").toLowerCase();
      const pub = String(s.publication_status ?? "").toLowerCase();
      const operable = !NON_OPERABLE_STATUS.has(status) && pub !== "draft";
      const asg = assignments.filter((a) => a.shift_id === s.id && ACTIVE_ASG.has(String(a.status)));
      const slots = Number(s.slots ?? 0);
      const clientName = s.client_id ? clientNames[s.client_id] : null;
      const label = s.title || clientName || "Turno";

      if (operable && asg.length === 0 && slots > 0) {
        items.push({
          key: `nostaff-${s.id}`,
          type: "Sin assignments",
          description: `${label} no tiene a nadie asignado (${slots} cupos)`,
          entity: label,
          priority: "high",
            href: shiftOpsHref(s.id),
        });
      } else if (operable && asg.length < slots) {
        items.push({
          key: `gap-${s.id}`,
          type: "Staffing incompleto",
          description: `${label} tiene ${slots - asg.length} cupo(s) sin cubrir`,
          entity: label,
          priority: "medium",
            href: shiftOpsHref(s.id),
        });
      }

      // E) Drafts con assignments
      if (pub === "draft" && asg.length > 0) {
        items.push({
          key: `draft-${s.id}`,
          type: "Borrador con gente",
          description: `${label} está en borrador con ${asg.length} trabajador(es)`,
          entity: label,
          priority: "medium",
            href: shiftOpsHref(s.id),
        });
      }
    });

    // D) Time entries pending
    const pendingCount = entries.filter((e) => String(e.status ?? "").toLowerCase() === "pending").length;
    if (pendingCount > 0) {
      items.push({
        key: "pending-te",
        type: "Time entries pendientes",
        description: `${pendingCount} marca(s) de hoy esperan revisión`,
        entity: "Time clock",
        priority: "medium",
        href: "/app/timeclock",
      });
    }

    const order = { high: 0, medium: 1, low: 2 } as const;
    return items.sort((a, b) => order[a.priority] - order[b.priority]).slice(0, 5);
  }, [openEntries, shifts, assignments, entries, clientNames, employeeNames, today]);

  // ---- Day Close mini health
  const attendance: DayHealth = openEntries.some((e) => e.clock_in && differenceInHours(today, new Date(e.clock_in)) > 16) ? "review" : "ok";
  const staffing: DayHealth = shiftCards.some((c) => c.risk.label === "Staffing gap" || c.risk.label === "Sin actividad") ? "review" : "ok";
  const payrollReadiness: DayHealth = entries.some((e) => String(e.status ?? "").toLowerCase() === "pending") || openEntries.length > 0 ? "review" : "ok";
  const dayState: "in_progress" | "needs_review" | "ready" =
    attendance === "review" || staffing === "review" || payrollReadiness === "review"
      ? "needs_review"
      : shiftCards.length === 0
      ? "ready"
      : "in_progress";

  const dayStateChip = {
    in_progress: { tone: "primary" as OpsStatusTone, label: "En curso", pulse: true },
    needs_review: { tone: "warning" as OpsStatusTone, label: "Requiere revisión" },
    ready: { tone: "success" as OpsStatusTone, label: "Listo" },
  }[dayState];

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Header compacto */}
        <header className="mb-6 flex flex-col gap-3 border-b border-border/60 pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-display text-2xl font-semibold tracking-tight">Hoy</h1>
              <Badge variant="outline" className="border-dashed text-[10px]">Read-only</Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Operación en vivo, decisiones pendientes y cierre del día.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-md border border-border/60 bg-muted/30 px-2 py-1 font-medium tabular-nums">
              {format(today, "EEE, MMM d")}
            </span>
            {selectedCompany?.name && (
              <span className="rounded-md border border-border/60 bg-muted/30 px-2 py-1 font-medium">
                {selectedCompany.name}
              </span>
            )}
            <OpsStatusChip tone={dayStateChip.tone} label={dayStateChip.label} pulse={dayStateChip.pulse} />
          </div>
        </header>

        {/* Grid: main + side */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Side first on mobile (Work Queue + Day Close), but second on desktop */}
          <aside className="order-1 space-y-4 lg:order-2 lg:col-span-1">
            {/* Work Queue */}
            <Card className="border-border/70">
              <CardContent className="p-4">
                <SectionHeader icon={ListChecks} title="Qué tienes que resolver" hint={`${queue.length} item(s)`} />
                {loading ? (
                  <div className="space-y-2 py-2">
                    {[0,1,2].map((i) => <div key={i} className="h-12 animate-pulse rounded-md bg-muted/40" />)}
                  </div>
                ) : queue.length === 0 ? (
                  <EmptyState
                    icon={ListChecks}
                    title="No hay tareas pendientes"
                    description="El día está limpio por ahora."
                    compact
                  />
                ) : (
                  <ul className="divide-y divide-border/50">
                    {queue.map((q) => (
                      <li key={q.key} className="py-2.5 first:pt-1 last:pb-1">
                        <Link to={q.href} className="group block">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <PriorityDot p={q.priority} />
                                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                  {q.type}
                                </span>
                              </div>
                              <p className="mt-0.5 truncate text-sm text-foreground group-hover:text-primary">
                                {q.description}
                              </p>
                            </div>
                            <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/50 transition group-hover:translate-x-0.5 group-hover:text-primary" />
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            {/* Day Close compact */}
            <Card className="border-border/70">
              <CardContent className="p-4">
                <SectionHeader icon={CalendarCheck2} title="Cierre del día" />
                <ul className="mt-1 space-y-2 text-sm">
                  <HealthRow label="Attendance" value={attendance} />
                  <HealthRow label="Staffing" value={staffing} />
                  <HealthRow label="Payroll readiness" value={payrollReadiness} />
                </ul>
                <Button asChild variant="outline" size="sm" className="mt-3 w-full">
                  <Link to="/app/daily-close">
                    Ver cierre diario
                    <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                  </Link>
                </Button>
                <p className="mt-2 text-[10.5px] leading-relaxed text-muted-foreground">
                  Payroll solo se revisa con horas reales marcadas, nunca con horas programadas.
                </p>
              </CardContent>
            </Card>
          </aside>

          {/* Live Operation */}
          <main className="order-2 lg:order-1 lg:col-span-2">
            <Card className="border-border/70">
              <CardContent className="p-4 sm:p-5">
                <SectionHeader
                  icon={Activity}
                  title="Operación de hoy"
                  hint={`${shiftCards.length} turno(s)`}
                  action={
                    <Button asChild variant="ghost" size="sm">
                      <Link to="/app/timeclock">
                        Ver operación
                        <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  }
                />
                {loading ? (
                  <div className="space-y-2">
                    {[0,1,2,3].map((i) => <div key={i} className="h-14 animate-pulse rounded-md bg-muted/40" />)}
                  </div>
                ) : shiftCards.length === 0 ? (
                  <EmptyState
                    icon={ClipboardList}
                    title="No hay turnos hoy"
                    description="Cuando programes turnos para hoy aparecerán aquí en vivo."
                    compact
                  />
                ) : (
                  <>
                    {/* Desktop table */}
                    <div className="hidden overflow-hidden rounded-lg border border-border/50 md:block">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/40 text-[10.5px] uppercase tracking-wider text-muted-foreground">
                          <tr>
                            <th className="px-3 py-2 text-left font-medium">Hora</th>
                            <th className="px-3 py-2 text-left font-medium">Turno / Cliente</th>
                            <th className="px-3 py-2 text-left font-medium">Estado</th>
                            <th className="px-3 py-2 text-right font-medium">Staffing</th>
                            <th className="px-3 py-2 text-right font-medium">Clock-ins</th>
                            <th className="px-3 py-2 text-left font-medium">Riesgo</th>
                            <th className="px-3 py-2"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {shiftCards.map((c) => (
                            <tr key={c.id} className="border-t border-border/40 hover:bg-accent/20">
                              <td className="px-3 py-2 font-mono text-xs tabular-nums text-foreground/80">{c.time}</td>
                              <td className="px-3 py-2">
                                <div className="font-medium text-foreground truncate max-w-[260px]">{c.title}</div>
                              </td>
                              <td className="px-3 py-2">
                                <span className="text-xs capitalize text-muted-foreground">
                                  {c.pubStatus === "draft" ? "Borrador" : c.shiftStatus}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-right font-mono text-xs tabular-nums">
                                <span className={c.assigned < c.slots ? "text-destructive" : "text-foreground"}>
                                  {c.assigned}/{c.slots}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-right font-mono text-xs tabular-nums text-foreground/80">
                                {c.clockIns}
                              </td>
                              <td className="px-3 py-2">
                                <OpsStatusChip tone={c.risk.tone} label={c.risk.label} size="sm" />
                              </td>
                              <td className="px-3 py-2 text-right">
                                <Button asChild variant="ghost" size="sm" className="h-7 px-2">
                                  <Link to={shiftOpsHref(c.id)}>
                                    Abrir turno
                                    <ArrowRight className="ml-1 h-3 w-3" />
                                  </Link>
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Mobile cards */}
                    <div className="space-y-2 md:hidden">
                      {shiftCards.map((c) => (
                        <Link
                          key={c.id}
                          to={shiftOpsHref(c.id)}
                          className="block rounded-lg border border-border/50 p-3 hover:bg-accent/20"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="font-mono text-xs tabular-nums text-muted-foreground">{c.time}</span>
                              <span className="truncate text-sm font-medium">{c.title}</span>
                            </div>
                            <OpsStatusChip tone={c.risk.tone} label={c.risk.label} size="sm" />
                          </div>
                          <div className="mt-1.5 flex items-center gap-3 text-[11px] text-muted-foreground">
                            <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" />{c.assigned}/{c.slots}</span>
                            <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{c.clockIns}</span>
                            <span className="capitalize">{c.pubStatus === "draft" ? "Borrador" : c.shiftStatus}</span>
                          </div>
                        </Link>
                      ))}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </main>
        </div>

        <p className="mt-6 text-center text-[11px] text-muted-foreground">
          Read-only · Sin escrituras · Sin notificaciones
        </p>
      </div>
    </div>
  );
}

function SectionHeader({
  icon: Icon,
  title,
  hint,
  action,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {hint && <span className="text-[11px] text-muted-foreground">· {hint}</span>}
      </div>
      {action}
    </div>
  );
}

function PriorityDot({ p }: { p: "high" | "medium" | "low" }) {
  const cls =
    p === "high" ? "bg-destructive" : p === "medium" ? "bg-warning" : "bg-muted-foreground/50";
  return <span className={`h-1.5 w-1.5 rounded-full ${cls}`} />;
}

function HealthRow({ label, value }: { label: string; value: DayHealth }) {
  const tone: OpsStatusTone = value === "ok" ? "success" : "warning";
  const text = value === "ok" ? "OK" : "Revisar";
  return (
    <li className="flex items-center justify-between">
      <span className="text-foreground/80">{label}</span>
      <OpsStatusChip tone={tone} label={text} size="sm" />
    </li>
  );
}
