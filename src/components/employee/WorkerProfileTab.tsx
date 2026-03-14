import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { EmptyState } from "@/components/ui/empty-state";
import { Textarea } from "@/components/ui/textarea";
import { useWorkerProfile } from "@/hooks/useWorkerProfile";
import { useWorkerAvailability } from "@/hooks/useWorkerAvailability";
import { useWorkerConsent } from "@/hooks/useWorkerConsent";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  User, Globe, MapPin, Briefcase, Languages, Shield, Car,
  Clock, CalendarCheck, Plus, X, Loader2, Eye, EyeOff,
  CheckCircle2, AlertCircle,
} from "lucide-react";

const WEEKDAY_LABELS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

const CONSENT_LABELS: Record<string, { label: string; icon: any }> = {
  terms_of_service: { label: "Términos de servicio", icon: Shield },
  privacy_policy: { label: "Política de privacidad", icon: Shield },
  gps_tracking: { label: "Rastreo GPS durante turnos", icon: MapPin },
  background_check: { label: "Verificación de antecedentes", icon: Shield },
  data_sharing: { label: "Compartir datos con clientes", icon: Globe },
};

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
  const [saving, setSaving] = useState(false);
  const [newSkill, setNewSkill] = useState("");
  const [newLang, setNewLang] = useState("");

  if (wp.loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // If no worker profile exists yet, offer to create one
  if (!wp.profile) {
    return (
      <EmptyState
        icon={User}
        title="Sin perfil profesional"
        description="Crea un perfil profesional para este empleado"
        compact
      >
        {!readOnly && (
          <Button
            size="sm"
            className="mt-3"
            onClick={async () => {
              setSaving(true);
              const { error } = await wp.createProfile({ employee_id: employeeId });
              setSaving(false);
              if (error) toast.error("Error al crear perfil");
              else toast.success("Perfil profesional creado");
            }}
            disabled={saving}
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Plus className="h-3 w-3 mr-1" />}
            Crear perfil profesional
          </Button>
        )}
      </EmptyState>
    );
  }

  const profile = wp.profile;

  const handleSaveBio = async () => {
    setSaving(true);
    const err = await wp.updateProfile({ headline: headlineValue, bio: bioValue });
    setSaving(false);
    if (err?.error) toast.error("Error al guardar");
    else { toast.success("Perfil actualizado"); setEditingBio(false); }
  };

  const handleSaveSchedule = async (field: string, value: any) => {
    const err = await avail.saveSchedulePrefs({ [field]: value } as any);
    if (err) toast.error("Error al guardar");
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
                <Badge
                  variant="outline"
                  className={cn("text-[10px]",
                    profile.verification_status === "verified" ? "bg-earning/10 text-earning border-earning/20" :
                    profile.verification_status === "pending" ? "bg-warning/10 text-warning border-warning/20" :
                    "bg-muted text-muted-foreground"
                  )}
                >
                  {profile.verification_status === "verified" ? "✓ Verificado" :
                   profile.verification_status === "pending" ? "⏳ Pendiente" : "Sin verificar"}
                </Badge>
                <Badge variant="outline" className="text-[10px]">
                  {profile.is_profile_public ? <><Eye className="h-2.5 w-2.5 mr-0.5" /> Público</> : <><EyeOff className="h-2.5 w-2.5 mr-0.5" /> Privado</>}
                </Badge>
              </div>
              {!readOnly && !editingBio && (
                <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => {
                  setEditingBio(true);
                  setHeadlineValue(profile.headline ?? "");
                  setBioValue(profile.bio ?? "");
                }}>
                  Editar
                </Button>
              )}
            </div>

            {editingBio ? (
              <div className="space-y-2">
                <Input
                  value={headlineValue}
                  onChange={e => setHeadlineValue(e.target.value)}
                  placeholder="Título profesional (ej: Limpieza comercial)"
                  className="h-8 text-xs"
                />
                <Textarea
                  value={bioValue}
                  onChange={e => setBioValue(e.target.value)}
                  placeholder="Resumen profesional..."
                  className="text-xs min-h-[60px]"
                />
                <div className="flex gap-2">
                  <Button size="sm" className="h-7 text-xs" onClick={handleSaveBio} disabled={saving}>
                    {saving ? "Guardando..." : "Guardar"}
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditingBio(false)}>Cancelar</Button>
                </div>
              </div>
            ) : (
              <>
                {profile.headline && <p className="text-sm font-semibold">{profile.headline}</p>}
                {profile.bio ? (
                  <p className="text-xs text-muted-foreground leading-relaxed">{profile.bio}</p>
                ) : (
                  <p className="text-xs text-muted-foreground/50 italic">Sin resumen profesional</p>
                )}
              </>
            )}

            {/* Location info */}
            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground pt-1">
              {profile.city && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{profile.city}{profile.state ? `, ${profile.state}` : ""}</span>}
              {profile.years_of_experience != null && <span className="flex items-center gap-1"><Briefcase className="h-3 w-3" />{profile.years_of_experience} años exp</span>}
              {profile.english_level && <span className="flex items-center gap-1"><Globe className="h-3 w-3" />Inglés: {profile.english_level}</span>}
            </div>

            {/* Profile completion */}
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

            {/* Visibility toggle */}
            {!readOnly && (
              <div className="flex items-center justify-between pt-2 border-t border-border/30">
                <span className="text-xs text-muted-foreground">Perfil público</span>
                <Switch
                  checked={profile.is_profile_public ?? false}
                  onCheckedChange={async (v) => {
                    await wp.updateProfile({ is_profile_public: v });
                    toast.success(v ? "Perfil ahora es público" : "Perfil ahora es privado");
                  }}
                />
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
            {wp.skills.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 mb-3">
                {wp.skills.map((s: any) => (
                  <Badge key={s.id} variant="outline" className="text-[10px] gap-1">
                    {s.worker_skills?.name ?? "Skill"}
                    {!readOnly && (
                      <button onClick={() => wp.removeSkill(s.id)} className="ml-0.5 hover:text-destructive">
                        <X className="h-2.5 w-2.5" />
                      </button>
                    )}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground/50 italic mb-2">Sin habilidades registradas</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Languages ── */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 mb-2">Idiomas</h3>
        <Card className="rounded-xl border-border/40">
          <CardContent className="p-4">
            {wp.languages.length > 0 ? (
              <div className="space-y-1.5 mb-2">
                {wp.languages.map((l: any) => (
                  <div key={l.id} className="flex items-center justify-between">
                    <span className="text-xs font-medium flex items-center gap-1.5">
                      <Languages className="h-3 w-3 text-muted-foreground" />
                      {l.language}
                    </span>
                    <Badge variant="secondary" className="text-[10px]">{l.proficiency}</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground/50 italic">Sin idiomas registrados</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Schedule Preferences ── */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 mb-2">Preferencias de horario</h3>
        <Card className="rounded-xl border-border/40">
          <CardContent className="p-4 space-y-3">
            {avail.schedulePrefs ? (
              <>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-muted-foreground">Max hrs/semana</span>
                    <p className="font-medium">{avail.schedulePrefs.max_hours_per_week ?? "—"}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Min hrs/semana</span>
                    <p className="font-medium">{avail.schedulePrefs.min_hours_per_week ?? "—"}</p>
                  </div>
                </div>
                <Separator />
                <div className="flex flex-wrap gap-3 text-xs">
                  <span className="flex items-center gap-1">
                    {avail.schedulePrefs.overnight_ok ? <CheckCircle2 className="h-3 w-3 text-earning" /> : <AlertCircle className="h-3 w-3 text-muted-foreground" />}
                    Nocturno
                  </span>
                  <span className="flex items-center gap-1">
                    {avail.schedulePrefs.weekend_ok ? <CheckCircle2 className="h-3 w-3 text-earning" /> : <AlertCircle className="h-3 w-3 text-muted-foreground" />}
                    Fines de semana
                  </span>
                  <span className="flex items-center gap-1">
                    {avail.schedulePrefs.holiday_ok ? <CheckCircle2 className="h-3 w-3 text-earning" /> : <AlertCircle className="h-3 w-3 text-muted-foreground" />}
                    Festivos
                  </span>
                </div>
                {avail.schedulePrefs.blocked_weekdays && avail.schedulePrefs.blocked_weekdays.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {avail.schedulePrefs.blocked_weekdays.map(d => (
                      <Badge key={d} variant="secondary" className="text-[10px] bg-destructive/10 text-destructive">
                        {WEEKDAY_LABELS[d]} bloqueado
                      </Badge>
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
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 mb-2">Transporte</h3>
        <Card className="rounded-xl border-border/40">
          <CardContent className="p-4">
            {avail.travelPrefs ? (
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="flex items-center gap-1.5">
                  <Car className="h-3 w-3 text-muted-foreground" />
                  <span>{avail.travelPrefs.has_own_transport ? "Transporte propio" : "Sin transporte"}</span>
                </div>
                {avail.travelPrefs.transport_type && (
                  <div><span className="text-muted-foreground">Tipo:</span> {avail.travelPrefs.transport_type}</div>
                )}
                {avail.travelPrefs.max_commute_minutes && (
                  <div><span className="text-muted-foreground">Max traslado:</span> {avail.travelPrefs.max_commute_minutes} min</div>
                )}
                {avail.travelPrefs.max_commute_km && (
                  <div><span className="text-muted-foreground">Max distancia:</span> {avail.travelPrefs.max_commute_km} km</div>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground/50 italic">Sin preferencias de transporte</p>
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
                  <span className="text-xs flex items-center gap-1.5">
                    <Icon className="h-3 w-3 text-muted-foreground" />
                    {label}
                  </span>
                  {has ? (
                    <Badge variant="outline" className="text-[10px] bg-earning/10 text-earning border-earning/20">
                      <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" /> Aceptado
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] text-muted-foreground">Pendiente</Badge>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
