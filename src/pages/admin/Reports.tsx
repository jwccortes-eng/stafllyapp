import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3, FileSpreadsheet, Users, UserCheck, AlertTriangle } from "lucide-react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/ui/page-header";

export default function Reports() {
  return (
    <div>
      <PageHeader variant="4" eyebrow="ANÁLISIS" title="Reportes" subtitle="Acceso rápido a vistas y exportaciones" />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link to="/app/summary">
          <Card className="stat-card cursor-pointer hover:border-primary/30">
            <CardHeader className="flex flex-row items-center gap-3">
              <FileSpreadsheet className="h-8 w-8 text-primary" />
              <div>
                <CardTitle className="text-base">Resumen por periodo</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Base + extras − deducciones por empleado, con exportación CSV.</p>
            </CardContent>
          </Card>
        </Link>

        <Link to="/app/reports/employee">
          <Card className="stat-card cursor-pointer hover:border-primary/30">
            <CardHeader className="flex flex-row items-center gap-3">
              <UserCheck className="h-8 w-8 text-primary" />
              <div>
                <CardTitle className="text-base">Resumen por empleado</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Historial completo de todos los periodos de un empleado con totales acumulados.</p>
            </CardContent>
          </Card>
        </Link>

        <Link to="/app/directory">
          <Card className="stat-card cursor-pointer hover:border-primary/30">
            <CardHeader className="flex flex-row items-center gap-3">
              <Users className="h-8 w-8 text-earning" />
              <div>
                <CardTitle className="text-base">Directorio de contacto</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Teléfonos, correos y acciones rápidas de llamada, texto y email.</p>
            </CardContent>
          </Card>
        </Link>

        <Link to="/app/movements">
          <Card className="stat-card cursor-pointer hover:border-primary/30">
            <CardHeader className="flex flex-row items-center gap-3">
              <BarChart3 className="h-8 w-8 text-warning" />
              <div>
                <CardTitle className="text-base">Novedades por periodo</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Todas las novedades registradas filtradas por periodo.</p>
            </CardContent>
          </Card>
        </Link>

        <Link to="/app/discrepancies">
          <Card className="stat-card cursor-pointer hover:border-primary/30">
            <CardHeader className="flex flex-row items-center gap-3">
              <AlertTriangle className="h-8 w-8 text-destructive" />
              <div>
                <CardTitle className="text-base">Discrepancias</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Turnos vs. registros de reloj: ausencias, tardanzas, extras no planeadas.</p>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}