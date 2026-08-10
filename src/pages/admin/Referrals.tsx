import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { OperationalWorkspace, WorkspaceSearch, WorkspaceTabs } from "@/components/stafly-ui/OperationalWorkspace";
import { EntityCard } from "@/components/entities/EntityCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Loader2, AlertTriangle, Phone, Mail, MapPin } from "lucide-react";
import { format } from "date-fns";

const STATUSES = [
  "pending_review",
  "possible_duplicate",
  "matched_existing_person",
  "needs_contact",
  "approved_to_invite",
  "invited",
  "rejected",
  "archived",
] as const;

const STATUS_LABEL: Record<string, string> = {
  pending_review: "Pendiente de revisión",
  possible_duplicate: "Posible duplicado",
  matched_existing_person: "Coincide con persona",
  needs_contact: "Falta contacto",
  approved_to_invite: "Aprobado para invitar",
  invited: "Invitado",
  rejected: "Rechazado",
  archived: "Archivado",
};

const STATUS_TONE: Record<string, string> = {
  pending_review: "bg-amber-500/10 text-amber-700 border-amber-500/30",
  possible_duplicate: "bg-orange-500/10 text-orange-700 border-orange-500/30",
  matched_existing_person: "bg-blue-500/10 text-blue-700 border-blue-500/30",
  needs_contact: "bg-purple-500/10 text-purple-700 border-purple-500/30",
  approved_to_invite: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30",
  invited: "bg-emerald-600/10 text-emerald-800 border-emerald-600/30",
  rejected: "bg-rose-500/10 text-rose-700 border-rose-500/30",
  archived: "bg-muted text-muted-foreground border-border",
};

