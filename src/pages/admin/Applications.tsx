import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  CheckCircle2, XCircle, Eye, Loader2, Clock, User, Search,
  Phone, Mail, MapPin, Car, Briefcase, FileText, Calendar,
  UtensilsCrossed, SprayCan, ChefHat, Copy, ExternalLink,
  AlertTriangle, MessageSquare, Archive, Link2, MoreVertical,
  UserPlus2, Shield,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { format } from "date-fns";
import { es } from "date-fns/locale";

type AppStatus = "pending" | "under_review" | "needs_info" | "approved" | "rejected" | "duplicate" | "archived";

const STATUS_CONFIG: Record<AppStatus, { label: string; color: string; icon: any }> = {
  pending: { label: "Pendiente", color: "bg-amber-100 text-amber-800 border-amber-200", icon: Clock },
  under_review: { label: "En revisión", color: "bg-blue-100 text-blue-800 border-blue-200", icon: Eye },
  needs_info: { label: "Info requerida", color: "bg-orange-100 text-orange-800 border-orange-200", icon: MessageSquare },
  approved: { label: "Aprobado", color: "bg-emerald-100 text-emerald-800 border-emerald-200", icon: CheckCircle2 },
  rejected: { label: "Rechazado", color: "bg-red-100 text-red-800 border-red-200", icon: XCircle },
  duplicate: { label: "Duplicado", color: "bg-purple-100 text-purple-800 border-purple-200", icon: Copy },
  archived: { label: "Archivado", color: "bg-gray-100 text-gray-700 border-gray-200", icon: Archive },
};

const ALL_STATUSES: AppStatus[] = ["pending", "under_review", "needs_info", "approved", "rejected", "duplicate", "archived"];

const WORKER_TYPE_LABELS: Record<string, { label: string; icon: any }> = {
  waiter: { label: "Mesero", icon: UtensilsCrossed },
  driver: { label: "Driver", icon: Car },
  cleaning: { label: "Limpieza", icon: SprayCan },
  kitchen: { label: "Cocina", icon: ChefHat },
  other: { label: "Otro", icon: Briefcase },
};

interface Application {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  email: string | null;
  worker_type: string;
  city: string | null;
  availability: string;
  can_drive: boolean;
  has_car: boolean;
  can_travel: boolean;
  document_url: string | null;
  status: string;
  reference_code: string;
  notes: string | null;
  admin_notes: string | null;
  rejection_reason: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  source: string | null;
  application_type: string;
  emergency_contact: string | null;
  experience_summary: string | null;
  languages: string[] | null;
  linked_user_id: string | null;
  duplicate_of_application_id: string | null;
}

interface ApplicationEvent {
  id: string;
  event_type: string;
  event_data: any;
  created_by: string | null;
  created_at: string;
}

