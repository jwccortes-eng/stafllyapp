import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  Building2, Users, LayoutGrid, UserPlus, CheckCircle2,
  ArrowRight, ArrowLeft, Sparkles, Rocket,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";

const MODULE_OPTIONS = [
  { key: "periods", label: "Periodos de nómina", group: "Nómina" },
  { key: "import", label: "Importación", group: "Nómina" },
  { key: "movements", label: "Novedades", group: "Nómina" },
  { key: "summary", label: "Resumen", group: "Nómina" },
  { key: "reports", label: "Reportes", group: "Nómina" },
  { key: "employees", label: "Empleados", group: "Catálogos" },
  { key: "concepts", label: "Conceptos", group: "Catálogos" },
  { key: "shifts", label: "Turnos", group: "Operaciones" },
  { key: "timeclock", label: "Reloj de asistencia", group: "Operaciones" },
  { key: "clients", label: "Clientes", group: "Operaciones" },
  { key: "locations", label: "Ubicaciones", group: "Operaciones" },
  { key: "announcements", label: "Anuncios", group: "Comunicación" },
  { key: "chat", label: "Chat interno", group: "Comunicación" },
];

const STEPS = [
  { key: "company", label: "Empresa", icon: Building2 },
  { key: "modules", label: "Módulos", icon: LayoutGrid },
  { key: "admin", label: "Admin", icon: UserPlus },
  { key: "done", label: "Listo", icon: Rocket },
];

