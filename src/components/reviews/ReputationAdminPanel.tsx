import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useReputation } from "@/hooks/useReputation";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  TrendingUp, Award, Plus, Star, Zap, AlertTriangle,
  ThumbsUp, ThumbsDown, Loader2, Save,
} from "lucide-react";

const EVENT_CATEGORIES = [
  { value: "punctuality", label: "Puntualidad", emoji: "⏰" },
  { value: "quality", label: "Calidad", emoji: "⭐" },
  { value: "service", label: "Servicio", emoji: "🤝" },
  { value: "professionalism", label: "Profesionalismo", emoji: "💼" },
  { value: "teamwork", label: "Trabajo en equipo", emoji: "👥" },
  { value: "attendance", label: "Asistencia", emoji: "📋" },
  { value: "cancellation", label: "Cancelación", emoji: "❌" },
  { value: "bonus", label: "Bonus", emoji: "🎁" },
];

const EVENT_SOURCES = [
  { value: "shift_review", label: "Reseña de turno" },
  { value: "attendance", label: "Asistencia" },
  { value: "manual", label: "Ajuste manual" },
  { value: "client_feedback", label: "Feedback de cliente" },
  { value: "system", label: "Sistema automático" },
];

interface Props {
  workerProfileId: string;
  employeeId: string;
  employeeName: string;
}

