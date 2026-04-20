/**
 * Requester portal dashboard. Reuses useServiceRequests so we never
 * duplicate data fetching with /app/requests or /app/service-requests.
 */
import { Link } from "react-router-dom";
import { useServiceRequests } from "@/hooks/useServiceRequests";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ClipboardList, Clock, CheckCircle2, Plus } from "lucide-react";

export default function ClientDashboard() {
  const { data: requests = [], isLoading } = useServiceRequests();

  const open = requests.filter((r) => r.status !== "closed" && r.status !== "cancelled").length;
  const upcoming = requests.filter((r) => {
    if (!r.service_date) return false;
    return new Date(r.service_date) >= new Date(new Date().toDateString());
  }).length;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Tus solicitudes</h1>
          <p className="text-sm text-muted-foreground">
            Resumen de los requerimientos de personal que has creado.
          </p>
        </div>
        <Link to="/client/requests/new">
          <Button size="sm" className="gap-1.5">
            <Plus className="h-4 w-4" /> Nueva solicitud
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <ClipboardList className="h-4 w-4" />
            </div>
            <div>
              <p className="text-2xl font-semibold leading-none">{requests.length}</p>
              <p className="text-xs text-muted-foreground mt-1">Total</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-warning/10 text-warning flex items-center justify-center">
              <Clock className="h-4 w-4" />
            </div>
            <div>
              <p className="text-2xl font-semibold leading-none">{open}</p>
              <p className="text-xs text-muted-foreground mt-1">Abiertas</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-earning/10 text-earning flex items-center justify-center">
              <CheckCircle2 className="h-4 w-4" />
            </div>
            <div>
              <p className="text-2xl font-semibold leading-none">{upcoming}</p>
              <p className="text-xs text-muted-foreground mt-1">Próximas</p>
            </div>
          </div>
        </Card>
      </div>

      <Card className="divide-y divide-border/60">
        <div className="px-4 py-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Recientes</h2>
          <Link to="/client/requests" className="text-xs text-primary hover:underline">
            Ver todas
          </Link>
        </div>
        {isLoading ? (
          <div className="p-8 text-center text-xs text-muted-foreground">Cargando…</div>
        ) : requests.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Aún no has creado solicitudes.
          </div>
        ) : (
          requests.slice(0, 8).map((r) => (
            <Link
              key={r.id}
              to={`/client/requests/${r.id}`}
              className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/40 transition-colors"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">
                  {r.title ?? "Solicitud"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {r.service_date ?? "Sin fecha"}
                </p>
              </div>
              <Badge variant="outline" className="text-[10px] capitalize">
                {r.status}
              </Badge>
            </Link>
          ))
        )}
      </Card>
    </div>
  );
}
