/**
 * Requester portal — minimal "new request" stub.
 * Out of scope for this iteration: full creation form. We point to the
 * existing admin form so we don't duplicate logic prematurely.
 */
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

export default function ClientNewRequest() {
  return (
    <Card className="p-6 max-w-xl mx-auto space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Nueva solicitud</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Por ahora la creación de solicitudes se gestiona desde el panel
          interno. En las próximas iteraciones tendrás un formulario aquí
          para crear, ver el estado, los turnos generados y el personal asignado.
        </p>
      </div>
      <div className="flex flex-col sm:flex-row gap-2">
        <Link to="/app/service-requests" className="flex-1">
          <Button variant="outline" className="w-full gap-1.5">
            Abrir panel interno <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </Link>
        <Link to="/client/requests" className="flex-1">
          <Button variant="ghost" className="w-full">
            Volver a mis solicitudes
          </Button>
        </Link>
      </div>
    </Card>
  );
}