export function ReputationAdminPanel({ workerProfileId, employeeId, employeeName }: Props) {
  const rep = useReputation({ workerProfileId });
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);

  const [eventForm, setEventForm] = useState({
    source: "manual",
    category: "quality",
    delta: "5",
    weight: "1",
    note: "",
  });

  const handleRecordEvent = async () => {
    setSaving(true);
    const err = await rep.recordEvent({
      source: eventForm.source,
      category: eventForm.category,
      delta: parseFloat(eventForm.delta),
      weight: parseFloat(eventForm.weight) || 1,
      note: eventForm.note || undefined,
    });
    setSaving(false);
    if (err) toast.error("Error al registrar evento");
    else {
      toast.success("Evento de reputación registrado");
      setAdding(false);
      setEventForm({ source: "manual", category: "quality", delta: "5", weight: "1", note: "" });
    }
  };

  const catEmoji = (cat: string) => EVENT_CATEGORIES.find(c => c.value === cat)?.emoji ?? "📊";

  return (
    <div className="space-y-4">
      {/* Score Overview */}
      <Card className="rounded-xl border-border/40">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">Reputation Score</h3>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-bold">{rep.score?.overall_score?.toFixed(1) ?? "—"}</span>
              <span className="text-xs text-muted-foreground">/100</span>
            </div>
          </div>

          {rep.score && (
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div><span className="text-muted-foreground">Total eventos:</span> <span className="font-medium">{rep.score.total_events}</span></div>
              <div><span className="text-muted-foreground">Último cálculo:</span> <span className="font-medium">{rep.score.last_calculated_at ? new Date(rep.score.last_calculated_at).toLocaleDateString("es") : "—"}</span></div>
              {rep.score.category_scores && typeof rep.score.category_scores === "object" && (
                <div className="col-span-2 pt-2 border-t border-border/30">
                  <p className="text-[10px] text-muted-foreground mb-1">Scores por categoría:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(rep.score.category_scores as Record<string, any>).map(([cat, data]) => (
                      <Badge key={cat} variant="outline" className="text-[10px]">
                        {catEmoji(cat)} {cat}: {typeof data === "object" ? `${data.count} eventos` : data}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {!rep.score && <p className="text-xs text-muted-foreground/50 italic">Sin score calculado aún</p>}
        </CardContent>
      </Card>

      {/* Badges */}
      <Card className="rounded-xl border-border/40">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Award className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Badges</h3>
          </div>
          {rep.badges.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {rep.badges.map((b: any) => (
                <Badge key={b.id} variant="secondary" className="text-xs gap-1">
                  {b.rep_badges?.emoji ?? "🏅"} {b.rep_badges?.label ?? b.badge_id}
                  <span className="text-[9px] text-muted-foreground ml-1">
                    {new Date(b.earned_at).toLocaleDateString("es")}
                  </span>
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground/50 italic">Sin badges asignados</p>
          )}
        </CardContent>
      </Card>

      {/* Record Event */}
      <Card className="rounded-xl border-border/40">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">Registrar evento</h3>
            </div>
            {!adding && (
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setAdding(true)}>
                <Plus className="h-3 w-3" /> Nuevo
              </Button>
            )}
          </div>

          {adding && (
            <div className="space-y-3 border-t border-border/30 pt-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-muted-foreground">Fuente</label>
                  <Select value={eventForm.source} onValueChange={v => setEventForm(p => ({ ...p, source: v }))}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {EVENT_SOURCES.map(s => <SelectItem key={s.value} value={s.value} className="text-xs">{s.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground">Categoría</label>
                  <Select value={eventForm.category} onValueChange={v => setEventForm(p => ({ ...p, category: v }))}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {EVENT_CATEGORIES.map(c => <SelectItem key={c.value} value={c.value} className="text-xs">{c.emoji} {c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-muted-foreground">Delta (puntos, +/-)</label>
                  <Input type="number" value={eventForm.delta} onChange={e => setEventForm(p => ({ ...p, delta: e.target.value }))} className="h-8 text-xs" />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground">Peso</label>
                  <Input type="number" step="0.1" value={eventForm.weight} onChange={e => setEventForm(p => ({ ...p, weight: e.target.value }))} className="h-8 text-xs" />
                </div>
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground">Nota (opcional)</label>
                <Textarea value={eventForm.note} onChange={e => setEventForm(p => ({ ...p, note: e.target.value }))} placeholder="Motivo del ajuste..." className="text-xs min-h-[40px]" />
              </div>
              <div className="flex gap-2">
                <Button size="sm" className="h-7 text-xs gap-1" onClick={handleRecordEvent} disabled={saving}>
                  <Save className="h-3 w-3" />{saving ? "Guardando..." : "Registrar"}
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setAdding(false)}>Cancelar</Button>
              </div>
              <div className="flex gap-2 pt-1">
                <Button size="sm" variant="outline" className="h-6 text-[10px] gap-1 text-earning border-earning/30" onClick={() => setEventForm(p => ({ ...p, delta: "10", category: "bonus", note: "Buen desempeño" }))}>
                  <ThumbsUp className="h-2.5 w-2.5" /> +10 Bonus
                </Button>
                <Button size="sm" variant="outline" className="h-6 text-[10px] gap-1 text-destructive border-destructive/30" onClick={() => setEventForm(p => ({ ...p, delta: "-10", category: "cancellation", note: "Cancelación tardía" }))}>
                  <ThumbsDown className="h-2.5 w-2.5" /> -10 Penalización
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Events */}
      <Card className="rounded-xl border-border/40">
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Star className="h-4 w-4 text-primary" /> Eventos recientes
          </h3>
          {rep.recentEvents.length > 0 ? (
            <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
              {rep.recentEvents.slice(0, 20).map((ev: any) => (
                <div key={ev.id} className="flex items-center justify-between py-1.5 border-b border-border/20 last:border-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm">{catEmoji(ev.category)}</span>
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate">{ev.category} — {ev.source}</p>
                      {ev.note && <p className="text-[10px] text-muted-foreground truncate">{ev.note}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="outline" className={cn("text-[10px] font-mono", ev.delta > 0 ? "text-earning" : "text-destructive")}>
                      {ev.delta > 0 ? "+" : ""}{ev.delta}
                    </Badge>
                    <span className="text-[9px] text-muted-foreground">{new Date(ev.created_at).toLocaleDateString("es")}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground/50 italic">Sin eventos registrados</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
