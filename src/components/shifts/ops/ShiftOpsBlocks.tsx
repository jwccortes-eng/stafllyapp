/**
 * ShiftOpsBlocks.tsx
 *
 * Operational "copilot" UI blocks for /app/shift-ops, all read-only and
 * presentational. They consume the pure heuristics from
 * `@/lib/shifts/shift-operations-intelligence` and surface them as the
 * 6 standard sections defined in the redesign brief:
 *
 *   1. SmartSummaryCard       — "Qué está pasando con este turno"
 *   2. MissingItemsCard       — "Qué falta"
 *   3. RisksCard              — "Qué riesgo hay"  (auto-hidden when empty)
 *   4. NextActionsCard        — "Qué recomienda Stafly hacer ahora"
 *   5. AssignedTeamCard       — "Quién debe actuar"
 *   6. CandidatesCard         — "Pool de workers" (no fake availability)
 *   7. WorkerPreviewCard      — "Qué verá el trabajador"
 *
 * Hard boundary: no Supabase reads/writes, no schema, no edge functions,
 * no payroll/time_entries/attendance/RLS/auth/portal/Connecteam touching.
 * All write actions (assign, message, edit, publish) are dispatched up via
 * callback props so the page owns mutations.
 */

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  AlertTriangle, ArrowRight, Building2, Car, CheckCircle2, ClipboardList,
  Clock, MapPin, MessageSquare, Phone, Sparkles, UserPlus, Users,
} from "lucide-react";
import {
  type AssignmentLike,
  type CandidateReason,
  type EmployeeLike,
  type MissingItem,
  type NextAction,
  type OperationalStatus,
  type RiskItem,
  type ShiftLike,
  getCandidateRecommendationReasons,
  getWorkerAssignmentSignals,
  groupByNormalizedArea,
  normalizeArea,
} from "@/lib/shifts/shift-operations-intelligence";

// ── Smart summary ─────────────────────────────────────────────────────────

export function SmartSummaryCard({ status }: { status: OperationalStatus }) {
  const toneClass = TONE_BG[status.tone];
  return (
    <div className={cn("rounded-2xl border p-4 flex items-start gap-3", toneClass)}>
      <div className="mt-0.5 shrink-0">
        <Sparkles className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-semibold uppercase tracking-wider opacity-70">
            Resumen inteligente
          </span>
          <Badge variant="outline" className="text-[10px] bg-background/50">
            {status.label}
          </Badge>
        </div>
        <p className="text-sm font-medium leading-snug">{status.message}</p>
      </div>
    </div>
  );
}

// ── Missing items ─────────────────────────────────────────────────────────

