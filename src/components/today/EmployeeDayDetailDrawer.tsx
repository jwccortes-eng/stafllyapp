import { useState } from "react";
import { format, differenceInMinutes } from "date-fns";
import { es } from "date-fns/locale";
import { Clock, MapPin, Users, LogIn, LogOut, Coffee, CalendarDays, ChevronRight, Pencil, Check, X, LogOut as LogOutIcon, StickyNote, Save } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuditLog } from "@/hooks/useAuditLog";
import { buildPatch, rowVersion, versionedWrite } from "@/lib/data/versioned-write";
import {
  VersionConflictDialog,
  type VersionConflictInfo,
} from "@/components/data-integrity/VersionConflictDialog";

import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle,
} from "@/components/ui/drawer";

interface TimeEntry {
  id: string;
  clock_in: string;
  clock_out: string | null;
  break_minutes: number;
  status: string;
  notes: string | null;
  /** Contrato VWC: versión observable y empresa dueña de la fila. */
  version?: number | null;
  company_id?: string | null;
  scheduled_shifts?: { id: string; title: string; start_time: string; end_time: string } | null;
}


interface ScheduledInfo {
  title: string;
  start_time: string;
  end_time: string;
  location_name?: string;
  client_name?: string;
}

interface EmployeeRow {
  id: string;
  first_name: string;
  last_name: string;
  avatar_url?: string | null;
  activeEntry?: TimeEntry;
  completedEntries: TimeEntry[];
  scheduled?: ScheduledInfo;
  totalMinutes: number;
  isClockedIn: boolean;
}

interface Props {
  employee: EmployeeRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  now: Date;
  onDataChanged?: () => void;
}

const formatDuration = (mins: number) => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

