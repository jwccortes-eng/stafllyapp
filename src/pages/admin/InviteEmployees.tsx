/**
 * Invitaciones — P0 ZERO NOISE VISUAL PASS.
 *
 * Una sola pregunta en pantalla: «¿Quién necesita acceso al portal?».
 *
 *  - Cabecera mínima (título + buscador + una acción).
 *  - Pestañas de estado en lugar de chips + panel administrativo.
 *  - Acceso al portal (link + QR) como acción secundaria en diálogo.
 *  - Una fila por persona con EntityCard canónico.
 *
 * No cambia lógica de acceso, PIN ni datos: sólo la superficie visual.
 */
import { useState, useMemo, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Copy, MessageCircle, CheckCircle2, Smartphone, Users } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import {
  OperationalWorkspace,
  WorkspaceSearch,
  WorkspaceTabs,
} from "@/components/stafly-ui/OperationalWorkspace";
import { EmptyState } from "@/components/ui/empty-state";
import { EntityCard } from "@/components/entities/EntityCard";
import type { EntityBadgeSpec, EntityStatusTone } from "@/lib/entities/entity-identity";
import { formatPersonName } from "@/lib/format-helpers";
import { portalAuthUrl } from "@/lib/app-url";

interface Employee {
  id: string;
  first_name: string;
  last_name: string;
  phone_number: string | null;
  email: string | null;
  is_active: boolean;
  has_access_pin: boolean;
  user_id: string | null;
  avatar_url: string | null;
  gender: string | null;
  employee_role: string | null;
}

type FilterKey = "pending" | "ready" | "active" | "all";

