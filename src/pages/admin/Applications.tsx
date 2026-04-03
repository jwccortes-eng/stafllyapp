import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  CheckCircle2, XCircle, Eye, Loader2, Clock, User,
  Phone, Mail, MapPin, Car, Briefcase, FileText, Calendar,
  UtensilsCrossed, SprayCan,
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

type AppStatus = "pending" | "reviewing" | "approved" | "rejected";

const STATUS_CONFIG: Record<AppStatus, { label: string; color: string; icon: any }> = {
  pending: { label: "Pendiente", color: "bg-amber-100 text-amber-800 border-amber-200", icon: Clock },
  reviewing: { label: "En revisión", color: "bg-blue-100 text-blue-800 border-blue-200", icon: Eye },
  approved: { label: "Aprobado", color: "bg-emerald-100 text-emerald-800 border-emerald-200", icon: CheckCircle2 },
  rejected: { label: "Rechazado", color: "bg-red-100 text-red-800 border-red-200", icon: XCircle },
};

const WORKER_TYPE_LABELS: Record<string, { label: string; icon: any }> = {
  waiter: { label: "Mesero", icon: UtensilsCrossed },
  driver: { label: "Driver", icon: Car },
  cleaning: { label: "Limpieza", icon: SprayCan },
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
  document_url: string | null;
  status: string;
  reference_code: string;
  notes: string | null;
  admin_notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export default function Applications() {
  const { selectedCompanyId } = useCompany();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<string>("pending");
  const [selected, setSelected] = useState<Application | null>(null);
  const [adminNotes, setAdminNotes] = useState("");

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

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: AppStatus }) => {
      const { error } = await supabase
        .from("job_applications")
        .update({
          status,
          reviewed_by: user?.id ?? null,
          reviewed_at: new Date().toISOString(),
          admin_notes: adminNotes || null,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, { status }) => {
      queryClient.invalidateQueries({ queryKey: ["job-applications"] });
      toast.success(status === "approved" ? "Solicitud aprobada" : status === "rejected" ? "Solicitud rechazada" : "Estado actualizado");
      setSelected(null);
      setAdminNotes("");
    },
  });

  const filtered = applications.filter((a) => a.status === tab);

  const counts: Record<string, number> = {
    pending: applications.filter((a) => a.status === "pending").length,
    reviewing: applications.filter((a) => a.status === "reviewing").length,
    approved: applications.filter((a) => a.status === "approved").length,
    rejected: applications.filter((a) => a.status === "rejected").length,
  };

  const openDetail = (app: Application) => {
    setSelected(app);
    setAdminNotes(app.admin_notes ?? "");
    // Mark as reviewing if pending
    if (app.status === "pending") {
      supabase
        .from("job_applications")
        .update({ status: "reviewing" })
        .eq("id", app.id)
        .then(() => queryClient.invalidateQueries({ queryKey: ["job-applications"] }));
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Aplicaciones"
        description="Gestiona las solicitudes de nuevos trabajadores"
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-muted/50 h-10">
          {(["pending", "reviewing", "approved", "rejected"] as AppStatus[]).map((s) => {
            const cfg = STATUS_CONFIG[s];
            return (
              <TabsTrigger key={s} value={s} className="gap-1.5 text-xs data-[state=active]:shadow-sm">
                {cfg.label}
                {counts[s] > 0 && (
                  <Badge variant="secondary" className="h-5 min-w-5 text-[10px] px-1.5">
                    {counts[s]}
                  </Badge>
                )}
              </TabsTrigger>
            );
          })}
        </TabsList>

        {(["pending", "reviewing", "approved", "rejected"] as AppStatus[]).map((s) => (
          <TabsContent key={s} value={s} className="mt-4">
            {isLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <p className="text-sm">No hay solicitudes {STATUS_CONFIG[s].label.toLowerCase()}</p>
              </div>
            ) : (
              <div className="bg-card rounded-xl border divide-y">
                {filtered.map((app) => (
                  <ApplicationRow key={app.id} app={app} onClick={() => openDetail(app)} />
                ))}
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>

      {/* Detail Sheet */}
      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {selected && (
            <div className="space-y-6">
              <SheetHeader>
                <div className="flex items-center gap-3">
                  <Avatar className="h-14 w-14">
                    <AvatarFallback className="bg-primary/10 text-primary text-lg font-bold">
                      {selected.first_name[0]}{selected.last_name[0]}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <SheetTitle className="text-lg">
                      {selected.first_name} {selected.last_name}
                    </SheetTitle>
                    <div className="flex items-center gap-2 mt-1">
                      <StatusBadge status={selected.status as AppStatus} />
                      <span className="text-xs text-muted-foreground">{selected.reference_code}</span>
                    </div>
                  </div>
                </div>
              </SheetHeader>

              {/* Info Grid */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-foreground">Información</h3>
                <div className="grid grid-cols-2 gap-3">
                  <InfoItem icon={Phone} label="Teléfono" value={selected.phone} />
                  <InfoItem icon={Mail} label="Email" value={selected.email ?? "—"} />
                  <InfoItem icon={Briefcase} label="Tipo" value={WORKER_TYPE_LABELS[selected.worker_type]?.label ?? selected.worker_type} />
                  <InfoItem icon={MapPin} label="Ciudad" value={selected.city ?? "—"} />
                  <InfoItem icon={Clock} label="Disponibilidad" value={selected.availability === "full_time" ? "Tiempo completo" : "Medio tiempo"} />
                  <InfoItem icon={Car} label="Conduce" value={selected.can_drive ? "Sí" : "No"} />
                  <InfoItem icon={Calendar} label="Aplicó" value={format(new Date(selected.created_at), "dd MMM yyyy", { locale: es })} />
                  {selected.document_url && (
                    <InfoItem icon={FileText} label="Documento" value="Adjunto" />
                  )}
                </div>
              </div>

              {/* Admin notes */}
              <div className="space-y-2">
                <label className="text-sm font-semibold text-foreground">Notas internas</label>
                <Textarea
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  placeholder="Agrega notas sobre este aplicante..."
                  className="min-h-[80px] rounded-xl"
                />
              </div>

              {/* Actions */}
              {(selected.status === "pending" || selected.status === "reviewing") && (
                <div className="flex gap-3 pt-2">
                  <Button
                    onClick={() => updateStatusMutation.mutate({ id: selected.id, status: "approved" })}
                    disabled={updateStatusMutation.isPending}
                    className="flex-1 h-11 rounded-xl text-primary-foreground"
                  >
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Aprobar
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => updateStatusMutation.mutate({ id: selected.id, status: "rejected" })}
                    disabled={updateStatusMutation.isPending}
                    className="flex-1 h-11 rounded-xl text-destructive border-destructive/30 hover:bg-destructive/5"
                  >
                    <XCircle className="h-4 w-4 mr-2" />
                    Rechazar
                  </Button>
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

/* ─── Sub-components ─── */

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
        <p className="text-sm font-semibold text-foreground truncate">
          {app.first_name} {app.last_name}
        </p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <WtIcon className="h-3 w-3" />
          <span>{wt.label}</span>
          <span>·</span>
          <span>{format(new Date(app.created_at), "dd MMM", { locale: es })}</span>
        </div>
      </div>
      <StatusBadge status={app.status as AppStatus} />
      <Eye className="h-4 w-4 text-muted-foreground/40 group-hover:text-primary transition-colors shrink-0" />
    </button>
  );
}

function StatusBadge({ status }: { status: AppStatus }) {
  const cfg = STATUS_CONFIG[status];
  const Icon = cfg.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border", cfg.color)}>
      <Icon className="h-3 w-3" />
      {cfg.label}
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
