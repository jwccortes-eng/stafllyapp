import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertCircle, CheckCircle2, Clock, MessageSquare, Send, Inbox,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";

interface EmployeeCRMTimelineProps {
  employeeId: string;
  companyId: string;
}

interface Ticket {
  id: string;
  subject: string;
  type: string;
  status: string;
  priority: string;
  created_at: string;
  description: string;
}

interface Note {
  id: string;
  content: string;
  author_type: string;
  note_type: string;
  created_at: string;
}

const STATUS_ICON: Record<string, any> = {
  new: AlertCircle,
  in_progress: Clock,
  resolved: CheckCircle2,
  closed: CheckCircle2,
};

const STATUS_COLOR: Record<string, string> = {
  new: "text-amber-600",
  in_progress: "text-blue-600",
  resolved: "text-emerald-600",
  closed: "text-muted-foreground",
};

export default function EmployeeCRMTimeline({ employeeId, companyId }: EmployeeCRMTimelineProps) {
  const { user } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedTicket, setExpandedTicket] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, Note[]>>({});
  const [newNote, setNewNote] = useState("");

  const fetchTickets = useCallback(async () => {
    const { data } = await supabase
      .from("employee_tickets")
      .select("id, subject, type, status, priority, created_at, description")
      .eq("employee_id", employeeId)
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(50);
    setTickets((data as Ticket[]) ?? []);
    setLoading(false);
  }, [employeeId, companyId]);

  useEffect(() => { fetchTickets(); }, [fetchTickets]);

  const fetchNotes = async (ticketId: string) => {
    const { data } = await supabase
      .from("ticket_notes")
      .select("id, content, author_type, note_type, created_at")
      .eq("ticket_id", ticketId)
      .order("created_at", { ascending: true });
    setNotes(prev => ({ ...prev, [ticketId]: (data as Note[]) ?? [] }));
  };

  const toggleExpand = (ticketId: string) => {
    if (expandedTicket === ticketId) {
      setExpandedTicket(null);
    } else {
      setExpandedTicket(ticketId);
      if (!notes[ticketId]) fetchNotes(ticketId);
    }
  };

  const sendNote = async (ticketId: string) => {
    if (!newNote.trim()) return;
    await supabase.from("ticket_notes").insert({
      ticket_id: ticketId,
      company_id: companyId,
      author_id: user!.id,
      author_type: "admin",
      note_type: "comment",
      content: newNote.trim(),
    } as any);
    setNewNote("");
    fetchNotes(ticketId);
    toast.success("Nota agregada");
  };

  if (loading) {
    return (
      <div className="flex justify-center py-6">
        <div className="animate-spin h-5 w-5 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (tickets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center gap-2">
        <Inbox className="h-8 w-8 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground/50">Sin historial de solicitudes</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/50 px-1">
        Historial de solicitudes ({tickets.length})
      </h4>
      <ScrollArea className="max-h-[400px]">
        <div className="space-y-2">
          {tickets.map(t => {
            const Icon = STATUS_ICON[t.status] || AlertCircle;
            const isExpanded = expandedTicket === t.id;
            return (
              <div key={t.id} className="rounded-xl border border-border/30 bg-card overflow-hidden">
                <button
                  onClick={() => toggleExpand(t.id)}
                  className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-muted/20 transition-colors"
                >
                  <Icon className={cn("h-4 w-4 shrink-0", STATUS_COLOR[t.status])} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{t.subject}</p>
                    <p className="text-[10px] text-muted-foreground/50">
                      {formatDistanceToNow(new Date(t.created_at), { addSuffix: true, locale: es })}
                    </p>
                  </div>
                  <Badge variant="outline" className="text-[10px] shrink-0">{t.type}</Badge>
                </button>

                {isExpanded && (
                  <div className="border-t border-border/20 px-4 py-3 space-y-3 bg-muted/5">
                    {t.description && (
                      <p className="text-xs text-muted-foreground">{t.description}</p>
                    )}

                    {/* Notes */}
                    <div className="space-y-1.5">
                      {(notes[t.id] ?? []).map(n => (
                        <div key={n.id} className={cn(
                          "rounded-lg px-3 py-2 text-xs",
                          n.note_type === "status_change" ? "bg-muted/30 italic text-muted-foreground" : "bg-card border border-border/20"
                        )}>
                          <p>{n.content}</p>
                          <p className="text-[9px] text-muted-foreground/40 mt-0.5">
                            {n.author_type} · {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: es })}
                          </p>
                        </div>
                      ))}
                    </div>

                    {/* Add note */}
                    <div className="flex gap-2">
                      <Textarea
                        value={newNote}
                        onChange={e => setNewNote(e.target.value)}
                        placeholder="Agregar nota..."
                        className="min-h-[40px] text-xs rounded-lg bg-background border-border/30 resize-none"
                      />
                      <Button size="icon" variant="ghost" onClick={() => sendNote(t.id)} disabled={!newNote.trim()} className="shrink-0 h-8 w-8">
                        <Send className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