export default function OnboardingWizard() {
  const { role } = useAuth();
  const { refetch } = useCompany();
  const { toast } = useToast();

  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);

  // Step 1: Company
  const [companyName, setCompanyName] = useState("");
  const [companySlug, setCompanySlug] = useState("");
  const [createdCompanyId, setCreatedCompanyId] = useState<string | null>(null);

  // Step 2: Modules
  const [selectedModules, setSelectedModules] = useState<Set<string>>(
    new Set(["periods", "employees", "concepts", "movements", "summary", "reports", "import"])
  );

  // Step 3: Admin
  const [adminEmail, setAdminEmail] = useState("");
  const [adminName, setAdminName] = useState("");
  const [adminPassword, setAdminPassword] = useState("");

  const generateSlug = (name: string) =>
    name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  const handleCreateCompany = async () => {
    if (!companyName.trim()) return;
    setLoading(true);
    const slug = companySlug || generateSlug(companyName);

    const { data, error } = await supabase
      .from("companies")
      .insert({ name: companyName.trim(), slug } as any)
      .select("id")
      .single();

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else if (data) {
      setCreatedCompanyId(data.id);
      // Log activity
      await supabase.rpc("log_activity", {
        _action: "create",
        _entity_type: "company",
        _entity_id: data.id,
        _company_id: data.id,
        _details: { name: companyName.trim(), slug } as any,
      });
      setStep(1);
      refetch();
    }
    setLoading(false);
  };

  const handleConfigureModules = async () => {
    if (!createdCompanyId) return;
    setLoading(true);

    const modules = Array.from(selectedModules).map(m => ({
      company_id: createdCompanyId,
      module: m,
      is_active: true,
      activated_at: new Date().toISOString(),
    }));

    const { error } = await supabase
      .from("company_modules")
      .insert(modules as any);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setStep(2);
    }
    setLoading(false);
  };

  const handleInviteAdmin = async () => {
    if (!adminEmail || !adminPassword) {
      setStep(3); // Skip admin invite
      return;
    }
    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("invite-admin", {
        body: {
          email: adminEmail,
          password: adminPassword,
          full_name: adminName,
          role: "admin",
          company_id: createdCompanyId,
        },
      });

      if (error) throw error;
      if (data?.error) {
        toast({ title: "Error", description: data.error, variant: "destructive" });
      } else {
        await supabase.rpc("log_activity", {
          _action: "invite",
          _entity_type: "user",
          _company_id: createdCompanyId,
          _details: { email: adminEmail, role: "admin" } as any,
        });
        toast({ title: "Admin invitado exitosamente" });
        setStep(3);
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setLoading(false);
  };

  const toggleModule = (key: string) => {
    setSelectedModules(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (role !== "owner") {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-muted-foreground">No tienes acceso a este módulo.</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <PageHeader
        variant="3"
        title="Nueva Empresa"
        subtitle="Configura una nueva empresa en 3 pasos"
        className="text-center"
      />

      {/* Steps indicator */}
      <div className="flex items-center justify-center gap-2 mb-8">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          const isActive = i === step;
          const isDone = i < step;
          return (
            <div key={s.key} className="flex items-center gap-2">
              {i > 0 && <div className={`h-px w-8 ${isDone ? "bg-primary" : "bg-border"}`} />}
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                isActive ? "bg-primary text-primary-foreground" :
                isDone ? "bg-primary/10 text-primary" :
                "bg-muted text-muted-foreground"
              }`}>
                {isDone ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
                <span className="hidden sm:inline">{s.label}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Step 0: Company */}
      {step === 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              Datos de la empresa
            </CardTitle>
            <CardDescription>Ingresa el nombre y URL única de la nueva empresa</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Nombre de la empresa</Label>
              <Input
                value={companyName}
                onChange={e => {
                  setCompanyName(e.target.value);
                  setCompanySlug(generateSlug(e.target.value));
                }}
                placeholder="Mi Empresa S.A."
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label>Slug (URL)</Label>
              <Input
                value={companySlug}
                onChange={e => setCompanySlug(e.target.value)}
                placeholder="mi-empresa"
              />
            </div>
            <Button onClick={handleCreateCompany} disabled={loading || !companyName.trim()} className="w-full gap-2">
              {loading ? "Creando..." : "Crear empresa"}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Step 1: Modules */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LayoutGrid className="h-5 w-5 text-primary" />
              Módulos activos
            </CardTitle>
            <CardDescription>Selecciona qué funcionalidades tendrá esta empresa</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {["Nómina", "Catálogos", "Operaciones", "Comunicación"].map(group => {
              const mods = MODULE_OPTIONS.filter(m => m.group === group);
              return (
                <div key={group}>
                  <p className="text-xs font-semibold uppercase text-muted-foreground mb-2">{group}</p>
                  <div className="grid grid-cols-2 gap-2">
                    {mods.map(m => (
                      <button
                        key={m.key}
                        onClick={() => toggleModule(m.key)}
                        className={`flex items-center gap-2 p-3 rounded-lg border text-sm font-medium transition-colors text-left ${
                          selectedModules.has(m.key)
                            ? "bg-primary/10 border-primary/30 text-primary"
                            : "bg-card border-border text-muted-foreground hover:bg-muted/50"
                        }`}
                      >
                        {selectedModules.has(m.key) && <CheckCircle2 className="h-4 w-4 shrink-0" />}
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => setStep(0)} className="gap-2">
                <ArrowLeft className="h-4 w-4" /> Atrás
              </Button>
              <Button onClick={handleConfigureModules} disabled={loading || selectedModules.size === 0} className="flex-1 gap-2">
                {loading ? "Configurando..." : "Configurar módulos"}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Admin */}
      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-primary" />
              Invitar administrador
            </CardTitle>
            <CardDescription>Opcional: crea un usuario administrador para esta empresa</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Nombre completo</Label>
              <Input
                value={adminName}
                onChange={e => setAdminName(e.target.value)}
                placeholder="Juan Pérez"
              />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={adminEmail}
                onChange={e => setAdminEmail(e.target.value)}
                placeholder="admin@empresa.com"
              />
            </div>
            <div className="space-y-2">
              <Label>Contraseña temporal</Label>
              <Input
                type="password"
                value={adminPassword}
                onChange={e => setAdminPassword(e.target.value)}
                placeholder="Min. 6 caracteres"
                minLength={6}
              />
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => setStep(1)} className="gap-2">
                <ArrowLeft className="h-4 w-4" /> Atrás
              </Button>
              <Button
                variant="ghost"
                onClick={() => setStep(3)}
                className="text-muted-foreground"
              >
                Omitir
              </Button>
              <Button
                onClick={handleInviteAdmin}
                disabled={loading || !adminEmail || !adminPassword}
                className="flex-1 gap-2"
              >
                {loading ? "Invitando..." : "Invitar admin"}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Done */}
      {step === 3 && (
        <Card className="text-center">
          <CardContent className="py-12 space-y-4">
            <div className="h-16 w-16 rounded-full gradient-primary flex items-center justify-center mx-auto">
              <Rocket className="h-8 w-8 text-white" />
            </div>
            <h2 className="font-heading text-2xl font-bold">¡Empresa lista!</h2>
            <p className="text-muted-foreground max-w-sm mx-auto">
              <strong>{companyName}</strong> fue creada con {selectedModules.size} módulos activos.
              {adminEmail && ` Se invitó a ${adminEmail} como administrador.`}
            </p>
            <div className="flex justify-center gap-3 pt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setStep(0);
                  setCompanyName("");
                  setCompanySlug("");
                  setCreatedCompanyId(null);
                  setAdminEmail("");
                  setAdminName("");
                  setAdminPassword("");
                  setSelectedModules(new Set(["periods", "employees", "concepts", "movements", "summary", "reports", "import"]));
                }}
              >
                Crear otra empresa
              </Button>
              <Button asChild className="gap-2">
                <a href="/app/companies">
                  Ver empresas <ArrowRight className="h-4 w-4" />
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
