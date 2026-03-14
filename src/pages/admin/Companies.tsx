import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Search, MoreHorizontal, Pencil, Building2, Plus, Users, LayoutGrid,
  FlaskConical, Copy, Check, CreditCard, ChevronDown, ChevronRight,
  DollarSign, TrendingUp, Shield, UserCog, User, Crown, CircleDot,
  CopyPlus, Loader2,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import CompanyUsersDialog from "@/components/CompanyUsersDialog";
import CompanyModulesDialog from "@/components/CompanyModulesDialog";

/* ── Types ── */
interface CompanyUser {
  user_id: string;
  role: string;
  email?: string;
  full_name?: string;
}

interface CompanyRecord {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  is_sandbox: boolean;
  invite_code: string;
  company_code: number | null;
  created_at: string;
  user_count: number;
  users: CompanyUser[];
  active_modules: number;
  total_modules: number;
  module_names: string[];
  plan: string;
  plan_status: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  current_period_end: string | null;
  mrr: number;
  employee_count: number;
}

const PLAN_OPTIONS = [
  { value: "free", label: "Starter", color: "bg-muted text-muted-foreground", price: 0 },
  { value: "pro", label: "Pro", color: "bg-primary/10 text-primary", price: 49 },
  { value: "enterprise", label: "Enterprise", color: "bg-chart-4/10 text-chart-4", price: 149 },
] as const;

const PLAN_PRICES: Record<string, number> = { free: 0, pro: 49, enterprise: 149 };

const ROLE_ICON: Record<string, React.ElementType> = {
  owner: Crown, admin: Shield, manager: UserCog, employee: User,
};
const ROLE_COLOR: Record<string, string> = {
  owner: "text-chart-4", admin: "text-primary", manager: "text-chart-1", employee: "text-muted-foreground",
};

