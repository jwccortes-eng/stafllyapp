import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CheckCircle2, Circle, Clock, AlertTriangle, Plus, Filter,
  ListChecks, Sparkles, ChevronDown, ChevronRight, CalendarDays,
  MessageSquare, Pencil, Trash2, Save, X,
} from "lucide-react";
import { format, formatDistanceToNow, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/ui/page-header";

interface ImplItem {
  id: string;
  title: string;
  description: string;
  status: string;
  category: string;
  priority: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  notes: string;
  prompt_ref: string;
}

const STATUS_CONFIG: Record<string, { label: string; icon: any; color: string; bg: string }> = {
  pending: { label: "Pendiente", icon: Circle, color: "text-muted-foreground", bg: "bg-muted" },
  in_progress: { label: "En progreso", icon: Clock, color: "text-warning", bg: "bg-warning/10" },
  done: { label: "Completado", icon: CheckCircle2, color: "text-earning", bg: "bg-earning/10" },
  blocked: { label: "Bloqueado", icon: AlertTriangle, color: "text-deduction", bg: "bg-deduction/10" },
};

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  low: { label: "Baja", color: "bg-muted text-muted-foreground" },
  medium: { label: "Media", color: "bg-primary/10 text-primary" },
  high: { label: "Alta", color: "bg-warning/10 text-warning" },
  critical: { label: "Crítica", color: "bg-deduction/10 text-deduction" },
};

const CATEGORY_OPTIONS = ["feature", "fix", "refactor", "database", "ui", "security", "testing", "infra"];

