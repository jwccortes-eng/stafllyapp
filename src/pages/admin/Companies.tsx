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
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Search, MoreHorizontal, Pencil, Building2, Plus, Users, LayoutGrid, FlaskConical } from "lucide-react";
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
  created_at: string;
  user_count?: number;
}

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
  const { toast } = useToast();

  const fetchCompanies = async () => {
    const { data } = await supabase
      .from("companies")
      .select("id, name, slug, is_active, is_sandbox, created_at")
      .order("name");

    if (!data) return;

    // Get user counts per company
    const { data: counts } = await supabase
      .from("company_users")
      .select("company_id");

    const countMap: Record<string, number> = {};
    counts?.forEach(c => {
      countMap[c.company_id] = (countMap[c.company_id] || 0) + 1;
    });

    setCompanies(data.map(c => ({ ...c, user_count: countMap[c.id] || 0 })));
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
      <div className="page-header">
        <div>
          <h1 className="page-title">Empresas</h1>
          <p className="page-subtitle">Gestiona tus unidades de negocio</p>
        </div>
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
      </div>

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
              <TableHead>Nombre</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>Usuarios</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  No hay empresas
                </TableCell>
              </TableRow>
            ) : (
              filtered.map(c => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      {c.name}
                      {c.is_sandbox && <Badge variant="outline" className="text-[10px]"><FlaskConical className="h-3 w-3 mr-1" />Sandbox</Badge>}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{c.slug}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{c.user_count} usuarios</Badge>
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
              ))
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
    </div>
  );
}
