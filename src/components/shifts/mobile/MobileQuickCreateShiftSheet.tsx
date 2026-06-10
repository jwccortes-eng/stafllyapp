import { useEffect, useMemo, useState } from "react";
import { format, addDays } from "date-fns";
import { Loader2 } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

/**
 * MobileQuickCreateShiftSheet — operator-grade mobile-first quick create.
 *
 * Reuses the EXACT same target table (`scheduled_shifts`) and column shape
 * the desktop dialog uses, behind the SAME RLS policies. We deliberately
 * expose the minimum field set an urgent on-phone admin needs:
 *  - title, date, start/end, slots, client, location, meeting point, notes.
 *
 * Out of scope (kept defaulted): pay_type, transportation, claimable,
 * shift_admin assignment, worker selection. Admin can edit on desktop or
 * via the shift detail later.
 *
 * Hard rules:
 *  - tenant (selectedCompanyId) is required and stamped on insert.
 *  - end > start; if end < start we treat as overnight (matches desktop calc).
 *  - slots must be ≥ 1.
 *  - publication_status = 'published' so the shift shows up immediately in
 *    Today/Upcoming/Needs Staff buckets (desktop default behavior parity).
 *  - NO writes to time_entries, payroll, shift_assignments (none selected here),
 *    or any payroll table.
 */
interface SelectOption { id: string; name: string; }

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string | null;
  clients: SelectOption[];
  locations: SelectOption[];
  requireClient: boolean;
  requireLocation: boolean;
  defaultStartTime?: string;
  defaultEndTime?: string;
  defaultSlots?: number;
  onCreated: (shiftId: string) => void;
}