export default function InviteEmployees() {
  const { selectedCompanyId, selectedCompany } = useCompany();
  const { toast } = useToast();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterKey>("pending");
  const [generatingPin, setGeneratingPin] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const companyName = selectedCompany?.name ?? "Stafly Core";
  const portalUrl = portalAuthUrl();

  useEffect(() => {
    if (!selectedCompanyId) return;
    fetchEmployees();
  }, [selectedCompanyId]);

  const fetchEmployees = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("employees")
      .select("id, first_name, last_name, phone_number, email, is_active, user_id, avatar_url, gender, employee_role")
      .eq("company_id", selectedCompanyId!)
      .eq("is_active", true)
      .order("first_name");
    const rows = (data ?? []) as any[];
    const { checkEmployeesHasPinBulk } = await import("@/lib/access-pin");
    const pinMap = await checkEmployeesHasPinBulk(rows.map(r => r.id));
    setEmployees(rows.map(r => ({ ...r, has_access_pin: !!pinMap[r.id] })));
    setLoading(false);
  };

  const generatePin = async (empId: string) => {
    setGeneratingPin(empId);
    const { data, error } = await supabase.functions.invoke("employee-auth", {
      body: { action: "provision", employee_id: empId },
    });
    if (error) {
      toast({ title: "Error", description: "No se pudo generar PIN", variant: "destructive" });
    } else {
      toast({ title: "PIN generado", description: `Nuevo PIN: ${data.pin} — cópialo ahora, no se mostrará más.` });
      fetchEmployees();
    }
    setGeneratingPin(null);
  };

  const getStatus = (emp: Employee) => {
    if (emp.user_id) return "active" as const;
    const hasPhone = !!(emp.phone_number ?? "").replace(/\D/g, "");
    return hasPhone && emp.has_access_pin ? "ready" as const : "incomplete" as const;
  };

  const buildInviteMessage = (emp: Employee) => {
    const pinLine = emp.has_access_pin
      ? `🔑 Usa tu PIN de 4 dígitos. Si no lo recuerdas, pide a tu admin que lo restablezca.`
      : `🔑 Pide a tu admin que te genere un PIN.`;
    return `¡Hola ${emp.first_name}! 👋\n\nTe invitamos a acceder al portal de empleados de *${companyName}*.\n\n📱 Accede aquí: ${portalUrl}\n📞 Tu teléfono: ${emp.phone_number ?? "N/A"}\n${pinLine}\n\nIngresa con tu número de teléfono y PIN.\n\n— Equipo ${companyName}`;
  };

  const normalizePhoneForWA = (raw: string): string => {
    let digits = raw.replace(/[^\d+]/g, "");
    if (digits.startsWith("+")) return digits.replace("+", "");
    if (digits.length === 10) return "1" + digits;
    if (digits.length === 11 && digits.startsWith("1")) return digits;
    return digits.length <= 10 ? "1" + digits : digits;
  };

  const shareWhatsApp = (emp: Employee) => {
    if (!emp.phone_number) return;
    const phone = normalizePhoneForWA(emp.phone_number);
    const msg = encodeURIComponent(buildInviteMessage(emp));
    window.open(`https://wa.me/${phone}?text=${msg}`, "_blank");
  };

  const copyInvite = (emp: Employee) => {
    navigator.clipboard.writeText(buildInviteMessage(emp));
    setCopiedId(emp.id);
    toast({ title: "Invitación copiada" });
    setTimeout(() => setCopiedId(null), 2000);
  };

  const counts = useMemo(() => ({
    all: employees.length,
    ready: employees.filter(e => getStatus(e) === "ready").length,
    pending: employees.filter(e => getStatus(e) === "incomplete").length,
    active: employees.filter(e => getStatus(e) === "active").length,
  }), [employees]);

  const filtered = useMemo(() => {
    let list = employees;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(e => `${e.first_name} ${e.last_name} ${e.phone_number ?? ""} ${e.email ?? ""}`.toLowerCase().includes(q));
    }
    if (filter === "ready") list = list.filter(e => getStatus(e) === "ready");
    if (filter === "pending") list = list.filter(e => getStatus(e) === "incomplete");
    if (filter === "active") list = list.filter(e => getStatus(e) === "active");
    return list;
  }, [employees, search, filter]);

  const sorted = useMemo(() => {
    const order = { incomplete: 0, ready: 1, active: 2 };
    return [...filtered].sort((a, b) => order[getStatus(a)] - order[getStatus(b)]);
  }, [filtered]);

  return (
    <OperationalWorkspace
      title="Invitaciones"
      search={
        <WorkspaceSearch
          value={search}
          onChange={setSearch}
          placeholder="Buscar persona…"
        />
      }
      action={
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 text-xs">
              <Smartphone className="h-3.5 w-3.5 mr-1.5" /> Acceso al portal
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-base">Acceso al portal</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col items-center gap-3 pt-1">
              <div className="bg-card p-2.5 rounded-xl border">
                <QRCodeSVG value={portalUrl} size={148} />
              </div>
              <p className="text-[11px] text-muted-foreground break-all text-center">{portalUrl}</p>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                onClick={() => {
                  navigator.clipboard.writeText(portalUrl);
                  toast({ title: "Link copiado" });
                }}
              >
                <Copy className="h-3.5 w-3.5 mr-1.5" /> Copiar link
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      }
      tabs={
        <WorkspaceTabs
          items={[
            { key: "pending", label: "Necesitan acceso", count: counts.pending, tone: "warning" as const },
            { key: "ready", label: "Listos para invitar", count: counts.ready },
            { key: "active", label: "Ya activos", count: counts.active },
            { key: "all", label: "Todos", count: counts.all },
          ]}
          value={filter}
          onChange={(k) => setFilter(k as FilterKey)}
          ariaLabel="Estado de invitación"
        />
      }
    >
      <div className="max-w-3xl">
        {loading ? (
          <div className="space-y-1">{[1,2,3,4,5].map(i => <div key={i} className="animate-pulse bg-muted rounded-lg h-14" />)}</div>
        ) : sorted.length === 0 ? (
          <EmptyState
            icon={Users}
            title={filter === "pending" ? "Nadie pendiente de acceso" : "Sin resultados"}
            description={search ? "Intenta con otro término." : "Cambia de pestaña para ver el resto del equipo."}
          />
        ) : (
          <div className="rounded-xl border border-border/40 bg-card overflow-hidden divide-y divide-border/20">
            {sorted.map(emp => {
              const status = getStatus(emp);
              const hasPhone = !!(emp.phone_number ?? "").replace(/\D/g, "");
              const hasPin = !!emp.has_access_pin;
              const isCopied = copiedId === emp.id;

              const tone: EntityStatusTone =
                status === "active" ? "historical" : status === "ready" ? "operational" : "attention";

              const badges: EntityBadgeSpec[] = [];
              if (status === "active") badges.push({ key: "on", label: "Portal activo", tone: "info" });
              if (status === "ready") badges.push({ key: "ready", label: "Listo para invitar", tone: "info" });
              if (!hasPhone) badges.push({ key: "phone", label: "Sin teléfono", tone: "critical" });
              if (!hasPin && status !== "active") badges.push({ key: "pin", label: "Sin PIN", tone: "warning" });

              return (
                <EntityCard
                  key={emp.id}
                  bare
                  density="compact"
                  kind="worker"
                  entityId={emp.id}
                  name={formatPersonName(`${emp.first_name} ${emp.last_name}`)}
                  avatarUrl={emp.avatar_url}
                  primaryDetail={emp.phone_number ?? "Sin teléfono"}
                  status={tone}
                  badges={badges}
                  maxBadges={2}
                  actions={
                    status === "active" ? (
                      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Activo
                      </span>
                    ) : status === "ready" ? (
                      <>
                        <Button
                          size="sm"
                          className="h-7 text-[11px] px-2.5"
                          onClick={() => shareWhatsApp(emp)}
                        >
                          <MessageCircle className="h-3.5 w-3.5 mr-1" /> Invitar
                        </Button>
                        <Button
                          variant="ghost" size="icon"
                          className="h-7 w-7"
                          onClick={() => copyInvite(emp)}
                          title="Copiar invitación"
                        >
                          {isCopied ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                        </Button>
                      </>
                    ) : !hasPin ? (
                      <Button
                        variant="outline" size="sm"
                        className="h-7 text-[11px] px-2.5"
                        onClick={() => generatePin(emp.id)}
                        disabled={generatingPin === emp.id}
                      >
                        {generatingPin === emp.id ? "…" : "Generar PIN"}
                      </Button>
                    ) : null
                  }
                />
              );
            })}
          </div>
        )}
      </div>
    </OperationalWorkspace>
  );
}
