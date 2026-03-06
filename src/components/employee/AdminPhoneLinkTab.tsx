import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Phone, Loader2, Shield, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

/**
 * Component for linking a phone number to an admin profile
 * so the admin can also log in via phone+PIN.
 * This is shown in the admin's own settings, not per-employee.
 */
export function AdminPhoneLinkSection() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [phone, setPhone] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    fetchProfile();
  }, [user?.id]);

  const fetchProfile = async () => {
    const { data } = await supabase
      .from("profiles")
      .select("phone_number, phone_login_enabled")
      .eq("user_id", user!.id)
      .maybeSingle();
    setPhone((data as any)?.phone_number ?? "");
    setEnabled((data as any)?.phone_login_enabled ?? false);
    setLoading(false);
  };

  const handleSave = async () => {
    if (!user?.id) return;
    if (enabled && !phone.trim()) {
      toast({ title: "Teléfono requerido", description: "Ingresa un número para habilitar el login por teléfono", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ phone_number: phone.trim() || null, phone_login_enabled: enabled } as any)
      .eq("user_id", user.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Configuración guardada" });
    }
    setSaving(false);
  };

  if (loading) return <div className="py-6 text-center text-xs text-muted-foreground">Cargando...</div>;

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 flex items-center gap-1.5">
        <Phone className="h-3.5 w-3.5" />
        Login por teléfono
      </h3>
      <Card className="rounded-xl border-border/40">
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Habilitar acceso por teléfono</p>
              <p className="text-[10px] text-muted-foreground">Podrás iniciar sesión con tu número de teléfono y PIN además de email/contraseña</p>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>

          {enabled && (
            <>
              <Separator />
              <div className="space-y-2">
                <Label className="text-xs">Número de teléfono</Label>
                <Input
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="+1 (555) 123-4567"
                  className="h-9"
                />
                <p className="text-[10px] text-muted-foreground">
                  Usa el mismo formato que tus empleados (ej. +15551234567)
                </p>
              </div>
            </>
          )}

          <Button size="sm" className="w-full" onClick={handleSave} disabled={saving}>
            {saving ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Guardando...</> : "Guardar configuración"}
          </Button>

          {enabled && phone && (
            <div className="flex items-center gap-2 text-xs text-earning">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Login por teléfono configurado
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
