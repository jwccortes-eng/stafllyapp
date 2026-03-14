import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { EmptyState } from "@/components/ui/empty-state";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useWorkerProfile } from "@/hooks/useWorkerProfile";
import { useWorkerAvailability } from "@/hooks/useWorkerAvailability";
import { useWorkerConsent } from "@/hooks/useWorkerConsent";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  User, Globe, MapPin, Briefcase, Languages, Shield, Car,
  Clock, CalendarCheck, Plus, X, Loader2, Eye, EyeOff,
  CheckCircle2, AlertCircle, Pencil, Save, Trash2,
} from "lucide-react";

const WEEKDAY_LABELS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const WEEKDAYS = [
  { value: 1, label: "Lun" }, { value: 2, label: "Mar" }, { value: 3, label: "Mié" },
  { value: 4, label: "Jue" }, { value: 5, label: "Vie" }, { value: 6, label: "Sáb" },
  { value: 0, label: "Dom" },
];

const CONSENT_LABELS: Record<string, { label: string; icon: any }> = {
  terms_of_service: { label: "Términos de servicio", icon: Shield },
  privacy_policy: { label: "Política de privacidad", icon: Shield },
  gps_tracking: { label: "Rastreo GPS durante turnos", icon: MapPin },
  background_check: { label: "Verificación de antecedentes", icon: Shield },
  data_sharing: { label: "Compartir datos con clientes", icon: Globe },
};

const PROFICIENCY_OPTIONS = ["native", "fluent", "advanced", "intermediate", "basic"];
const TRANSPORT_TYPES = ["car", "bike", "public", "rideshare", "walk"];

interface Props {
  employeeId: string;
  readOnly?: boolean;
}