function toMinutes(t: string) {
  if (!t) return 0;
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function MobileQuickCreateShiftSheet({
  open, onOpenChange, companyId, clients, locations,
  requireClient, requireLocation,
  defaultStartTime = "09:00",
  defaultEndTime = "17:00",
  defaultSlots = 1,
  onCreated,
}: Props) {
  const { user, role, hasModuleAccess } = useAuth();
  const canCreate = role === "owner" || role === "admin" || hasModuleAccess("shifts", "edit");

  const todayStr = useMemo(() => format(new Date(), "yyyy-MM-dd"), []);
  const tomorrowStr = useMemo(() => format(addDays(new Date(), 1), "yyyy-MM-dd"), []);

  const [title, setTitle] = useState("");
  const [date, setDate] = useState(todayStr);
  const [startTime, setStartTime] = useState(defaultStartTime);
  const [endTime, setEndTime] = useState(defaultEndTime);
  const [slots, setSlots] = useState<string>(String(defaultSlots));
  const [clientId, setClientId] = useState<string>("");
  const [locationId, setLocationId] = useState<string>("");
  const [meetingPoint, setMeetingPoint] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle("");
      setDate(todayStr);
      setStartTime(defaultStartTime);
      setEndTime(defaultEndTime);
      setSlots(String(defaultSlots));
      setClientId("");
      setLocationId("");
      setMeetingPoint("");
      setNotes("");
      setSaving(false);
    }
  }, [open, todayStr, defaultStartTime, defaultEndTime, defaultSlots]);

  const slotsNum = Math.max(0, parseInt(slots) || 0);
  const startMin = toMinutes(startTime);
  const endMin = toMinutes(endTime);
  // Treat end <= start as overnight; only flag if literally equal.
  const timesInvalid = !startTime || !endTime || startMin === endMin;

  const errors: string[] = [];
  if (!companyId) errors.push("Selecciona una empresa antes de crear un turno.");
  if (!date) errors.push("Fecha requerida.");
  if (timesInvalid) errors.push("Hora de inicio y fin no pueden ser iguales.");
  if (slotsNum < 1) errors.push("Debe haber al menos 1 trabajador.");
  if (requireClient && !clientId) errors.push("Cliente requerido por la configuración.");
  if (requireLocation && !locationId) errors.push("Ubicación requerida por la configuración.");
  if (!canCreate) errors.push("No tienes permiso para crear turnos en esta empresa.");

  const valid = errors.length === 0;

  const handleCreate = async () => {
    if (!valid || !companyId) return;
    setSaving(true);
    try {
      const insertData: any = {
        company_id: companyId,
        title: title.trim() || "Turno",
        date,
        start_time: startTime,
        end_time: endTime,
        slots: slotsNum,
        client_id: clientId || null,
        location_id: locationId || null,
        meeting_point: meetingPoint.trim() || null,
        notes: notes.trim() || null,
        created_by: user?.id ?? null,
        status: "published",
        publication_status: "published",
        published_at: new Date().toISOString(),
        published_by: user?.id ?? null,
        claimable: false,
      };

      const { data, error } = await supabase
        .from("scheduled_shifts")
        .insert(insertData)
        .select("id")
        .single();

      if (error) throw error;

      // Best-effort audit; do not block UX on failure.
      try {
        await supabase.rpc("log_activity_detailed", {
          _action: "crear_turno",
          _entity_type: "scheduled_shift",
          _entity_id: data!.id,
          _company_id: companyId,
          _details: { source: "mobile_quick_create" },
          _old_data: null,
          _new_data: {
            title: title.trim(),
            date,
            start_time: startTime,
            end_time: endTime,
            slots: slotsNum,
          },
        } as any);
      } catch { /* non-blocking */ }

      toast.success("Turno creado", {
        description: `${title.trim() || "Turno"} · ${date} ${startTime}–${endTime}`,
      });
      onCreated(data!.id);
      onOpenChange(false);
    } catch (e: any) {
      console.error("[MobileQuickCreateShiftSheet] insert error", e);
      toast.error(e?.message ?? "No se pudo crear el turno");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="h-[92dvh] rounded-t-2xl p-0 flex flex-col overflow-hidden"
      >
        <SheetHeader className="px-5 pt-5 pb-3 text-left border-b border-border/40">
          <SheetTitle className="text-lg">Crear turno rápido</SheetTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Mínimo necesario para abrir el turno. Puedes refinar pagos, asignaciones y transporte después.
          </p>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="qcs-title">Título</Label>
            <Input
              id="qcs-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ej. Catering evento Brooklyn"
              className="h-11"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5 col-span-2">
              <Label htmlFor="qcs-date">Fecha</Label>
              <div className="flex gap-2">
                <Input
                  id="qcs-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="h-11 flex-1"
                />
                <Button
                  type="button"
                  variant={date === todayStr ? "default" : "outline"}
                  size="sm"
                  onClick={() => setDate(todayStr)}
                  className="h-11 px-3 text-xs"
                >
                  Hoy
                </Button>
                <Button
                  type="button"
                  variant={date === tomorrowStr ? "default" : "outline"}
                  size="sm"
                  onClick={() => setDate(tomorrowStr)}
                  className="h-11 px-3 text-xs"
                >
                  Mañana
                </Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="qcs-start">Inicio</Label>
              <Input
                id="qcs-start"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="h-11"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="qcs-end">Fin aprox.</Label>
              <Input
                id="qcs-end"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="h-11"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="qcs-slots">Trabajadores requeridos</Label>
            <Input
              id="qcs-slots"
              type="number"
              inputMode="numeric"
              min={1}
              value={slots}
              onChange={(e) => setSlots(e.target.value)}
              className="h-11"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Cliente {requireClient && <span className="text-destructive">*</span>}</Label>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger className="h-11">
                <SelectValue placeholder="Selecciona un cliente" />
              </SelectTrigger>
              <SelectContent>
                {clients.length === 0 && (
                  <div className="px-2 py-3 text-xs text-muted-foreground">
                    Aún no hay clientes en esta empresa.
                  </div>
                )}
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Ubicación / sitio {requireLocation && <span className="text-destructive">*</span>}</Label>
            <Select value={locationId} onValueChange={setLocationId}>
              <SelectTrigger className="h-11">
                <SelectValue placeholder="Selecciona una ubicación" />
              </SelectTrigger>
              <SelectContent>
                {locations.length === 0 && (
                  <div className="px-2 py-3 text-xs text-muted-foreground">
                    Aún no hay ubicaciones en esta empresa.
                  </div>
                )}
                {locations.map((l) => (
                  <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="qcs-meeting">Punto de encuentro (opcional)</Label>
            <Input
              id="qcs-meeting"
              value={meetingPoint}
              onChange={(e) => setMeetingPoint(e.target.value)}
              placeholder="Ej. Entrada lateral, calle 42"
              className="h-11"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="qcs-notes">Notas (opcional)</Label>
            <Textarea
              id="qcs-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Detalles internos para el equipo"
              rows={3}
            />
          </div>

          {errors.length > 0 && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2.5 text-xs text-amber-700 dark:text-amber-300 space-y-1">
              {errors.map((e, i) => <div key={i}>• {e}</div>)}
            </div>
          )}
        </div>

        <div
          className="shrink-0 border-t border-border/40 bg-background/95 backdrop-blur-sm px-5 pt-3 flex gap-2"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)" }}
        >
          <Button
            variant="ghost"
            className="flex-1 h-11"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancelar
          </Button>
          <Button
            className="flex-[1.4] h-11"
            disabled={!valid || saving}
            onClick={handleCreate}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Publicar turno"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
