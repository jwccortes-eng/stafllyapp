import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { Copy, QrCode, MessageCircle, Send, Search, CheckCircle2, Smartphone, AlertTriangle, KeyRound, Phone, X } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useEffect } from "react";
import { OperationalWorkspace } from "@/components/stafly-ui/OperationalWorkspace";
import { Users } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
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

type FilterKey = "all" | "ready" | "incomplete" | "active";

export default function InviteEmployees() {
  const { selectedCompanyId, selectedCompany } = useCompany();
  const { toast } = useToast();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
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
    // Phase B: resolve PIN existence via boolean RPC (parallel).
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
      // One-time reveal: show PIN only right after generation so admin can share it.
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
    // Phase B: never embed raw PIN. If admin needs to share a fresh one, use Generate PIN
    // (server returns it once via toast) or open EmployeeInviteDialog.
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
    incomplete: employees.filter(e => getStatus(e) === "incomplete").length,
    active: employees.filter(e => getStatus(e) === "active").length,
  }), [employees]);

  const filtered = useMemo(() => {
    let list = employees;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(e => `${e.first_name} ${e.last_name} ${e.phone_number ?? ""} ${e.email ?? ""}`.toLowerCase().includes(q));
    }
    if (filter !== "all") list = list.filter(e => getStatus(e) === filter);
    return list;
  }, [employees, search, filter]);

  // Sort: incomplete first, then ready, then active
  const sorted = useMemo(() => {
    const order = { incomplete: 0, ready: 1, active: 2 };
    return [...filtered].sort((a, b) => order[getStatus(a)] - order[getStatus(b)]);
  }, [filtered]);

  const searchSlot = (
    <div className="relative w-full">
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Buscar persona…"
        className="pl-8 h-8 text-xs"
      />
      {search && (
        <button
          onClick={() => setSearch("")}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground"
          aria-label="Limpiar búsqueda"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );

  return (
    <OperationalWorkspace
      title="Invitaciones"
      context={`Acceso al portal de ${companyName} · ${filtered.length} personas`}
      search={searchSlot}
      action={
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          onClick={() => {
            navigator.clipboard.writeText(portalUrl);
            toast({ title: "Link copiado" });
          }}
        >
          <Copy className="h-3.5 w-3.5 mr-1.5" /> Copiar link
        </Button>
      }
      metrics={[
        { label: "Listos para invitar", value: counts.ready, tone: "primary", active: filter === "ready", onClick: () => setFilter(filter === "ready" ? "all" : "ready") },
        { label: "Datos incompletos", value: counts.incomplete, tone: "warning", active: filter === "incomplete", onClick: () => setFilter(filter === "incomplete" ? "all" : "incomplete") },
        { label: "Ya activos", value: counts.active, tone: "success", active: filter === "active", onClick: () => setFilter(filter === "active" ? "all" : "active") },
      ]}
      adminTitle="Acceso al portal"
      adminHint={portalUrl}
      admin={
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Smartphone className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold">Link del portal</p>
              <p className="text-[10px] text-muted-foreground truncate">{portalUrl}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="bg-card p-1.5 rounded-lg border shrink-0">
              <QRCodeSVG value={portalUrl} size={48} />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold">Código QR</p>
              <p className="text-[10px] text-muted-foreground">Muestra o imprime para acceso rápido</p>
            </div>
          </div>
        </div>
      }
    >


      {/* Employee list */}
      {loading ? (
        <div className="space-y-1">{[1,2,3,4,5].map(i => <div key={i} className="animate-pulse bg-muted rounded-lg h-14" />)}</div>
      ) : sorted.length === 0 ? (
        <EmptyState icon={Users} title="Sin empleados" description={search ? "Intenta con otro término" : "No hay empleados registrados"} />
      ) : (
        <div className="rounded-xl border border-border/40 bg-card overflow-hidden divide-y divide-border/20">
          {sorted.map(emp => {
            const status = getStatus(emp);
            const hasPhone = !!(emp.phone_number ?? "").replace(/\D/g, "");
            const hasPin = !!emp.has_access_pin;
            const isCopied = copiedId === emp.id;

            return (
              <div key={emp.id} className={cn(
                "flex items-center gap-3 px-3 py-2.5 transition-colors",
                status === "active" && "opacity-50",
              )}>
                <EmployeeAvatar firstName={emp.first_name} lastName={emp.last_name} avatarUrl={emp.avatar_url} gender={emp.gender} size="sm" />

                {/* Identity */}
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold truncate">{formatPersonName(`${emp.first_name} ${emp.last_name}`)}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {emp.phone_number && (
                      <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                        <Phone className="h-2.5 w-2.5" /> {emp.phone_number}
                      </span>
                    )}
                    {emp.employee_role && (
                      <span className="text-[9px] text-muted-foreground/60">{emp.employee_role}</span>
                    )}
                  </div>
                </div>

                {/* Readiness indicators */}
                <div className="flex items-center gap-1 shrink-0">
                  <TooltipProvider delayDuration={200}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className={cn(
                          "h-5 w-5 rounded-full flex items-center justify-center text-[8px]",
                          hasPhone ? "bg-[hsl(var(--earning)/0.1)] text-[hsl(var(--earning))]" : "bg-destructive/10 text-destructive"
                        )}>
                          <Phone className="h-2.5 w-2.5" />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-[10px]">{hasPhone ? "Teléfono ✓" : "Sin teléfono"}</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <TooltipProvider delayDuration={200}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className={cn(
                          "h-5 w-5 rounded-full flex items-center justify-center text-[8px]",
                          hasPin ? "bg-[hsl(var(--earning)/0.1)] text-[hsl(var(--earning))]" : "bg-warning/10 text-warning"
                        )}>
                          <KeyRound className="h-2.5 w-2.5" />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-[10px]">{hasPin ? "PIN configurado" : "Sin PIN"}</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>

                {/* Status + Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  {status === "active" ? (
                    <Badge variant="success" className="text-[9px] py-0 px-1.5">
                      <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" /> Activo
                    </Badge>
                  ) : status === "incomplete" ? (
                    <div className="flex items-center gap-1">
                      {!hasPin && (
                        <Button
                          variant="outline" size="sm"
                          className="h-6 text-[9px] px-2"
                          onClick={() => generatePin(emp.id)}
                          disabled={generatingPin === emp.id}
                        >
                          {generatingPin === emp.id ? "..." : "Generar PIN"}
                        </Button>
                      )}
                    </div>
                  ) : (
                    /* ready */
                    <div className="flex items-center gap-0.5">
                      <Button
                        variant="ghost" size="icon"
                        className="h-7 w-7 text-[#25D366] hover:bg-[#25D366]/10"
                        onClick={() => shareWhatsApp(emp)}
                        title="WhatsApp"
                      >
                        <MessageCircle className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost" size="icon"
                        className={cn("h-7 w-7", isCopied && "text-[hsl(var(--earning))]")}
                        onClick={() => copyInvite(emp)}
                        title="Copiar invitación"
                      >
                        {isCopied ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </OperationalWorkspace>
  );
}