/* ── Component ── */
export default function CompaniesPage() {
  const { role } = useAuth();
  const { refetch } = useCompany();
  const [companies, setCompanies] = useState<CompanyRecord[]>([]);
  const [search, setSearch] = useState("");
  const [planFilter, setPlanFilter] = useState<string>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [editCompany, setEditCompany] = useState<CompanyRecord | null>(null);
  const [formName, setFormName] = useState("");
  const [formSlug, setFormSlug] = useState("");
  const [loading, setLoading] = useState(false);
  const [usersCompany, setUsersCompany] = useState<CompanyRecord | null>(null);
  const [modulesCompany, setModulesCompany] = useState<CompanyRecord | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [planCompany, setPlanCompany] = useState<CompanyRecord | null>(null);
  const [selectedPlan, setSelectedPlan] = useState("free");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [duplicating, setDuplicating] = useState(false);
  const { toast } = useToast();

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    toast({ title: "Código copiado" });
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const fetchCompanies = async () => {
    const { data } = await supabase
      .from("companies")
      .select("id, name, slug, is_active, is_sandbox, invite_code, company_code, created_at")
      .order("company_code");

    if (!data) return;

    const [{ data: cuData }, { data: modules }, { data: subs }, { data: profiles }, { data: empCounts }] = await Promise.all([
      supabase.from("company_users").select("company_id, user_id, role"),
      supabase.from("company_modules").select("company_id, is_active, module"),
      supabase.from("subscriptions").select("company_id, plan, status, stripe_customer_id, stripe_subscription_id, current_period_end"),
      supabase.from("profiles").select("user_id, email, full_name"),
      supabase.from("employees").select("company_id, id"),
    ]);

    const profileMap = new Map((profiles ?? []).map(p => [p.user_id, p]));

    const cuByCompany: Record<string, CompanyUser[]> = {};
    (cuData ?? []).forEach(cu => {
      const p = profileMap.get(cu.user_id);
      if (!cuByCompany[cu.company_id]) cuByCompany[cu.company_id] = [];
      cuByCompany[cu.company_id].push({
        user_id: cu.user_id,
        role: cu.role,
        email: p?.email ?? "",
        full_name: p?.full_name ?? "",
      });
    });

    const activeModMap: Record<string, number> = {};
    const totalModMap: Record<string, number> = {};
    const modNamesMap: Record<string, string[]> = {};
    (modules ?? []).forEach(m => {
      totalModMap[m.company_id] = (totalModMap[m.company_id] || 0) + 1;
      if (m.is_active) {
        activeModMap[m.company_id] = (activeModMap[m.company_id] || 0) + 1;
        if (!modNamesMap[m.company_id]) modNamesMap[m.company_id] = [];
        modNamesMap[m.company_id].push(m.module);
      }
    });

    const subMap: Record<string, any> = {};
    (subs ?? []).forEach(s => { subMap[s.company_id] = s; });

    const empCountMap: Record<string, number> = {};
    (empCounts ?? []).forEach(e => {
      empCountMap[e.company_id] = (empCountMap[e.company_id] || 0) + 1;
    });

    setCompanies(data.map(c => {
      const sub = subMap[c.id];
      const plan = sub?.plan ?? "free";
      const isActive = sub?.status === "active" || sub?.status === "trialing";
      return {
        ...c,
        user_count: cuByCompany[c.id]?.length ?? 0,
        users: cuByCompany[c.id] ?? [],
        active_modules: activeModMap[c.id] || 0,
        total_modules: totalModMap[c.id] || 0,
        module_names: modNamesMap[c.id] || [],
        plan,
        plan_status: sub?.status ?? "none",
        stripe_customer_id: sub?.stripe_customer_id ?? null,
        stripe_subscription_id: sub?.stripe_subscription_id ?? null,
        current_period_end: sub?.current_period_end ?? null,
        mrr: isActive ? (PLAN_PRICES[plan] ?? 0) : 0,
        employee_count: empCountMap[c.id] || 0,
      };
    }));
  };

  useEffect(() => { fetchCompanies(); }, []);

  /* ── KPIs ── */
  const kpis = useMemo(() => {
    const totalMrr = companies.reduce((s, c) => s + c.mrr, 0);
    const activeSubs = companies.filter(c => c.plan_status === "active" || c.plan_status === "trialing").length;
    const totalEmployees = companies.reduce((s, c) => s + c.employee_count, 0);
    const totalUsers = companies.reduce((s, c) => s + c.user_count, 0);
    return { totalMrr, activeSubs, totalEmployees, totalUsers };
  }, [companies]);

  /* ── Filters ── */
  const filtered = useMemo(() => {
    let list = companies;
    if (search) list = list.filter(c => c.name.toLowerCase().includes(search.toLowerCase()));
    if (planFilter !== "all") list = list.filter(c => c.plan === planFilter);
    return list;
  }, [companies, search, planFilter]);

  /* ── Helpers ── */
  const generateSlug = (name: string) =>
    name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const slug = formSlug || generateSlug(formName);
    const { error } = await supabase.from("companies").insert({ name: formName.trim(), slug } as any);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else { toast({ title: "Empresa creada" }); setCreateOpen(false); setFormName(""); setFormSlug(""); fetchCompanies(); refetch(); }
    setLoading(false);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editCompany) return;
    setLoading(true);
    const { error } = await supabase.from("companies").update({ name: formName.trim(), slug: formSlug || generateSlug(formName) } as any).eq("id", editCompany.id);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else { toast({ title: "Empresa actualizada" }); setEditCompany(null); fetchCompanies(); refetch(); }
    setLoading(false);
  };

  const toggleActive = async (company: CompanyRecord) => {
    await supabase.from("companies").update({ is_active: !company.is_active } as any).eq("id", company.id);
    fetchCompanies(); refetch();
  };

  const openEdit = (c: CompanyRecord) => { setEditCompany(c); setFormName(c.name); setFormSlug(c.slug); };

  const openAssignPlan = (c: CompanyRecord) => { setPlanCompany(c); setSelectedPlan(c.plan || "free"); };

  const handleAssignPlan = async () => {
    if (!planCompany) return;
    setLoading(true);
    const { data: existing } = await supabase.from("subscriptions").select("id").eq("company_id", planCompany.id).maybeSingle();
    if (existing) await supabase.from("subscriptions").update({ plan: selectedPlan, status: "active", updated_at: new Date().toISOString() } as any).eq("id", existing.id);
    else await supabase.from("subscriptions").insert({ company_id: planCompany.id, plan: selectedPlan, status: "active" } as any);
    toast({ title: "Plan asignado", description: `${planCompany.name} → ${selectedPlan.toUpperCase()}` });
    setPlanCompany(null); fetchCompanies(); setLoading(false);
  };

  const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" }) : "—";

  if (role !== "owner" && role !== "developer") {
    return <div className="flex items-center justify-center min-h-[60vh]"><p className="text-muted-foreground">No tienes acceso a este módulo.</p></div>;
  }

  return (
    <div>
      <PageHeader
        variant="1"
        icon={Building2}
        title="Cuadro Maestro de Empresas"
        subtitle="Vista consolidada: planes, facturación, usuarios y cartera"
        rightSlot={
          <div className="flex gap-2">
            {!companies.some(c => c.is_sandbox) && (
              <Button variant="outline" onClick={async () => {
                const { error } = await supabase.from("companies").insert({ name: "Sandbox", slug: "sandbox", is_sandbox: true } as any);
                if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
                else { toast({ title: "Sandbox creado" }); fetchCompanies(); refetch(); }
              }}>
                <FlaskConical className="h-4 w-4 mr-2" />Crear Sandbox
              </Button>
            )}
            <Button onClick={() => { setCreateOpen(true); setFormName(""); setFormSlug(""); }}>
              <Plus className="h-4 w-4 mr-2" />Nueva empresa
            </Button>
          </div>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <Card><CardContent className="flex items-center gap-3 p-4">
          <div className="p-2 rounded-lg bg-primary/10 text-primary"><Building2 className="h-5 w-5" /></div>
          <div><p className="text-2xl font-bold">{companies.length}</p><p className="text-xs text-muted-foreground">Empresas</p></div>
        </CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 p-4">
          <div className="p-2 rounded-lg bg-chart-1/10 text-chart-1"><TrendingUp className="h-5 w-5" /></div>
          <div><p className="text-2xl font-bold">{kpis.activeSubs}</p><p className="text-xs text-muted-foreground">Suscripciones activas</p></div>
        </CardContent></Card>
        <Card className="border-primary/30 bg-primary/5"><CardContent className="flex items-center gap-3 p-4">
          <div className="p-2 rounded-lg bg-primary/10 text-primary"><DollarSign className="h-5 w-5" /></div>
          <div><p className="text-2xl font-bold text-primary">${kpis.totalMrr}</p><p className="text-xs text-muted-foreground">MRR mensual</p></div>
        </CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 p-4">
          <div className="p-2 rounded-lg bg-chart-4/10 text-chart-4"><Users className="h-5 w-5" /></div>
          <div><p className="text-2xl font-bold">{kpis.totalUsers}</p><p className="text-xs text-muted-foreground">Usuarios admin</p></div>
        </CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 p-4">
          <div className="p-2 rounded-lg bg-chart-2/10 text-chart-2"><User className="h-5 w-5" /></div>
          <div><p className="text-2xl font-bold">{kpis.totalEmployees}</p><p className="text-xs text-muted-foreground">Empleados totales</p></div>
        </CardContent></Card>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-3 items-center mb-4">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar empresa..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <div className="flex gap-1">
          {[{ value: "all", label: "Todas" }, ...PLAN_OPTIONS.map(p => ({ value: p.value, label: p.label }))].map(f => (
            <Button key={f.value} size="sm" variant={planFilter === f.value ? "default" : "outline"} onClick={() => setPlanFilter(f.value)} className="text-xs h-8">
              {f.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Master table */}
      <div className="data-table-wrapper">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10"></TableHead>
              <TableHead className="w-16">#ID</TableHead>
              <TableHead>Empresa</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Estado suscripción</TableHead>
              <TableHead>MRR</TableHead>
              <TableHead>Usuarios</TableHead>
              <TableHead>Empleados</TableHead>
              <TableHead>Módulos</TableHead>
              <TableHead>Vence</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow><TableCell colSpan={12} className="text-center text-muted-foreground py-8">No hay empresas</TableCell></TableRow>
            ) : filtered.map(c => {
              const planOpt = PLAN_OPTIONS.find(p => p.value === c.plan) ?? PLAN_OPTIONS[0];
              const isExpanded = expandedId === c.id;

              return (
                <>{/* Main row */}
                <TableRow key={c.id} className="cursor-pointer hover:bg-muted/40" onClick={() => setExpandedId(isExpanded ? null : c.id)}>
                  <TableCell className="pr-0">
                    {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                  </TableCell>
                  <TableCell>
                    <span className="font-mono text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-md">
                      {String(c.company_code ?? 0).padStart(3, '0')}
                    </span>
                  </TableCell>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      {c.name}
                      {c.is_sandbox && <Badge variant="outline" className="text-[10px]"><FlaskConical className="h-3 w-3 mr-1" />Sandbox</Badge>}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge className={`text-[10px] font-bold ${planOpt.color} border-0`}>{planOpt.label}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`text-[10px] ${c.plan_status === "active" ? "border-chart-1/40 text-chart-1" : c.plan_status === "trialing" ? "border-chart-4/40 text-chart-4" : ""}`}>
                      {c.plan_status === "active" ? "Activa" : c.plan_status === "trialing" ? "Trial" : c.plan_status === "canceled" ? "Cancelada" : "Sin plan"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className={`font-semibold text-sm ${c.mrr > 0 ? "text-chart-1" : "text-muted-foreground"}`}>
                      ${c.mrr}
                    </span>
                  </TableCell>
                  <TableCell><Badge variant="outline">{c.user_count}</Badge></TableCell>
                  <TableCell><Badge variant="outline">{c.employee_count}</Badge></TableCell>
                  <TableCell>
                    {c.total_modules ? (
                      <Badge variant="outline" className={c.active_modules === c.total_modules ? "border-primary/30 text-primary" : ""}>
                        <LayoutGrid className="h-3 w-3 mr-1" />{c.active_modules}/{c.total_modules}
                      </Badge>
                    ) : <span className="text-xs text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{fmtDate(c.current_period_end)}</TableCell>
                  <TableCell>
                    <Badge variant={c.is_active ? "default" : "secondary"}>{c.is_active ? "Activa" : "Inactiva"}</Badge>
                  </TableCell>
                  <TableCell onClick={e => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEdit(c)}><Pencil className="h-4 w-4 mr-2" />Editar</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openAssignPlan(c)}><CreditCard className="h-4 w-4 mr-2" />Asignar plan</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setUsersCompany(c)}><Users className="h-4 w-4 mr-2" />Usuarios</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setModulesCompany(c)}><LayoutGrid className="h-4 w-4 mr-2" />Módulos</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => toggleActive(c)}>{c.is_active ? "Desactivar" : "Activar"}</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>

                {/* Expanded detail */}
                {isExpanded && (
                  <TableRow key={`${c.id}-detail`} className="bg-muted/20 hover:bg-muted/20">
                    <TableCell colSpan={12} className="p-0">
                      <div className="px-6 py-4">
                        <Tabs defaultValue="general" className="w-full">
                          <TabsList className="h-8">
                            <TabsTrigger value="general" className="text-xs h-7">General</TabsTrigger>
                            <TabsTrigger value="users" className="text-xs h-7">Usuarios & Roles</TabsTrigger>
                            <TabsTrigger value="billing" className="text-xs h-7">Facturación</TabsTrigger>
                            <TabsTrigger value="modules" className="text-xs h-7">Módulos</TabsTrigger>
                          </TabsList>

                          {/* General */}
                          <TabsContent value="general">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2">
                              <div className="space-y-1">
                                <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">Slug</p>
                                <p className="text-sm font-mono">{c.slug}</p>
                              </div>
                              <div className="space-y-1">
                                <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">Código invitación</p>
                                <button onClick={() => copyCode(c.invite_code)} className="inline-flex items-center gap-1.5 font-mono text-sm bg-muted/50 hover:bg-muted px-2 py-1 rounded-lg transition-colors">
                                  {c.invite_code}
                                  {copiedCode === c.invite_code ? <Check className="h-3 w-3 text-primary" /> : <Copy className="h-3 w-3 text-muted-foreground" />}
                                </button>
                              </div>
                              <div className="space-y-1">
                                <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">Creada</p>
                                <p className="text-sm">{fmtDate(c.created_at)}</p>
                              </div>
                              <div className="space-y-1">
                                <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">Tipo</p>
                                <p className="text-sm">{c.is_sandbox ? "🧪 Sandbox" : "Producción"}</p>
                              </div>
                            </div>
                          </TabsContent>

                          {/* Users & Roles */}
                          <TabsContent value="users">
                            <div className="pt-2">
                              {c.users.length === 0 ? (
                                <p className="text-sm text-muted-foreground py-4 text-center">No hay usuarios asignados</p>
                              ) : (
                                <div className="border rounded-lg overflow-hidden">
                                  <Table>
                                    <TableHeader>
                                      <TableRow>
                                        <TableHead className="text-xs">Usuario</TableHead>
                                        <TableHead className="text-xs">Email</TableHead>
                                        <TableHead className="text-xs">Rol</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {c.users.map(u => {
                                        const Icon = ROLE_ICON[u.role] ?? User;
                                        const color = ROLE_COLOR[u.role] ?? "text-muted-foreground";
                                        return (
                                          <TableRow key={u.user_id}>
                                            <TableCell className="text-sm font-medium">{u.full_name || "—"}</TableCell>
                                            <TableCell className="text-xs text-muted-foreground">{u.email}</TableCell>
                                            <TableCell>
                                              <div className="flex items-center gap-1.5">
                                                <Icon className={`h-3.5 w-3.5 ${color}`} />
                                                <span className={`text-xs font-medium capitalize ${color}`}>{u.role}</span>
                                              </div>
                                            </TableCell>
                                          </TableRow>
                                        );
                                      })}
                                    </TableBody>
                                  </Table>
                                </div>
                              )}
                              <Button variant="outline" size="sm" className="mt-3 text-xs" onClick={() => setUsersCompany(c)}>
                                <Users className="h-3.5 w-3.5 mr-1.5" />Gestionar usuarios
                              </Button>
                            </div>
                          </TabsContent>

                          {/* Billing */}
                          <TabsContent value="billing">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2">
                              <div className="space-y-1">
                                <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">Plan actual</p>
                                <Badge className={`${planOpt.color} border-0 font-bold`}>{planOpt.label}</Badge>
                              </div>
                              <div className="space-y-1">
                                <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">Valor mensual</p>
                                <p className="text-lg font-bold text-chart-1">${c.mrr}<span className="text-xs text-muted-foreground font-normal">/mes</span></p>
                              </div>
                              <div className="space-y-1">
                                <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">Estado</p>
                                <p className="text-sm capitalize">{c.plan_status === "none" ? "Sin suscripción" : c.plan_status}</p>
                              </div>
                              <div className="space-y-1">
                                <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">Próximo cobro</p>
                                <p className="text-sm">{fmtDate(c.current_period_end)}</p>
                              </div>
                              <div className="space-y-1">
                                <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">Stripe Customer</p>
                                <p className="text-xs font-mono text-muted-foreground">{c.stripe_customer_id || "—"}</p>
                              </div>
                              <div className="space-y-1">
                                <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">Stripe Subscription</p>
                                <p className="text-xs font-mono text-muted-foreground">{c.stripe_subscription_id || "—"}</p>
                              </div>
                              <div className="space-y-1">
                                <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">Valor cartera anual</p>
                                <p className="text-lg font-bold">${c.mrr * 12}<span className="text-xs text-muted-foreground font-normal">/año</span></p>
                              </div>
                            </div>
                            <Button variant="outline" size="sm" className="mt-3 text-xs" onClick={() => openAssignPlan(c)}>
                              <CreditCard className="h-3.5 w-3.5 mr-1.5" />Cambiar plan
                            </Button>
                          </TabsContent>

                          {/* Modules */}
                          <TabsContent value="modules">
                            <div className="pt-2">
                              {c.module_names.length === 0 ? (
                                <p className="text-sm text-muted-foreground py-4 text-center">Sin módulos configurados</p>
                              ) : (
                                <div className="flex flex-wrap gap-2">
                                  {c.module_names.map(m => (
                                    <Badge key={m} variant="outline" className="text-xs capitalize bg-primary/5 border-primary/20 text-primary">
                                      <CircleDot className="h-3 w-3 mr-1" />{m}
                                    </Badge>
                                  ))}
                                </div>
                              )}
                              <div className="flex items-center gap-2 mt-3">
                                <Badge variant="outline" className="text-xs">{c.active_modules} activos / {c.total_modules} total</Badge>
                                <Button variant="outline" size="sm" className="text-xs" onClick={() => setModulesCompany(c)}>
                                  <LayoutGrid className="h-3.5 w-3.5 mr-1.5" />Gestionar módulos
                                </Button>
                              </div>
                            </div>
                          </TabsContent>
                        </Tabs>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
                </>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* ── Dialogs ── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Nueva empresa</DialogTitle><DialogDescription>Crea una nueva unidad de negocio</DialogDescription></DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2"><Label>Nombre</Label><Input value={formName} onChange={e => { setFormName(e.target.value); setFormSlug(generateSlug(e.target.value)); }} required placeholder="Mi Empresa" /></div>
            <div className="space-y-2"><Label>Slug (URL)</Label><Input value={formSlug} onChange={e => setFormSlug(e.target.value)} required placeholder="mi-empresa" /></div>
            <Button type="submit" className="w-full" disabled={loading}>{loading ? "Creando..." : "Crear empresa"}</Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editCompany} onOpenChange={v => { if (!v) setEditCompany(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Editar empresa</DialogTitle><DialogDescription>{editCompany?.name}</DialogDescription></DialogHeader>
          <form onSubmit={handleUpdate} className="space-y-4">
            <div className="space-y-2"><Label>Nombre</Label><Input value={formName} onChange={e => setFormName(e.target.value)} required /></div>
            <div className="space-y-2"><Label>Slug (URL)</Label><Input value={formSlug} onChange={e => setFormSlug(e.target.value)} required /></div>
            <Button type="submit" className="w-full" disabled={loading}>{loading ? "Guardando..." : "Guardar cambios"}</Button>
          </form>
        </DialogContent>
      </Dialog>

      <CompanyUsersDialog companyId={usersCompany?.id ?? null} companyName={usersCompany?.name ?? ""} open={!!usersCompany} onOpenChange={v => { if (!v) setUsersCompany(null); }} onUpdated={fetchCompanies} />
      <CompanyModulesDialog companyId={modulesCompany?.id ?? null} companyName={modulesCompany?.name ?? ""} isSandbox={modulesCompany?.is_sandbox ?? false} open={!!modulesCompany} onOpenChange={v => { if (!v) setModulesCompany(null); }} />

      <Dialog open={!!planCompany} onOpenChange={v => { if (!v) setPlanCompany(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Asignar plan</DialogTitle><DialogDescription>{planCompany?.name} — Asigna un plan sin pasar por Stripe</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Plan</Label>
              <Select value={selectedPlan} onValueChange={setSelectedPlan}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PLAN_OPTIONS.map(p => (
                    <SelectItem key={p.value} value={p.value}>
                      <div className="flex items-center gap-2">
                        <span className={`inline-block h-2 w-2 rounded-full ${p.value === "free" ? "bg-muted-foreground" : p.value === "pro" ? "bg-primary" : "bg-chart-4"}`} />
                        {p.label}
                        {p.price > 0 && <span className="text-muted-foreground text-xs">— ${p.price}/mes</span>}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">Esto activa el plan inmediatamente sin cobro. Ideal para pilotos, cortesías o migraciones.</p>
            <Button onClick={handleAssignPlan} className="w-full" disabled={loading}>{loading ? "Asignando..." : `Asignar ${PLAN_OPTIONS.find(p => p.value === selectedPlan)?.label}`}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
