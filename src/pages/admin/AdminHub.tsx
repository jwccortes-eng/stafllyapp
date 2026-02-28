import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/ui/page-header";
import { cn } from "@/lib/utils";
import {
  Globe, Building2, Shield, Users, Activity, Settings2,
  CalendarDays, DollarSign, ListChecks, Cpu, FileText, Zap, UserPlus,
} from "lucide-react";

const sections = [
  {
    title: "Empresa",
    items: [
      { to: "/app/global", icon: Globe, label: "Vista global", desc: "Métricas consolidadas de todas las empresas" },
      { to: "/app/companies", icon: Building2, label: "Empresas", desc: "Gestionar empresas y sandboxes" },
      { to: "/app/company-config", icon: Settings2, label: "Config Empresa", desc: "Módulos, branding y ajustes" },
      { to: "/app/onboarding", icon: UserPlus, label: "Onboarding", desc: "Asistente de configuración inicial" },
    ],
  },
  {
    title: "Usuarios y Permisos",
    items: [
      { to: "/app/users", icon: Shield, label: "Usuarios", desc: "Admins, managers y roles" },
      { to: "/app/permissions", icon: Shield, label: "Permisos", desc: "Control granular de acceso" },
      { to: "/app/leads", icon: Users, label: "Leads", desc: "Prospectos y seguimiento" },
    ],
  },
  {
    title: "Sistema",
    items: [
      { to: "/app/activity", icon: Activity, label: "Actividad", desc: "Log de auditoría" },
      { to: "/app/automations", icon: Zap, label: "Automatizaciones", desc: "Reglas y triggers automáticos" },
      { to: "/app/notification-templates", icon: FileText, label: "Plantillas", desc: "Plantillas de notificación" },
      { to: "/app/settings", icon: Settings2, label: "Plataforma", desc: "Configuración general" },
      { to: "/app/system-health", icon: Cpu, label: "Cuadro de control", desc: "Estado y performance" },
      { to: "/app/implementations", icon: ListChecks, label: "Implementaciones", desc: "Roadmap y progreso" },
      { to: "/app/monetization", icon: DollarSign, label: "Inversión", desc: "Costos y monetización" },
    ],
  },
];

export default function AdminHub() {
  const { role } = useAuth();

  if (role !== "owner") {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-muted-foreground text-sm">No tienes acceso a esta sección.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in max-w-5xl">
      <PageHeader
        variant="1"
        eyebrow="OWNER"
        title="Administración"
        subtitle="Configuración avanzada, usuarios y herramientas del sistema"
      />

      {sections.map((section) => (
        <div key={section.title} className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/60 px-1">
            {section.title}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {section.items.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "group flex items-start gap-3.5 rounded-2xl border bg-card p-4",
                  "hover:bg-accent/50 hover:border-primary/20 transition-all duration-200",
                  "hover:shadow-md active:scale-[0.98]"
                )}
              >
                <div className="h-10 w-10 rounded-xl bg-primary/8 flex items-center justify-center shrink-0 group-hover:bg-primary/12 transition-colors">
                  <item.icon className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground leading-tight">{item.label}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{item.desc}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
