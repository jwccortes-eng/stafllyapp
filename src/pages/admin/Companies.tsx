import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
import { Search, MoreHorizontal, Pencil, Building2, Plus, Users, LayoutGrid, FlaskConical, Copy, Check, CreditCard } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import CompanyUsersDialog from "@/components/CompanyUsersDialog";
import CompanyModulesDialog from "@/components/CompanyModulesDialog";

interface CompanyRecord {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  is_sandbox: boolean;
  invite_code: string;
  company_code: number | null;
  created_at: string;
  user_count?: number;
  active_modules?: number;
  total_modules?: number;
  plan?: string;
  plan_status?: string;
}

const PLAN_OPTIONS = [
  { value: "free", label: "Free", color: "bg-muted text-muted-foreground" },
  { value: "pro", label: "Pro", color: "bg-primary/10 text-primary" },
  { value: "enterprise", label: "Enterprise", color: "bg-chart-4/10 text-chart-4" },
] as const;

export default function CompaniesPage() {
  const { role } = useAuth();
  const { refetch } = useCompany();
  const [companies, setCompanies] = useState<CompanyRecord[]>([]);
  const [search, setSearch] = useState("");
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

    // Get user counts per company
    const [{ data: counts }, { data: modules }, { data: subs }] = await Promise.all([
      supabase.from("company_users").select("company_id"),
      supabase.from("company_modules").select("company_id, is_active"),
      supabase.from("subscriptions").select("company_id, plan, status"),
    ]);

    const countMap: Record<string, number> = {};
    counts?.forEach(c => {
      countMap[c.company_id] = (countMap[c.company_id] || 0) + 1;
    });

    const activeModMap: Record<string, number> = {};
    const totalModMap: Record<string, number> = {};
    modules?.forEach(m => {
      totalModMap[m.company_id] = (totalModMap[m.company_id] || 0) + 1;
      if (m.is_active) activeModMap[m.company_id] = (activeModMap[m.company_id] || 0) + 1;
    });

    const planMap: Record<string, { plan: string; status: string }> = {};
    subs?.forEach(s => { planMap[s.company_id] = { plan: s.plan, status: s.status }; });

    setCompanies(data.map(c => ({
      ...c,
      user_count: countMap[c.id] || 0,
      active_modules: activeModMap[c.id] || 0,
      total_modules: totalModMap[c.id] || 0,
      plan: planMap[c.id]?.plan || "free",
      plan_status: planMap[c.id]?.status || "none",
    })));
  };

  useEffect(() => { fetchCompanies(); }, []);

  const generateSlug = (name: string) =>
    name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const slug = formSlug || generateSlug(formName);

    const { error } = await supabase
      .from("companies")
      .insert({ name: formName.trim(), slug } as any);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Empresa creada" });
      setCreateOpen(false);
      setFormName("");
      setFormSlug("");
      fetchCompanies();
      refetch();
    }
    setLoading(false);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editCompany) return;
    setLoading(true);

    const { error } = await supabase
      .from("companies")
      .update({ name: formName.trim(), slug: formSlug || generateSlug(formName) } as any)
      .eq("id", editCompany.id);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Empresa actualizada" });
      setEditCompany(null);
      fetchCompanies();
      refetch();
    }
    setLoading(false);
  };

  const toggleActive = async (company: CompanyRecord) => {
    await supabase
      .from("companies")
      .update({ is_active: !company.is_active } as any)
      .eq("id", company.id);
    fetchCompanies();
    refetch();
  };

  const openEdit = (c: CompanyRecord) => {
    setEditCompany(c);
    setFormName(c.name);
    setFormSlug(c.slug);
  };

  const openAssignPlan = (c: CompanyRecord) => {
    setPlanCompany(c);
    setSelectedPlan(c.plan || "free");
  };

  const handleAssignPlan = async () => {
    if (!planCompany) return;
    setLoading(true);

    // Upsert into subscriptions table
    const { data: existing } = await supabase
      .from("subscriptions")
      .select("id")
      .eq("company_id", planCompany.id)
      .maybeSingle();

    if (existing) {
      await supabase
        .from("subscriptions")
        .update({ plan: selectedPlan, status: "active", updated_at: new Date().toISOString() } as any)
        .eq("id", existing.id);
    } else {
      await supabase
        .from("subscriptions")
        .insert({ company_id: planCompany.id, plan: selectedPlan, status: "active" } as any);
    }

    toast({ title: "Plan asignado", description: `${planCompany.name} → ${selectedPlan.toUpperCase()}` });
    setPlanCompany(null);
    fetchCompanies();
    setLoading(false);
  };

  const filtered = companies.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  if (role !== "owner") {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-muted-foreground">No tienes acceso a este módulo.</p>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        variant="1"
        icon={Building2}
        title="Empresas"
        subtitle="Gestiona tus unidades de negocio"
        rightSlot={
          <div className="flex gap-2">
            {!companies.some(c => c.is_sandbox) && (
              <Button variant="outline" onClick={async () => {
                const { error } = await supabase.from("companies").insert({ name: "Sandbox", slug: "sandbox", is_sandbox: true } as any);
                if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
                else { toast({ title: "Sandbox creado" }); fetchCompanies(); refetch(); }
              }}>
                <FlaskConical className="h-4 w-4 mr-2" />
                Crear Sandbox
              </Button>
            )}
            <Button onClick={() => { setCreateOpen(true); setFormName(""); setFormSlug(""); }}>
              <Plus className="h-4 w-4 mr-2" />
              Nueva empresa
            </Button>
          </div>
        }
      />

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{companies.length}</p>
              <p className="text-xs text-muted-foreground">Total empresas</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="p-2 rounded-lg bg-chart-1/10 text-chart-1">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{companies.filter(c => c.is_active).length}</p>
              <p className="text-xs text-muted-foreground">Activas</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="p-2 rounded-lg bg-chart-4/10 text-chart-4">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{companies.reduce((s, c) => s + (c.user_count || 0), 0)}</p>
              <p className="text-xs text-muted-foreground">Usuarios totales</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="data-table-wrapper">
        <div className="p-4 border-b">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar empresa..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>
        </div>
        <Table>
          <TableHeader>
           <TableRow>
              <TableHead className="w-16">#ID</TableHead>
              <TableHead>Nombre</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Código invitación</TableHead>
              <TableHead className="hidden lg:table-cell">Slug</TableHead>
              <TableHead>Usuarios</TableHead>
              <TableHead className="hidden md:table-cell">Módulos</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                 <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                   No hay empresas
                </TableCell>
              </TableRow>
            ) : (
              filtered.map(c => {
                const planOption = PLAN_OPTIONS.find(p => p.value === (c.plan || "free"))!;
                return (
                <TableRow key={c.id}>
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
                     <Badge className={`text-[10px] font-bold ${planOption.color} border-0`}>
                       {planOption.label}
                     </Badge>
                   </TableCell>
                  <TableCell>
                    <button
                      onClick={() => copyCode(c.invite_code)}
                      className="inline-flex items-center gap-1.5 font-mono text-xs bg-muted/50 hover:bg-muted px-2 py-1 rounded-lg transition-colors group"
                    >
                      <span className="tracking-wider">{c.invite_code}</span>
                      {copiedCode === c.invite_code ? (
                        <Check className="h-3 w-3 text-primary" />
                      ) : (
                        <Copy className="h-3 w-3 text-muted-foreground group-hover:text-foreground" />
                      )}
                    </button>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground hidden lg:table-cell">{c.slug}</TableCell>
                   <TableCell>
                     <Badge variant="outline">{c.user_count} usuarios</Badge>
                   </TableCell>
                   <TableCell className="hidden md:table-cell">
                     {c.total_modules ? (
                       <Badge variant="outline" className={c.active_modules === c.total_modules ? "border-primary/30 text-primary" : ""}>
                         <LayoutGrid className="h-3 w-3 mr-1" />
                         {c.active_modules}/{c.total_modules}
                       </Badge>
                     ) : (
                       <span className="text-xs text-muted-foreground">Sin configurar</span>
                     )}
                   </TableCell>
                  <TableCell>
                    <Badge variant={c.is_active ? "default" : "secondary"}>
                      {c.is_active ? "Activa" : "Inactiva"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEdit(c)}>
                          <Pencil className="h-4 w-4 mr-2" />Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openAssignPlan(c)}>
                          <CreditCard className="h-4 w-4 mr-2" />Asignar plan
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setUsersCompany(c)}>
                          <Users className="h-4 w-4 mr-2" />Usuarios
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setModulesCompany(c)}>
                          <LayoutGrid className="h-4 w-4 mr-2" />Módulos
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => toggleActive(c)}>
                          {c.is_active ? "Desactivar" : "Activar"}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nueva empresa</DialogTitle>
            <DialogDescription>Crea una nueva unidad de negocio</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <Label>Nombre</Label>
              <Input value={formName} onChange={e => { setFormName(e.target.value); setFormSlug(generateSlug(e.target.value)); }} required placeholder="Mi Empresa" />
            </div>
            <div className="space-y-2">
              <Label>Slug (URL)</Label>
              <Input value={formSlug} onChange={e => setFormSlug(e.target.value)} required placeholder="mi-empresa" />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Creando..." : "Crear empresa"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editCompany} onOpenChange={v => { if (!v) setEditCompany(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar empresa</DialogTitle>
            <DialogDescription>{editCompany?.name}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleUpdate} className="space-y-4">
            <div className="space-y-2">
              <Label>Nombre</Label>
              <Input value={formName} onChange={e => setFormName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Slug (URL)</Label>
              <Input value={formSlug} onChange={e => setFormSlug(e.target.value)} required />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Guardando..." : "Guardar cambios"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Company Users Dialog */}
      <CompanyUsersDialog
        companyId={usersCompany?.id ?? null}
        companyName={usersCompany?.name ?? ""}
        open={!!usersCompany}
        onOpenChange={(v) => { if (!v) setUsersCompany(null); }}
        onUpdated={fetchCompanies}
      />

      {/* Company Modules Dialog */}
      <CompanyModulesDialog
        companyId={modulesCompany?.id ?? null}
        companyName={modulesCompany?.name ?? ""}
        isSandbox={modulesCompany?.is_sandbox ?? false}
        open={!!modulesCompany}
        onOpenChange={(v) => { if (!v) setModulesCompany(null); }}
      />

      {/* Assign Plan Dialog */}
      <Dialog open={!!planCompany} onOpenChange={v => { if (!v) setPlanCompany(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Asignar plan</DialogTitle>
            <DialogDescription>
              {planCompany?.name} — Asigna un plan sin pasar por Stripe
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Plan</Label>
              <Select value={selectedPlan} onValueChange={setSelectedPlan}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PLAN_OPTIONS.map(p => (
                    <SelectItem key={p.value} value={p.value}>
                      <div className="flex items-center gap-2">
                        <span className={`inline-block h-2 w-2 rounded-full ${p.value === "free" ? "bg-muted-foreground" : p.value === "pro" ? "bg-primary" : "bg-chart-4"}`} />
                        {p.label}
                        {p.value === "pro" && <span className="text-muted-foreground text-xs">— $49/mes</span>}
                        {p.value === "enterprise" && <span className="text-muted-foreground text-xs">— $149/mes</span>}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
              Esto activa el plan inmediatamente sin cobro. Ideal para pilotos, cortesías o migraciones.
            </p>
            <Button onClick={handleAssignPlan} className="w-full" disabled={loading}>
              {loading ? "Asignando..." : `Asignar ${PLAN_OPTIONS.find(p => p.value === selectedPlan)?.label}`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
