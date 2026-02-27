import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { toast } from "sonner";
import { Loader2, CheckCircle2, XCircle, Clock, MapPin, Users, CalendarDays, HandMetal, MessageSquare } from "lucide-react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";

interface ShiftRequest {
  id: string;
  shift_id: string;
  employee_id: string;
  status: string;
  message: string | null;
  rejection_reason: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  employee: { first_name: string; last_name: string; email: string | null };
  shift: {
    title: string; date: string; start_time: string; end_time: string;
    slots: number | null; status: string;
    location_name: string | null; client_name: string | null;
  };
}

export default function ShiftRequests() {
  const { user } = useAuth();
  const { selectedCompanyId } = useCompany();
  const [requests, setRequests] = useState<ShiftRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("pending");
  const [processing, setProcessing] = useState<string | null>(null);

  // Reject dialog
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const loadRequests = useCallback(async () => {
    if (!selectedCompanyId) return;
    setLoading(true);

    const { data, error } = await supabase
      .from("shift_requests")
      .select(`
        id, shift_id, employee_id, status, message, rejection_reason,
        reviewed_by, reviewed_at, created_at,
        employees!inner(first_name, last_name, email),
        scheduled_shifts!inner(title, date, start_time, end_time, slots, status,
          locations(name), clients(name)
        )
      `)
      .eq("company_id", selectedCompanyId)
      .order("created_at", { ascending: false });

    if (error) { console.error(error); setLoading(false); return; }

    const mapped: ShiftRequest[] = (data ?? []).map((r: any) => ({
      id: r.id,
      shift_id: r.shift_id,
      employee_id: r.employee_id,
      status: r.status,
      message: r.message,
      rejection_reason: r.rejection_reason,
      reviewed_by: r.reviewed_by,
      reviewed_at: r.reviewed_at,
      created_at: r.created_at,
      employee: {
        first_name: r.employees.first_name,
        last_name: r.employees.last_name,
        email: r.employees.email,
      },
      shift: {
        title: r.scheduled_shifts.title,
        date: r.scheduled_shifts.date,
        start_time: r.scheduled_shifts.start_time,
        end_time: r.scheduled_shifts.end_time,
        slots: r.scheduled_shifts.slots,
        status: r.scheduled_shifts.status,
        location_name: r.scheduled_shifts.locations?.name ?? null,
        client_name: r.scheduled_shifts.clients?.name ?? null,
      },
    }));

    setRequests(mapped);
    setLoading(false);
  }, [selectedCompanyId]);

  useEffect(() => { loadRequests(); }, [loadRequests]);

  const handleApprove = async (req: ShiftRequest) => {
    setProcessing(req.id);

    // Check slot availability
    const { count } = await supabase
      .from("shift_assignments")
      .select("id", { count: "exact", head: true })
      .eq("shift_id", req.shift_id);

    const currentCount = count ?? 0;
    const maxSlots = req.shift.slots ?? 1;

    if (currentCount >= maxSlots) {
      toast.error("No hay plazas disponibles en este turno");
      setProcessing(null);
      return;
    }

    // Create assignment
    const { error: assignError } = await supabase.from("shift_assignments").insert({
      company_id: selectedCompanyId!,
      shift_id: req.shift_id,
      employee_id: req.employee_id,
      status: "confirmed",
    } as any);

    if (assignError) { toast.error(assignError.message); setProcessing(null); return; }

    // Update request
    await supabase.from("shift_requests")
      .update({ status: "approved", reviewed_by: user?.id, reviewed_at: new Date().toISOString() } as any)
      .eq("id", req.id);

    // Notify employee
    await supabase.from("notifications").insert({
      company_id: selectedCompanyId!,
      recipient_id: req.employee_id,
      recipient_type: "employee",
      type: "shift_request_approved",
      title: "✅ Solicitud aprobada",
      body: `Tu solicitud para el turno "${req.shift.title}" del ${format(parseISO(req.shift.date), "d MMM", { locale: es })} ha sido aprobada. ¡Estás asignado!`,
      metadata: { shift_id: req.shift_id },
      created_by: user?.id,
    } as any);

    // Log audit
    await supabase.rpc("log_activity_detailed", {
      _action: "aprobar_solicitud_turno",
      _entity_type: "shift_request",
      _entity_id: req.id,
      _company_id: selectedCompanyId,
      _details: { employee_id: req.employee_id, shift_id: req.shift_id },
      _old_data: { status: "pending" },
      _new_data: { status: "approved" },
    });

    toast.success(`Solicitud aprobada — ${req.employee.first_name} asignado al turno`);
    setProcessing(null);
    loadRequests();
  };

  const handleReject = async () => {
    if (!rejectId) return;
    const req = requests.find(r => r.id === rejectId);
    if (!req) return;

    setProcessing(rejectId);

    await supabase.from("shift_requests")
      .update({
        status: "rejected",
        rejection_reason: rejectReason.trim() || null,
        reviewed_by: user?.id,
        reviewed_at: new Date().toISOString(),
      } as any)
      .eq("id", rejectId);

    // Notify employee
    await supabase.from("notifications").insert({
      company_id: selectedCompanyId!,
      recipient_id: req.employee_id,
      recipient_type: "employee",
      type: "shift_request_rejected",
      title: "❌ Solicitud rechazada",
      body: `Tu solicitud para el turno "${req.shift.title}" del ${format(parseISO(req.shift.date), "d MMM", { locale: es })} fue rechazada.${rejectReason.trim() ? ` Motivo: ${rejectReason.trim()}` : ""}`,
      metadata: { shift_id: req.shift_id, rejection_reason: rejectReason.trim() || null },
      created_by: user?.id,
    } as any);

    await supabase.rpc("log_activity_detailed", {
      _action: "rechazar_solicitud_turno",
      _entity_type: "shift_request",
      _entity_id: rejectId,
      _company_id: selectedCompanyId,
      _details: { employee_id: req.employee_id, shift_id: req.shift_id, reason: rejectReason.trim() },
      _old_data: { status: "pending" },
      _new_data: { status: "rejected" },
    });

    toast.success("Solicitud rechazada");
    setProcessing(null);
    setRejectId(null);
    setRejectReason("");
    loadRequests();
  };

  const filtered = requests.filter(r => r.status === tab);
  const pendingCount = requests.filter(r => r.status === "pending").length;

  const statusBadge = (status: string) => {
    if (status === "pending") return <Badge variant="outline" className="bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30 text-[10px]">Pendiente</Badge>;
    if (status === "approved") return <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 text-[10px]">Aprobada</Badge>;
    return <Badge variant="outline" className="bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/30 text-[10px]">Rechazada</Badge>;
  };

  return (
    <div className="space-y-5">
      <PageHeader
        variant="1"
        icon={HandMetal}
        title="Solicitudes de turnos"
        subtitle="Aprueba o rechaza solicitudes de empleados para turnos reclamables"
        badge={pendingCount > 0 ? `${pendingCount} pendiente(s)` : undefined}
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="h-8 bg-muted/50">
          <TabsTrigger value="pending" className="text-[11px] gap-1 data-[state=active]:bg-background">
            Pendientes {pendingCount > 0 && <Badge variant="secondary" className="h-4 px-1 text-[9px]">{pendingCount}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="approved" className="text-[11px] data-[state=active]:bg-background">Aprobadas</TabsTrigger>
          <TabsTrigger value="rejected" className="text-[11px] data-[state=active]:bg-background">Rechazadas</TabsTrigger>
        </TabsList>
      </Tabs>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <HandMetal className="h-8 w-8 mx-auto mb-3 opacity-30" />
          <p className="text-sm">
            {tab === "pending" ? "No hay solicitudes pendientes" : `No hay solicitudes ${tab === "approved" ? "aprobadas" : "rechazadas"}`}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(req => (
            <div key={req.id} className="rounded-xl border bg-card p-4 space-y-3">
              {/* Header: Employee + status */}
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <EmployeeAvatar firstName={req.employee.first_name} lastName={req.employee.last_name} size="sm" />
                  <div>
                    <p className="text-sm font-semibold">{req.employee.first_name} {req.employee.last_name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      Solicitó {format(parseISO(req.created_at), "d MMM HH:mm", { locale: es })}
                    </p>
                  </div>
                </div>
                {statusBadge(req.status)}
              </div>

              {/* Shift info */}
              <div className="rounded-lg bg-muted/30 p-3 space-y-1.5">
                <p className="text-xs font-semibold">{req.shift.title}</p>
                <div className="flex items-center gap-4 text-[11px] text-muted-foreground flex-wrap">
                  <span className="flex items-center gap-1">
                    <CalendarDays className="h-3 w-3" />
                    {format(parseISO(req.shift.date), "EEE d MMM", { locale: es })}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {req.shift.start_time.slice(0, 5)} – {req.shift.end_time.slice(0, 5)}
                  </span>
                  {req.shift.location_name && (
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {req.shift.location_name}
                    </span>
                  )}
                  {req.shift.client_name && (
                    <span className="flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      {req.shift.client_name}
                    </span>
                  )}
                </div>
              </div>

              {/* Employee message */}
              {req.message && (
                <div className="flex items-start gap-2 text-xs text-muted-foreground">
                  <MessageSquare className="h-3 w-3 mt-0.5 shrink-0" />
                  <p>"{req.message}"</p>
                </div>
              )}

              {/* Rejection reason */}
              {req.rejection_reason && req.status === "rejected" && (
                <div className="flex items-start gap-2 text-xs text-red-600 dark:text-red-400">
                  <XCircle className="h-3 w-3 mt-0.5 shrink-0" />
                  <p>Motivo: {req.rejection_reason}</p>
                </div>
              )}

              {/* Actions */}
              {req.status === "pending" && (
                <div className="flex items-center gap-2 pt-1">
                  <Button
                    size="sm"
                    className="h-8 text-xs gap-1.5"
                    onClick={() => handleApprove(req)}
                    disabled={processing === req.id}
                  >
                    {processing === req.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                    Aprobar
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs gap-1.5 text-destructive hover:text-destructive"
                    onClick={() => { setRejectId(req.id); setRejectReason(""); }}
                    disabled={processing === req.id}
                  >
                    <XCircle className="h-3.5 w-3.5" />
                    Rechazar
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Reject dialog */}
      <Dialog open={!!rejectId} onOpenChange={o => { if (!o) { setRejectId(null); setRejectReason(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">Rechazar solicitud</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Opcionalmente indica el motivo del rechazo. El empleado será notificado.
            </p>
            <Textarea
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              placeholder="Motivo del rechazo (opcional)..."
              rows={3}
              className="text-sm resize-none"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => { setRejectId(null); setRejectReason(""); }}>
              Cancelar
            </Button>
            <Button variant="destructive" size="sm" onClick={handleReject} disabled={processing === rejectId}>
              {processing === rejectId ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
              Rechazar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
