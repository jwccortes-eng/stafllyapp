import { useEffect, useMemo, useState } from "react";
import { format, addDays } from "date-fns";
import { Loader2, Check, AlertTriangle, Circle } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

/**
 * MobileQuickCreateShiftSheet — operator-grade mobile-first quick create.
 *
 * Phase 2 additions (this pass):
 *  - Draft / Publish now segmented control (uses existing
 *    `shift_publication_status` enum: 'draft' | 'published').
 *  - Compact "Readiness" checklist (client, location, time, slots, meeting
 *    point, notes) — purely presentational, reuses the same field state.
 *  - Publish guard: hard-blocks on REQUIRED fields (per shifts_config); shows
 *    a soft warning + secondary confirm for recommended-but-missing fields.
 *
 * Reuses the EXACT same target table (`scheduled_shifts`) and column shape
 * the desktop dialog uses, behind the SAME RLS policies.
 *
 * Hard rules (unchanged):
 *  - tenant (selectedCompanyId) is required and stamped on insert.
 *  - end !== start.
 *  - slots must be ≥ 1.
 *  - NO writes to time_entries, payroll, shift_assignments, or any payroll
 *    / auth / payments / chat / documents table.
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

type PublishMode = "draft" | "published";

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

  const [mode, setMode] = useState<PublishMode>("published");
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
  const [warningAck, setWarningAck] = useState(false);

  useEffect(() => {
    if (open) {
      setMode("published");
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
      setWarningAck(false);
    }
  }, [open, todayStr, defaultStartTime, defaultEndTime, defaultSlots]);

  // Reset the recommended-fields ack whenever something the user can change
  // moves — otherwise they could "ack" then edit back to a broken state.
  useEffect(() => { setWarningAck(false); }, [meetingPoint, notes, clientId, locationId, mode]);

  const slotsNum = Math.max(0, parseInt(slots) || 0);
  const startMin = toMinutes(startTime);
  const endMin = toMinutes(endTime);
  const timesInvalid = !startTime || !endTime || startMin === endMin;

  // HARD errors — block both Draft and Publish (data integrity).
  const hardErrors: string[] = [];
  if (!companyId) hardErrors.push("Selecciona una empresa antes de crear un turno.");
  if (!date) hardErrors.push("Fecha requerida.");
  if (timesInvalid) hardErrors.push("Hora de inicio y fin no pueden ser iguales.");
  if (slotsNum < 1) hardErrors.push("Debe haber al menos 1 trabajador.");
  if (!canCreate) hardErrors.push("No tienes permiso para crear turnos en esta empresa.");

  // PUBLISH-only required (per company shifts_config).
  const publishBlockers: string[] = [];
  if (mode === "published" && requireClient && !clientId) publishBlockers.push("Cliente requerido por la configuración.");
  if (mode === "published" && requireLocation && !locationId) publishBlockers.push("Ubicación requerida por la configuración.");

  // SOFT warnings — recommended but not required.
  const softWarnings: string[] = [];
  if (mode === "published") {
    if (!clientId && !requireClient) softWarnings.push("Sin cliente asignado.");
    if (!locationId && !requireLocation) softWarnings.push("Sin ubicación asignada.");
    if (!meetingPoint.trim()) softWarnings.push("Sin punto de encuentro.");
    if (!notes.trim()) softWarnings.push("Sin notas o instrucciones para el equipo.");
  }

  const needsWarningAck = mode === "published" && softWarnings.length > 0;
  const valid =
    hardErrors.length === 0 &&
    publishBlockers.length === 0 &&
    (!needsWarningAck || warningAck);

  // Readiness checklist items (presentational).
  const checklist: { label: string; ok: boolean; required: boolean }[] = [
    { label: "Fecha y horario válidos", ok: !!date && !timesInvalid, required: true },
    { label: "Trabajadores requeridos", ok: slotsNum >= 1, required: true },
    { label: "Cliente seleccionado", ok: !!clientId, required: requireClient },
    { label: "Ubicación seleccionada", ok: !!locationId, required: requireLocation },
    { label: "Punto de encuentro", ok: !!meetingPoint.trim(), required: false },
    { label: "Notas o instrucciones", ok: !!notes.trim(), required: false },
  ];

  const handleCreate = async () => {
    if (!valid || !companyId) return;
    setSaving(true);
    try {
      const isPublish = mode === "published";
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
        status: isPublish ? "published" : "draft",
        publication_status: isPublish ? "published" : "draft",
        published_at: isPublish ? new Date().toISOString() : null,
        published_by: isPublish ? (user?.id ?? null) : null,
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
          _action: isPublish ? "publicar_turno" : "guardar_turno_borrador",
          _entity_type: "scheduled_shift",
          _entity_id: data!.id,
          _company_id: companyId,
          _details: { source: "mobile_quick_create", mode },
          _old_data: null,
          _new_data: {
            title: title.trim(),
            date,
            start_time: startTime,
            end_time: endTime,
            slots: slotsNum,
            publication_status: insertData.publication_status,
          },
        } as any);
      } catch { /* non-blocking */ }

      toast.success(isPublish ? "Turno publicado" : "Turno guardado como borrador", {
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

  const ctaLabel = saving
    ? null
    : mode === "published"
      ? (needsWarningAck && !warningAck ? "Revisar antes de publicar" : "Publicar turno")
      : "Guardar borrador";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="h-[92dvh] rounded-t-2xl p-0 flex flex-col overflow-hidden"
      >
        <SheetHeader className="px-5 pt-5 pb-3 text-left border-b border-border/40">
          <SheetTitle className="text-lg">Crear turno rápido</SheetTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Guarda como borrador para completar después, o publica ahora si todo lo crítico está listo.
          </p>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Mode toggle */}
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-muted/50 p-1">
            <button
              type="button"
              onClick={() => setMode("draft")}
              className={cn(
                "h-10 rounded-lg text-sm font-medium transition-colors",
                mode === "draft" ? "bg-background shadow-sm" : "text-muted-foreground",
              )}
            >
              Borrador
            </button>
            <button
              type="button"
              onClick={() => setMode("published")}
              className={cn(
                "h-10 rounded-lg text-sm font-medium transition-colors",
                mode === "published" ? "bg-background shadow-sm" : "text-muted-foreground",
              )}
            >
              Publicar ahora
            </button>
          </div>

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

          {/* Readiness checklist */}
          <div className="rounded-xl border border-border/60 bg-card/50 px-3 py-3 space-y-2">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Preparación del turno
            </div>
            <ul className="space-y-1.5">
              {checklist.map((item, i) => (
                <li key={i} className="flex items-center gap-2 text-xs">
                  {item.ok ? (
                    <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  ) : item.required ? (
                    <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0" />
                  ) : (
                    <Circle className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
                  )}
                  <span className={cn(
                    item.ok ? "text-foreground" : item.required ? "text-destructive" : "text-muted-foreground",
                  )}>
                    {item.label}
                    {item.required && !item.ok && <span className="ml-1">· requerido</span>}
                    {!item.required && !item.ok && <span className="ml-1 opacity-70">· recomendado</span>}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Hard errors + publish blockers */}
          {(hardErrors.length > 0 || publishBlockers.length > 0) && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-xs text-destructive space-y-1">
              {[...hardErrors, ...publishBlockers].map((e, i) => <div key={i}>• {e}</div>)}
            </div>
          )}

          {/* Soft warnings (Publish only) */}
          {needsWarningAck && hardErrors.length === 0 && publishBlockers.length === 0 && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2.5 text-xs text-amber-700 dark:text-amber-300 space-y-2">
              <div className="font-medium">Faltan datos recomendados antes de publicar:</div>
              {softWarnings.map((w, i) => <div key={i}>• {w}</div>)}
              <label className="flex items-start gap-2 pt-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={warningAck}
                  onChange={(e) => setWarningAck(e.target.checked)}
                  className="mt-0.5"
                />
                <span>Entiendo y quiero publicar igual. El equipo verá el turno con la información actual.</span>
              </label>
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
            variant={mode === "draft" ? "outline" : "default"}
            disabled={!valid || saving}
            onClick={handleCreate}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : ctaLabel}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
