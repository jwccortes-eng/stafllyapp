import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { MessageCircle, Wallet, BarChart3, CalendarDays, FileText, Settings, HelpCircle, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";

const resources = [
  { to: "/portal/payments", icon: Wallet, label: "Nómina", description: "Pagos y detalle semanal", color: "bg-primary/10 text-primary" },
  { to: "/portal/accumulated", icon: BarChart3, label: "Historial", description: "Acumulado y tendencia", color: "bg-earning/10 text-earning" },
  { to: "/portal/shifts", icon: CalendarDays, label: "Turnos", description: "Mis asignaciones y disponibles", color: "bg-accent text-accent-foreground" },
  { to: "/portal/announcements", icon: BookOpen, label: "Feed completo", description: "Todos los anuncios", color: "bg-warning/10 text-warning" },
];

export default function PortalResources() {
  const { fullName } = useAuth();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-heading tracking-tight">Recursos</h1>
        <p className="text-sm text-muted-foreground mt-1">Herramientas y opciones disponibles</p>
      </div>

      {/* Resource grid */}
      <div className="grid grid-cols-1 gap-2.5">
        {resources.map(r => (
          <Link
            key={r.to}
            to={r.to}
            className="flex items-center gap-4 rounded-2xl border bg-card p-4 hover:bg-accent/50 transition-colors active:scale-[0.98]"
          >
            <div className={cn("h-11 w-11 rounded-xl flex items-center justify-center shrink-0", r.color)}>
              <r.icon className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">{r.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{r.description}</p>
            </div>
          </Link>
        ))}
      </div>

      {/* Help section */}
      <div className="rounded-2xl border bg-muted/30 p-4 text-center space-y-2">
        <HelpCircle className="h-6 w-6 text-muted-foreground/40 mx-auto" />
        <p className="text-xs text-muted-foreground">¿Necesitas ayuda? Contacta a tu administrador</p>
      </div>
    </div>
  );
}
