import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  CheckCircle2, Circle, Clock, AlertTriangle, Plus, Search,
  ListChecks, ChevronDown, ChevronRight, CalendarDays,
  Pencil, Save, X, Bug, Sparkles, Wrench, Code2,
  Eye, FileCheck, ShieldAlert, LayoutGrid, List,
  Target, Building2, Zap, Hash,
} from "lucide-react";
import { format, formatDistanceToNow, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/ui/page-header";

// ── Types ──────────────────────────────────────────────
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
  module: string;
  item_type: string;
  sprint: string;
  affected_company: string;
  origin: string;
  root_cause: string;
  fix_applied: string;
  validation_required: string;
  evidence: string;
  responsible: string;
  target_date: string | null;
}

// ── Constants ──────────────────────────────────────────
const STATUS_CONFIG: Record<string, { label: string; icon: any; color: string; bg: string; order: number }> = {
  blocked:              { label: "Bloqueado",            icon: ShieldAlert,  color: "text-deduction",        bg: "bg-deduction/10",        order: 0 },
  pending:              { label: "Pendiente",            icon: Circle,       color: "text-muted-foreground", bg: "bg-muted",               order: 1 },
  analysis:             { label: "En análisis",          icon: Eye,          color: "text-primary",          bg: "bg-primary/10",          order: 2 },
  development:          { label: "En desarrollo",        icon: Code2,        color: "text-warning",          bg: "bg-warning/10",          order: 3 },
  ready_for_validation: { label: "Listo para validar",   icon: FileCheck,    color: "text-accent-foreground",bg: "bg-accent/30",           order: 4 },
  validated:            { label: "Validado",             icon: CheckCircle2, color: "text-earning",          bg: "bg-earning/10",          order: 5 },
  closed:               { label: "Cerrado",              icon: CheckCircle2, color: "text-earning",          bg: "bg-earning/15",          order: 6 },
};

const PRIORITY_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  P0: { label: "P0 — Crítica",  color: "bg-deduction/15 text-deduction border-deduction/30", dot: "bg-deduction" },
  P1: { label: "P1 — Alta",     color: "bg-warning/15 text-warning border-warning/30",       dot: "bg-warning" },
  P2: { label: "P2 — Media",    color: "bg-primary/15 text-primary border-primary/30",       dot: "bg-primary" },
  P3: { label: "P3 — Baja",     color: "bg-muted text-muted-foreground border-border",       dot: "bg-muted-foreground" },
};

const TYPE_CONFIG: Record<string, { label: string; icon: any; color: string }> = {
  bug:         { label: "Bug",        icon: Bug,      color: "text-deduction" },
  feature:     { label: "Feature",    icon: Sparkles, color: "text-primary" },
  improvement: { label: "Mejora",     icon: Wrench,   color: "text-warning" },
  tech_debt:   { label: "Tech Debt",  icon: Code2,    color: "text-muted-foreground" },
};

const MODULES = [
  "Tenant Isolation / Multitenant",
  "Users / Access",
  "Employees",
  "Shifts / Scheduling",
  "Attendance / Clock / Timesheets",
  "Notifications / Announcements",
  "Compensation / Payroll Base",
  "Documents",
  "Chat",
  "Tasks",
  "Forms",
  "Automations",
  "Reports / Analytics",
  "UI / UX / Operational Polish",
];

const SPRINTS = [
  "Sprint 1: Tenant Isolation + Access",
  "Sprint 2: Scheduling",
  "Sprint 3: Attendance",
  "Sprint 4: Notifications / Docs / Compensation",
  "Backlog Connecteam Parity",
];

const ORIGINS = ["Connecteam parity", "bug detectado", "mejora interna"];

const COMPANIES = ["JKITCHEN STAFF", "Quality Staff by Keury", "My Staff Solution LLC", "Todas", ""];

// ── Helpers ────────────────────────────────────────────
type GroupKey = "status" | "sprint" | "priority" | "module" | "affected_company" | "item_type";

