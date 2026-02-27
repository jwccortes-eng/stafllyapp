import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/ui/page-header";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Users, Search, Mail, Phone, Building2, Calendar } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface Lead {
  id: string;
  name: string;
  company: string;
  email: string | null;
  phone: string | null;
  employee_count: string | null;
  source: string | null;
  created_at: string;
}

export default function Leads() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from("demo_requests" as any)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      setLeads((data as any as Lead[]) ?? []);
      setLoading(false);
    };
    fetch();
  }, []);

  const filtered = leads.filter(l => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      l.name.toLowerCase().includes(q) ||
      l.company.toLowerCase().includes(q) ||
      l.email?.toLowerCase().includes(q)
    );
  });

  if (loading) return <PageSkeleton />;

  return (
    <div className="space-y-6">
      <PageHeader
        variant="1"
        icon={Users}
        title="Leads"
        subtitle="Solicitudes de demo recibidas desde la landing page"
      />

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="rounded-2xl border border-border/50 bg-card p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">Total</p>
          <p className="text-2xl font-bold mt-1">{leads.length}</p>
        </div>
        <div className="rounded-2xl border border-border/50 bg-card p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">Con email</p>
          <p className="text-2xl font-bold mt-1 text-primary">{leads.filter(l => l.email).length}</p>
        </div>
        <div className="rounded-2xl border border-border/50 bg-card p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">Con teléfono</p>
          <p className="text-2xl font-bold mt-1 text-emerald-600">{leads.filter(l => l.phone).length}</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40" />
        <Input
          placeholder="Buscar por nombre, empresa o email..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9 h-9 rounded-xl bg-muted/30 border-border/30"
        />
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
          <div className="h-12 w-12 rounded-2xl bg-muted/50 flex items-center justify-center">
            <Users className="h-6 w-6 text-muted-foreground/40" />
          </div>
          <p className="text-sm font-medium text-muted-foreground/60">Sin leads aún</p>
          <p className="text-xs text-muted-foreground/40">Las solicitudes de demo aparecerán aquí automáticamente.</p>
        </div>
      ) : (
        <div className="data-table-wrapper">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Empresa</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Teléfono</TableHead>
                <TableHead>Empleados</TableHead>
                <TableHead>Fuente</TableHead>
                <TableHead>Fecha</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(l => (
                <TableRow key={l.id}>
                  <TableCell className="font-medium">{l.name}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <Building2 className="h-3.5 w-3.5 text-muted-foreground/50" />
                      <span className="text-sm">{l.company}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {l.email ? (
                      <a href={`mailto:${l.email}`} className="text-sm text-primary hover:underline flex items-center gap-1">
                        <Mail className="h-3 w-3" />
                        {l.email}
                      </a>
                    ) : (
                      <span className="text-xs text-muted-foreground/40">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {l.phone ? (
                      <a href={`tel:${l.phone}`} className="text-sm flex items-center gap-1 hover:underline">
                        <Phone className="h-3 w-3 text-muted-foreground/50" />
                        {l.phone}
                      </a>
                    ) : (
                      <span className="text-xs text-muted-foreground/40">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {l.employee_count ? (
                      <Badge variant="secondary" className="text-xs">{l.employee_count}</Badge>
                    ) : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs capitalize">{l.source || "landing"}</Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {format(new Date(l.created_at), "dd MMM yyyy HH:mm", { locale: es })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
