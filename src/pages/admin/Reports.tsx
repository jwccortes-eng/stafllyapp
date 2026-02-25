import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3, FileSpreadsheet, Users, UserCheck } from "lucide-react";
import { Link } from "react-router-dom";

export default function Reports() {
  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Reportes</h1>
        <p className="page-subtitle">Acceso rápido a vistas y exportaciones</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link to="/admin/summary">
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

        <Link to="/admin/reports/employee">
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

        <Link to="/admin/employees">
          <Card className="stat-card cursor-pointer hover:border-primary/30">
            <CardHeader className="flex flex-row items-center gap-3">
              <Users className="h-8 w-8 text-earning" />
              <div>
                <CardTitle className="text-base">Directorio empleados</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Lista completa con búsqueda y datos de contacto.</p>
            </CardContent>
          </Card>
        </Link>

        <Link to="/admin/movements">
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
      </div>
    </div>
  );
}