function groupItems(items: ImplItem[], key: GroupKey): Record<string, ImplItem[]> {
  const groups: Record<string, ImplItem[]> = {};
  for (const item of items) {
    const val = (item[key] as string) || "(sin asignar)";
    if (!groups[val]) groups[val] = [];
    groups[val].push(item);
  }
  return groups;
}

// ── Component ──────────────────────────────────────────
export default function Implementations() {
  const { toast } = useToast();
  const [items, setItems] = useState<ImplItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterModule, setFilterModule] = useState("all");
  const [filterSprint, setFilterSprint] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [groupBy, setGroupBy] = useState<GroupKey>("status");
  const [viewMode, setViewMode] = useState<"board" | "list">("board");
  const [showAdd, setShowAdd] = useState(false);
  const [detailItem, setDetailItem] = useState<ImplItem | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState<Partial<ImplItem>>({});

  const EMPTY_NEW: Partial<ImplItem> = {
    title: "", description: "", status: "pending", priority: "P2",
    module: MODULES[0], item_type: "bug", sprint: SPRINTS[0],
    affected_company: "", origin: ORIGINS[0], root_cause: "", fix_applied: "",
    validation_required: "", evidence: "", responsible: "", notes: "", prompt_ref: "",
  };
  const [newItem, setNewItem] = useState<Partial<ImplItem>>(EMPTY_NEW);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("implementation_log")
      .select("*")
      .order("created_at", { ascending: false });
    setItems((data as ImplItem[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Filtered items
  const filtered = useMemo(() => {
    return items.filter(i => {
      if (filterStatus !== "all" && i.status !== filterStatus) return false;
      if (filterModule !== "all" && i.module !== filterModule) return false;
      if (filterSprint !== "all" && i.sprint !== filterSprint) return false;
      if (filterPriority !== "all" && i.priority !== filterPriority) return false;
      if (filterType !== "all" && i.item_type !== filterType) return false;
      if (search) {
        const q = search.toLowerCase();
        return [i.title, i.description, i.notes, i.root_cause, i.fix_applied, i.module, i.affected_company]
          .some(f => f?.toLowerCase().includes(q));
      }
      return true;
    });
  }, [items, filterStatus, filterModule, filterSprint, filterPriority, filterType, search]);

  // Stats
  const stats = useMemo(() => {
    const s: Record<string, number> = { total: items.length };
    Object.keys(STATUS_CONFIG).forEach(k => { s[k] = items.filter(i => i.status === k).length; });
    s.p0 = items.filter(i => i.priority === "P0").length;
    s.bugs = items.filter(i => i.item_type === "bug" && i.status !== "closed").length;
    return s;
  }, [items]);

  const grouped = useMemo(() => groupItems(filtered, groupBy), [filtered, groupBy]);

  // Sort group keys by status order if grouping by status
  const sortedGroupKeys = useMemo(() => {
    const keys = Object.keys(grouped);
    if (groupBy === "status") {
      return keys.sort((a, b) => (STATUS_CONFIG[a]?.order ?? 99) - (STATUS_CONFIG[b]?.order ?? 99));
    }
    if (groupBy === "priority") {
      const order = ["P0", "P1", "P2", "P3"];
      return keys.sort((a, b) => (order.indexOf(a) === -1 ? 99 : order.indexOf(a)) - (order.indexOf(b) === -1 ? 99 : order.indexOf(b)));
    }
    return keys.sort();
  }, [grouped, groupBy]);

  // CRUD
  const handleAdd = async () => {
    if (!newItem.title?.trim()) return;
    const { error } = await supabase.from("implementation_log").insert(newItem as any);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Tarjeta creada" });
    setNewItem(EMPTY_NEW);
    setShowAdd(false);
    load();
  };

  const handleSave = async () => {
    if (!detailItem) return;
    const update: any = { ...editForm };
    if (update.status === "closed" && !detailItem.completed_at) update.completed_at = new Date().toISOString();
    if (update.status !== "closed") update.completed_at = null;
    const { error } = await supabase.from("implementation_log").update(update).eq("id", detailItem.id);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Guardado" });
    setEditMode(false);
    setDetailItem(null);
    load();
  };

  const handleDelete = async (id: string) => {
    await supabase.from("implementation_log").delete().eq("id", id);
    toast({ title: "Eliminado" });
    setDetailItem(null);
    load();
  };

  const openDetail = (item: ImplItem) => {
    setDetailItem(item);
    setEditForm(item);
    setEditMode(false);
  };

  // Quick status change
  const quickStatus = async (id: string, status: string) => {
    const update: any = { status };
    if (status === "closed") update.completed_at = new Date().toISOString();
    else update.completed_at = null;
    await supabase.from("implementation_log").update(update).eq("id", id);
    load();
  };

  // ── Card Component ───────────────────────────────
  const ItemCard = ({ item }: { item: ImplItem }) => {
    const sc = STATUS_CONFIG[item.status] || STATUS_CONFIG.pending;
    const pc = PRIORITY_CONFIG[item.priority] || PRIORITY_CONFIG.P2;
    const tc = TYPE_CONFIG[item.item_type] || TYPE_CONFIG.feature;
    const TypeIcon = tc.icon;

    const canClose = item.root_cause && item.fix_applied && item.validation_required;

    return (
      <Card
        className={cn(
          "cursor-pointer hover:shadow-md transition-all duration-200 group",
          item.status === "closed" && "opacity-60",
          item.priority === "P0" && item.status !== "closed" && "border-deduction/30",
        )}
        onClick={() => openDetail(item)}
      >
        <CardContent className="p-3.5">
          {/* Priority dot + Type icon + Title */}
          <div className="flex items-start gap-2.5">
            <div className={cn("h-2.5 w-2.5 rounded-full mt-1.5 shrink-0", pc.dot)} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-1">
                <TypeIcon className={cn("h-3.5 w-3.5 shrink-0", tc.color)} />
                <span className="text-sm font-medium leading-tight line-clamp-2">{item.title}</span>
              </div>

              {/* Tags row */}
              <div className="flex flex-wrap gap-1 mt-1.5">
                <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4">{item.module?.split(" / ")[0]}</Badge>
                {item.affected_company && (
                  <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4">
                    <Building2 className="h-2.5 w-2.5 mr-0.5" />{item.affected_company}
                  </Badge>
                )}
                {item.origin === "Connecteam parity" && (
                  <Badge className="text-[9px] px-1.5 py-0 h-4 bg-primary/20 text-primary border-0">CT</Badge>
                )}
              </div>

              {/* Bottom: status + date */}
              <div className="flex items-center justify-between mt-2">
                <span className={cn("text-[10px] font-medium flex items-center gap-1", sc.color)}>
                  <sc.icon className="h-3 w-3" />{sc.label}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {formatDistanceToNow(parseISO(item.updated_at), { locale: es, addSuffix: true })}
                </span>
              </div>

              {/* Closure warning */}
              {item.status === "closed" && !canClose && (
                <div className="mt-1.5 text-[9px] text-deduction flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />Falta causa raíz / fix / validación
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  // ── Form Fields Component ────────────────────────
  const FormFields = ({ form, setForm, isNew = false }: { form: Partial<ImplItem>; setForm: (f: Partial<ImplItem>) => void; isNew?: boolean }) => (
    <div className="space-y-4">
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1 block">Título *</label>
        <Input value={form.title ?? ""} onChange={e => setForm({ ...form, title: e.target.value })} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Módulo</label>
          <Select value={form.module ?? MODULES[0]} onValueChange={v => setForm({ ...form, module: v })}>
            <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>{MODULES.map(m => <SelectItem key={m} value={m} className="text-xs">{m}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Tipo</label>
          <Select value={form.item_type ?? "bug"} onValueChange={v => setForm({ ...form, item_type: v })}>
            <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(TYPE_CONFIG).map(([k, v]) => <SelectItem key={k} value={k} className="text-xs">{v.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Prioridad</label>
          <Select value={form.priority ?? "P2"} onValueChange={v => setForm({ ...form, priority: v })}>
            <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(PRIORITY_CONFIG).map(([k, v]) => <SelectItem key={k} value={k} className="text-xs">{v.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Estado</label>
          <Select value={form.status ?? "pending"} onValueChange={v => setForm({ ...form, status: v })}>
            <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(STATUS_CONFIG).map(([k, v]) => <SelectItem key={k} value={k} className="text-xs">{v.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Sprint / Fase</label>
          <Select value={form.sprint ?? SPRINTS[0]} onValueChange={v => setForm({ ...form, sprint: v })}>
            <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>{SPRINTS.map(s => <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Origen</label>
          <Select value={form.origin ?? ORIGINS[0]} onValueChange={v => setForm({ ...form, origin: v })}>
            <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>{ORIGINS.map(o => <SelectItem key={o} value={o} className="text-xs">{o}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Empresa afectada</label>
          <Select value={form.affected_company || "__none__"} onValueChange={v => setForm({ ...form, affected_company: v === "__none__" ? "" : v })}>
            <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Seleccionar" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__" className="text-xs">— Ninguna —</SelectItem>
              {COMPANIES.filter(Boolean).map(c => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Responsable</label>
          <Input value={form.responsible ?? ""} onChange={e => setForm({ ...form, responsible: e.target.value })} className="h-9 text-xs" placeholder="Nombre o equipo" />
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1 block">Descripción del problema o feature</label>
        <Textarea value={form.description ?? ""} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} className="text-xs" />
      </div>

      <Separator />
      <p className="text-xs font-semibold text-muted-foreground">Trazabilidad</p>

      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1 block">Causa raíz</label>
        <Textarea value={form.root_cause ?? ""} onChange={e => setForm({ ...form, root_cause: e.target.value })} rows={2} className="text-xs" placeholder="¿Qué estaba mal realmente?" />
      </div>
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1 block">Fix aplicado</label>
        <Textarea value={form.fix_applied ?? ""} onChange={e => setForm({ ...form, fix_applied: e.target.value })} rows={2} className="text-xs" placeholder="¿Qué se hizo para resolverlo?" />
      </div>
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1 block">Validación requerida</label>
        <Textarea value={form.validation_required ?? ""} onChange={e => setForm({ ...form, validation_required: e.target.value })} rows={2} className="text-xs" placeholder="¿Qué prueba se necesita para cerrar?" />
      </div>
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1 block">Evidencia</label>
        <Textarea value={form.evidence ?? ""} onChange={e => setForm({ ...form, evidence: e.target.value })} rows={2} className="text-xs" placeholder="Links, capturas, logs..." />
      </div>
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1 block">Notas</label>
        <Textarea value={form.notes ?? ""} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} className="text-xs" />
      </div>
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1 block">Fecha objetivo</label>
        <Input type="date" value={form.target_date ?? ""} onChange={e => setForm({ ...form, target_date: e.target.value || null })} className="h-9 text-xs" />
      </div>
    </div>
  );

  // ── Render ───────────────────────────────────────
  return (
    <div className="space-y-5">
      <PageHeader
        variant="5"
        icon={ListChecks}
        title="Centro de Control"
        subtitle="Tablero maestro de implementaciones, bugs, fixes y reemplazo de Connecteam"
      />

      {/* KPI Bar */}
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-7 gap-2">
        {[
          { label: "Total", value: stats.total, color: "text-foreground", filter: () => { setFilterStatus("all"); setFilterType("all"); setFilterPriority("all"); } },
          { label: "Pendientes", value: stats.pending, color: "text-muted-foreground", filter: () => setFilterStatus("pending") },
          { label: "En desarrollo", value: stats.development, color: "text-warning", filter: () => setFilterStatus("development") },
          { label: "Por validar", value: stats.ready_for_validation, color: "text-accent-foreground", filter: () => setFilterStatus("ready_for_validation") },
          { label: "Cerrados", value: stats.closed, color: "text-earning", filter: () => setFilterStatus("closed") },
          { label: "P0 Críticos", value: stats.p0, color: "text-deduction", filter: () => { setFilterPriority("P0"); setFilterStatus("all"); } },
          { label: "Bugs abiertos", value: stats.bugs, color: "text-deduction", filter: () => { setFilterType("bug"); setFilterStatus("all"); setFilterPriority("all"); } },
        ].map(s => (
          <Card key={s.label} className="cursor-pointer hover:shadow-md transition-shadow" onClick={s.filter}>
            <CardContent className="p-3">
              <p className="text-[10px] text-muted-foreground truncate">{s.label}</p>
              <p className={cn("text-xl font-bold font-heading", s.color)}>{s.value ?? 0}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters Bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9" />
        </div>

        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="h-9 w-[140px] text-xs"><SelectValue placeholder="Estado" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            {Object.entries(STATUS_CONFIG).map(([k, v]) => <SelectItem key={k} value={k} className="text-xs">{v.label}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={filterModule} onValueChange={setFilterModule}>
          <SelectTrigger className="h-9 w-[150px] text-xs"><SelectValue placeholder="Módulo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los módulos</SelectItem>
            {MODULES.map(m => <SelectItem key={m} value={m} className="text-xs">{m}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={filterSprint} onValueChange={setFilterSprint}>
          <SelectTrigger className="h-9 w-[160px] text-xs"><SelectValue placeholder="Sprint" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los sprints</SelectItem>
            {SPRINTS.map(s => <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={filterPriority} onValueChange={setFilterPriority}>
          <SelectTrigger className="h-9 w-[110px] text-xs"><SelectValue placeholder="Prioridad" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            {Object.entries(PRIORITY_CONFIG).map(([k, v]) => <SelectItem key={k} value={k} className="text-xs">{v.label}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="h-9 w-[110px] text-xs"><SelectValue placeholder="Tipo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {Object.entries(TYPE_CONFIG).map(([k, v]) => <SelectItem key={k} value={k} className="text-xs">{v.label}</SelectItem>)}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-1 ml-auto">
          <Select value={groupBy} onValueChange={v => setGroupBy(v as GroupKey)}>
            <SelectTrigger className="h-9 w-[130px] text-xs"><SelectValue placeholder="Agrupar" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="status" className="text-xs">Por estado</SelectItem>
              <SelectItem value="sprint" className="text-xs">Por sprint</SelectItem>
              <SelectItem value="priority" className="text-xs">Por prioridad</SelectItem>
              <SelectItem value="module" className="text-xs">Por módulo</SelectItem>
              <SelectItem value="affected_company" className="text-xs">Por empresa</SelectItem>
              <SelectItem value="item_type" className="text-xs">Por tipo</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex border rounded-lg overflow-hidden">
            <button className={cn("p-1.5", viewMode === "board" && "bg-accent")} onClick={() => setViewMode("board")}><LayoutGrid className="h-4 w-4" /></button>
            <button className={cn("p-1.5", viewMode === "list" && "bg-accent")} onClick={() => setViewMode("list")}><List className="h-4 w-4" /></button>
          </div>

          <Button size="sm" onClick={() => setShowAdd(true)}>
            <Plus className="h-4 w-4 mr-1" /> Nueva tarjeta
          </Button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[1, 2, 3].map(i => <div key={i} className="h-32 rounded-xl bg-muted animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-muted-foreground">No hay tarjetas que coincidan con los filtros</CardContent></Card>
      ) : viewMode === "board" ? (
        /* ── Board View ── */
        <div className="space-y-6">
          {sortedGroupKeys.map(group => {
            const groupItems = grouped[group];
            const sc = STATUS_CONFIG[group];
            const pc = PRIORITY_CONFIG[group];
            return (
              <div key={group}>
                <div className="flex items-center gap-2 mb-3">
                  {sc && <sc.icon className={cn("h-4 w-4", sc.color)} />}
                  {pc && <div className={cn("h-3 w-3 rounded-full", pc.dot)} />}
                  <h3 className="text-sm font-semibold">{sc?.label || pc?.label || group}</h3>
                  <Badge variant="secondary" className="text-[10px] h-5">{groupItems.length}</Badge>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5">
                  {groupItems.map(item => <ItemCard key={item.id} item={item} />)}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* ── List View ── */
        <div className="space-y-5">
          {sortedGroupKeys.map(group => {
            const groupItems = grouped[group];
            const sc = STATUS_CONFIG[group];
            return (
              <div key={group}>
                <div className="flex items-center gap-2 mb-2">
                  {sc && <sc.icon className={cn("h-4 w-4", sc.color)} />}
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{sc?.label || group}</h3>
                  <Badge variant="secondary" className="text-[10px] h-4">{groupItems.length}</Badge>
                </div>
                <div className="space-y-1">
                  {groupItems.map(item => {
                    const pc = PRIORITY_CONFIG[item.priority] || PRIORITY_CONFIG.P2;
                    const tc = TYPE_CONFIG[item.item_type] || TYPE_CONFIG.feature;
                    const TypeIcon = tc.icon;
                    return (
                      <div
                        key={item.id}
                        className="flex items-center gap-3 px-3 py-2 rounded-lg border bg-card hover:bg-accent/30 cursor-pointer transition-colors"
                        onClick={() => openDetail(item)}
                      >
                        <div className={cn("h-2 w-2 rounded-full shrink-0", pc.dot)} />
                        <TypeIcon className={cn("h-3.5 w-3.5 shrink-0", tc.color)} />
                        <span className="text-sm font-medium flex-1 truncate">{item.title}</span>
                        <Badge variant="outline" className="text-[9px] h-4 px-1.5">{item.module?.split(" / ")[0]}</Badge>
                        <Badge variant="outline" className={cn("text-[9px] h-4 px-1.5", pc.color)}>{item.priority}</Badge>
                        {item.affected_company && <span className="text-[10px] text-muted-foreground truncate max-w-[80px]">{item.affected_company}</span>}
                        <span className="text-[10px] text-muted-foreground shrink-0">
                          {format(parseISO(item.updated_at), "dd MMM", { locale: es })}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Add Dialog ── */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Nueva tarjeta</DialogTitle></DialogHeader>
          <FormFields form={newItem} setForm={setNewItem} isNew />
          <Button className="w-full mt-2" onClick={handleAdd}>Crear tarjeta</Button>
        </DialogContent>
      </Dialog>

      {/* ── Detail Sheet ── */}
      <Sheet open={!!detailItem} onOpenChange={open => { if (!open) { setDetailItem(null); setEditMode(false); } }}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          {detailItem && (
            <>
              <SheetHeader className="mb-4">
                <div className="flex items-center gap-2">
                  {(() => { const tc = TYPE_CONFIG[detailItem.item_type] || TYPE_CONFIG.feature; return <tc.icon className={cn("h-5 w-5", tc.color)} />; })()}
                  <SheetTitle className="text-left flex-1">{editMode ? "Editar tarjeta" : detailItem.title}</SheetTitle>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  <Badge className={cn("text-[10px]", PRIORITY_CONFIG[detailItem.priority]?.color)}>{detailItem.priority}</Badge>
                  <Badge variant="outline" className="text-[10px]">{STATUS_CONFIG[detailItem.status]?.label}</Badge>
                  <Badge variant="secondary" className="text-[10px]">{detailItem.module}</Badge>
                  {detailItem.origin === "Connecteam parity" && <Badge className="text-[10px] bg-primary/20 text-primary border-0">Connecteam</Badge>}
                </div>
              </SheetHeader>

              {editMode ? (
                <div className="space-y-4">
                  <FormFields form={editForm} setForm={setEditForm} />
                  <div className="flex gap-2">
                    <Button className="flex-1" onClick={handleSave}><Save className="h-4 w-4 mr-1" />Guardar</Button>
                    <Button variant="outline" onClick={() => setEditMode(false)}><X className="h-4 w-4 mr-1" />Cancelar</Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Meta info */}
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div><span className="text-muted-foreground">Sprint:</span> <span className="font-medium">{detailItem.sprint}</span></div>
                    <div><span className="text-muted-foreground">Empresa:</span> <span className="font-medium">{detailItem.affected_company || "—"}</span></div>
                    <div><span className="text-muted-foreground">Origen:</span> <span className="font-medium">{detailItem.origin}</span></div>
                    <div><span className="text-muted-foreground">Responsable:</span> <span className="font-medium">{detailItem.responsible || "—"}</span></div>
                    <div><span className="text-muted-foreground">Creado:</span> <span className="font-medium">{format(parseISO(detailItem.created_at), "dd MMM yyyy HH:mm", { locale: es })}</span></div>
                    <div><span className="text-muted-foreground">Fecha objetivo:</span> <span className="font-medium">{detailItem.target_date ? format(parseISO(detailItem.target_date), "dd MMM yyyy", { locale: es }) : "—"}</span></div>
                  </div>

                  <Separator />

                  {/* Description */}
                  {detailItem.description && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-1">Descripción</p>
                      <p className="text-sm whitespace-pre-wrap">{detailItem.description}</p>
                    </div>
                  )}

                  {/* Traceability fields */}
                  {[
                    { label: "Causa raíz", value: detailItem.root_cause, icon: Target },
                    { label: "Fix aplicado", value: detailItem.fix_applied, icon: Wrench },
                    { label: "Validación requerida", value: detailItem.validation_required, icon: FileCheck },
                    { label: "Evidencia", value: detailItem.evidence, icon: Eye },
                  ].map(field => (
                    <div key={field.label}>
                      <p className="text-xs font-semibold text-muted-foreground mb-1 flex items-center gap-1">
                        <field.icon className="h-3 w-3" />{field.label}
                      </p>
                      {field.value ? (
                        <p className="text-sm whitespace-pre-wrap bg-muted/30 rounded-lg p-2.5">{field.value}</p>
                      ) : (
                        <p className="text-xs text-muted-foreground/50 italic">Sin documentar</p>
                      )}
                    </div>
                  ))}

                  {detailItem.notes && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-1">Notas</p>
                      <p className="text-sm whitespace-pre-wrap">{detailItem.notes}</p>
                    </div>
                  )}

                  {/* Closure validation */}
                  {detailItem.status !== "closed" && (
                    <div className="rounded-lg border border-dashed p-3 space-y-1.5">
                      <p className="text-xs font-semibold">Checklist de cierre</p>
                      {[
                        { label: "Causa raíz documentada", ok: !!detailItem.root_cause },
                        { label: "Fix aplicado documentado", ok: !!detailItem.fix_applied },
                        { label: "Validación definida", ok: !!detailItem.validation_required },
                        { label: "Evidencia adjunta", ok: !!detailItem.evidence },
                      ].map(c => (
                        <div key={c.label} className="flex items-center gap-2 text-xs">
                          {c.ok ? <CheckCircle2 className="h-3.5 w-3.5 text-earning" /> : <Circle className="h-3.5 w-3.5 text-muted-foreground" />}
                          <span className={c.ok ? "text-foreground" : "text-muted-foreground"}>{c.label}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <Separator />

                  {/* Actions */}
                  <div className="flex flex-wrap gap-2">
                    <Select value={detailItem.status} onValueChange={v => { quickStatus(detailItem.id, v); setDetailItem({ ...detailItem, status: v }); }}>
                      <SelectTrigger className="h-9 w-[160px] text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(STATUS_CONFIG).map(([k, v]) => <SelectItem key={k} value={k} className="text-xs">{v.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Button variant="outline" size="sm" onClick={() => setEditMode(true)}><Pencil className="h-3.5 w-3.5 mr-1" />Editar</Button>
                    <Button variant="ghost" size="sm" className="text-deduction hover:text-deduction ml-auto" onClick={() => handleDelete(detailItem.id)}>Eliminar</Button>
                  </div>
                </div>
              )}
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
