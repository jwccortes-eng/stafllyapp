import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import {
  Inbox, Search, Filter, MessageSquare, CheckCircle2, Clock, AlertCircle,
  User, ChevronRight, Send,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";

interface Ticket {
  id: string;
  type: string;
  subject: string;
  description: string;
  status: string;
  priority: string;
  assigned_to: string | null;
  source: string;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  resolution_note: string | null;
  employee_id: string;
  company_id: string;
  employee?: { first_name: string; last_name: string };
}

interface TicketNote {
  id: string;
  content: string;
  author_type: string;
  note_type: string;
  created_at: string;
  author_id: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  new: { label: "Nuevo", color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300", icon: AlertCircle },
  in_progress: { label: "En gestión", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300", icon: Clock },
  resolved: { label: "Resuelto", color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300", icon: CheckCircle2 },
  closed: { label: "Cerrado", color: "bg-muted text-muted-foreground", icon: CheckCircle2 },
};

const PRIORITY_LABELS: Record<string, string> = {
  low: "Baja",
  normal: "Normal",
  high: "Alta",
  urgent: "Urgente",
};

const TYPE_LABELS: Record<string, string> = {
  clock_request: "Reloj",
  shift_request: "Turno",
  general: "General",
  complaint: "Queja",
  document: "Documento",
  schedule_change: "Cambio horario",
};

export default function Requests() {
  const { user } = useAuth();
  const { selectedCompanyId } = useCompany();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [notes, setNotes] = useState<TicketNote[]>([]);
  const [newNote, setNewNote] = useState("");
  const [notesLoading, setNotesLoading] = useState(false);

  const fetchTickets = useCallback(async () => {
    if (!selectedCompanyId) return;
    setLoading(true);

    let query = supabase
      .from("employee_tickets")
      .select("*, employees!inner(first_name, last_name)")
      .eq("company_id", selectedCompanyId)
      .order("created_at", { ascending: false })
      .limit(200);

    if (statusFilter !== "all") {
      query = query.eq("status", statusFilter);
    }

    const { data, error } = await query;
    if (!error && data) {
      setTickets(data.map((t: any) => ({
        ...t,
        employee: t.employees,
      })));
    }
    setLoading(false);
  }, [selectedCompanyId, statusFilter]);

  useEffect(() => { fetchTickets(); }, [fetchTickets]);

  // Realtime
  useEffect(() => {
    if (!selectedCompanyId) return;
    const channel = supabase
      .channel("tickets-realtime")
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "employee_tickets",
        filter: `company_id=eq.${selectedCompanyId}`,
      }, () => { fetchTickets(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedCompanyId, fetchTickets]);

  const fetchNotes = async (ticketId: string) => {
    setNotesLoading(true);
    const { data } = await supabase
      .from("ticket_notes")
      .select("*")
      .eq("ticket_id", ticketId)
      .order("created_at", { ascending: true });
    setNotes((data as TicketNote[]) ?? []);
    setNotesLoading(false);
  };

  const openTicket = (ticket: Ticket) => {
    setSelectedTicket(ticket);
    fetchNotes(ticket.id);
  };

  const updateStatus = async (ticketId: string, newStatus: string) => {
    const updates: any = { status: newStatus };
    if (newStatus === "in_progress" && !selectedTicket?.assigned_to) {
      updates.assigned_to = user?.id;
    }
    if (newStatus === "resolved") {
      updates.resolved_at = new Date().toISOString();
      updates.resolved_by = user?.id;
    }

    const { error } = await supabase
      .from("employee_tickets")
      .update(updates)
      .eq("id", ticketId);

    if (!error) {
      // Add system note
      await supabase.from("ticket_notes").insert({
        ticket_id: ticketId,
        company_id: selectedCompanyId!,
        author_id: user!.id,
        author_type: "admin",
        note_type: "status_change",
        content: `Estado cambiado a ${STATUS_CONFIG[newStatus]?.label || newStatus}`,
      } as any);

      toast.success("Estado actualizado");
      fetchTickets();
      if (selectedTicket?.id === ticketId) {
        setSelectedTicket(prev => prev ? { ...prev, ...updates } : null);
        fetchNotes(ticketId);
      }
    }
  };

  const sendNote = async () => {
    if (!newNote.trim() || !selectedTicket) return;

    const { error } = await supabase.from("ticket_notes").insert({
      ticket_id: selectedTicket.id,
      company_id: selectedCompanyId!,
      author_id: user!.id,
      author_type: "admin",
      note_type: "comment",
      content: newNote.trim(),
    } as any);

    if (!error) {
      setNewNote("");
      fetchNotes(selectedTicket.id);
      toast.success("Nota agregada");
    }
  };

  const filtered = tickets.filter(t => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      t.subject.toLowerCase().includes(q) ||
      t.employee?.first_name.toLowerCase().includes(q) ||
      t.employee?.last_name.toLowerCase().includes(q)
    );
  });

  const counts = {
    all: tickets.length,
    new: tickets.filter(t => t.status === "new").length,
    in_progress: tickets.filter(t => t.status === "in_progress").length,
    resolved: tickets.filter(t => t.status === "resolved").length,
  };

  if (loading && tickets.length === 0) return <PageSkeleton />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Inbox className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="page-title">Solicitudes</h1>
          <p className="text-sm text-muted-foreground">Gestiona las solicitudes de tus empleados</p>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {([
          { key: "all", label: "Totales", color: "text-foreground" },
          { key: "new", label: "Nuevas", color: "text-amber-600" },
          { key: "in_progress", label: "En gestión", color: "text-blue-600" },
          { key: "resolved", label: "Resueltas", color: "text-emerald-600" },
        ] as const).map(k => (
          <button
            key={k.key}
            onClick={() => setStatusFilter(k.key)}
            className={cn(
              "rounded-2xl border p-4 text-left transition-all hover:shadow-sm active:scale-[0.98]",
              statusFilter === k.key ? "border-primary/30 bg-primary/3 shadow-sm" : "border-border/50 bg-card"
            )}
          >
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">{k.label}</p>
            <p className={cn("text-2xl font-bold mt-1", k.color)}>{counts[k.key]}</p>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40" />
          <Input
            placeholder="Buscar por asunto o empleado..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 h-9 rounded-xl bg-muted/30 border-border/30"
          />
        </div>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
          <div className="h-12 w-12 rounded-2xl bg-muted/50 flex items-center justify-center">
            <Inbox className="h-6 w-6 text-muted-foreground/40" />
          </div>
          <p className="text-sm font-medium text-muted-foreground/60">Sin solicitudes</p>
          <p className="text-xs text-muted-foreground/40">Las solicitudes de tus empleados aparecerán aquí automáticamente.</p>
        </div>
      ) : (
        <div className="data-table-wrapper">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Estado</TableHead>
                <TableHead>Empleado</TableHead>
                <TableHead>Asunto</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Prioridad</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(t => {
                const sc = STATUS_CONFIG[t.status] || STATUS_CONFIG.new;
                const StatusIcon = sc.icon;
                return (
                  <TableRow
                    key={t.id}
                    className="cursor-pointer hover:bg-muted/30"
                    onClick={() => openTicket(t)}
                  >
                    <TableCell>
                      <Badge variant="secondary" className={cn("gap-1", sc.color)}>
                        <StatusIcon className="h-3 w-3" />
                        {sc.label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center">
                          <User className="h-3.5 w-3.5 text-primary" />
                        </div>
                        <span className="text-sm font-medium">
                          {t.employee?.first_name} {t.employee?.last_name}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate text-sm">{t.subject}</TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">{TYPE_LABELS[t.type] || t.type}</span>
                    </TableCell>
                    <TableCell>
                      <span className={cn(
                        "text-xs font-medium",
                        t.priority === "urgent" && "text-destructive",
                        t.priority === "high" && "text-amber-600 dark:text-amber-400",
                      )}>
                        {PRIORITY_LABELS[t.priority] || t.priority}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(t.created_at), { addSuffix: true, locale: es })}
                    </TableCell>
                    <TableCell>
                      <ChevronRight className="h-4 w-4 text-muted-foreground/30" />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Detail Sheet */}
      <Sheet open={!!selectedTicket} onOpenChange={(v) => { if (!v) setSelectedTicket(null); }}>
        <SheetContent className="w-full sm:max-w-lg p-0 flex flex-col">
          {selectedTicket && (
            <>
              <SheetHeader className="p-5 border-b border-border/30 shrink-0">
                <SheetTitle className="text-base font-heading">{selectedTicket.subject}</SheetTitle>
                <div className="flex items-center gap-2 mt-2">
                  <Badge variant="secondary" className={cn("gap-1", STATUS_CONFIG[selectedTicket.status]?.color)}>
                    {STATUS_CONFIG[selectedTicket.status]?.label}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {selectedTicket.employee?.first_name} {selectedTicket.employee?.last_name}
                  </span>
                  <span className="text-xs text-muted-foreground/50">
                    · {format(new Date(selectedTicket.created_at), "dd MMM yyyy HH:mm", { locale: es })}
                  </span>
                </div>
              </SheetHeader>

              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {/* Description */}
                {selectedTicket.description && (
                  <div className="bg-muted/30 rounded-xl p-4 text-sm">
                    {selectedTicket.description}
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2 flex-wrap">
                  <Select
                    value={selectedTicket.status}
                    onValueChange={(v) => updateStatus(selectedTicket.id, v)}
                  >
                    <SelectTrigger className="w-[160px] h-8 text-xs rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="new">Nuevo</SelectItem>
                      <SelectItem value="in_progress">En gestión</SelectItem>
                      <SelectItem value="resolved">Resuelto</SelectItem>
                      <SelectItem value="closed">Cerrado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Timeline */}
                <div className="space-y-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/50">
                    Timeline
                  </h4>
                  {notesLoading ? (
                    <div className="flex justify-center py-4">
                      <div className="animate-spin h-5 w-5 border-2 border-primary border-t-transparent rounded-full" />
                    </div>
                  ) : notes.length === 0 ? (
                    <p className="text-sm text-muted-foreground/50 text-center py-4">Sin actividad aún</p>
                  ) : (
                    <div className="space-y-2">
                      {notes.map(n => (
                        <div key={n.id} className={cn(
                          "rounded-xl p-3 text-sm",
                          n.note_type === "status_change" ? "bg-muted/20 text-muted-foreground italic" : "bg-card border border-border/30"
                        )}>
                          <p>{n.content}</p>
                          <p className="text-[10px] text-muted-foreground/40 mt-1">
                            {n.author_type === "admin" ? "Admin" : n.author_type === "employee" ? "Empleado" : "Sistema"}
                            {" · "}
                            {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: es })}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Add note */}
              <div className="border-t border-border/30 p-4 shrink-0">
                <div className="flex gap-2">
                  <Textarea
                    value={newNote}
                    onChange={e => setNewNote(e.target.value)}
                    placeholder="Agregar nota o respuesta..."
                    className="min-h-[60px] text-sm rounded-xl bg-muted/20 border-border/30 resize-none"
                    onKeyDown={e => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) sendNote();
                    }}
                  />
                  <Button size="icon" onClick={sendNote} disabled={!newNote.trim()} className="shrink-0 rounded-xl h-10 w-10">
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
