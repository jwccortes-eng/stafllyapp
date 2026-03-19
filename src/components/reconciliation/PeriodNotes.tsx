import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { EmptyState } from "@/components/ui/empty-state";
import { StickyNote, Plus, Send, Trash2 } from "lucide-react";
import type { PeriodStatus } from "@/hooks/useReconciliationPeriod";

interface Props {
  period: PeriodStatus;
  companyId: string | null;
}

interface PeriodNote {
  id: string;
  event_type: string;
  event_label: string;
  detail: string | null;
  performed_by: string | null;
  created_at: string;
}

export default function PeriodNotes({ period, companyId }: Props) {
  const { user } = useAuth();
  const [notes, setNotes] = useState<PeriodNote[]>([]);
  const [newNote, setNewNote] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    const { data } = await supabase
      .from("reconciliation_period_journal" as any)
      .select("*")
      .eq("period_status_id", period.id)
      .eq("event_type", "operator_note")
      .order("created_at", { ascending: false })
      .limit(100);
    setNotes((data || []) as any[]);
    setLoading(false);
  }, [companyId, period.id]);

  useEffect(() => { load(); }, [load]);

  const addNote = async () => {
    if (!companyId || !newNote.trim()) return;
    await supabase.from("reconciliation_period_journal" as any).insert({
      company_id: companyId,
      period_status_id: period.id,
      event_type: "operator_note",
      event_label: "Nota del operador",
      detail: newNote.trim(),
      performed_by: user?.id || null,
    } as any);
    setNewNote("");
    load();
  };

  const deleteNote = async (id: string) => {
    await supabase.from("reconciliation_period_journal" as any).delete().eq("id", id);
    load();
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <StickyNote className="h-4 w-4" /> Notas del Periodo — {period.period_label}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Add note */}
        <div className="flex gap-2">
          <Textarea
            value={newNote}
            onChange={e => setNewNote(e.target.value)}
            placeholder="Observación de importación, situación inusual, varianza aceptada, comentario post-cierre..."
            rows={2}
            className="text-sm"
          />
          <Button size="sm" onClick={addNote} disabled={!newNote.trim()} className="shrink-0 self-end">
            <Send className="h-3 w-3" />
          </Button>
        </div>

        {/* Notes list */}
        {notes.length === 0 ? (
          <EmptyState icon={StickyNote} title="Sin notas" description="Agrega notas durante la ejecución del periodo para documentar decisiones importantes." />
        ) : (
          <ScrollArea className="max-h-[400px]">
            <div className="space-y-2">
              {notes.map(note => (
                <div key={note.id} className="flex items-start gap-2 p-2.5 rounded-lg bg-muted/30 group">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs">{note.detail}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {new Date(note.created_at).toLocaleString("es", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                    onClick={() => deleteNote(note.id)}
                  >
                    <Trash2 className="h-3 w-3 text-muted-foreground" />
                  </Button>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
