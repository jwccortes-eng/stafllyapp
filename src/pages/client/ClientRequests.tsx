/**
 * Requester portal — list of service requests. Reuses useServiceRequests.
 */
import { Link } from "react-router-dom";
import { useServiceRequests } from "@/hooks/useServiceRequests";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export default function ClientRequests() {
  const { data: requests = [], isLoading } = useServiceRequests();
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Solicitudes</h1>
        <Link to="/client/requests/new">
          <Button size="sm" className="gap-1.5">
            <Plus className="h-4 w-4" /> Nueva
          </Button>
        </Link>
      </div>
      <Card className="divide-y divide-border/60">
        {isLoading ? (
          <div className="p-8 text-center text-xs text-muted-foreground">Cargando…</div>
        ) : requests.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <p className="text-sm text-muted-foreground">
              No tienes solicitudes todavía.
            </p>
            <Link to="/client/requests/new">
              <Button size="sm" variant="outline" className="gap-1.5">
                <Plus className="h-3.5 w-3.5" /> Crear la primera
              </Button>
            </Link>
          </div>
        ) : (
          requests.map((r) => (
            <Link
              key={r.id}
              to={`/client/requests/${r.id}`}
              className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/40 transition-colors"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">
                  {r.client_name_snapshot ?? r.location_name ?? r.request_code}
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
