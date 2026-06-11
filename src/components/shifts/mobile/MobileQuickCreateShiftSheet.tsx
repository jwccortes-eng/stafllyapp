import { useEffect, useMemo, useState } from "react";
import { format, addDays } from "date-fns";
import { Loader2, Check, AlertTriangle, Circle, Search, Users, X } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { SmartLocationField } from "@/components/shifts/form/SmartLocationField";
import { ClientAvatar } from "@/components/ui/client-avatar";

/**
 * MobileQuickCreateShiftSheet — operator-grade mobile quick create.
 *
 * Aligned with desktop ShiftFormFields/JobSiteSection/MeetingPointsSection:
 *  - Job Site is captured via SmartLocationField (free-text address first,
 *    saved location_v2 secondary). Writes to `job_site_address` and/or
 *    `job_site_location_id` — never forces a saved location.
 *  - Meeting Point uses the same SmartLocationField, writes `meeting_point`
 *    + optional `meeting_point_location_id`.
 *  - require_location passes when EITHER a manual job-site address OR a saved
 *    location is present (job_site_location_id OR job_site_address OR legacy
 *    location_id).
 *  - Premium mobile Client Picker (search + bottom-sheet list) replaces the
 *    native <select>.
 *
 * Reuses the EXACT same target table (`scheduled_shifts`) and columns the
 * desktop dialog uses, behind the SAME RLS policies. NO writes to time_entries,
 * payroll, shift_assignments, or any auth/payments/chat/documents table.
 */
interface SelectOption { id: string; name: string; }

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string | null;
  clients: SelectOption[];
  /** kept for backwards compatibility; saved locations are now resolved via SmartLocationField/useLocationsV2 */
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

// ── Premium Client Picker ─────────────────────────────────────────────────
function MobileClientPicker({
  clients, value, onChange, required,
}: {
  clients: SelectOption[];
  value: string;
  onChange: (id: string) => void;
  required: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const selected = useMemo(
    () => clients.find((c) => c.id === value) ?? null,
    [clients, value],
  );

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return clients;
    return clients.filter((c) => c.name.toLowerCase().includes(t));
  }, [clients, q]);

  return (
    <div className="space-y-1.5">
      <Label>Cliente {required && <span className="text-destructive">*</span>}</Label>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "w-full h-11 rounded-xl border border-input bg-background px-3 flex items-center gap-2 text-left transition-colors hover:bg-muted/40",
        )}
      >
        {selected ? (
          <>
            <ClientAvatar name={selected.name} size="sm" />
            <span className="text-sm font-medium truncate flex-1">{selected.name}</span>
            <span className="text-[11px] text-muted-foreground">Cambiar</span>
          </>
        ) : (
          <>
            <Users className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground flex-1">
              {clients.length === 0 ? "No hay clientes en esta empresa" : "Selecciona un cliente"}
            </span>
          </>
        )}
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          className="h-[80dvh] rounded-t-2xl p-0 flex flex-col overflow-hidden"
        >
          <SheetHeader className="px-5 pt-5 pb-3 text-left border-b border-border/40">
            <SheetTitle className="text-base">Selecciona un cliente</SheetTitle>
          </SheetHeader>
          <div className="px-5 py-3 border-b border-border/40">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/70" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar cliente…"
                className="h-11 pl-9"
                autoFocus
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-2 py-2">
            {filtered.length === 0 ? (
              <div className="px-3 py-8 text-center text-sm text-muted-foreground">
                {clients.length === 0
                  ? "Aún no hay clientes en esta empresa."
                  : "Sin resultados para esa búsqueda."}
              </div>
            ) : (
              filtered.map((c) => {
                const isSel = c.id === value;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      onChange(c.id);
                      setOpen(false);
                      setQ("");
                    }}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left hover:bg-muted/60 transition-colors",
                      isSel && "bg-primary/5",
                    )}
                  >
                    <ClientAvatar name={c.name} size="sm" />
                    <span className="text-sm font-medium truncate flex-1">{c.name}</span>
                    {isSel && <Check className="h-4 w-4 text-primary" />}
                  </button>
                );
              })
            )}
          </div>
          <div
            className="shrink-0 border-t border-border/40 px-5 pt-3 flex gap-2"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)" }}
          >
            {value && (
              <Button
                variant="ghost"
                className="flex-1 h-11"
                onClick={() => {
                  onChange("");
                  setOpen(false);
                  setQ("");
                }}
              >
                <X className="h-4 w-4 mr-1" /> Quitar selección
              </Button>
            )}
            <Button
              variant="outline"
              className="flex-1 h-11"
              onClick={() => setOpen(false)}
            >
              Cerrar
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

