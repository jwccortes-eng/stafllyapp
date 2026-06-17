import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { MessageCircle, Wallet, BarChart3, CalendarDays, FileText, Settings, HelpCircle, BookOpen } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { StaflyPageShell } from "@/components/stafly-ui/StaflyPageShell";
import { StaflyCard } from "@/components/stafly-ui/StaflyCard";
import { usePortalChrome } from "@/components/stafly-ui/usePortalChrome";
import { cn } from "@/lib/utils";


const resources = [
  { to: "/portal/pay-reports", icon: Wallet, label: "Pay Reports", description: "Finalized weekly payroll", color: "bg-primary/10 text-primary" },
  { to: "/portal/accumulated", icon: BarChart3, label: "Historial", description: "Acumulado y tendencia", color: "bg-earning/10 text-earning" },
  { to: "/portal/shifts", icon: CalendarDays, label: "Turnos", description: "Mis asignaciones y disponibles", color: "bg-accent text-accent-foreground" },
  { to: "/portal/announcements", icon: BookOpen, label: "Feed completo", description: "Todos los anuncios", color: "bg-warning/10 text-warning" },
];

export default function PortalResources() {
  const { fullName } = useAuth();
  const { setChromeMode } = usePortalChrome();

  // DS1D-a3 pilot: opt out of EmployeeLayout legacy px-4 py-4 chrome so
  // StaflyPageShell can own padding via Stafly tokens. Restore on unmount.
  useEffect(() => {
    setChromeMode?.("shell");
    return () => setChromeMode?.("legacy");
  }, [setChromeMode]);

  return (
    <StaflyPageShell density="worker" className="animate-fade-in">
      <PageHeader
        variant="4"
        eyebrow="SOPORTE"
        title="Recursos de trabajo"
        subtitle="Herramientas y material de apoyo para tu día"
      />

      {/* Resource grid */}
      <div className="grid grid-cols-1 gap-2.5">
        {resources.map(r => (
          <StaflyCard
            key={r.to}
            to={r.to}
            tone="interactive"
            padding="md"
            className="flex items-center gap-4"
          >
            <div className={cn("h-11 w-11 rounded-xl flex items-center justify-center shrink-0", r.color)}>
              <r.icon className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">{r.label}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{r.description}</p>
            </div>
          </StaflyCard>
        ))}
      </div>

      {/* Help section */}
      <StaflyCard tone="soft" padding="lg" className="bg-muted/20 text-center space-y-2">
        <HelpCircle className="h-6 w-6 text-muted-foreground/30 mx-auto" />
        <p className="text-xs text-muted-foreground/70">¿Necesitas ayuda? Contacta a tu administrador</p>
      </StaflyCard>
    </StaflyPageShell>
  );
}

