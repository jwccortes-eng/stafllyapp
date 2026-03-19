import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Phone, MessageSquare, Mail, Users, MessageCircle, Filter, Download } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { ReportActionsBar } from "@/components/ui/report-actions-bar";
import { useCompany } from "@/hooks/useCompany";
import { formatPersonName, formatDisplayText, localeSort } from "@/lib/format-helpers";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { useEmployeeStatuses, type EmployeeOnlineStatus } from "@/hooks/useEmployeeStatus";
import { Badge } from "@/components/ui/badge";

const STATUS_LABELS: Record<EmployeeOnlineStatus, { label: string; className: string }> = {
  online: { label: "En línea", className: "bg-earning/15 text-earning border-earning/30" },
  on_shift: { label: "En turno", className: "bg-primary/15 text-primary border-primary/30" },
  recently_active: { label: "Reciente", className: "bg-warning/15 text-warning border-warning/30" },
  offline: { label: "Desconectado", className: "bg-muted text-muted-foreground border-border" },
  not_available: { label: "No disponible", className: "bg-destructive/15 text-destructive border-destructive/30" },
};

interface DirectoryEntry {
  id: string;
  first_name: string;
  last_name: string;
  phone_number: string | null;
  email: string | null;
  employee_role: string | null;
  gender: string | null;
  avatar_url: string | null;
}

export default function Directory() {
  const { selectedCompanyId } = useCompany();
  const [employees, setEmployees] = useState<DirectoryEntry[]>([]);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!selectedCompanyId) return;
    setLoading(true);
    supabase
      .from("employees")
      .select("id, first_name, last_name, phone_number, email, employee_role, gender, avatar_url")
      .eq("company_id", selectedCompanyId)
      .eq("is_active", true)
      .order("first_name")
      .then(({ data }) => {
        setEmployees((data as DirectoryEntry[]) ?? []);
        setLoading(false);
      });
  }, [selectedCompanyId]);

  const roles = useMemo(() => {
    const set = new Set<string>();
    employees.forEach((e) => {
      if (e.employee_role) set.add(e.employee_role);
    });
    return Array.from(set).sort((a, b) => localeSort(a, b));
  }, [employees]);

  const filtered = employees.filter((e) => {
    const matchesSearch = `${e.first_name} ${e.last_name} ${e.email ?? ""} ${e.phone_number ?? ""}`
      .toLowerCase()
      .includes(search.toLowerCase());
    const matchesRole = roleFilter === "all" || e.employee_role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const cleanPhone = (phone: string | null) => phone?.replace(/[^+\d]/g, "") ?? "";

  return (
    <div>
      <PageHeader
        variant="1"
        icon={Users}
        title="Directorio"
        subtitle={`${filtered.length} empleados activos`}
      />

      {filtered.length > 0 && (
        <ReportActionsBar
          title="Directorio"
          subtitle={`${filtered.length} empleados`}
          onExportCSV={() => {
            const headers = ["Nombre", "Teléfono", "Email", "Rol", "Género"];
            const rows = filtered.map(e => [
              formatPersonName(`${e.first_name} ${e.last_name}`),
              e.phone_number ?? "",
              e.email ?? "",
              e.employee_role ?? "",
              e.gender ?? "",
            ]);
            return [headers, ...rows];
          }}
        />
      )}

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre, teléfono o correo…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        {roles.length > 0 && (
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="w-full sm:w-[200px]">
              <Filter className="h-4 w-4 mr-2 text-muted-foreground" />
              <SelectValue placeholder="Filtrar por rol" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los roles</SelectItem>
              {roles.map((role) => (
                <SelectItem key={role} value={role}>{formatDisplayText(role, "label")}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Cards grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-32 animate-pulse bg-muted rounded-2xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <div className="h-14 w-14 mx-auto mb-3 rounded-2xl bg-primary/5 border border-primary/10 flex items-center justify-center">
            <Users className="h-7 w-7 text-primary/40" />
          </div>
          <p className="text-sm font-heading font-semibold">No se encontraron empleados</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((emp) => {
            const phone = cleanPhone(emp.phone_number);

            return (
              <div
                key={emp.id}
                className="group relative rounded-2xl border border-border/40 bg-card p-4 shadow-xs hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 overflow-hidden"
              >
                {/* decorative blob */}
                <div className="absolute top-0 right-0 h-24 w-24 rounded-full bg-primary/5 -translate-y-8 translate-x-8 group-hover:scale-[2] transition-transform duration-700" />

                <div className="relative z-10 flex items-start gap-3">
                  {/* 3D Avatar */}
                  <EmployeeAvatar
                    firstName={emp.first_name}
                    lastName={emp.last_name}
                    avatarUrl={emp.avatar_url}
                    gender={emp.gender}
                    size="xl"
                    className="ring-2 ring-background shadow-lg"
                  />

                  <div className="min-w-0 flex-1 pt-1">
                    <p className="text-sm font-bold text-foreground truncate leading-tight">
                      {formatPersonName(`${emp.first_name} ${emp.last_name}`)}
                    </p>
                    {emp.employee_role && (
                      <span className="inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-primary/10 text-primary">
                        {formatDisplayText(emp.employee_role, "label")}
                      </span>
                    )}

                    {/* Contact info */}
                    <div className="mt-2 space-y-0.5">
                      {emp.phone_number && (
                        <p className="text-[11px] text-muted-foreground truncate flex items-center gap-1">
                          <Phone className="h-3 w-3 shrink-0" /> {emp.phone_number}
                        </p>
                      )}
                      {emp.email && (
                        <p className="text-[11px] text-muted-foreground truncate flex items-center gap-1">
                          <Mail className="h-3 w-3 shrink-0" /> {emp.email}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="relative z-10 flex flex-wrap items-center gap-1.5 mt-3 pt-3 border-t border-border/30">
                  {phone && (
                    <>
                      <a
                        href={`tel:${phone}`}
                        className="flex-1 min-w-[4rem] flex items-center justify-center gap-1 py-1.5 rounded-xl text-[11px] font-semibold bg-earning/10 text-earning hover:bg-earning/20 transition-colors"
                      >
                        <Phone className="h-3.5 w-3.5 shrink-0" />
                        Llamar
                      </a>
                      <a
                        href={`https://wa.me/${phone.replace('+', '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 min-w-[4rem] flex items-center justify-center gap-1 py-1.5 rounded-xl text-[11px] font-semibold bg-earning/10 text-earning hover:bg-earning/20 transition-colors"
                      >
                        <MessageCircle className="h-3.5 w-3.5 shrink-0" />
                        WhatsApp
                      </a>
                      <a
                        href={`sms:${phone}`}
                        className="flex-1 min-w-[4rem] flex items-center justify-center gap-1 py-1.5 rounded-xl text-[11px] font-semibold bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                      >
                        <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                        Texto
                      </a>
                    </>
                  )}
                  {emp.email && (
                    <a
                      href={`mailto:${emp.email}`}
                      className="flex-1 min-w-[4rem] flex items-center justify-center gap-1 py-1.5 rounded-xl text-[11px] font-semibold bg-warning/10 text-warning hover:bg-warning/20 transition-colors"
                    >
                      <Mail className="h-3.5 w-3.5 shrink-0" />
                      Correo
                    </a>
                  )}
                  {!phone && !emp.email && (
                    <p className="text-xs text-muted-foreground italic w-full text-center">Sin datos de contacto</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
