import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Settings2, Link2, Copy, ExternalLink, Loader2, Save,
  UtensilsCrossed, Car, SprayCan, ChefHat, Briefcase,
} from "lucide-react";

const WORKER_TYPES_ALL = [
  { value: "waiter", label: "Mesero", icon: UtensilsCrossed },
  { value: "driver", label: "Driver", icon: Car },
  { value: "cleaning", label: "Limpieza", icon: SprayCan },
  { value: "kitchen", label: "Cocina", icon: ChefHat },
  { value: "other", label: "Otro", icon: Briefcase },
];

interface Config {
  application_enabled: boolean;
  require_email: boolean;
  require_document: boolean;
  require_work_auth: boolean;
  require_emergency_contact: boolean;
  allow_file_uploads: boolean;
  auto_send_invite_on_approval: boolean;
  visible_worker_types: string[];
  intro_text: string;
  cover_image_url: string;
}

const DEFAULTS: Config = {
  application_enabled: true,
  require_email: false,
  require_document: false,
  require_work_auth: false,
  require_emergency_contact: false,
  allow_file_uploads: true,
  auto_send_invite_on_approval: false,
  visible_worker_types: ["waiter", "driver", "cleaning", "kitchen", "other"],
  intro_text: "",
  cover_image_url: "",
};