export default function Applications() {
  const { selectedCompanyId, selectedCompany } = useCompany();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<string>("pending");
  const [selected, setSelected] = useState<Application | null>(null);
  const [adminNotes, setAdminNotes] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [approvalConfig, setApprovalConfig] = useState({ role: "employee", portalEnabled: true, pinEnabled: true, sendInvite: false, inviteChannel: "whatsapp", initialStatus: "active" });
  const [detailTab, setDetailTab] = useState("summary");
  const [approving, setApproving] = useState(false);

  const { data: applications = [], isLoading } = useQuery({
    queryKey: ["job-applications", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("job_applications")
        .select("*")
        .eq("company_id", selectedCompanyId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Application[];
    },
  });

  const { data: events = [] } = useQuery({
    queryKey: ["application-events", selected?.id],
    enabled: !!selected,
    queryFn: async () => {
      const { data } = await supabase
        .from("application_events")
        .select("*")
        .eq("application_id", selected!.id)
        .order("created_at", { ascending: false });
      return (data ?? []) as ApplicationEvent[];
    },
  });

  // Duplicate candidates
  const { data: duplicates = [] } = useQuery({
    queryKey: ["duplicate-candidates", selected?.id, selected?.phone],
    enabled: !!selected,
    queryFn: async () => {
      if (!selected) return [];
      const { data } = await supabase
        .from("job_applications")
        .select("id, first_name, last_name, phone, email, status, reference_code, created_at")
        .eq("company_id", selectedCompanyId!)
        .eq("phone", selected.phone)
        .neq("id", selected.id)
        .limit(5);
      return data ?? [];
    },
  });

  // Existing employee matches for identity resolution
  const { data: existingMatches = [] } = useQuery({
    queryKey: ["employee-matches", selected?.phone, selected?.email, selectedCompanyId],
    enabled: !!selected && !!selectedCompanyId,
    queryFn: async () => {
      if (!selected || !selectedCompanyId) return [];
      const phone = selected.phone?.replace(/\D/g, "") || "";
      const conditions: any[] = [];
      if (phone) {
        const { data: byPhone } = await supabase
          .from("employees")
          .select("id, first_name, last_name, phone_number, email, is_active, user_id, access_pin, portal_access_enabled")
          .eq("company_id", selectedCompanyId)
          .eq("phone_number", phone);
        if (byPhone?.length) conditions.push(...byPhone);
      }
      if (selected.email) {
        const { data: byEmail } = await supabase
          .from("employees")
          .select("id, first_name, last_name, phone_number, email, is_active, user_id, access_pin, portal_access_enabled")
          .eq("company_id", selectedCompanyId)
          .eq("email", selected.email.toLowerCase().trim());
        if (byEmail?.length) conditions.push(...byEmail);
      }
      // Deduplicate
      const unique = new Map<string, any>();
      conditions.forEach((e) => unique.set(e.id, e));
      return Array.from(unique.values());
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status, extraFields }: { id: string; status: AppStatus; extraFields?: Record<string, any> }) => {
      const { error } = await supabase
        .from("job_applications")
        .update({
          status,
          reviewed_by: user?.id ?? null,
          reviewed_at: new Date().toISOString(),
          admin_notes: adminNotes || null,
          ...extraFields,
        })
        .eq("id", id);
      if (error) throw error;

      await supabase.from("application_events").insert({
        application_id: id,
        event_type: `status_${status}`,
        event_data: { notes: adminNotes, ...(extraFields ?? {}) },
        created_by: user?.id,
      });
    },
    onSuccess: (_, { status }) => {
      queryClient.invalidateQueries({ queryKey: ["job-applications"] });
      queryClient.invalidateQueries({ queryKey: ["application-events"] });
      const labels: Record<string, string> = { approved: "Solicitud aprobada", rejected: "Solicitud rechazada", needs_info: "Info solicitada", duplicate: "Marcado como duplicado", archived: "Archivado" };
      toast.success(labels[status] ?? "Estado actualizado");
      if (status !== "under_review") setSelected(null);
      setAdminNotes("");
      setRejectionReason("");
    },
  });

  const handleApprove = async () => {
    if (!selected) return;
    setApproving(true);
    try {
      const { data, error } = await supabase.functions.invoke("approve-application", {
        body: {
          application_id: selected.id,
          role: approvalConfig.role,
          portal_enabled: approvalConfig.portalEnabled,
          pin_enabled: approvalConfig.pinEnabled,
          send_invite: approvalConfig.sendInvite,
          invite_channel: approvalConfig.inviteChannel,
          initial_status: approvalConfig.initialStatus,
          admin_notes: adminNotes || null,
          link_existing_employee_id: existingMatches.length === 1 ? existingMatches[0].id : null,
        },
      });

      if (error) throw new Error(error.message || "Approval failed");
      if (data?.error) throw new Error(data.error);

      const msgs: string[] = ["✅ Solicitud aprobada"];
      if (data.created_new) msgs.push("Nuevo empleado creado");
      if (data.linked_existing) msgs.push("Vinculado a empleado existente");
      if (data.invite_sent) msgs.push("Invitación enviada");
      toast.success(msgs.join(" · "));

      queryClient.invalidateQueries({ queryKey: ["job-applications"] });
      queryClient.invalidateQueries({ queryKey: ["application-events"] });
      setShowApprovalModal(false);
      setSelected(null);
    } catch (err: any) {
      toast.error(err.message || "Error al aprobar solicitud");
    } finally {
      setApproving(false);
    }
  };

  const handleReject = () => {
    if (!selected) return;
    updateStatusMutation.mutate({ id: selected.id, status: "rejected", extraFields: { rejection_reason: rejectionReason } });
  };

  /* ─── Filters ─── */
  const filtered = useMemo(() => {
    let list = tab === "all" ? applications : applications.filter((a) => a.status === tab);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((a) =>
        `${a.first_name} ${a.last_name}`.toLowerCase().includes(q) ||
        a.phone.includes(q) ||
        a.email?.toLowerCase().includes(q) ||
        a.reference_code.toLowerCase().includes(q)
      );
    }
    if (typeFilter !== "all") list = list.filter((a) => a.worker_type === typeFilter);
    return list;
  }, [applications, tab, searchQuery, typeFilter]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: applications.length };
    ALL_STATUSES.forEach((s) => { c[s] = applications.filter((a) => a.status === s).length; });
    return c;
  }, [applications]);

  const openDetail = (app: Application) => {
    setSelected(app);
    setAdminNotes(app.admin_notes ?? "");
    setRejectionReason(app.rejection_reason ?? "");
    setDetailTab("summary");
    if (app.status === "pending") {
      supabase.from("job_applications").update({ status: "under_review" }).eq("id", app.id)
        .then(() => queryClient.invalidateQueries({ queryKey: ["job-applications"] }));
      supabase.from("application_events").insert({ application_id: app.id, event_type: "status_under_review", created_by: user?.id });
    }
  };

  const applicationLink = selectedCompany?.slug ? `${window.location.origin}/apply/${selectedCompany.slug}` : "";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Aplicaciones"
        subtitle="Gestiona las solicitudes de nuevos trabajadores"
        icon={UserPlus2}
        rightSlot={
          applicationLink ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => { navigator.clipboard.writeText(applicationLink); toast.success("Link copiado"); }}
              className="gap-2"
            >
              <Link2 className="h-3.5 w-3.5" /> Copiar link
            </Button>
          ) : null
        }
      />

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Buscar por nombre, teléfono, email..." className="pl-10 h-10 rounded-xl" />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-40 h-10 rounded-xl">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los tipos</SelectItem>
            {Object.entries(WORKER_TYPE_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-muted/50 h-10 flex-wrap">
          {[{ key: "pending", label: "Pendientes" }, { key: "under_review", label: "En revisión" }, { key: "needs_info", label: "Info" }, { key: "approved", label: "Aprobadas" }, { key: "rejected", label: "Rechazadas" }, { key: "duplicate", label: "Duplicadas" }, { key: "all", label: "Todas" }].map((t) => (
            <TabsTrigger key={t.key} value={t.key} className="gap-1 text-[11px] data-[state=active]:shadow-sm">
              {t.label}
              {(counts[t.key] ?? 0) > 0 && (
                <Badge variant="secondary" className="h-4 min-w-4 text-[9px] px-1">{counts[t.key]}</Badge>
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="mt-4">
          {isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <EmptyState tab={tab} applicationLink={applicationLink} />
          ) : (
            <div className="bg-card rounded-xl border divide-y">
              {filtered.map((app) => (
                <ApplicationRow key={app.id} app={app} onClick={() => openDetail(app)} />
              ))}
            </div>
          )}
        </div>
      </Tabs>

      {/* Detail Sheet */}
      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto p-0">
          {selected && (
            <div className="flex flex-col h-full">
              {/* Header */}
              <div className="p-5 border-b bg-muted/20">
                <SheetHeader className="space-y-0">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-14 w-14">
                      <AvatarFallback className="bg-primary/10 text-primary text-lg font-bold">
                        {selected.first_name[0]}{selected.last_name[0]}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <SheetTitle className="text-lg">{selected.first_name} {selected.last_name}</SheetTitle>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <StatusBadge status={selected.status as AppStatus} />
                        <WorkerTypeBadge type={selected.worker_type} />
                        <span className="text-[10px] text-muted-foreground font-mono">{selected.reference_code}</span>
                      </div>
                    </div>
                  </div>
                </SheetHeader>
              </div>

              {/* Duplicate warning */}
              {duplicates.length > 0 && (
                <div className="mx-5 mt-4 flex items-start gap-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                  <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-amber-800 dark:text-amber-200">
                      {duplicates.length} solicitud(es) con el mismo teléfono
                    </p>
                    {duplicates.map((d: any) => (
                      <p key={d.id} className="text-[10px] text-amber-700 dark:text-amber-300 mt-0.5">
                        {d.first_name} {d.last_name} — {d.reference_code} ({STATUS_CONFIG[d.status as AppStatus]?.label ?? d.status})
                      </p>
                    ))}
                  </div>
                </div>
              )}

              {/* Tabs */}
              <Tabs value={detailTab} onValueChange={setDetailTab} className="flex-1 flex flex-col">
                <TabsList className="mx-5 mt-4 bg-muted/50 h-9">
                  <TabsTrigger value="summary" className="text-[11px]">Resumen</TabsTrigger>
                  <TabsTrigger value="info" className="text-[11px]">Información</TabsTrigger>
                  <TabsTrigger value="docs" className="text-[11px]">Documentos</TabsTrigger>
                  <TabsTrigger value="history" className="text-[11px]">Historial</TabsTrigger>
                </TabsList>

                <div className="flex-1 overflow-y-auto px-5 py-4">
                  <TabsContent value="summary" className="mt-0 space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <InfoItem icon={Phone} label="Teléfono" value={selected.phone} />
                      <InfoItem icon={Mail} label="Email" value={selected.email ?? "—"} />
                      <InfoItem icon={Briefcase} label="Tipo" value={WORKER_TYPE_LABELS[selected.worker_type]?.label ?? selected.worker_type} />
                      <InfoItem icon={MapPin} label="Ciudad" value={selected.city ?? "—"} />
                      <InfoItem icon={Clock} label="Disponibilidad" value={formatAvailability(selected.availability)} />
                      <InfoItem icon={Car} label="Vehículo" value={selected.has_car ? "Sí" : "No"} />
                      <InfoItem icon={Calendar} label="Aplicó" value={format(new Date(selected.created_at), "dd MMM yyyy HH:mm", { locale: es })} />
                      {selected.source && <InfoItem icon={ExternalLink} label="Fuente" value={selected.source} />}
                    </div>
                    {selected.experience_summary && (
                      <div className="p-3 rounded-xl bg-muted/30">
                        <p className="text-[10px] text-muted-foreground mb-1">Experiencia</p>
                        <p className="text-xs text-foreground">{selected.experience_summary}</p>
                      </div>
                    )}
                    {selected.languages && selected.languages.length > 0 && (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] text-muted-foreground">Idiomas:</span>
                        {selected.languages.map((l) => (
                          <Badge key={l} variant="secondary" className="text-[10px] h-5">{l}</Badge>
                        ))}
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="info" className="mt-0 space-y-4">
                    <div className="space-y-3">
                      <InfoBlock label="Nombre completo" value={`${selected.first_name} ${selected.last_name}`} />
                      <InfoBlock label="Teléfono" value={selected.phone} />
                      <InfoBlock label="Email" value={selected.email ?? "No proporcionado"} />
                      <InfoBlock label="Tipo de trabajador" value={WORKER_TYPE_LABELS[selected.worker_type]?.label ?? selected.worker_type} />
                      <InfoBlock label="Ciudad" value={selected.city ?? "No proporcionada"} />
                      <InfoBlock label="Disponibilidad" value={formatAvailability(selected.availability)} />
                      <InfoBlock label="Tiene vehículo" value={selected.has_car ? "Sí" : "No"} />
                      <InfoBlock label="Puede desplazarse" value={selected.can_travel ? "Sí" : "No"} />
                      {selected.emergency_contact && <InfoBlock label="Contacto emergencia" value={selected.emergency_contact} />}
                      <InfoBlock label="Fuente" value={selected.source ?? "Link directo"} />
                      <InfoBlock label="Referencia" value={selected.reference_code} />
                    </div>
                  </TabsContent>

                  <TabsContent value="docs" className="mt-0">
                    {selected.document_url ? (
                      <div className="flex items-center gap-3 p-4 rounded-xl bg-card border">
                        <FileText className="h-8 w-8 text-primary" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground">Documento adjunto</p>
                          <p className="text-xs text-muted-foreground truncate">{selected.document_url}</p>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        <FileText className="h-8 w-8 mx-auto mb-2 opacity-40" />
                        <p className="text-sm">No hay documentos adjuntos</p>
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="history" className="mt-0">
                    {events.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-8">Sin eventos registrados</p>
                    ) : (
                      <div className="space-y-3">
                        {events.map((ev) => (
                          <div key={ev.id} className="flex items-start gap-3 p-3 rounded-xl bg-muted/30">
                            <div className="h-2 w-2 rounded-full bg-primary mt-1.5 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-foreground">{formatEventType(ev.event_type)}</p>
                              <p className="text-[10px] text-muted-foreground">{format(new Date(ev.created_at), "dd MMM yyyy HH:mm", { locale: es })}</p>
                              {ev.event_data?.notes && <p className="text-[10px] text-muted-foreground mt-1 italic">"{ev.event_data.notes}"</p>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </TabsContent>
                </div>
              </Tabs>

              {/* Admin notes + Actions */}
              <div className="border-t p-5 space-y-4 bg-card">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">Notas internas</label>
                  <Textarea value={adminNotes} onChange={(e) => setAdminNotes(e.target.value)} placeholder="Agrega notas..." className="min-h-[60px] rounded-xl text-xs" />
                </div>

                {(selected.status === "pending" || selected.status === "under_review" || selected.status === "needs_info") && (
                  <div className="flex gap-2">
                    <Button onClick={() => setShowApprovalModal(true)} className="flex-1 h-10 rounded-xl text-primary-foreground text-xs">
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" /> Aprobar
                    </Button>
                    <Button variant="outline" onClick={handleReject} disabled={updateStatusMutation.isPending} className="flex-1 h-10 rounded-xl text-destructive border-destructive/30 hover:bg-destructive/5 text-xs">
                      <XCircle className="h-3.5 w-3.5 mr-1.5" /> Rechazar
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="icon" className="h-10 w-10 rounded-xl shrink-0">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => updateStatusMutation.mutate({ id: selected.id, status: "needs_info" })}>
                          <MessageSquare className="h-3.5 w-3.5 mr-2" /> Solicitar info
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => updateStatusMutation.mutate({ id: selected.id, status: "duplicate" })}>
                          <Copy className="h-3.5 w-3.5 mr-2" /> Marcar duplicado
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => updateStatusMutation.mutate({ id: selected.id, status: "archived" })}>
                          <Archive className="h-3.5 w-3.5 mr-2" /> Archivar
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                )}

                {selected.status === "rejected" && selected.rejection_reason && (
                  <div className="p-3 rounded-xl bg-destructive/5 border border-destructive/10">
                    <p className="text-[10px] text-muted-foreground">Razón de rechazo</p>
                    <p className="text-xs text-destructive font-medium">{selected.rejection_reason}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Approval Modal */}
      <Dialog open={showApprovalModal} onOpenChange={setShowApprovalModal}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              Aprobar solicitud
            </DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4 py-2">
              {/* Applicant summary */}
              <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/30">
                <Avatar className="h-10 w-10">
                  <AvatarFallback className="bg-primary/10 text-primary text-sm font-bold">
                    {selected.first_name[0]}{selected.last_name[0]}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">{selected.first_name} {selected.last_name}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Phone className="h-3 w-3" />{selected.phone}
                    {selected.email && <><Mail className="h-3 w-3 ml-1" />{selected.email}</>}
                  </div>
                </div>
                <WorkerTypeBadge type={selected.worker_type} />
              </div>

              {/* Identity resolution warning */}
              {existingMatches.length > 0 && (
                <div className="p-3 rounded-xl border-2 border-primary/30 bg-primary/5">
                  <div className="flex items-center gap-2 mb-2">
                    <Link2 className="h-4 w-4 text-primary" />
                    <p className="text-xs font-semibold text-primary">Empleado existente detectado</p>
                  </div>
                  {existingMatches.map((emp: any) => (
                    <div key={emp.id} className="flex items-center gap-2 p-2 rounded-lg bg-card border text-xs">
                      <Avatar className="h-7 w-7">
                        <AvatarFallback className="text-[10px] bg-primary/10 text-primary">{emp.first_name?.[0]}{emp.last_name?.[0]}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-foreground">{emp.first_name} {emp.last_name}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {emp.is_active ? "Activo" : "Inactivo"} · {emp.user_id ? "Con portal" : "Sin portal"} · {emp.access_pin ? "Con PIN" : "Sin PIN"}
                        </p>
                      </div>
                      <Badge variant="outline" className="text-[9px] shrink-0">Se vinculará</Badge>
                    </div>
                  ))}
                  <p className="text-[10px] text-muted-foreground mt-2">
                    Se vinculará al registro existente en lugar de crear uno nuevo.
                  </p>
                </div>
              )}

              {existingMatches.length === 0 && (
                <div className="p-3 rounded-xl border border-border/60 bg-muted/20">
                  <div className="flex items-center gap-2">
                    <UserPlus2 className="h-4 w-4 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">Se creará un <strong className="text-foreground">nuevo empleado</strong> en la empresa.</p>
                  </div>
                </div>
              )}

              {/* Configuration */}
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground">Rol a asignar</label>
                  <Select value={approvalConfig.role} onValueChange={(v) => setApprovalConfig((c) => ({ ...c, role: v }))}>
                    <SelectTrigger className="rounded-xl h-10"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="employee">Empleado</SelectItem>
                      <SelectItem value="supervisor">Supervisor</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground">Estado inicial</label>
                  <Select value={approvalConfig.initialStatus} onValueChange={(v) => setApprovalConfig((c) => ({ ...c, initialStatus: v }))}>
                    <SelectTrigger className="rounded-xl h-10"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Activo</SelectItem>
                      <SelectItem value="inactive">Inactivo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <ToggleOption label="Portal habilitado" value={approvalConfig.portalEnabled} onChange={(v) => setApprovalConfig((c) => ({ ...c, portalEnabled: v }))} />
                  <ToggleOption label="PIN requerido" value={approvalConfig.pinEnabled} onChange={(v) => setApprovalConfig((c) => ({ ...c, pinEnabled: v }))} />
                </div>

                <ToggleOption label="Enviar invitación automática" value={approvalConfig.sendInvite} onChange={(v) => setApprovalConfig((c) => ({ ...c, sendInvite: v }))} />

                {approvalConfig.sendInvite && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-foreground">Canal de invitación</label>
                    <Select value={approvalConfig.inviteChannel} onValueChange={(v) => setApprovalConfig((c) => ({ ...c, inviteChannel: v }))}>
                      <SelectTrigger className="rounded-xl h-10"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="whatsapp">WhatsApp</SelectItem>
                        <SelectItem value="sms">SMS</SelectItem>
                        <SelectItem value="email">Email</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              {/* Action summary */}
              <div className="p-3 rounded-xl bg-muted/30 space-y-1">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Resumen de acciones</p>
                <div className="text-xs text-foreground space-y-0.5">
                  <p>• {existingMatches.length > 0 ? "Vincular a empleado existente" : "Crear nuevo empleado"}</p>
                  <p>• Rol: <strong>{approvalConfig.role === "supervisor" ? "Supervisor" : "Empleado"}</strong></p>
                  <p>• Portal: <strong>{approvalConfig.portalEnabled ? "Habilitado" : "Deshabilitado"}</strong></p>
                  <p>• PIN: <strong>{approvalConfig.pinEnabled ? "Habilitado (últimos 4 dígitos del tel.)" : "Deshabilitado"}</strong></p>
                  {approvalConfig.sendInvite && <p>• Invitación: <strong>Se enviará por {approvalConfig.inviteChannel}</strong></p>}
                  <p>• Estado: <strong>{approvalConfig.initialStatus === "active" ? "Activo" : "Inactivo"}</strong></p>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowApprovalModal(false)}>Cancelar</Button>
            <Button onClick={handleApprove} disabled={approving} className="text-primary-foreground">
              {approving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <CheckCircle2 className="h-4 w-4 mr-1.5" />}
              Confirmar aprobación
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════ */
/*  SUB-COMPONENTS                                           */
/* ═══════════════════════════════════════════════════════════ */

function ApplicationRow({ app, onClick }: { app: Application; onClick: () => void }) {
  const wt = WORKER_TYPE_LABELS[app.worker_type] ?? { label: app.worker_type, icon: Briefcase };
  const WtIcon = wt.icon;
  return (
    <button onClick={onClick} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors group">
      <Avatar className="h-10 w-10 shrink-0">
        <AvatarFallback className="bg-primary/10 text-primary text-sm font-bold">
          {app.first_name[0]}{app.last_name[0]}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground truncate">{app.first_name} {app.last_name}</p>
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <WtIcon className="h-3 w-3 shrink-0" />
          <span>{wt.label}</span>
          <span className="text-muted-foreground/30">·</span>
          <span>{format(new Date(app.created_at), "dd MMM", { locale: es })}</span>
          {app.source && app.source !== "direct_link" && (
            <>
              <span className="text-muted-foreground/30">·</span>
              <span className="truncate max-w-20">{app.source}</span>
            </>
          )}
        </div>
      </div>
      <StatusBadge status={app.status as AppStatus} />
      <Eye className="h-4 w-4 text-muted-foreground/30 group-hover:text-primary transition-colors shrink-0" />
    </button>
  );
}

function EmptyState({ tab, applicationLink }: { tab: string; applicationLink: string }) {
  return (
    <div className="text-center py-16">
      <UserPlus2 className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
      <p className="text-sm font-medium text-foreground mb-1">
        {tab === "pending" ? "No hay solicitudes pendientes" : "No hay solicitudes en esta categoría"}
      </p>
      <p className="text-xs text-muted-foreground mb-4">Comparte el link de aplicación para recibir solicitudes</p>
      {applicationLink && (
        <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(applicationLink); toast.success("Link copiado"); }} className="gap-2">
          <Link2 className="h-3.5 w-3.5" /> Copiar link de aplicación
        </Button>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: AppStatus }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
  const Icon = cfg.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border shrink-0", cfg.color)}>
      <Icon className="h-3 w-3" />{cfg.label}
    </span>
  );
}

function WorkerTypeBadge({ type }: { type: string }) {
  const wt = WORKER_TYPE_LABELS[type];
  if (!wt) return null;
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-muted text-muted-foreground border border-border/60">
      {wt.label}
    </span>
  );
}

function InfoItem({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2 p-2.5 rounded-lg bg-muted/30">
      <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-[10px] text-muted-foreground">{label}</p>
        <p className="text-xs font-medium text-foreground truncate">{value}</p>
      </div>
    </div>
  );
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center py-2 border-b border-border/40 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs font-medium text-foreground text-right max-w-[60%]">{value}</span>
    </div>
  );
}

function ToggleOption({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!value)} className={cn(
      "flex items-center justify-between p-3 rounded-xl border-2 transition-all text-left",
      value ? "border-primary bg-primary/5" : "border-border/60 bg-card"
    )}>
      <span className="text-xs font-medium text-foreground">{label}</span>
      <div className={cn("h-5 w-9 rounded-full transition-colors relative", value ? "bg-primary" : "bg-muted")}>
        <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform", value ? "translate-x-4" : "translate-x-0.5")} />
      </div>
    </button>
  );
}

function formatAvailability(a: string): string {
  const map: Record<string, string> = { full_time: "Tiempo completo", part_time: "Medio tiempo", weekends: "Fines de semana", flexible: "Flexible" };
  return map[a] ?? a;
}

function formatEventType(t: string): string {
  const map: Record<string, string> = {
    submitted: "Solicitud enviada",
    status_under_review: "Marcada como en revisión",
    status_approved: "Aprobada",
    status_rejected: "Rechazada",
    status_needs_info: "Info solicitada",
    status_duplicate: "Marcada como duplicado",
    status_archived: "Archivada",
  };
  return map[t] ?? t;
}
