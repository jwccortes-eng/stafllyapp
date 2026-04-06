import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Sparkles, MessageCircle, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { useContactSales } from "@/hooks/useBilling";

interface UpgradeRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function UpgradeRequestDialog({ open, onOpenChange }: UpgradeRequestDialogProps) {
  const { selectedCompanyId, companies } = useCompany();
  const { user } = useAuth();
  const { planCode, hasRequestedUpgrade } = useSubscription();
  const { contactSales } = useContactSales();
  const queryClient = useQueryClient();

  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState(user?.email ?? "");
  const [contactPhone, setContactPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const company = companies?.find((c) => c.id === selectedCompanyId);

  const handleSubmit = async () => {
    if (!selectedCompanyId || !user) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.from("upgrade_requests" as any).insert({
        company_id: selectedCompanyId,
        requested_by: user.id,
        plan_requested: "paid_manual",
        status: "new",
        company_name: company?.name || null,
        contact_name: contactName || null,
        contact_email: contactEmail || null,
        contact_phone: contactPhone || null,
        current_plan: planCode,
        notes: notes || null,
        source: "app_dialog",
      } as any);

      if (error) throw error;

      // Update company billing_status
      await supabase
        .from("companies")
        .update({
          billing_status: "contact_requested",
          upgrade_requested_at: new Date().toISOString(),
        } as any)
        .eq("id", selectedCompanyId);

      queryClient.invalidateQueries({ queryKey: ["company-plan"] });
      setSubmitted(true);
      toast({ title: "Solicitud enviada", description: "Nuestro equipo te contactará pronto." });
    } catch {
      toast({ title: "Error", description: "No se pudo enviar la solicitud.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    // Reset after animation
    setTimeout(() => { setSubmitted(false); setNotes(""); }, 300);
  };

  if (hasRequestedUpgrade || submitted) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-md">
          <div className="flex flex-col items-center text-center gap-4 py-6">
            <div className="h-14 w-14 rounded-2xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <CheckCircle2 className="h-7 w-7 text-green-600" />
            </div>
            <div className="space-y-1.5">
              <h3 className="text-lg font-bold">¡Solicitud recibida!</h3>
              <p className="text-sm text-muted-foreground max-w-sm">
                Nuestro equipo se pondrá en contacto contigo para activar el plan Pro de <strong>{company?.name}</strong>.
              </p>
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => contactSales("whatsapp")} className="gap-1.5">
                <MessageCircle className="h-4 w-4" />
                WhatsApp
              </Button>
              <Button variant="ghost" size="sm" onClick={handleClose}>
                Cerrar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Solicitar Plan Pro
          </DialogTitle>
          <DialogDescription>
            Completa tus datos y nuestro equipo te contactará para activar funciones avanzadas.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-lg bg-muted/50 p-3 text-sm">
            <p className="font-medium">Empresa: {company?.name}</p>
            <p className="text-muted-foreground text-xs mt-0.5">
              Plan actual: {planCode === "free" ? "Starter (Gratis)" : "Pro"}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ur-name">Nombre de contacto</Label>
              <Input
                id="ur-name"
                placeholder="Tu nombre"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                maxLength={100}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ur-phone">Teléfono / WhatsApp</Label>
              <Input
                id="ur-phone"
                placeholder="+1 809 000 0000"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                maxLength={30}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ur-email">Email de contacto</Label>
            <Input
              id="ur-email"
              type="email"
              placeholder="tu@empresa.com"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              maxLength={255}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ur-notes">¿Qué necesitas? (opcional)</Label>
            <Textarea
              id="ur-notes"
              placeholder="Ej: Necesitamos nómina para 50 empleados, reportes avanzados..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              maxLength={1000}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={submitting} className="gap-1.5">
            <Sparkles className="h-4 w-4" />
            {submitting ? "Enviando..." : "Enviar solicitud"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