export default function ApplicationSettings() {
  const { selectedCompanyId, selectedCompany } = useCompany();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Config>(DEFAULTS);
  const [dirty, setDirty] = useState(false);

  const { data: existing, isLoading } = useQuery({
    queryKey: ["application-config", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data } = await supabase
        .from("application_configs")
        .select("*")
        .eq("company_id", selectedCompanyId!)
        .maybeSingle();
      return data;
    },
  });

  useEffect(() => {
    if (existing) {
      setForm({
        application_enabled: existing.application_enabled,
        require_email: existing.require_email,
        require_document: existing.require_document,
        require_work_auth: existing.require_work_auth,
        require_emergency_contact: existing.require_emergency_contact,
        allow_file_uploads: existing.allow_file_uploads,
        auto_send_invite_on_approval: existing.auto_send_invite_on_approval,
        visible_worker_types: (existing.visible_worker_types as string[]) ?? DEFAULTS.visible_worker_types,
        intro_text: existing.intro_text ?? "",
        cover_image_url: existing.cover_image_url ?? "",
      });
    }
  }, [existing]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        company_id: selectedCompanyId!,
        application_enabled: form.application_enabled,
        require_email: form.require_email,
        require_document: form.require_document,
        require_work_auth: form.require_work_auth,
        require_emergency_contact: form.require_emergency_contact,
        allow_file_uploads: form.allow_file_uploads,
        auto_send_invite_on_approval: form.auto_send_invite_on_approval,
        visible_worker_types: form.visible_worker_types,
        intro_text: form.intro_text || null,
        cover_image_url: form.cover_image_url || null,
      };
      if (existing) {
        const { error } = await supabase.from("application_configs").update(payload).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("application_configs").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["application-config"] });
      toast.success("Configuración guardada");
      setDirty(false);
    },
    onError: () => toast.error("Error al guardar"),
  });

  const update = <K extends keyof Config>(key: K, value: Config[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setDirty(true);
  };

  const toggleWorkerType = (wt: string) => {
    const current = form.visible_worker_types;
    const next = current.includes(wt) ? current.filter((t) => t !== wt) : [...current, wt];
    update("visible_worker_types", next);
  };

  const applicationLink = selectedCompany?.slug ? `${window.location.origin}/apply/${selectedCompany.slug}` : "";

  if (isLoading) {
    return (
      <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <PageHeader
        title="Configuración de Aplicaciones"
        subtitle="Personaliza el formulario de aplicación para nuevos trabajadores"
        icon={Settings2}
      />

      {/* Application Link */}
      <div className="bg-card rounded-xl border p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Link de aplicación</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Comparte este enlace para recibir solicitudes</p>
          </div>
          <Switch checked={form.application_enabled} onCheckedChange={(v) => update("application_enabled", v)} />
        </div>
        {form.application_enabled && applicationLink && (
          <div className="flex items-center gap-2">
            <Input value={applicationLink} readOnly className="text-xs font-mono h-9 rounded-lg bg-muted/30" />
            <Button size="sm" variant="outline" className="shrink-0 h-9 gap-1.5" onClick={() => { navigator.clipboard.writeText(applicationLink); toast.success("Copiado"); }}>
              <Copy className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" variant="outline" className="shrink-0 h-9 gap-1.5" onClick={() => window.open(applicationLink, "_blank")}>
              <ExternalLink className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>

      {/* Intro Text */}
      <div className="bg-card rounded-xl border p-5 space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Texto de bienvenida</h3>
        <Textarea
          value={form.intro_text}
          onChange={(e) => update("intro_text", e.target.value)}
          placeholder="Completa este proceso rápido para comenzar a trabajar con nosotros."
          className="min-h-[80px] rounded-xl text-sm"
        />
        <div className="space-y-1.5">
          <Label className="text-xs">URL de imagen de portada</Label>
          <Input value={form.cover_image_url} onChange={(e) => update("cover_image_url", e.target.value)} placeholder="https://..." className="h-9 rounded-lg text-xs" />
        </div>
      </div>

      {/* Worker Types */}
      <div className="bg-card rounded-xl border p-5 space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Tipos de trabajador visibles</h3>
        <p className="text-xs text-muted-foreground">Selecciona qué categorías verán los aplicantes</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {WORKER_TYPES_ALL.map((wt) => {
            const Icon = wt.icon;
            const active = form.visible_worker_types.includes(wt.value);
            return (
              <button key={wt.value} onClick={() => toggleWorkerType(wt.value)} className={cn(
                "flex items-center gap-2 p-3 rounded-xl border-2 transition-all text-xs font-semibold",
                active ? "border-primary bg-primary/5 text-primary" : "border-border/60 bg-card text-muted-foreground hover:border-primary/30"
              )}>
                <Icon className="h-4 w-4" />
                {wt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Required Fields */}
      <div className="bg-card rounded-xl border p-5 space-y-4">
        <h3 className="text-sm font-semibold text-foreground">Campos requeridos</h3>
        <SettingToggle label="Email requerido" description="Los aplicantes deben proporcionar un email" checked={form.require_email} onChange={(v) => update("require_email", v)} />
        <SettingToggle label="Documento requerido" description="Los aplicantes deben subir un documento de identificación" checked={form.require_document} onChange={(v) => update("require_document", v)} />
        <SettingToggle label="Contacto de emergencia" description="Campo obligatorio de contacto de emergencia" checked={form.require_emergency_contact} onChange={(v) => update("require_emergency_contact", v)} />
        <SettingToggle label="Permitir subida de archivos" description="Habilitar la subida de documentos en la aplicación" checked={form.allow_file_uploads} onChange={(v) => update("allow_file_uploads", v)} />
      </div>

      {/* Approval Settings */}
      <div className="bg-card rounded-xl border p-5 space-y-4">
        <h3 className="text-sm font-semibold text-foreground">Al aprobar</h3>
        <SettingToggle label="Enviar invitación automáticamente" description="Enviar invitación al portal al aprobar una solicitud" checked={form.auto_send_invite_on_approval} onChange={(v) => update("auto_send_invite_on_approval", v)} />
      </div>

      {/* Save */}
      <div className="flex justify-end">
        <Button onClick={() => saveMutation.mutate()} disabled={!dirty || saveMutation.isPending} className="gap-2 rounded-xl text-primary-foreground">
          {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Guardar configuración
        </Button>
      </div>
    </div>
  );
}

function SettingToggle({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between py-2">
      <div>
        <p className="text-xs font-medium text-foreground">{label}</p>
        <p className="text-[10px] text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