export default function Implementations() {
  const { toast } = useToast();
  const [items, setItems] = useState<ImplItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<ImplItem>>({});
  const [showAdd, setShowAdd] = useState(false);
  const [newItem, setNewItem] = useState({ title: "", description: "", category: "feature", priority: "medium", notes: "", prompt_ref: "" });

  const load = async () => {
    const { data } = await supabase
      .from("implementation_log")
      .select("*")
      .order("created_at", { ascending: false });
    setItems((data as ImplItem[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    return items.filter(i => {
      if (filterStatus !== "all" && i.status !== filterStatus) return false;
      if (filterCategory !== "all" && i.category !== filterCategory) return false;
      if (search) {
        const q = search.toLowerCase();
        return i.title.toLowerCase().includes(q) || i.description.toLowerCase().includes(q) || i.notes.toLowerCase().includes(q);
      }
      return true;
    });
  }, [items, filterStatus, filterCategory, search]);

  const stats = useMemo(() => ({
    total: items.length,
    pending: items.filter(i => i.status === "pending").length,
    in_progress: items.filter(i => i.status === "in_progress").length,
    done: items.filter(i => i.status === "done").length,
    blocked: items.filter(i => i.status === "blocked").length,
  }), [items]);

  const handleAdd = async () => {
    if (!newItem.title.trim()) return;
    const { error } = await supabase.from("implementation_log").insert(newItem as any);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Implementación agregada" });
    setNewItem({ title: "", description: "", category: "feature", priority: "medium", notes: "", prompt_ref: "" });
    setShowAdd(false);
    load();
  };

  const handleStatusChange = async (id: string, status: string) => {
    const update: any = { status };
    if (status === "done") update.completed_at = new Date().toISOString();
    else update.completed_at = null;
    await supabase.from("implementation_log").update(update).eq("id", id);
    load();
  };

  const handleSaveEdit = async (id: string) => {
    await supabase.from("implementation_log").update(editForm as any).eq("id", id);
    setEditingId(null);
    toast({ title: "Actualizado" });
    load();
  };

  const handleDelete = async (id: string) => {
    await supabase.from("implementation_log").delete().eq("id", id);
    toast({ title: "Eliminado" });
    load();
  };

  const startEdit = (item: ImplItem) => {
    setEditingId(item.id);
    setEditForm({ title: item.title, description: item.description, category: item.category, priority: item.priority, notes: item.notes, prompt_ref: item.prompt_ref });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        variant="5"
        icon={ListChecks}
        title="Tablero de Implementaciones"
        subtitle="Seguimiento cronológico de features, fixes y mejoras"
      />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "Total", value: stats.total, icon: ListChecks, color: "text-foreground" },
          { label: "Pendientes", value: stats.pending, icon: Circle, color: "text-muted-foreground" },
          { label: "En progreso", value: stats.in_progress, icon: Clock, color: "text-warning" },
          { label: "Completados", value: stats.done, icon: CheckCircle2, color: "text-earning" },
          { label: "Bloqueados", value: stats.blocked, icon: AlertTriangle, color: "text-deduction" },
        ].map(s => (
          <Card key={s.label} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setFilterStatus(s.label === "Total" ? "all" : Object.keys(STATUS_CONFIG).find(k => STATUS_CONFIG[k].label === s.label) || "all")}>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground">{s.label}</span>
                <s.icon className={cn("h-4 w-4", s.color)} />
              </div>
              <p className="text-2xl font-bold font-heading">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters + Add */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
          <Input placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} className="h-9 max-w-xs" />
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="h-9 w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="h-9 w-[130px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {CATEGORY_OPTIONS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button size="sm" onClick={() => setShowAdd(true)}>
          <Plus className="h-4 w-4 mr-1" /> Agregar
        </Button>
      </div>

      {/* Add dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Nueva implementación</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Título" value={newItem.title} onChange={e => setNewItem(p => ({ ...p, title: e.target.value }))} />
            <Textarea placeholder="Descripción" rows={2} value={newItem.description} onChange={e => setNewItem(p => ({ ...p, description: e.target.value }))} />
            <div className="grid grid-cols-2 gap-3">
              <Select value={newItem.category} onValueChange={v => setNewItem(p => ({ ...p, category: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORY_OPTIONS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={newItem.priority} onValueChange={v => setNewItem(p => ({ ...p, priority: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(PRIORITY_CONFIG).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Textarea placeholder="Notas / contexto" rows={2} value={newItem.notes} onChange={e => setNewItem(p => ({ ...p, notes: e.target.value }))} />
            <Input placeholder="Referencia de prompt (opcional)" value={newItem.prompt_ref} onChange={e => setNewItem(p => ({ ...p, prompt_ref: e.target.value }))} />
            <Button className="w-full" onClick={handleAdd}>Crear</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* List */}
      {loading ? (
        <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">No hay implementaciones que coincidan</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {filtered.map(item => {
            const sc = STATUS_CONFIG[item.status] || STATUS_CONFIG.pending;
            const pc = PRIORITY_CONFIG[item.priority] || PRIORITY_CONFIG.medium;
            const isExpanded = expandedId === item.id;
            const isEditing = editingId === item.id;

            return (
              <Card key={item.id} className={cn("transition-all duration-200 hover:shadow-md", item.status === "done" && "opacity-70")}>
                <CardContent className="py-3 px-4">
                  <div className="flex items-start gap-3">
                    {/* Status icon as button */}
                    <button
                      className={cn("mt-0.5 shrink-0 rounded-full p-1 transition-colors", sc.bg)}
                      onClick={() => {
                        const order = ["pending", "in_progress", "done"];
                        const next = order[(order.indexOf(item.status) + 1) % order.length];
                        handleStatusChange(item.id, next);
                      }}
                      title="Cambiar estado"
                    >
                      <sc.icon className={cn("h-4 w-4", sc.color)} />
                    </button>

                    <div className="flex-1 min-w-0">
                      {isEditing ? (
                        <div className="space-y-2">
                          <Input value={editForm.title ?? ""} onChange={e => setEditForm(p => ({ ...p, title: e.target.value }))} className="h-8 text-sm font-medium" />
                          <Textarea value={editForm.description ?? ""} onChange={e => setEditForm(p => ({ ...p, description: e.target.value }))} rows={2} className="text-xs" />
                          <div className="grid grid-cols-2 gap-2">
                            <Select value={editForm.category ?? "feature"} onValueChange={v => setEditForm(p => ({ ...p, category: v }))}>
                              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>{CATEGORY_OPTIONS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                            </Select>
                            <Select value={editForm.priority ?? "medium"} onValueChange={v => setEditForm(p => ({ ...p, priority: v }))}>
                              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>{Object.entries(PRIORITY_CONFIG).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent>
                            </Select>
                          </div>
                          <Textarea placeholder="Notas" value={editForm.notes ?? ""} onChange={e => setEditForm(p => ({ ...p, notes: e.target.value }))} rows={2} className="text-xs" />
                          <div className="flex gap-2">
                            <Button size="sm" onClick={() => handleSaveEdit(item.id)}><Save className="h-3 w-3 mr-1" />Guardar</Button>
                            <Button size="sm" variant="outline" onClick={() => setEditingId(null)}><X className="h-3 w-3 mr-1" />Cancelar</Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center gap-2 flex-wrap">
                            <button className="text-sm font-medium text-left hover:text-primary transition-colors" onClick={() => setExpandedId(isExpanded ? null : item.id)}>
                              {isExpanded ? <ChevronDown className="h-3 w-3 inline mr-1" /> : <ChevronRight className="h-3 w-3 inline mr-1" />}
                              {item.title}
                            </button>
                            <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", pc.color)}>{pc.label}</Badge>
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{item.category}</Badge>
                          </div>
                          {item.description && !isExpanded && (
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{item.description}</p>
                          )}
                          {isExpanded && (
                            <div className="mt-3 space-y-2">
                              {item.description && <p className="text-xs text-muted-foreground">{item.description}</p>}
                              {item.notes && (
                                <div className="rounded-lg bg-muted/50 p-3">
                                  <p className="text-[10px] font-semibold text-muted-foreground mb-1 flex items-center gap-1"><MessageSquare className="h-3 w-3" />Notas</p>
                                  <p className="text-xs whitespace-pre-wrap">{item.notes}</p>
                                </div>
                              )}
                              {item.prompt_ref && (
                                <p className="text-[10px] text-muted-foreground"><Sparkles className="h-3 w-3 inline mr-1" />Prompt: {item.prompt_ref}</p>
                              )}
                              {item.completed_at && (
                                <p className="text-[10px] text-earning"><CheckCircle2 className="h-3 w-3 inline mr-1" />Completado {format(parseISO(item.completed_at), "dd MMM yyyy HH:mm", { locale: es })}</p>
                              )}
                              <div className="flex gap-2 pt-1">
                                <Select value={item.status} onValueChange={v => handleStatusChange(item.id, v)}>
                                  <SelectTrigger className="h-7 w-[130px] text-xs"><SelectValue /></SelectTrigger>
                                  <SelectContent>{Object.entries(STATUS_CONFIG).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent>
                                </Select>
                                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => startEdit(item)}><Pencil className="h-3 w-3 mr-1" />Editar</Button>
                                <Button variant="ghost" size="sm" className="h-7 text-xs text-deduction hover:text-deduction" onClick={() => handleDelete(item.id)}><Trash2 className="h-3 w-3 mr-1" />Eliminar</Button>
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>

                    {/* Timestamp */}
                    <div className="text-right shrink-0">
                      <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <CalendarDays className="h-3 w-3" />
                        {format(parseISO(item.created_at), "dd MMM", { locale: es })}
                      </p>
                      <p className="text-[10px] text-muted-foreground/60">
                        {formatDistanceToNow(parseISO(item.updated_at), { locale: es, addSuffix: true })}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
