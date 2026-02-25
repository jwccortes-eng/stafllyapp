import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Search, Phone, MessageSquare, Mail, Users, MessageCircle } from "lucide-react";
import { useCompany } from "@/hooks/useCompany";

interface DirectoryEntry {
  id: string;
  first_name: string;
  last_name: string;
  phone_number: string | null;
  email: string | null;
  employee_role: string | null;
}

export default function Directory() {
  const { selectedCompanyId } = useCompany();
  const [employees, setEmployees] = useState<DirectoryEntry[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!selectedCompanyId) return;
    setLoading(true);
    supabase
      .from("employees")
      .select("id, first_name, last_name, phone_number, email, employee_role")
      .eq("company_id", selectedCompanyId)
      .eq("is_active", true)
      .order("first_name")
      .then(({ data }) => {
        setEmployees((data as DirectoryEntry[]) ?? []);
        setLoading(false);
      });
  }, [selectedCompanyId]);

  const filtered = employees.filter((e) =>
    `${e.first_name} ${e.last_name} ${e.email ?? ""} ${e.phone_number ?? ""}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  const cleanPhone = (phone: string | null) => phone?.replace(/[^+\d]/g, "") ?? "";

  return (
    <div>
      <div className="page-header flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Users className="h-6 w-6 text-primary" />
          <div>
            <h1 className="page-title">Directorio</h1>
            <p className="page-subtitle">
              {filtered.length} empleados activos
            </p>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nombre, teléfono o correo…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Cards grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-28 animate-pulse bg-muted rounded-2xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Users className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">No se encontraron empleados</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((emp) => {
            const phone = cleanPhone(emp.phone_number);
            const initials = `${emp.first_name?.[0] ?? ""}${emp.last_name?.[0] ?? ""}`.toUpperCase();

            return (
              <div
                key={emp.id}
                className="group relative rounded-2xl border border-border bg-card p-4 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 overflow-hidden"
              >
                {/* decorative blob */}
                <div className="absolute top-0 right-0 h-20 w-20 rounded-full bg-primary/5 -translate-y-6 translate-x-6 group-hover:scale-150 transition-transform duration-500" />

                <div className="relative z-10 flex items-start gap-3">
                  {/* Avatar */}
                  <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shrink-0 shadow-sm">
                    <span className="text-sm font-bold text-primary-foreground">{initials}</span>
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground truncate">
                      {emp.first_name} {emp.last_name}
                    </p>
                    {emp.employee_role && (
                      <p className="text-[11px] text-muted-foreground truncate">{emp.employee_role}</p>
                    )}

                    {/* Contact info */}
                    <div className="mt-2 space-y-1">
                      {emp.phone_number && (
                        <p className="text-xs text-muted-foreground truncate">
                          📞 {emp.phone_number}
                        </p>
                      )}
                      {emp.email && (
                        <p className="text-xs text-muted-foreground truncate">
                          ✉️ {emp.email}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="relative z-10 flex items-center gap-2 mt-3 pt-3 border-t border-border">
                  {phone && (
                    <>
                      <a
                        href={`tel:${phone}`}
                        className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium bg-earning/10 text-earning hover:bg-earning/20 transition-colors"
                      >
                        <Phone className="h-3.5 w-3.5" />
                        Llamar
                      </a>
                      <a
                        href={`https://wa.me/${phone.replace('+', '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium bg-earning/10 text-earning hover:bg-earning/20 transition-colors"
                      >
                        <MessageCircle className="h-3.5 w-3.5" />
                        WhatsApp
                      </a>
                      <a
                        href={`sms:${phone}`}
                        className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                      >
                        <MessageSquare className="h-3.5 w-3.5" />
                        Texto
                      </a>
                    </>
                  )}
                  {emp.email && (
                    <a
                      href={`mailto:${emp.email}`}
                      className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium bg-warning/10 text-warning hover:bg-warning/20 transition-colors"
                    >
                      <Mail className="h-3.5 w-3.5" />
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
