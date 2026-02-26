import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Link } from "react-router-dom";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import {
  User, Mail, Phone, MapPin, CalendarDays, Wallet,
  ChevronRight, LogOut, Shield, BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface EmployeeProfile {
  first_name: string;
  last_name: string;
  email: string | null;
  phone_number: string | null;
  employee_role: string | null;
  start_date: string | null;
  groups: string | null;
  tags: string | null;
}

export default function PortalProfile() {
  const { employeeId, signOut } = useAuth();
  const [profile, setProfile] = useState<EmployeeProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [companyName, setCompanyName] = useState("");

  useEffect(() => {
    if (!employeeId) return;
    async function load() {
      const { data } = await supabase
        .from("employees")
        .select("first_name, last_name, email, phone_number, employee_role, start_date, groups, tags, company_id")
        .eq("id", employeeId)
        .maybeSingle();

      if (data) {
        setProfile(data);
        const { data: comp } = await supabase.from("companies").select("name").eq("id", data.company_id).maybeSingle();
        setCompanyName(comp?.name ?? "");
      }
      setLoading(false);
    }
    load();
  }, [employeeId]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-32 animate-pulse bg-muted rounded-2xl" />
        <div className="h-20 animate-pulse bg-muted rounded-2xl" />
      </div>
    );
  }

  if (!profile) return null;

  const infoItems = [
    { icon: Mail, label: "Email", value: profile.email },
    { icon: Phone, label: "Teléfono", value: profile.phone_number },
    { icon: Shield, label: "Rol", value: profile.employee_role },
    { icon: CalendarDays, label: "Inicio", value: profile.start_date },
  ].filter(i => i.value);

  const menuItems = [
    { to: "/portal/payments", icon: Wallet, label: "Mis pagos", description: "Historial de nómina" },
    { to: "/portal/accumulated", icon: BarChart3, label: "Acumulado", description: "Total histórico" },
    { to: "/portal/shifts", icon: CalendarDays, label: "Mis turnos", description: "Asignaciones y solicitudes" },
  ];

  return (
    <div className="space-y-6">
      {/* Profile header */}
      <div className="rounded-2xl bg-gradient-to-br from-primary to-primary/70 p-6 text-primary-foreground relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,hsl(243_75%_70%/0.3),transparent_60%)]" />
        <div className="relative flex items-center gap-4">
          <EmployeeAvatar
            firstName={profile.first_name}
            lastName={profile.last_name}
            size="lg"
            className="border-2 border-white/30"
          />
          <div className="min-w-0">
            <h1 className="text-xl font-bold font-heading tracking-tight">
              {profile.first_name} {profile.last_name}
            </h1>
            <p className="text-sm opacity-80">{companyName}</p>
            {profile.employee_role && (
              <span className="inline-block mt-1.5 text-[10px] px-2 py-0.5 rounded-full bg-white/20 font-medium">
                {profile.employee_role}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Info cards */}
      {infoItems.length > 0 && (
        <div className="grid grid-cols-2 gap-2.5">
          {infoItems.map(item => (
            <div key={item.label} className="rounded-2xl border bg-card p-3.5">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <item.icon className="h-3.5 w-3.5" />
                <span className="text-[10px] font-semibold uppercase tracking-wider">{item.label}</span>
              </div>
              <p className="text-sm font-medium text-foreground truncate">{item.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Tags & groups */}
      {(profile.groups || profile.tags) && (
        <div className="space-y-2">
          {profile.groups && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Grupos:</span>
              {profile.groups.split(",").map(g => (
                <span key={g.trim()} className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                  {g.trim()}
                </span>
              ))}
            </div>
          )}
          {profile.tags && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Tags:</span>
              {profile.tags.split(",").map(t => (
                <span key={t.trim()} className="text-[10px] px-2 py-0.5 rounded-full bg-accent text-accent-foreground font-medium">
                  {t.trim()}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Quick menu */}
      <div className="space-y-2">
        {menuItems.map(item => (
          <Link
            key={item.to}
            to={item.to}
            className="flex items-center gap-3.5 rounded-2xl border bg-card p-4 hover:bg-accent/50 transition-colors active:scale-[0.98]"
          >
            <item.icon className="h-5 w-5 text-muted-foreground" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">{item.label}</p>
              <p className="text-[10px] text-muted-foreground">{item.description}</p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Link>
        ))}
      </div>

      {/* Logout */}
      <Button
        variant="outline"
        className="w-full h-11 text-sm gap-2 text-destructive hover:text-destructive"
        onClick={signOut}
      >
        <LogOut className="h-4 w-4" />
        Cerrar sesión
      </Button>
    </div>
  );
}