export function MissingItemsCard({
  items,
  onEdit,
}: {
  items: MissingItem[];
  onEdit?: () => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="rounded-2xl border border-border/40 bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-warning" />
          Qué falta
        </h3>
        {onEdit && (
          <Button variant="ghost" size="sm" className="h-7 text-[11px]" onClick={onEdit}>
            Completar
          </Button>
        )}
      </div>
      <ul className="space-y-1.5">
        {items.map(item => (
          <li key={item.key} className="flex items-start gap-2 text-xs">
            <span
              className={cn(
                "mt-1 h-1.5 w-1.5 rounded-full shrink-0",
                item.severity === "block" && "bg-destructive",
                item.severity === "warn" && "bg-warning",
                item.severity === "info" && "bg-muted-foreground/40",
              )}
            />
            <div className="min-w-0 flex-1">
              <p className="font-medium leading-snug">{item.label}</p>
              {item.hint && (
                <p className="text-[10px] text-muted-foreground leading-snug mt-0.5">{item.hint}</p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Risks ─────────────────────────────────────────────────────────────────

export function RisksCard({ risks }: { risks: RiskItem[] }) {
  if (risks.length === 0) return null;
  return (
    <div className="rounded-2xl border border-warning/30 bg-warning/[0.05] p-4 space-y-2">
      <h3 className="text-sm font-bold flex items-center gap-2 text-warning">
        <AlertTriangle className="h-4 w-4" />
        Riesgos detectados
      </h3>
      <ul className="space-y-1">
        {risks.map(r => (
          <li key={r.key} className="text-xs flex items-center gap-2">
            <span className={cn(
              "h-1.5 w-1.5 rounded-full shrink-0",
              r.severity === "danger" ? "bg-destructive" : "bg-warning",
            )} />
            <span>{r.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Next actions ──────────────────────────────────────────────────────────

export interface NextActionHandlers {
  onAssignWorker?: () => void;
  onMessagePending?: () => void;
  onEditShift?: () => void;
  onPublish?: () => void;
}

export function NextActionsCard({
  actions,
  handlers,
}: {
  actions: NextAction[];
  handlers: NextActionHandlers;
}) {
  if (actions.length === 0) return null;
  return (
    <div className="rounded-2xl border border-primary/20 bg-primary/[0.04] p-4 space-y-3">
      <h3 className="text-sm font-bold flex items-center gap-2 text-primary">
        <Sparkles className="h-4 w-4" />
        Siguiente acción recomendada
      </h3>
      <div className="space-y-2">
        {actions.map((a, i) => {
          const handler = pickHandler(a, handlers);
          return (
            <button
              key={a.kind + i}
              onClick={handler}
              disabled={!handler}
              className={cn(
                "w-full text-left rounded-xl border bg-card hover:bg-muted/30 transition-colors p-3 flex items-start gap-3 group",
                "disabled:cursor-not-allowed disabled:opacity-60",
                a.tone === "danger" && "border-destructive/30",
                a.tone === "warn" && "border-warning/30",
                a.tone === "primary" && "border-primary/30",
              )}
            >
              <div className="mt-0.5 shrink-0">
                {a.tone === "danger" ? <AlertTriangle className="h-4 w-4 text-destructive" /> :
                 a.tone === "warn" ? <AlertTriangle className="h-4 w-4 text-warning" /> :
                 <CheckCircle2 className="h-4 w-4 text-primary" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold leading-snug">{a.label}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{a.rationale}</p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground/50 group-hover:text-foreground transition-colors mt-0.5 shrink-0" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function pickHandler(a: NextAction, h: NextActionHandlers): (() => void) | undefined {
  switch (a.kind) {
    case "assign_worker":
    case "assign_driver":
    case "assign_admin":
      return h.onAssignWorker;
    case "message_pending":
      return h.onMessagePending;
    case "complete_location":
    case "add_meeting_point":
      return h.onEditShift;
    case "publish_shift":
      return h.onPublish;
    case "review_before_close":
      return h.onEditShift;
    default:
      return undefined;
  }
}

// ── Assigned team ─────────────────────────────────────────────────────────

export function AssignedTeamCard({
  assignments,
  onContact,
}: {
  assignments: AssignmentLike[];
  onContact?: (a: AssignmentLike) => void;
}) {
  return (
    <div className="rounded-2xl border border-border/40 bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          Equipo asignado
          <Badge variant="secondary" className="text-[10px]">{assignments.length}</Badge>
        </h3>
      </div>
      {assignments.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-4">
          Aún no hay workers asignados. Asigna desde el pool de workers de abajo.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {assignments.map(a => {
            const sig = getWorkerAssignmentSignals(a);
            const name = a.employee
              ? `${a.employee.first_name ?? ""} ${a.employee.last_name ?? ""}`.trim() || a.employee_id
              : a.employee_id;
            return (
              <li
                key={a.id}
                // Ancla de foco: el Command Center puede señalar a la persona.
                data-employee-id={a.employee_id}
                className="flex items-center gap-3 rounded-xl bg-muted/20 px-3 py-2 scroll-mt-24 data-[focused=true]:ring-2 data-[focused=true]:ring-primary/60"
              >
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary shrink-0">
                  {(a.employee?.first_name?.[0] ?? "?") + (a.employee?.last_name?.[0] ?? "")}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold truncate">{name}</p>
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[9px] px-1.5 py-0",
                        sig.statusTone === "success" && "border-earning/40 text-earning",
                        sig.statusTone === "warn" && "border-warning/40 text-warning",
                        sig.statusTone === "danger" && "border-destructive/40 text-destructive",
                      )}
                    >
                      {sig.statusLabel}
                    </Badge>
                    {sig.isAdmin && (
                      <span className="text-[9px] text-primary font-semibold">Admin</span>
                    )}
                    {sig.isDriver && <Car className="h-3 w-3 text-warning" aria-label="Tiene transporte" />}
                    {sig.noArea && <span className="text-[9px] text-warning">Sin zona</span>}
                  </div>
                </div>
                {sig.hasPhone && onContact && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    onClick={() => onContact(a)}
                    title="Contactar"
                  >
                    <Phone className="h-3.5 w-3.5" />
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ── Candidates / pool ─────────────────────────────────────────────────────

export interface CandidateRow {
  employee: EmployeeLike;
  reasons: CandidateReason[];
}

export function buildCandidatePool(
  employees: EmployeeLike[],
  assignments: AssignmentLike[],
  shiftAreaHint: string | null,
): { recommended: CandidateRow[]; pool: CandidateRow[] } {
  const assignedIds = new Set(assignments.map(a => a.employee_id));
  const remaining = employees.filter(e => !assignedIds.has(e.id));
  const normalizedShift = normalizeArea(shiftAreaHint ?? "");

  // Rank: same area first, then drivers, then contactable, then rest.
  const ranked = remaining
    .map(emp => {
      const reasons = getCandidateRecommendationReasons(emp, shiftAreaHint);
      const sameArea = reasons.some(r => r.key === "same_area");
      const driver = reasons.some(r => r.key === "driver");
      const phone = reasons.some(r => r.key === "has_phone");
      const score = (sameArea ? 3 : 0) + (driver ? 2 : 0) + (phone ? 1 : 0);
      return { row: { employee: emp, reasons }, score };
    })
    .sort((a, b) => b.score - a.score);

  // "Recommended" requires at least one positive reason AND (same area OR
  // driver) so we never claim recommendation just because a phone exists.
  const recommended = normalizedShift
    ? ranked
        .filter(r => r.score >= 2)
        .slice(0, 6)
        .map(r => r.row)
    : [];
  const pool = ranked.map(r => r.row);
  return { recommended, pool };
}

export function CandidatesCard({
  recommended,
  pool,
  shiftAreaHint,
  onAssign,
}: {
  recommended: CandidateRow[];
  pool: CandidateRow[];
  shiftAreaHint: string | null;
  onAssign: (employeeId: string) => void;
}) {
  const normalizedShift = normalizeArea(shiftAreaHint ?? "");
  const groupedPool = groupByNormalizedArea(pool.map(p => ({ ...p.employee, _row: p })) as any);

  return (
    <div className="rounded-2xl border border-border/40 bg-card p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          Candidatos recomendados
        </h3>
        <span className="text-[10px] text-muted-foreground">
          Pool de workers · {pool.length} disponibles en directorio
        </span>
      </div>

      {/* Ranked recommendations (only when we can compute a real reason) */}
      {recommended.length > 0 ? (
        <div className="space-y-1.5">
          {recommended.map(r => (
            <CandidateRowView key={r.employee.id} row={r} onAssign={onAssign} />
          ))}
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground italic leading-snug">
          {normalizedShift
            ? "Sin candidatos con señales fuertes para este turno. Usa el pool completo abajo."
            : "Sin zona del turno definida — Stafly no puede priorizar candidatos por cercanía. Completa la ubicación o usa el pool de abajo."}
        </p>
      )}

      {/* Pool by normalized area */}
      <div className="space-y-2 pt-2 border-t border-border/40">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
          Pool de workers por zona
        </p>
        {groupedPool.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">Sin workers en el directorio para asignar.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {groupedPool.map(group => (
              <div key={group.area} className="rounded-xl border border-dashed border-border/40 p-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-bold text-muted-foreground">{group.area}</p>
                  <Badge variant="outline" className="text-[9px]">{group.rows.length}</Badge>
                </div>
                <ul className="space-y-1">
                  {group.rows.slice(0, 8).map((emp: any) => (
                    <li key={emp.id} className="flex items-center gap-2 text-[11px] group">
                      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/30 shrink-0" />
                      <span className="truncate text-muted-foreground">
                        {emp.first_name} {emp.last_name}
                      </span>
                      <button
                        className="ml-auto text-[10px] font-semibold text-primary opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5"
                        onClick={() => onAssign(emp.id)}
                      >
                        <UserPlus className="h-3 w-3" /> Asignar
                      </button>
                    </li>
                  ))}
                  {group.rows.length > 8 && (
                    <li className="text-[9px] text-muted-foreground/50 text-center pt-1">
                      +{group.rows.length - 8} más
                    </li>
                  )}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CandidateRowView({
  row,
  onAssign,
}: {
  row: CandidateRow;
  onAssign: (id: string) => void;
}) {
  const { employee, reasons } = row;
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/30 bg-muted/10 p-2.5">
      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary shrink-0">
        {(employee.first_name?.[0] ?? "?") + (employee.last_name?.[0] ?? "")}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold truncate">
          {employee.first_name} {employee.last_name}
        </p>
        <div className="flex items-center gap-1 mt-0.5 flex-wrap">
          {reasons.map(r => (
            <span
              key={r.key}
              className={cn(
                "text-[9px] px-1.5 py-0.5 rounded font-medium",
                r.tone === "positive" && "bg-earning/10 text-earning",
                r.tone === "neutral" && "bg-muted text-muted-foreground",
                r.tone === "warn" && "bg-warning/10 text-warning",
              )}
            >
              {r.label}
            </span>
          ))}
        </div>
      </div>
      <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => onAssign(employee.id)}>
        <UserPlus className="h-3 w-3 mr-1" /> Asignar
      </Button>
    </div>
  );
}

// ── Worker preview ────────────────────────────────────────────────────────

export function WorkerPreviewCard({
  shift,
  clientName,
  locationName,
  locationAddress,
}: {
  shift: ShiftLike;
  clientName: string;
  locationName: string;
  locationAddress: string;
}) {
  const missingMeeting = !shift.meeting_point && !shift.meeting_point_location_id && !locationAddress;
  const missingInstructions = !shift.special_instructions || shift.special_instructions.trim() === "";

  return (
    <div className="rounded-2xl border border-border/40 bg-card p-4 space-y-3">
      <h3 className="text-sm font-bold flex items-center gap-2">
        <MessageSquare className="h-4 w-4 text-primary" />
        Vista del trabajador
      </h3>
      <div className="rounded-xl bg-muted/20 p-3 space-y-2 text-xs">
        <Row icon={<Clock className="h-3.5 w-3.5" />} label="Horario">
          {shift.start_time.slice(0, 5)} – {shift.end_time.slice(0, 5)}
        </Row>
        <Row icon={<Building2 className="h-3.5 w-3.5" />} label="Cliente">
          {clientName || <Missing label="Sin cliente" />}
        </Row>
        <Row icon={<MapPin className="h-3.5 w-3.5" />} label="Ubicación">
          {locationName || locationAddress || <Missing label="Falta dirección" />}
        </Row>
        <Row icon={<MapPin className="h-3.5 w-3.5" />} label="Punto de encuentro">
          {missingMeeting
            ? <Missing label="No definido — el worker usará la dirección" />
            : (shift.meeting_point || locationAddress)}
        </Row>
        <Row icon={<ClipboardList className="h-3.5 w-3.5" />} label="Instrucciones">
          {missingInstructions
            ? <span className="text-muted-foreground italic">Sin instrucciones especiales</span>
            : shift.special_instructions}
        </Row>
        {shift.transportation_required && (
          <Row icon={<Car className="h-3.5 w-3.5" />} label="Transporte">
            Requerido (capacidad {shift.car_capacity ?? 5} por carro)
          </Row>
        )}
      </div>
      <p className="text-[10px] text-muted-foreground italic leading-snug">
        Preview operativo. La vista final del worker puede variar según su portal.
      </p>
    </div>
  );
}

function Row({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-muted-foreground mt-0.5">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
        <p className="text-xs font-medium leading-snug break-words">{children}</p>
      </div>
    </div>
  );
}

function Missing({ label }: { label: string }) {
  return <span className="text-warning font-medium">⚠ {label}</span>;
}

// ── shared tone palette ───────────────────────────────────────────────────

const TONE_BG: Record<OperationalStatus["tone"], string> = {
  neutral: "border-border/40 bg-card text-foreground",
  info:    "border-primary/20 bg-primary/[0.05] text-foreground",
  success: "border-earning/30 bg-earning/[0.06] text-foreground",
  warn:    "border-warning/30 bg-warning/[0.06] text-foreground",
  danger:  "border-destructive/30 bg-destructive/[0.06] text-foreground",
};