export function WorkerProfileTab({ employeeId, readOnly = false }: Props) {
  const wp = useWorkerProfile({ employeeId });
  const avail = useWorkerAvailability({ workerProfileId: wp.profile?.id });
  const consent = useWorkerConsent({ workerProfileId: wp.profile?.id });

  const [editingBio, setEditingBio] = useState(false);
  const [bioValue, setBioValue] = useState("");
  const [headlineValue, setHeadlineValue] = useState("");
  const [editingLocation, setEditingLocation] = useState(false);
  const [cityValue, setCityValue] = useState("");
  const [stateValue, setStateValue] = useState("");
  const [yearsExpValue, setYearsExpValue] = useState("");
  const [saving, setSaving] = useState(false);

  // Language form
  const [addingLang, setAddingLang] = useState(false);
  const [langName, setLangName] = useState("");
  const [langProf, setLangProf] = useState("intermediate");

  // Schedule editing
  const [editingSched, setEditingSched] = useState(false);
  const [schedForm, setSchedForm] = useState({
    max_hours_per_week: "",
    min_hours_per_week: "",
    overnight_ok: false,
    weekend_ok: true,
    holiday_ok: false,
    blocked_weekdays: [] as number[],
  });

  // Travel editing
  const [editingTravel, setEditingTravel] = useState(false);
  const [travelForm, setTravelForm] = useState({
    has_own_transport: false,
    transport_type: "",
    max_commute_minutes: "",
    max_commute_km: "",
  });

  // Service zone form
  const [addingZone, setAddingZone] = useState(false);
  const [zoneLabel, setZoneLabel] = useState("");
  const [zoneCity, setZoneCity] = useState("");
  const [zoneRadius, setZoneRadius] = useState("25");

  if (wp.loading) {
    return <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  if (!wp.profile) {
    return (
      <div className="space-y-3">
        <EmptyState icon={User} title="Sin perfil profesional" description="Crea un perfil profesional para este empleado" compact />
        {!readOnly && (
          <Button size="sm" variant="outline" className="w-full border-dashed" disabled={saving}
            onClick={async () => {
              setSaving(true);
              const { error } = await wp.createProfile({ employee_id: employeeId });
              setSaving(false);
              if (error) toast.error("Error al crear perfil"); else toast.success("Perfil profesional creado");
            }}>
            {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Plus className="h-3 w-3 mr-1" />}
            Crear perfil profesional
          </Button>
        )}
      </div>
    );
  }

  const profile = wp.profile;

  const handleSaveBio = async () => {
    setSaving(true);
    const err = await wp.updateProfile({ headline: headlineValue, bio: bioValue });
    setSaving(false);
    if (err?.error) toast.error("Error al guardar"); else { toast.success("Perfil actualizado"); setEditingBio(false); }
  };

  const handleSaveLocation = async () => {
    setSaving(true);
    const err = await wp.updateProfile({
      city: cityValue || null,
      state: stateValue || null,
      years_of_experience: yearsExpValue ? parseInt(yearsExpValue) : null,
    });
    setSaving(false);
    if (err?.error) toast.error("Error"); else { toast.success("Ubicación actualizada"); setEditingLocation(false); }
  };

  const handleAddLang = async () => {
    if (!langName.trim()) return;
    setSaving(true);
    const err = await wp.addLanguage(langName.trim(), langProf);
    setSaving(false);
    if (err) toast.error("Error"); else { toast.success("Idioma agregado"); setAddingLang(false); setLangName(""); }
  };

  const handleSaveSchedule = async () => {
    setSaving(true);
    const err = await avail.saveSchedulePrefs({
      max_hours_per_week: schedForm.max_hours_per_week ? parseFloat(schedForm.max_hours_per_week) : null,
      min_hours_per_week: schedForm.min_hours_per_week ? parseFloat(schedForm.min_hours_per_week) : null,
      overnight_ok: schedForm.overnight_ok,
      weekend_ok: schedForm.weekend_ok,
      holiday_ok: schedForm.holiday_ok,
      blocked_weekdays: schedForm.blocked_weekdays,
    } as any);
    setSaving(false);
    if (err) toast.error("Error"); else { toast.success("Preferencias guardadas"); setEditingSched(false); }
  };

  const handleSaveTravel = async () => {
    setSaving(true);
    const err = await avail.saveTravelPrefs({
      has_own_transport: travelForm.has_own_transport,
      transport_type: travelForm.transport_type || null,
      max_commute_minutes: travelForm.max_commute_minutes ? parseInt(travelForm.max_commute_minutes) : null,
      max_commute_km: travelForm.max_commute_km ? parseFloat(travelForm.max_commute_km) : null,
    } as any);
    setSaving(false);
    if (err) toast.error("Error"); else { toast.success("Transporte guardado"); setEditingTravel(false); }
  };

  const handleAddZone = async () => {
    if (!zoneLabel.trim() && !zoneCity.trim()) return;
    setSaving(true);
    const err = await avail.addServiceZone({
      zone_type: "city" as any,
      label: zoneLabel.trim() || zoneCity.trim(),
      city: zoneCity.trim() || null,
      radius_km: parseFloat(zoneRadius) || 25,
    } as any);
    setSaving(false);
    if (err) toast.error("Error"); else { toast.success("Zona agregada"); setAddingZone(false); setZoneLabel(""); setZoneCity(""); }
  };

  const startEditSched = () => {
    const sp = avail.schedulePrefs;
    setSchedForm({
      max_hours_per_week: sp?.max_hours_per_week?.toString() ?? "",
      min_hours_per_week: sp?.min_hours_per_week?.toString() ?? "",
      overnight_ok: sp?.overnight_ok ?? false,
      weekend_ok: sp?.weekend_ok ?? true,
      holiday_ok: sp?.holiday_ok ?? false,
      blocked_weekdays: sp?.blocked_weekdays ?? [],
    });
    setEditingSched(true);
  };

  const startEditTravel = () => {
    const tp = avail.travelPrefs;
    setTravelForm({
      has_own_transport: tp?.has_own_transport ?? false,
      transport_type: tp?.transport_type ?? "",
      max_commute_minutes: tp?.max_commute_minutes?.toString() ?? "",
      max_commute_km: tp?.max_commute_km?.toString() ?? "",
    });
    setEditingTravel(true);
  };

  return (
    <div className="space-y-5">
      {/* ── Bio & Headline ── */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 mb-2">Perfil profesional</h3>
        <Card className="rounded-xl border-border/40">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={cn("text-[10px]",
                  profile.verification_status === "verified" ? "bg-earning/10 text-earning border-earning/20" :
                  profile.verification_status === "pending" ? "bg-warning/10 text-warning border-warning/20" :
                  "bg-muted text-muted-foreground"
                )}>
                  {profile.verification_status === "verified" ? "✓ Verificado" : profile.verification_status === "pending" ? "⏳ Pendiente" : "Sin verificar"}
                </Badge>
                <Badge variant="outline" className="text-[10px]">
                  {profile.is_profile_public ? <><Eye className="h-2.5 w-2.5 mr-0.5" /> Público</> : <><EyeOff className="h-2.5 w-2.5 mr-0.5" /> Privado</>}
                </Badge>
              </div>
              {!readOnly && !editingBio && (
                <Button size="sm" variant="ghost" className="h-6 text-[10px] gap-1" onClick={() => { setEditingBio(true); setHeadlineValue(profile.headline ?? ""); setBioValue(profile.bio ?? ""); }}>
                  <Pencil className="h-2.5 w-2.5" /> Editar
                </Button>
              )}
            </div>

            {editingBio ? (
              <div className="space-y-2">
                <Input value={headlineValue} onChange={e => setHeadlineValue(e.target.value)} placeholder="Título profesional (ej: Limpieza comercial)" className="h-8 text-xs" />
                <Textarea value={bioValue} onChange={e => setBioValue(e.target.value)} placeholder="Resumen profesional..." className="text-xs min-h-[60px]" />
                <div className="flex gap-2">
                  <Button size="sm" className="h-7 text-xs gap-1" onClick={handleSaveBio} disabled={saving}><Save className="h-3 w-3" />{saving ? "..." : "Guardar"}</Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditingBio(false)}>Cancelar</Button>
                </div>
              </div>
            ) : (
              <>
                {profile.headline && <p className="text-sm font-semibold">{profile.headline}</p>}
                {profile.bio ? <p className="text-xs text-muted-foreground leading-relaxed">{profile.bio}</p> : <p className="text-xs text-muted-foreground/50 italic">Sin resumen profesional</p>}
              </>
            )}

            {/* Location — editable */}
            {editingLocation ? (
              <div className="space-y-2 pt-2 border-t border-border/30">
                <div className="grid grid-cols-3 gap-2">
                  <Input value={cityValue} onChange={e => setCityValue(e.target.value)} placeholder="Ciudad" className="h-8 text-xs" />
                  <Input value={stateValue} onChange={e => setStateValue(e.target.value)} placeholder="Estado" className="h-8 text-xs" />
                  <Input value={yearsExpValue} onChange={e => setYearsExpValue(e.target.value)} placeholder="Años exp" type="number" className="h-8 text-xs" />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" className="h-7 text-xs" onClick={handleSaveLocation} disabled={saving}>{saving ? "..." : "Guardar"}</Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditingLocation(false)}>Cancelar</Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between pt-1">
                <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                  {profile.city && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{profile.city}{profile.state ? `, ${profile.state}` : ""}</span>}
                  {profile.years_of_experience != null && <span className="flex items-center gap-1"><Briefcase className="h-3 w-3" />{profile.years_of_experience} años exp</span>}
                  {profile.english_level && <span className="flex items-center gap-1"><Globe className="h-3 w-3" />Inglés: {profile.english_level}</span>}
                  {!profile.city && !profile.years_of_experience && <span className="text-muted-foreground/40 italic">Sin ubicación</span>}
                </div>
                {!readOnly && (
                  <Button size="sm" variant="ghost" className="h-5 text-[10px]" onClick={() => { setEditingLocation(true); setCityValue(profile.city ?? ""); setStateValue(profile.state ?? ""); setYearsExpValue(profile.years_of_experience?.toString() ?? ""); }}>
                    <Pencil className="h-2.5 w-2.5" />
                  </Button>
                )}
              </div>
            )}

            {profile.profile_completion_percent != null && (
              <div className="pt-2">
                <div className="flex items-center justify-between text-[10px] mb-1">
                  <span className="text-muted-foreground">Perfil completo</span>
                  <span className="font-semibold">{profile.profile_completion_percent}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted">
                  <div className="h-1.5 rounded-full bg-primary transition-all" style={{ width: `${profile.profile_completion_percent}%` }} />
                </div>
              </div>
            )}

            {!readOnly && (
              <div className="flex items-center justify-between pt-2 border-t border-border/30">
                <span className="text-xs text-muted-foreground">Perfil público</span>
                <Switch checked={profile.is_profile_public ?? false} onCheckedChange={async (v) => { await wp.updateProfile({ is_profile_public: v }); toast.success(v ? "Perfil público" : "Perfil privado"); }} />
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Skills ── */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 mb-2">Habilidades</h3>
        <Card className="rounded-xl border-border/40">
          <CardContent className="p-4">
            {wp.skills.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-3">
                {wp.skills.map((s: any) => (
                  <Badge key={s.id} variant="outline" className="text-[10px] gap-1">
                    {s.worker_skills?.name ?? "Skill"}
                    {!readOnly && <button onClick={() => wp.removeSkill(s.id)} className="ml-0.5 hover:text-destructive"><X className="h-2.5 w-2.5" /></button>}
                  </Badge>
                ))}
              </div>
            )}
            {wp.skills.length === 0 && <p className="text-xs text-muted-foreground/50 italic mb-2">Sin habilidades registradas</p>}
          </CardContent>
        </Card>
      </div>

      {/* ── Languages ── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">Idiomas</h3>
          {!readOnly && !addingLang && (
            <Button size="sm" variant="ghost" className="h-5 text-[10px] gap-1" onClick={() => setAddingLang(true)}>
              <Plus className="h-2.5 w-2.5" /> Agregar
            </Button>
          )}
        </div>
        <Card className="rounded-xl border-border/40">
          <CardContent className="p-4">
            {wp.languages.length > 0 && (
              <div className="space-y-1.5 mb-2">
                {wp.languages.map((l: any) => (
                  <div key={l.id} className="flex items-center justify-between">
                    <span className="text-xs font-medium flex items-center gap-1.5"><Languages className="h-3 w-3 text-muted-foreground" />{l.language}</span>
                    <Badge variant="secondary" className="text-[10px]">{l.proficiency}</Badge>
                  </div>
                ))}
              </div>
            )}
            {wp.languages.length === 0 && !addingLang && <p className="text-xs text-muted-foreground/50 italic">Sin idiomas</p>}
            {addingLang && (
              <div className="space-y-2 pt-2 border-t border-border/30">
                <div className="grid grid-cols-2 gap-2">
                  <Input value={langName} onChange={e => setLangName(e.target.value)} placeholder="Idioma" className="h-8 text-xs" autoFocus />
                  <Select value={langProf} onValueChange={setLangProf}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PROFICIENCY_OPTIONS.map(p => <SelectItem key={p} value={p} className="text-xs">{p}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" className="h-7 text-xs" onClick={handleAddLang} disabled={saving || !langName.trim()}>{saving ? "..." : "Agregar"}</Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setAddingLang(false); setLangName(""); }}>Cancelar</Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Schedule Preferences ── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">Preferencias de horario</h3>
          {!readOnly && !editingSched && (
            <Button size="sm" variant="ghost" className="h-5 text-[10px] gap-1" onClick={startEditSched}>
              <Pencil className="h-2.5 w-2.5" /> {avail.schedulePrefs ? "Editar" : "Configurar"}
            </Button>
          )}
        </div>
        <Card className="rounded-xl border-border/40">
          <CardContent className="p-4 space-y-3">
            {editingSched ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-muted-foreground">Max hrs/semana</label>
                    <Input type="number" value={schedForm.max_hours_per_week} onChange={e => setSchedForm(p => ({ ...p, max_hours_per_week: e.target.value }))} className="h-8 text-xs" />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground">Min hrs/semana</label>
                    <Input type="number" value={schedForm.min_hours_per_week} onChange={e => setSchedForm(p => ({ ...p, min_hours_per_week: e.target.value }))} className="h-8 text-xs" />
                  </div>
                </div>
                <div className="flex flex-wrap gap-4">
                  {[{ key: "overnight_ok", label: "Nocturno" }, { key: "weekend_ok", label: "Fines de semana" }, { key: "holiday_ok", label: "Festivos" }].map(({ key, label }) => (
                    <label key={key} className="flex items-center gap-1.5 text-xs cursor-pointer">
                      <Switch checked={(schedForm as any)[key]} onCheckedChange={v => setSchedForm(p => ({ ...p, [key]: v }))} className="scale-75" />
                      {label}
                    </label>
                  ))}
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground block mb-1">Días bloqueados</label>
                  <div className="flex gap-1.5">
                    {WEEKDAYS.map(wd => {
                      const blocked = schedForm.blocked_weekdays.includes(wd.value);
                      return (
                        <button key={wd.value} onClick={() => setSchedForm(p => ({
                          ...p, blocked_weekdays: blocked ? p.blocked_weekdays.filter(d => d !== wd.value) : [...p.blocked_weekdays, wd.value],
                        }))} className={cn("h-8 w-10 rounded-lg text-[10px] font-medium border transition-all",
                          blocked ? "bg-destructive/10 border-destructive/30 text-destructive" : "bg-muted/50 border-border/50 text-muted-foreground hover:bg-accent"
                        )}>
                          {wd.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" className="h-7 text-xs gap-1" onClick={handleSaveSchedule} disabled={saving}><Save className="h-3 w-3" />{saving ? "..." : "Guardar"}</Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditingSched(false)}>Cancelar</Button>
                </div>
              </div>
            ) : avail.schedulePrefs ? (
              <>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div><span className="text-muted-foreground">Max hrs/semana</span><p className="font-medium">{avail.schedulePrefs.max_hours_per_week ?? "—"}</p></div>
                  <div><span className="text-muted-foreground">Min hrs/semana</span><p className="font-medium">{avail.schedulePrefs.min_hours_per_week ?? "—"}</p></div>
                </div>
                <Separator />
                <div className="flex flex-wrap gap-3 text-xs">
                  {[{ ok: avail.schedulePrefs.overnight_ok, label: "Nocturno" }, { ok: avail.schedulePrefs.weekend_ok, label: "Fines de semana" }, { ok: avail.schedulePrefs.holiday_ok, label: "Festivos" }].map(({ ok, label }) => (
                    <span key={label} className="flex items-center gap-1">
                      {ok ? <CheckCircle2 className="h-3 w-3 text-earning" /> : <AlertCircle className="h-3 w-3 text-muted-foreground" />} {label}
                    </span>
                  ))}
                </div>
                {avail.schedulePrefs.blocked_weekdays && avail.schedulePrefs.blocked_weekdays.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {avail.schedulePrefs.blocked_weekdays.map(d => (
                      <Badge key={d} variant="secondary" className="text-[10px] bg-destructive/10 text-destructive">{WEEKDAY_LABELS[d]} bloqueado</Badge>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <p className="text-xs text-muted-foreground/50 italic">Sin preferencias configuradas</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Travel Preferences ── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">Transporte</h3>
          {!readOnly && !editingTravel && (
            <Button size="sm" variant="ghost" className="h-5 text-[10px] gap-1" onClick={startEditTravel}>
              <Pencil className="h-2.5 w-2.5" /> {avail.travelPrefs ? "Editar" : "Configurar"}
            </Button>
          )}
        </div>
        <Card className="rounded-xl border-border/40">
          <CardContent className="p-4">
            {editingTravel ? (
              <div className="space-y-3">
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <Switch checked={travelForm.has_own_transport} onCheckedChange={v => setTravelForm(p => ({ ...p, has_own_transport: v }))} className="scale-75" />
                  Tiene transporte propio
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-[10px] text-muted-foreground">Tipo</label>
                    <Select value={travelForm.transport_type} onValueChange={v => setTravelForm(p => ({ ...p, transport_type: v }))}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Tipo" /></SelectTrigger>
                      <SelectContent>
                        {TRANSPORT_TYPES.map(t => <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground">Max minutos</label>
                    <Input type="number" value={travelForm.max_commute_minutes} onChange={e => setTravelForm(p => ({ ...p, max_commute_minutes: e.target.value }))} className="h-8 text-xs" />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground">Max km</label>
                    <Input type="number" value={travelForm.max_commute_km} onChange={e => setTravelForm(p => ({ ...p, max_commute_km: e.target.value }))} className="h-8 text-xs" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" className="h-7 text-xs gap-1" onClick={handleSaveTravel} disabled={saving}><Save className="h-3 w-3" />{saving ? "..." : "Guardar"}</Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditingTravel(false)}>Cancelar</Button>
                </div>
              </div>
            ) : avail.travelPrefs ? (
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="flex items-center gap-1.5"><Car className="h-3 w-3 text-muted-foreground" /><span>{avail.travelPrefs.has_own_transport ? "Transporte propio" : "Sin transporte"}</span></div>
                {avail.travelPrefs.transport_type && <div><span className="text-muted-foreground">Tipo:</span> {avail.travelPrefs.transport_type}</div>}
                {avail.travelPrefs.max_commute_minutes && <div><span className="text-muted-foreground">Max traslado:</span> {avail.travelPrefs.max_commute_minutes} min</div>}
                {avail.travelPrefs.max_commute_km && <div><span className="text-muted-foreground">Max distancia:</span> {avail.travelPrefs.max_commute_km} km</div>}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground/50 italic">Sin preferencias de transporte</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Service Zones ── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">Zonas de servicio</h3>
          {!readOnly && !addingZone && (
            <Button size="sm" variant="ghost" className="h-5 text-[10px] gap-1" onClick={() => setAddingZone(true)}>
              <Plus className="h-2.5 w-2.5" /> Agregar
            </Button>
          )}
        </div>
        <Card className="rounded-xl border-border/40">
          <CardContent className="p-4">
            {avail.serviceZones.length > 0 && (
              <div className="space-y-2 mb-2">
                {avail.serviceZones.map((z: any) => (
                  <div key={z.id} className="flex items-center justify-between">
                    <span className="text-xs font-medium flex items-center gap-1.5">
                      <MapPin className="h-3 w-3 text-muted-foreground" />{z.label || z.city || "Zona"}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <Badge variant="outline" className="text-[10px]">{z.zone_type}{z.radius_km ? ` · ${z.radius_km}km` : ""}</Badge>
                      {!readOnly && (
                        <button onClick={() => avail.removeServiceZone(z.id)} className="text-muted-foreground hover:text-destructive">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {avail.serviceZones.length === 0 && !addingZone && <p className="text-xs text-muted-foreground/50 italic">Sin zonas de servicio</p>}
            {addingZone && (
              <div className="space-y-2 pt-2 border-t border-border/30">
                <div className="grid grid-cols-3 gap-2">
                  <Input value={zoneLabel} onChange={e => setZoneLabel(e.target.value)} placeholder="Nombre" className="h-8 text-xs" autoFocus />
                  <Input value={zoneCity} onChange={e => setZoneCity(e.target.value)} placeholder="Ciudad" className="h-8 text-xs" />
                  <Input value={zoneRadius} onChange={e => setZoneRadius(e.target.value)} placeholder="Radio (km)" type="number" className="h-8 text-xs" />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" className="h-7 text-xs" onClick={handleAddZone} disabled={saving || (!zoneLabel.trim() && !zoneCity.trim())}>{saving ? "..." : "Agregar"}</Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setAddingZone(false)}>Cancelar</Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Consents ── */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 mb-2">Consentimientos</h3>
        <Card className="rounded-xl border-border/40">
          <CardContent className="p-4 space-y-2">
            {Object.entries(CONSENT_LABELS).map(([key, { label, icon: Icon }]) => {
              const has = consent.hasConsent(key);
              return (
                <div key={key} className="flex items-center justify-between py-1.5">
                  <span className="text-xs flex items-center gap-1.5"><Icon className="h-3 w-3 text-muted-foreground" />{label}</span>
                  <div className="flex items-center gap-2">
                    {has ? (
                      <Badge variant="outline" className="text-[10px] bg-earning/10 text-earning border-earning/20"><CheckCircle2 className="h-2.5 w-2.5 mr-0.5" /> Aceptado</Badge>
                    ) : (
                      <>
                        <Badge variant="outline" className="text-[10px] text-muted-foreground">Pendiente</Badge>
                        {!readOnly && (
                          <Button size="sm" variant="ghost" className="h-5 text-[10px]" onClick={() => consent.grantConsent(key)}>Otorgar</Button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
