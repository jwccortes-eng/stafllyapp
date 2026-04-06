import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/ui/page-header";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sparkles, Building2, Mail, Phone, Clock } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "@/hooks/use-toast";

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  new: { label: "Nueva", variant: "default" },
  contacted: { label: "Contactada", variant: "secondary" },
  qualified: { label: "Calificada", variant: "outline" },
  approved: { label: "Aprobada", variant: "default" },
  rejected: { label: "Rechazada", variant: "destructive" },
  closed: { label: "Cerrada", variant: "outline" },
};

export default function UpgradeRequests() {
  const queryClient = useQueryClient();

  const { data: requests, isLoading } = useQuery({
    queryKey: ["upgrade-requests-admin"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("upgrade_requests" as any)
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as any[]) ?? [];
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from("upgrade_requests" as any)
        .update({ status, updated_at: new Date().toISOString() } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["upgrade-requests-admin"] });
      toast({ title: "Estado actualizado" });
    },
  });

  if (isLoading) return <PageSkeleton variant="table" />;

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        variant="2"
        icon={Sparkles}
        title="Solicitudes de Upgrade"
        subtitle="Gestión de solicitudes de plan Pro"
        badge={`${requests?.length ?? 0} solicitudes`}
      />

      {!requests?.length ? (
        <EmptyState
          icon={Sparkles}
          title="Sin solicitudes"
          description="Las solicitudes de upgrade aparecerán aquí cuando los clientes las envíen."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Contacto</TableHead>
                  <TableHead>Plan actual</TableHead>
                  <TableHead>Notas</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map((req: any) => {
                  const statusInfo = STATUS_CONFIG[req.status] ?? STATUS_CONFIG.new;
                  return (
                    <TableRow key={req.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span className="font-medium text-sm">{req.company_name || "—"}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-0.5 text-xs">
                          {req.contact_name && <p className="font-medium">{req.contact_name}</p>}
                          {req.contact_email && (
                            <p className="flex items-center gap-1 text-muted-foreground">
                              <Mail className="h-3 w-3" />{req.contact_email}
                            </p>
                          )}
                          {req.contact_phone && (
                            <p className="flex items-center gap-1 text-muted-foreground">
                              <Phone className="h-3 w-3" />{req.contact_phone}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {req.current_plan === "free" ? "Starter" : req.current_plan ?? "—"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <p className="text-xs text-muted-foreground max-w-[200px] truncate">
                          {req.notes || "—"}
                        </p>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {format(new Date(req.created_at), "d MMM yyyy", { locale: es })}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={req.status}
                          onValueChange={(val) => updateStatus.mutate({ id: req.id, status: val })}
                        >
                          <SelectTrigger className="h-7 w-[130px] text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                              <SelectItem key={key} value={key} className="text-xs">
                                {cfg.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