export default function Referrals() {
  const { role } = useAuth();
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<any | null>(null);
  const [adminNotes, setAdminNotes] = useState("");
  const [companyToRoute, setCompanyToRoute] = useState<string>("");

  const isGlobalOwner = role === "developer" || role === "owner";

  const { data: referrals = [], isLoading } = useQuery({
    queryKey: ["admin-referrals", statusFilter],
    enabled: isGlobalOwner,
    queryFn: async () => {
      let q = supabase
        .from("job_applications")
        .select("*")
        .is("company_id", null)
        .order("created_at", { ascending: false })
        .limit(200);
      if (statusFilter !== "all") q = q.eq("status", statusFilter);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: companies = [] } = useQuery({
    queryKey: ["all-companies-for-routing"],
    enabled: isGlobalOwner,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("id, name")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const counts = STATUSES.reduce<Record<string, number>>((acc, s) => {
    acc[s] = referrals.filter((r: any) => r.status === s).length;
    return acc;
  }, { all: referrals.length } as any);

  const filtered = referrals.filter((r: any) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      `${r.first_name} ${r.last_name}`.toLowerCase().includes(q) ||
      (r.phone || "").includes(q) ||
      (r.email || "").toLowerCase().includes(q) ||
      (r.reference_code || "").toLowerCase().includes(q)
    );
  });

  const openDetail = (r: any) => {
    setSelected(r);
    setAdminNotes(r.admin_notes || "");
    setCompanyToRoute("");
  };

  const updateStatus = async (newStatus: string, extra: Record<string, any> = {}) => {
    if (!selected) return;
    const { error } = await supabase
      .from("job_applications")
      .update({ status: newStatus, admin_notes: adminNotes || null, reviewed_at: new Date().toISOString(), ...extra })
      .eq("id", selected.id);
    if (error) { toast.error(error.message); return; }
    toast.success(`Estado: ${STATUS_LABEL[newStatus]}`);
    qc.invalidateQueries({ queryKey: ["admin-referrals"] });
    setSelected(null);
  };

  const routeToCompany = async () => {
    if (!selected || !companyToRoute) { toast.error("Elige una empresa"); return; }
    const { error } = await supabase
      .from("job_applications")
      .update({
        company_id: companyToRoute,
        routed_company_id: companyToRoute,
        status: "approved_to_invite",
        admin_notes: adminNotes || null,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", selected.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Referido enviado a la empresa");
    qc.invalidateQueries({ queryKey: ["admin-referrals"] });
    setSelected(null);
  };

  if (!isGlobalOwner) {
    return (
      <div className="p-8">
        <Card className="p-6 max-w-md">
          <h2 className="font-semibold">Acceso restringido</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Solo la propiedad de la plataforma puede ver el fondo global de referidos.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <OperationalWorkspace
      title="Referidos"
      context="Candidatos externos enviados por socios o clientes. Nada se activa hasta que lo derives e invites."
      search={
        <WorkspaceSearch
          value={search}
          onChange={setSearch}
          placeholder="Buscar nombre, teléfono, correo o referencia…"
        />
      }
      tabs={
        <WorkspaceTabs
          items={[
            { key: "all", label: "Todos", count: counts.all },
            ...STATUSES.map((s) => ({
              key: s as string,
              label: STATUS_LABEL[s],
              count: counts[s] ?? 0,
              tone: s === "possible_duplicate" ? ("warning" as const) : undefined,
            })),
          ]}
          value={statusFilter}
          onChange={setStatusFilter}
          ariaLabel="Estado del referido"
        />
      }
    >
      <div className="pt-3">
        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />Cargando…
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-border/50 bg-card/40 p-12 text-center text-sm text-muted-foreground">
            Todavía no hay referidos.
          </div>
        ) : (
          <div className="rounded-xl border border-border/50 bg-card divide-y divide-border/30 overflow-hidden">
            {filtered.map((r: any) => {
              const duplicate = !!(r.duplicate_of_application_id || r.duplicate_of_user_id);
              return (
                <EntityCard
                  key={r.id}
                  bare
                  density="compact"
                  kind="worker"
                  name={`${r.first_name ?? ""} ${r.last_name ?? ""}`.trim() || "Sin nombre"}
                  reference={r.reference_code ?? "—"}
                  status={r.status === "rejected" || r.status === "archived" ? "historical" : "attention"}
                  primaryDetail={[r.phone, r.email, r.city].filter(Boolean).join(" · ")}
                  badges={[
                    { label: STATUS_LABEL[r.status] ?? r.status, tone: "info" as const },
                    ...(duplicate ? [{ label: "Posible duplicado", tone: "warning" as const }] : []),
                    ...(r.intake_kind ? [{ label: String(r.intake_kind), tone: "info" as const }] : []),
                  ]}
                  onClick={() => openDetail(r)}
                  actions={
                    <span className="text-[11px] text-muted-foreground tabular-nums">
                      {format(new Date(r.created_at), "d MMM · HH:mm")}
                    </span>
                  }
                />
              );
            })}
          </div>
        )}
      </div>

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle>{selected.first_name} {selected.last_name}</SheetTitle>
                <SheetDescription className="font-mono text-xs">{selected.reference_code}</SheetDescription>
              </SheetHeader>

              <div className="space-y-5 mt-6">
                <Card className="p-3 space-y-1 text-sm">
                  <div><span className="text-muted-foreground">Teléfono:</span> {selected.phone}</div>
                  {selected.email && <div><span className="text-muted-foreground">Correo:</span> {selected.email}</div>}
                  {selected.city && <div><span className="text-muted-foreground">Ciudad:</span> {selected.city}</div>}
                  {selected.preferred_contact_method && (
                    <div><span className="text-muted-foreground">Contacto preferido:</span> {selected.preferred_contact_method}</div>
                  )}
                  <div><span className="text-muted-foreground">Origen:</span> {selected.intake_kind}</div>
                  {selected.referral_source && (
                    <div><span className="text-muted-foreground">Fuente:</span> {selected.referral_source}</div>
                  )}
                  <div><span className="text-muted-foreground">Consentimiento:</span> {selected.consent_at ? format(new Date(selected.consent_at), "PPp") : "—"}</div>
                </Card>

                {(selected.duplicate_of_application_id || selected.duplicate_of_user_id) && (
                  <Card className="p-3 bg-orange-500/5 border-orange-500/30">
                    <div className="flex items-center gap-2 text-sm">
                      <AlertTriangle className="h-4 w-4 text-orange-600" />
                      <span className="font-medium">Posible duplicado detectado</span>
                    </div>
                    {selected.duplicate_of_application_id && (
                      <div className="text-xs text-muted-foreground mt-1">Postulación: <span className="font-mono">{selected.duplicate_of_application_id}</span></div>
                    )}
                    {selected.duplicate_of_user_id && (
                      <div className="text-xs text-muted-foreground mt-1">Persona: <span className="font-mono">{selected.duplicate_of_user_id}</span></div>
                    )}
                  </Card>
                )}

                {selected.notes && (
                  <div>
                    <Label>Notas de quien lo envió</Label>
                    <Card className="p-3 text-sm whitespace-pre-wrap">{selected.notes}</Card>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="an">Notas internas</Label>
                  <Textarea id="an" value={adminNotes} onChange={(e) => setAdminNotes(e.target.value)} rows={3} />
                </div>

                <div className="space-y-2">
                  <Label>Derivar a empresa</Label>
                  <div className="flex gap-2">
                    <Select value={companyToRoute} onValueChange={setCompanyToRoute}>
                      <SelectTrigger><SelectValue placeholder="Elige una empresa…" /></SelectTrigger>
                      <SelectContent>
                        {companies.map((c: any) => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button onClick={routeToCompany} disabled={!companyToRoute}>Derivar y aprobar</Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Derivar asigna el referido a una empresa y lo marca como Aprobado. La persona NO queda activa: hay que invitarla aparte.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2">
                  <Button variant="outline" onClick={() => updateStatus("needs_contact")}>Falta contacto</Button>
                  <Button variant="outline" onClick={() => updateStatus("matched_existing_person")}>Coincide con persona</Button>
                  <Button variant="outline" onClick={() => updateStatus("archived")}>Archivar</Button>
                  <Button variant="destructive" onClick={() => updateStatus("rejected", { rejection_reason: adminNotes || "No encaja" })}>Rechazar</Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </OperationalWorkspace>
  );
}

function Label({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return <label htmlFor={htmlFor} className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{children}</label>;
}