export function MobileQuickCreateShiftSheet({
  open, onOpenChange, companyId, clients,
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

  // Job site — desktop parity: address-first, saved location optional
  const [jobSiteAddress, setJobSiteAddress] = useState<string>("");
  const [jobSiteLocationId, setJobSiteLocationId] = useState<string | null>(null);

  // Meeting point — same pattern
  const [meetingPoint, setMeetingPoint] = useState("");
  const [meetingPointLocationId, setMeetingPointLocationId] = useState<string | null>(null);

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
      setJobSiteAddress("");
      setJobSiteLocationId(null);
      setMeetingPoint("");
      setMeetingPointLocationId(null);
      setNotes("");
      setSaving(false);
      setWarningAck(false);
    }
  }, [open, todayStr, defaultStartTime, defaultEndTime, defaultSlots]);

  useEffect(() => {
    setWarningAck(false);
  }, [meetingPoint, meetingPointLocationId, notes, clientId, jobSiteAddress, jobSiteLocationId, mode]);

  const slotsNum = Math.max(0, parseInt(slots) || 0);
  const startMin = toMinutes(startTime);
  const endMin = toMinutes(endTime);
  const timesInvalid = !startTime || !endTime || startMin === endMin;

  // Either manual address OR saved job-site satisfies "location" requirement
  const hasJobSite = !!(jobSiteLocationId || jobSiteAddress.trim());

  // HARD errors — block both Draft and Publish (data integrity).
  const hardErrors: string[] = [];
  if (!companyId) hardErrors.push("Selecciona una empresa antes de crear un turno.");
  if (!date) hardErrors.push("Fecha requerida.");
  if (timesInvalid) hardErrors.push("Hora de inicio y fin no pueden ser iguales.");
  if (slotsNum < 1) hardErrors.push("Debe haber al menos 1 trabajador.");
  if (!canCreate) hardErrors.push("No tienes permiso para crear turnos en esta empresa.");

  // PUBLISH-only required (per company shifts_config).
  const publishBlockers: string[] = [];
  if (mode === "published" && requireClient && !clientId) {
    publishBlockers.push("Cliente requerido por la configuración.");
  }
  if (mode === "published" && requireLocation && !hasJobSite) {
    publishBlockers.push("Agrega una dirección del trabajo o selecciona una ubicación guardada.");
  }

  // SOFT warnings — recommended but not required.
  const softWarnings: string[] = [];
  if (mode === "published") {
    if (!clientId && !requireClient) softWarnings.push("Sin cliente asignado.");
    if (!hasJobSite && !requireLocation) softWarnings.push("Sin dirección del trabajo.");
    if (!meetingPoint.trim() && !meetingPointLocationId) softWarnings.push("Sin punto de encuentro.");
    if (!notes.trim()) softWarnings.push("Sin notas o instrucciones para el equipo.");
  }

  const needsWarningAck = mode === "published" && softWarnings.length > 0;
  const valid =
    hardErrors.length === 0 &&
    publishBlockers.length === 0 &&
    (!needsWarningAck || warningAck);

  const checklist: { label: string; ok: boolean; required: boolean }[] = [
    { label: "Fecha y horario válidos", ok: !!date && !timesInvalid, required: true },
    { label: "Trabajadores requeridos", ok: slotsNum >= 1, required: true },
    { label: "Cliente seleccionado", ok: !!clientId, required: requireClient },
    { label: "Dirección o ubicación del trabajo", ok: hasJobSite, required: requireLocation },
    { label: "Punto de encuentro", ok: !!(meetingPoint.trim() || meetingPointLocationId), required: false },
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
        // Desktop parity: job_site_* and meeting_point_* columns
        job_site_address: jobSiteAddress.trim() || null,
        job_site_location_id: jobSiteLocationId || null,
        meeting_point: meetingPoint.trim() || null,
        meeting_point_location_id: meetingPointLocationId || null,
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
            has_job_site_address: !!insertData.job_site_address,
            has_job_site_location: !!insertData.job_site_location_id,
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

          {/* Premium Client Picker */}
          <MobileClientPicker
            clients={clients}
            value={clientId}
            onChange={setClientId}
            required={requireClient}
          />

          {/* Job Site — desktop parity (address first, saved optional) */}
          <div className="space-y-1.5">
            <Label>
              Dirección del trabajo {requireLocation && <span className="text-destructive">*</span>}
            </Label>
            <SmartLocationField
              companyId={companyId}
              kind="job_site"
              title="Dirección del trabajo"
              helper="Pega la dirección que te envió el cliente o selecciona una ubicación guardada si la vas a reutilizar."
              freeTextValue={jobSiteAddress}
              savedLocationId={jobSiteLocationId}
              onFreeText={(text) => setJobSiteAddress(text)}
              onSavedLocation={(id) => {
                setJobSiteLocationId(id);
                if (id) setJobSiteAddress("");
              }}
              placeholder="Ej: 1601 Broadway, New York, NY"
            />
          </div>

          {/* Meeting point */}
          <div className="space-y-1.5">
            <Label>Punto de encuentro (opcional)</Label>
            <SmartLocationField
              companyId={companyId}
              kind="meeting_point"
              title="Punto de encuentro"
              helper="Lugar donde el equipo se reúne antes del job site."
              freeTextValue={meetingPoint}
              savedLocationId={meetingPointLocationId}
              onFreeText={(text) => setMeetingPoint(text)}
              onSavedLocation={(id, addr) => {
                setMeetingPointLocationId(id);
                setMeetingPoint(addr ?? (id ? meetingPoint : ""));
              }}
              placeholder="Ej. Chase Bank 74 & Roosevelt"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="qcs-notes">Indicaciones para el trabajador (opcional)</Label>
            <Textarea
              id="qcs-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ej. Entrar por la puerta lateral, parking en sótano 2…"
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
