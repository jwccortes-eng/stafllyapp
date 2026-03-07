import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { usePageView } from "@/hooks/useAuditLog";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { format, parse } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { formatDisplayText } from "@/lib/format-helpers";
import AuditPanel from "@/components/audit/AuditPanel";
import {
  ClipboardList, Plus, Loader2, CalendarIcon, Search, Filter,
  MoreHorizontal, Eye, Pencil, CheckCircle2, XCircle, Users as UsersIcon,
  Building2, MapPin, Clock, ArrowRight, FileText, Download,
} from "lucide-react";

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  draft: { label: "Borrador", color: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400" },
  submitted: { label: "Enviada", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  under_review: { label: "En revisión", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  approved: { label: "Aprobada", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  rejected: { label: "Rechazada", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  sourcing: { label: "Buscando personal", color: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400" },
  partially_assigned: { label: "Parcialmente asignada", color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" },
  fully_assigned: { label: "Completamente asignada", color: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400" },
  scheduled: { label: "Programada", color: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400" },
  in_progress: { label: "En progreso", color: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400" },
  completed: { label: "Completada", color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  cancelled: { label: "Cancelada", color: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" },
};

interface StaffingRequest {
  id: string;
  title: string;
  client_id: string | null;
  location_id: string | null;
  category_id: string | null;
  requested_role: string | null;
  workers_needed: number;
  requested_date: string;
  start_time: string;
  end_time: string;
  priority: string;
  status: string;
  notes: string | null;
  internal_notes: string | null;
  estimated_bill_rate: number | null;
  estimated_pay_rate: number | null;
  creation_source: string;
  created_at: string;
}

export default function StaffingRequests() {
  usePageView("Solicitudes de personal");
  const { user, role } = useAuth();
  const { selectedCompanyId } = useCompany();

  const [requests, setRequests] = useState<StaffingRequest[]>([]);
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [detailRequest, setDetailRequest] = useState<StaffingRequest | null>(null);

  // Create form state
  const [form, setForm] = useState({
    title: "", client_id: "", location_id: "", category_id: "",
    requested_role: "", workers_needed: "1", requested_date: "",
    start_time: "08:00", end_time: "17:00", priority: "normal",
    notes: "", internal_notes: "", estimated_bill_rate: "", estimated_pay_rate: "",
  });
  const [saving, setSaving] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  const loadData = async () => {
    if (!selectedCompanyId) return;
    setLoading(true);
    const [reqRes, cliRes, locRes, catRes] = await Promise.all([
      supabase.from("staffing_requests").select("*").eq("company_id", selectedCompanyId).order("created_at", { ascending: false }),
      supabase.from("clients").select("id, name").eq("company_id", selectedCompanyId).is("deleted_at", null),
      supabase.from("locations").select("id, name").eq("company_id", selectedCompanyId).is("deleted_at", null),
      supabase.from("service_categories").select("id, name").eq("company_id", selectedCompanyId).eq("is_active", true),
    ]);
    setRequests((reqRes.data ?? []) as StaffingRequest[]);
    setClients(cliRes.data ?? []);
    setLocations(locRes.data ?? []);
    setCategories(catRes.data ?? []);
    setLoading(false);
  };

  useEffect(() => { loadData(); }, [selectedCompanyId]);

  const filtered = useMemo(() => {
    let r = requests;
    if (search) {
      const q = search.toLowerCase();
      r = r.filter(req => req.title.toLowerCase().includes(q));
    }
    if (statusFilter !== "all") r = r.filter(req => req.status === statusFilter);
    return r;
  }, [requests, search, statusFilter]);

  const handleCreate = async () => {
    if (!form.title.trim() || !form.requested_date || !selectedCompanyId) {
      toast.error("Completa título y fecha"); return;
    }
    setSaving(true);
    const { error } = await supabase.from("staffing_requests").insert({
      company_id: selectedCompanyId,
      title: form.title.trim(),
      client_id: form.client_id || null,
      location_id: form.location_id || null,
      category_id: form.category_id || null,
      requested_role: form.requested_role.trim() || null,
      workers_needed: parseInt(form.workers_needed) || 1,
      requested_date: form.requested_date,
      start_time: form.start_time,
      end_time: form.end_time,
      priority: form.priority,
      notes: form.notes.trim() || null,
      internal_notes: form.internal_notes.trim() || null,
      estimated_bill_rate: form.estimated_bill_rate ? parseFloat(form.estimated_bill_rate) : null,
      estimated_pay_rate: form.estimated_pay_rate ? parseFloat(form.estimated_pay_rate) : null,
      created_by: user?.id,
      status: "draft",
    } as any);
    if (error) { toast.error(error.message); setSaving(false); return; }
    toast.success("Solicitud creada");
    setSaving(false);
    setCreateOpen(false);
    setForm({ title: "", client_id: "", location_id: "", category_id: "", requested_role: "", workers_needed: "1", requested_date: "", start_time: "08:00", end_time: "17:00", priority: "normal", notes: "", internal_notes: "", estimated_bill_rate: "", estimated_pay_rate: "" });
    loadData();
  };

  const handleStatusChange = async (id: string, newStatus: string) => {
    const updates: any = { status: newStatus };
    if (newStatus === "approved") { updates.approved_by = user?.id; updates.approved_at = new Date().toISOString(); }
    if (newStatus === "cancelled") { updates.cancelled_by = user?.id; updates.cancelled_at = new Date().toISOString(); }
    const { error } = await supabase.from("staffing_requests").update(updates).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success(`Estado actualizado a ${STATUS_CONFIG[newStatus]?.label || newStatus}`);
    loadData();
  };

  const getClientName = (id: string | null) => clients.find(c => c.id === id)?.name || "—";
  const getLocationName = (id: string | null) => locations.find(l => l.id === id)?.name || "—";
  const getCategoryName = (id: string | null) => categories.find(c => c.id === id)?.name || "—";

  // Pipeline counts
  const pipeline = useMemo(() => {
    const counts: Record<string, number> = {};
    requests.forEach(r => { counts[r.status] = (counts[r.status] || 0) + 1; });
    return counts;
  }, [requests]);

  return (
    <div className="space-y-5">
      <PageHeader
        variant="1"
        icon={ClipboardList}
        title="Solicitudes de personal"
        subtitle="Gestiona las solicitudes de staffing de tus clientes"
        rightSlot={
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="h-8 text-xs gap-1.5"><Plus className="h-3.5 w-3.5" /> Nueva solicitud</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Nueva solicitud de personal</DialogTitle></DialogHeader>
              <div className="space-y-4 pt-2">
                <div>
                  <Label className="text-xs">Título *</Label>
                  <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Ej: 3 meseros para evento" className="h-9 text-sm mt-1" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Cliente</Label>
                    <Select value={form.client_id || "none"} onValueChange={v => setForm(f => ({ ...f, client_id: v === "none" ? "" : v }))}>
                      <SelectTrigger className="h-9 text-sm mt-1"><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sin asignar</SelectItem>
                        {clients.map(c => <SelectItem key={c.id} value={c.id}>{formatDisplayText(c.name, "name")}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Ubicación</Label>
                    <Select value={form.location_id || "none"} onValueChange={v => setForm(f => ({ ...f, location_id: v === "none" ? "" : v }))}>
                      <SelectTrigger className="h-9 text-sm mt-1"><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sin asignar</SelectItem>
                        {locations.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Categoría de servicio</Label>
                    <Select value={form.category_id || "none"} onValueChange={v => setForm(f => ({ ...f, category_id: v === "none" ? "" : v }))}>
                      <SelectTrigger className="h-9 text-sm mt-1"><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sin asignar</SelectItem>
                        {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Rol solicitado</Label>
                    <Input value={form.requested_role} onChange={e => setForm(f => ({ ...f, requested_role: e.target.value }))} placeholder="Ej: Mesero" className="h-9 text-sm mt-1" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs">Trabajadores</Label>
                    <Input type="number" min="1" value={form.workers_needed} onChange={e => setForm(f => ({ ...f, workers_needed: e.target.value }))} className="h-9 text-sm mt-1" />
                  </div>
                  <div>
                    <Label className="text-xs">Prioridad</Label>
                    <Select value={form.priority} onValueChange={v => setForm(f => ({ ...f, priority: v }))}>
                      <SelectTrigger className="h-9 text-sm mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Baja</SelectItem>
                        <SelectItem value="normal">Normal</SelectItem>
                        <SelectItem value="high">Alta</SelectItem>
                        <SelectItem value="urgent">Urgente</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Fecha *</Label>
                    <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className={cn("w-full h-9 text-sm justify-start font-normal mt-1", !form.requested_date && "text-muted-foreground")}>
                          <CalendarIcon className="h-3.5 w-3.5 mr-1" />
                          {form.requested_date ? format(parse(form.requested_date, "yyyy-MM-dd", new Date()), "dd MMM yy", { locale: es }) : "Fecha"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={form.requested_date ? parse(form.requested_date, "yyyy-MM-dd", new Date()) : undefined} onSelect={d => { if (d) { setForm(f => ({ ...f, requested_date: format(d, "yyyy-MM-dd") })); setDatePickerOpen(false); } }} />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="text-xs">Hora inicio</Label><Input type="time" value={form.start_time} onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))} className="h-9 text-sm mt-1" /></div>
                  <div><Label className="text-xs">Hora fin</Label><Input type="time" value={form.end_time} onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))} className="h-9 text-sm mt-1" /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="text-xs">Bill rate estimado ($)</Label><Input type="number" step="0.01" value={form.estimated_bill_rate} onChange={e => setForm(f => ({ ...f, estimated_bill_rate: e.target.value }))} className="h-9 text-sm mt-1" placeholder="0.00" /></div>
                  <div><Label className="text-xs">Pay rate estimado ($)</Label><Input type="number" step="0.01" value={form.estimated_pay_rate} onChange={e => setForm(f => ({ ...f, estimated_pay_rate: e.target.value }))} className="h-9 text-sm mt-1" placeholder="0.00" /></div>
                </div>
                <div><Label className="text-xs">Notas</Label><Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} className="text-sm mt-1" placeholder="Notas visibles para el cliente..." /></div>
                <div><Label className="text-xs">Notas internas</Label><Textarea value={form.internal_notes} onChange={e => setForm(f => ({ ...f, internal_notes: e.target.value }))} rows={2} className="text-sm mt-1" placeholder="Solo visible para admins..." /></div>
                <Button onClick={handleCreate} disabled={saving} className="w-full h-10 text-sm">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Crear solicitud
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        }
      />

      {/* Pipeline summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
        {(["draft", "submitted", "under_review", "approved", "sourcing", "completed"] as const).map(s => {
          const cfg = STATUS_CONFIG[s];
          return (
            <button key={s} onClick={() => setStatusFilter(statusFilter === s ? "all" : s)}
              className={cn("rounded-xl border border-border/20 p-3 text-left transition-all hover:shadow-sm", statusFilter === s ? "ring-2 ring-primary/30 bg-primary/5" : "bg-card")}>
              <p className="text-[10px] text-muted-foreground font-medium">{cfg.label}</p>
              <p className="text-xl font-bold mt-0.5">{pipeline[s] || 0}</p>
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar solicitudes..." className="pl-9 h-9 text-sm" />
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <ClipboardList className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No hay solicitudes{statusFilter !== "all" ? ` con estado "${STATUS_CONFIG[statusFilter]?.label}"` : ""}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => setCreateOpen(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Crear primera solicitud
          </Button>
        </div>
      ) : (
        <div className="rounded-xl border border-border/20 overflow-hidden bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/15 bg-muted/30">
                  <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-muted-foreground">Solicitud</th>
                  <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-muted-foreground">Cliente</th>
                  <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-muted-foreground">Fecha</th>
                  <th className="text-center px-3 py-2.5 text-[11px] font-semibold text-muted-foreground">Trabajadores</th>
                  <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-muted-foreground">Estado</th>
                  <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-muted-foreground">Prioridad</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(req => {
                  const st = STATUS_CONFIG[req.status] || { label: req.status, color: "bg-muted text-muted-foreground" };
                  return (
                    <tr key={req.id} className="border-b border-border/10 hover:bg-muted/20 transition-colors cursor-pointer" onClick={() => setDetailRequest(req)}>
                      <td className="px-4 py-3">
                        <p className="font-medium text-sm">{req.title}</p>
                        {req.requested_role && <p className="text-[11px] text-muted-foreground">{req.requested_role}</p>}
                      </td>
                      <td className="px-3 py-3 text-xs text-muted-foreground">{getClientName(req.client_id)}</td>
                      <td className="px-3 py-3 text-xs">{format(new Date(req.requested_date + "T12:00:00"), "dd MMM yyyy", { locale: es })}</td>
                      <td className="px-3 py-3 text-center">
                        <span className="inline-flex items-center gap-1 text-xs font-semibold">
                          <UsersIcon className="h-3 w-3" /> {req.workers_needed}
                        </span>
                      </td>
                      <td className="px-3 py-3"><Badge variant="secondary" className={cn("text-[10px] font-semibold", st.color)}>{st.label}</Badge></td>
                      <td className="px-3 py-3">
                        <Badge variant="outline" className={cn("text-[10px]",
                          req.priority === "urgent" ? "border-red-300 text-red-600" :
                          req.priority === "high" ? "border-amber-300 text-amber-600" : "")}>
                          {req.priority === "urgent" ? "Urgente" : req.priority === "high" ? "Alta" : req.priority === "low" ? "Baja" : "Normal"}
                        </Badge>
                      </td>
                      <td className="px-2 py-3">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
                            <Button variant="ghost" size="icon" className="h-7 w-7"><MoreHorizontal className="h-3.5 w-3.5" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" onClick={e => e.stopPropagation()}>
                            {req.status === "draft" && <DropdownMenuItem onClick={() => handleStatusChange(req.id, "submitted")}><ArrowRight className="h-4 w-4 mr-2" /> Enviar</DropdownMenuItem>}
                            {req.status === "submitted" && <DropdownMenuItem onClick={() => handleStatusChange(req.id, "under_review")}><Eye className="h-4 w-4 mr-2" /> Marcar en revisión</DropdownMenuItem>}
                            {req.status === "under_review" && <DropdownMenuItem onClick={() => handleStatusChange(req.id, "approved")}><CheckCircle2 className="h-4 w-4 mr-2" /> Aprobar</DropdownMenuItem>}
                            {req.status === "under_review" && <DropdownMenuItem onClick={() => handleStatusChange(req.id, "rejected")} className="text-destructive"><XCircle className="h-4 w-4 mr-2" /> Rechazar</DropdownMenuItem>}
                            {["approved", "sourcing"].includes(req.status) && <DropdownMenuItem onClick={() => handleStatusChange(req.id, "sourcing")}><UsersIcon className="h-4 w-4 mr-2" /> Buscar personal</DropdownMenuItem>}
                            {!["completed", "cancelled"].includes(req.status) && <DropdownMenuItem onClick={() => handleStatusChange(req.id, "cancelled")} className="text-destructive"><XCircle className="h-4 w-4 mr-2" /> Cancelar</DropdownMenuItem>}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Detail dialog */}
      <Dialog open={!!detailRequest} onOpenChange={o => { if (!o) setDetailRequest(null); }}>
        <DialogContent className="max-w-lg">
          {detailRequest && (
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-bold">{detailRequest.title}</h3>
                <Badge variant="secondary" className={cn("text-[10px] mt-1", STATUS_CONFIG[detailRequest.status]?.color)}>{STATUS_CONFIG[detailRequest.status]?.label}</Badge>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground"><Building2 className="h-3.5 w-3.5" /> {getClientName(detailRequest.client_id)}</div>
                <div className="flex items-center gap-2 text-muted-foreground"><MapPin className="h-3.5 w-3.5" /> {getLocationName(detailRequest.location_id)}</div>
                <div className="flex items-center gap-2 text-muted-foreground"><CalendarIcon className="h-3.5 w-3.5" /> {format(new Date(detailRequest.requested_date + "T12:00:00"), "dd MMM yyyy", { locale: es })}</div>
                <div className="flex items-center gap-2 text-muted-foreground"><Clock className="h-3.5 w-3.5" /> {detailRequest.start_time?.slice(0,5)} – {detailRequest.end_time?.slice(0,5)}</div>
                <div className="flex items-center gap-2 text-muted-foreground"><UsersIcon className="h-3.5 w-3.5" /> {detailRequest.workers_needed} trabajadores</div>
                {detailRequest.requested_role && <div className="flex items-center gap-2 text-muted-foreground"><FileText className="h-3.5 w-3.5" /> {detailRequest.requested_role}</div>}
              </div>
              {detailRequest.estimated_bill_rate && (
                <div className="flex gap-4 text-sm">
                  <span className="text-muted-foreground">Bill rate: <strong>${detailRequest.estimated_bill_rate}</strong>/hr</span>
                  {detailRequest.estimated_pay_rate && <span className="text-muted-foreground">Pay rate: <strong>${detailRequest.estimated_pay_rate}</strong>/hr</span>}
                </div>
              )}
              {detailRequest.notes && <div className="text-sm"><p className="text-[11px] font-medium text-muted-foreground mb-1">Notas</p><p className="text-sm">{detailRequest.notes}</p></div>}
              {detailRequest.internal_notes && <div className="text-sm"><p className="text-[11px] font-medium text-muted-foreground mb-1">Notas internas</p><p className="text-sm text-amber-600 dark:text-amber-400">{detailRequest.internal_notes}</p></div>}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AuditPanel entityType="staffing_request" />
    </div>
  );
}