export function EmployeeDayDetailDrawer({ employee, open, onOpenChange, now, onDataChanged }: Props) {
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editClockIn, setEditClockIn] = useState("");
  const [editClockOut, setEditClockOut] = useState("");
  const [editBreak, setEditBreak] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [hoursConflict, setHoursConflict] = useState<VersionConflictInfo | null>(null);

  const [forcingClockOut, setForcingClockOut] = useState<string | null>(null);
  const { logAudit } = useAuditLog();

  if (!employee) return null;

  const allEntries = [
    ...(employee.activeEntry ? [employee.activeEntry] : []),
    ...employee.completedEntries,
  ].sort((a, b) => new Date(a.clock_in).getTime() - new Date(b.clock_in).getTime());

  const totalBreak = allEntries.reduce((sum, e) => sum + (e.break_minutes ?? 0), 0);

  const startEditing = (entry: TimeEntry) => {
    setEditingEntryId(entry.id);
    setEditClockIn(format(new Date(entry.clock_in), "HH:mm"));
    setEditClockOut(entry.clock_out ? format(new Date(entry.clock_out), "HH:mm") : "");
    setEditBreak(String(entry.break_minutes ?? 0));
    setEditNotes(entry.notes ?? "");
  };

  const cancelEditing = () => {
    setEditingEntryId(null);
  };

  /**
   * Carril 2 (PATCH parcial + expected_version). Sólo viajan los campos que el
   * operador tocó y la versión que tenía a la vista. Si otra persona guardó
   * antes, el servidor rechaza y mostramos el conflicto: nunca sobrescribimos horas.
   */
  const saveEntry = async (entryId: string) => {
    const entry = allEntries.find((e) => e.id === entryId);
    if (!entry) return;

    setSaving(true);

    // La fecha base es la del propio fichaje, no "hoy": editar un fichaje de
    // ayer no puede moverlo al día de hoy.
    const baseDate = format(new Date(entry.clock_in), "yyyy-MM-dd");

    const next: Record<string, any> = {
      clock_in: `${baseDate}T${editClockIn}:00`,
      break_minutes: parseInt(editBreak) || 0,
      notes: editNotes.trim() || null,
    };
    if (editClockOut) next.clock_out = `${baseDate}T${editClockOut}:00`;

    const oldData = {
      clock_in: entry.clock_in,
      clock_out: entry.clock_out,
      break_minutes: entry.break_minutes,
      notes: entry.notes,
    };

    const patch = buildPatch(oldData, next);
    if (Object.keys(patch).length === 0) {
      toast.info("No hay cambios que guardar");
      setEditingEntryId(null);
      setSaving(false);
      return;
    }

    const result = await versionedWrite({
      entity: "time_entries",
      id: entryId,
      companyId: entry.company_id,
      patch,
      expectedVersion: rowVersion(entry),
      surface: "today_view/employee_day_detail",
    });

    if (result.status === "applied" || result.status === "noop") {
      toast.success("Fichaje actualizado");
      setEditingEntryId(null);
      onDataChanged?.();
      logAudit({
        action: "update",
        entityType: "time_entry",
        entityId: entryId,
        details: { employee_name: `${employee.first_name} ${employee.last_name}`, source: "today_view" },
        oldData,
        newData: patch,
      });
    } else if (result.status === "conflict") {
      setHoursConflict({
        patch,
        serverRow: result.row ?? null,
        actualVersion: result.actualVersion ?? null,
        expectedVersion: result.expectedVersion ?? null,
        updatedAt: result.updatedAt ?? null,
      });
    } else {
      toast.error(result.message);
    }


    setSaving(false);
  };

  /** Salida forzada: PATCH de un solo campo, también versionado. */
  const forceClockOut = async (entryId: string) => {
    const entry = allEntries.find((e) => e.id === entryId);
    if (!entry) return;

    setForcingClockOut(entryId);
    const clockOutTime = new Date().toISOString();

    const result = await versionedWrite({
      entity: "time_entries",
      id: entryId,
      companyId: entry.company_id,
      patch: { clock_out: clockOutTime },
      expectedVersion: rowVersion(entry),
      surface: "today_view/force_clock_out",
    });

    if (result.status === "ok") {
      toast.success("Salida forzada registrada");
      onDataChanged?.();
      logAudit({
        action: "update",
        entityType: "time_entry",
        entityId: entryId,
        details: {
          employee_name: `${employee.first_name} ${employee.last_name}`,
          source: "today_view",
          forced_clock_out: true,
        },
        oldData: { clock_in: entry.clock_in, clock_out: null },
        newData: { clock_out: clockOutTime },
      });
    } else if (result.status === "conflict") {
      setHoursConflict(result.conflict);
    } else {
      toast.error(result.message);
    }

    setForcingClockOut(null);
  };


  return (
    <Drawer open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setEditingEntryId(null); }}>
      <DrawerContent className="max-h-[85vh]">
        <DrawerHeader className="pb-2">
          <div className="flex items-center gap-3">
            <EmployeeAvatar
              firstName={employee.first_name}
              lastName={employee.last_name}
              avatarUrl={employee.avatar_url}
              className="h-12 w-12 text-base"
            />
            <div className="flex-1 min-w-0">
              <DrawerTitle className="text-base truncate">
                {employee.first_name} {employee.last_name}
              </DrawerTitle>
              <p className="text-xs text-muted-foreground">
                {format(new Date(), "EEEE d 'de' MMMM", { locale: es })}
              </p>
            </div>
            {employee.isClockedIn ? (
              <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-200 text-[10px] font-medium shrink-0">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 mr-1 animate-pulse" />
                Activo
              </Badge>
            ) : employee.totalMinutes > 0 ? (
              <Badge variant="secondary" className="text-[10px] shrink-0">Completado</Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] shrink-0 text-muted-foreground">Sin actividad</Badge>
            )}
          </div>
        </DrawerHeader>

        <div className="px-4 pb-6 space-y-4 overflow-y-auto">
          {/* Summary KPIs */}
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg bg-muted/40 p-3 text-center">
              <p className="text-lg font-bold font-mono">{formatDuration(employee.totalMinutes)}</p>
              <p className="text-[10px] text-muted-foreground">Horas netas</p>
            </div>
            <div className="rounded-lg bg-muted/40 p-3 text-center">
              <p className="text-lg font-bold font-mono">{allEntries.length}</p>
              <p className="text-[10px] text-muted-foreground">Fichajes</p>
            </div>
            <div className="rounded-lg bg-muted/40 p-3 text-center">
              <p className="text-lg font-bold font-mono">{totalBreak > 0 ? `${totalBreak}m` : "--"}</p>
              <p className="text-[10px] text-muted-foreground">Descanso</p>
            </div>
          </div>

          {/* Scheduled shift */}
          {employee.scheduled && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-2">
                Turno programado
              </p>
              <div className="rounded-lg border bg-card p-3 space-y-1.5">
                <p className="text-sm font-semibold">{employee.scheduled.title}</p>
                <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {employee.scheduled.start_time.slice(0, 5)} – {employee.scheduled.end_time.slice(0, 5)}
                  </span>
                  {employee.scheduled.location_name && (
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {employee.scheduled.location_name}
                    </span>
                  )}
                  {employee.scheduled.client_name && (
                    <span className="flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      {employee.scheduled.client_name}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Time entries timeline */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-2">
              Registro de fichajes
            </p>
            {allEntries.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <CalendarDays className="h-6 w-6 mx-auto mb-2 opacity-30" />
                <p className="text-xs">Sin fichajes registrados hoy</p>
              </div>
            ) : (
              <div className="space-y-2">
                {allEntries.map((entry) => {
                  const clockIn = new Date(entry.clock_in);
                  const clockOut = entry.clock_out ? new Date(entry.clock_out) : null;
                  const isActive = !entry.clock_out;
                  const isEditing = editingEntryId === entry.id;
                  const duration = clockOut
                    ? differenceInMinutes(clockOut, clockIn) - (entry.break_minutes ?? 0)
                    : differenceInMinutes(now, clockIn) - (entry.break_minutes ?? 0);

                  if (isEditing) {
                    return (
                      <div key={entry.id} className="rounded-lg border-2 border-primary/40 bg-primary/5 p-3 space-y-3">
                        {entry.scheduled_shifts && (
                          <p className="text-[11px] font-medium text-muted-foreground">
                            {entry.scheduled_shifts.title}
                          </p>
                        )}

                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10px] text-muted-foreground font-medium">Entrada</label>
                            <Input
                              type="time"
                              value={editClockIn}
                              onChange={e => setEditClockIn(e.target.value)}
                              className="h-8 text-sm font-mono"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] text-muted-foreground font-medium">Salida</label>
                            <Input
                              type="time"
                              value={editClockOut}
                              onChange={e => setEditClockOut(e.target.value)}
                              className="h-8 text-sm font-mono"
                              placeholder="--:--"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="text-[10px] text-muted-foreground font-medium">Descanso (min)</label>
                          <Input
                            type="number"
                            value={editBreak}
                            onChange={e => setEditBreak(e.target.value)}
                            className="h-8 text-sm w-24"
                            min="0"
                          />
                        </div>

                        <div>
                          <label className="text-[10px] text-muted-foreground font-medium">Notas del manager</label>
                          <Textarea
                            value={editNotes}
                            onChange={e => setEditNotes(e.target.value)}
                            className="text-sm min-h-[60px] resize-none"
                            placeholder="Agregar nota..."
                          />
                        </div>

                        <div className="flex items-center gap-2 justify-end">
                          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={cancelEditing}>
                            <X className="h-3 w-3 mr-1" /> Cancelar
                          </Button>
                          <Button size="sm" className="h-7 text-xs" onClick={() => saveEntry(entry.id)} disabled={saving}>
                            <Save className="h-3 w-3 mr-1" /> {saving ? "Guardando..." : "Guardar"}
                          </Button>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={entry.id}
                      className={`rounded-lg border p-3 space-y-2 ${isActive ? "border-emerald-500/40 bg-emerald-500/5" : "bg-card"}`}
                    >
                      {/* Shift name if linked */}
                      {entry.scheduled_shifts && (
                        <p className="text-[11px] font-medium text-muted-foreground">
                          {entry.scheduled_shifts.title}
                        </p>
                      )}

                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5">
                          <LogIn className="h-3.5 w-3.5 text-emerald-600" />
                          <span className="text-sm font-mono font-semibold">
                            {format(clockIn, "HH:mm")}
                          </span>
                        </div>

                        <ChevronRight className="h-3 w-3 text-muted-foreground/40" />

                        <div className="flex items-center gap-1.5">
                          <LogOut className={`h-3.5 w-3.5 ${isActive ? "text-muted-foreground/40" : "text-red-500"}`} />
                          <span className={`text-sm font-mono font-semibold ${isActive ? "text-muted-foreground/40" : ""}`}>
                            {clockOut ? format(clockOut, "HH:mm") : "--:--"}
                          </span>
                        </div>

                        <div className="flex-1" />

                        <span className={`text-sm font-mono font-semibold ${isActive ? "text-emerald-600" : "text-foreground"}`}>
                          {formatDuration(Math.max(0, duration))}
                        </span>
                      </div>

                      {/* Break info */}
                      {(entry.break_minutes ?? 0) > 0 && (
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <Coffee className="h-2.5 w-2.5" />
                          {entry.break_minutes} min descanso
                        </div>
                      )}

                      {/* Notes */}
                      {entry.notes && (
                        <div className="flex items-start gap-1 text-[10px] text-muted-foreground">
                          <StickyNote className="h-2.5 w-2.5 mt-0.5 shrink-0" />
                          <span className="line-clamp-2">{entry.notes}</span>
                        </div>
                      )}

                      {/* Action buttons */}
                      <div className="flex items-center gap-1.5 pt-1">
                        {isActive && (
                          <>
                            <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-200 text-[9px] px-1.5 py-0">
                              <span className="inline-block h-1 w-1 rounded-full bg-emerald-500 mr-1 animate-pulse" />
                              En curso
                            </Badge>
                            <div className="flex-1" />
                            <Button
                              variant="destructive"
                              size="sm"
                              className="h-6 text-[10px] px-2 gap-1"
                              onClick={() => forceClockOut(entry.id)}
                              disabled={forcingClockOut === entry.id}
                            >
                              <LogOutIcon className="h-2.5 w-2.5" />
                              {forcingClockOut === entry.id ? "..." : "Forzar salida"}
                            </Button>
                          </>
                        )}
                        {!isActive && <div className="flex-1" />}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-[10px] px-2 gap-1 text-muted-foreground"
                          onClick={() => startEditing(entry)}
                        >
                          <Pencil className="h-2.5 w-2.5" />
                          Editar
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}