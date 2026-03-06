import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useCompany } from "@/hooks/useCompany";
import {
  Send, MessageCircle, Phone, Copy, Check, Mail, QrCode, Link2, Smartphone,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee: Record<string, any>;
}

const PRODUCTION_URL = "https://staflyapps.com";

export function EmployeeInviteDialog({ open, onOpenChange, employee }: Props) {
  const { toast } = useToast();
  const { companies, selectedCompanyId } = useCompany();
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  const company = companies.find(c => c.id === selectedCompanyId);
  const slug = company?.slug ?? "";
  const companyName = company?.name ?? "la empresa";

  const portalUrl = `${PRODUCTION_URL}/${slug}`;
  const pin = employee.access_pin ?? "—";

  const message = `¡Hola ${employee.first_name}! 👋\n\nTe invitamos a acceder al portal de empleados de *${companyName}*.\n\n📱 Enlace: ${portalUrl}\n🔑 Tu PIN: ${pin}\n\nIngresa con tu número de teléfono y PIN.`;

  const phoneDigits = (employee.phone_number ?? "").replace(/\D/g, "");
  const fullPhone = phoneDigits.length === 10 ? `1${phoneDigits}` : phoneDigits;

  const waLink = `https://wa.me/${fullPhone}?text=${encodeURIComponent(message)}`;
  const smsLink = `sms:${employee.phone_number ?? ""}?body=${encodeURIComponent(message)}`;

  const copyLink = async () => {
    await navigator.clipboard.writeText(message);
    setCopied(true);
    toast({ title: "Copiado al portapapeles" });
    setTimeout(() => setCopied(false), 2000);
  };

  const sendEmail = async () => {
    if (!employee.email) {
      toast({ title: "Sin email", description: "Este empleado no tiene email registrado.", variant: "destructive" });
      return;
    }
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-invite-email", {
        body: {
          to: employee.email,
          subject: `Invitación al portal de ${companyName}`,
          html: `
            <div style="font-family: 'Sora', Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 28px;">
              <h1 style="font-size: 22px; font-weight: 700; color: hsl(220, 60%, 7%); margin: 0 0 16px;">¡Hola ${employee.first_name}! 👋</h1>
              <p style="font-size: 14px; color: hsl(220, 15%, 46%); line-height: 1.6; margin: 0 0 20px;">
                Te invitamos a acceder al portal de empleados de <strong>${companyName}</strong>.
              </p>
              <div style="background: hsl(220, 20%, 97%); border-radius: 12px; padding: 16px; margin: 0 0 20px;">
                <p style="font-size: 13px; color: hsl(220, 15%, 30%); margin: 0 0 8px;">📱 <strong>Enlace:</strong> <a href="${portalUrl}" style="color: hsl(222, 100%, 59%);">${portalUrl}</a></p>
                <p style="font-size: 13px; color: hsl(220, 15%, 30%); margin: 0;">🔑 <strong>Tu PIN:</strong> ${pin}</p>
              </div>
              <p style="font-size: 13px; color: hsl(220, 15%, 46%); line-height: 1.6;">
                Ingresa con tu número de teléfono y tu PIN de 4 dígitos.
              </p>
              <div style="margin: 24px 0;">
                <a href="${portalUrl}" style="display: inline-block; background: hsl(222, 100%, 59%); color: #ffffff; font-size: 14px; font-weight: 600; border-radius: 16px; padding: 12px 28px; text-decoration: none;">
                  Ir al portal
                </a>
              </div>
              <p style="font-size: 12px; color: hsl(220, 15%, 46%); margin: 30px 0 0;">
                Si no esperabas esta invitación, puedes ignorar este correo.
              </p>
            </div>
          `,
        },
      });
      if (error) throw error;
      setEmailSent(true);
      toast({ title: "Email enviado", description: `Invitación enviada a ${employee.email}` });
    } catch (err: any) {
      toast({ title: "Error al enviar", description: err.message ?? "Intenta de nuevo", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-4 w-4 text-primary" />
            Invitar a {employee.first_name}
          </DialogTitle>
          <DialogDescription>
            Envía las credenciales de acceso al portal del empleado
          </DialogDescription>
        </DialogHeader>

        {/* Credentials summary */}
        <div className="bg-muted/50 rounded-xl p-4 space-y-2 border border-border/40">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Portal</span>
            <a href={portalUrl} target="_blank" rel="noopener" className="text-primary font-medium text-xs hover:underline truncate max-w-[240px]">
              {portalUrl}
            </a>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Teléfono</span>
            <span className="font-medium text-xs">{employee.phone_number || "—"}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">PIN</span>
            <Badge variant="outline" className="font-mono text-xs tracking-widest">{pin}</Badge>
          </div>
        </div>

        <Tabs defaultValue="link" className="w-full">
          <TabsList className="w-full grid grid-cols-2 h-9 bg-muted/40 rounded-xl">
            <TabsTrigger value="link" className="text-xs data-[state=active]:bg-card rounded-lg gap-1.5">
              <Link2 className="h-3.5 w-3.5" />
              Link / Mensaje
            </TabsTrigger>
            <TabsTrigger value="email" className="text-xs data-[state=active]:bg-card rounded-lg gap-1.5">
              <Mail className="h-3.5 w-3.5" />
              Email
            </TabsTrigger>
          </TabsList>

          <TabsContent value="link" className="mt-3 space-y-3">
            {/* Message preview */}
            <div className="bg-background rounded-lg border border-border/40 p-3">
              <p className="text-xs text-muted-foreground whitespace-pre-line leading-relaxed">{message}</p>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-col h-auto py-3 gap-1.5 border-[#25D366]/30 hover:bg-[#25D366]/10 hover:border-[#25D366]/50"
                asChild
                disabled={!phoneDigits}
              >
                <a href={waLink} target="_blank" rel="noopener">
                  <MessageCircle className="h-5 w-5 text-[#25D366]" />
                  <span className="text-[10px]">WhatsApp</span>
                </a>
              </Button>

              <Button
                variant="outline"
                size="sm"
                className="flex-col h-auto py-3 gap-1.5 border-primary/30 hover:bg-primary/10"
                asChild
                disabled={!phoneDigits}
              >
                <a href={smsLink}>
                  <Smartphone className="h-5 w-5 text-primary" />
                  <span className="text-[10px]">SMS</span>
                </a>
              </Button>

              <Button
                variant="outline"
                size="sm"
                className={cn(
                  "flex-col h-auto py-3 gap-1.5",
                  copied && "border-earning/50 bg-earning/10"
                )}
                onClick={copyLink}
              >
                {copied ? <Check className="h-5 w-5 text-earning" /> : <Copy className="h-5 w-5 text-muted-foreground" />}
                <span className="text-[10px]">{copied ? "Copiado" : "Copiar"}</span>
              </Button>
            </div>

            {!phoneDigits && (
              <p className="text-[10px] text-warning text-center">
                ⚠️ Este empleado no tiene teléfono registrado. WhatsApp y SMS no están disponibles.
              </p>
            )}
          </TabsContent>

          <TabsContent value="email" className="mt-3 space-y-3">
            <div className="space-y-2">
              <Label className="text-xs">Email del empleado</Label>
              <Input
                value={employee.email ?? ""}
                disabled
                className="h-9 text-sm bg-muted/30"
              />
            </div>

            {emailSent ? (
              <div className="flex items-center gap-2 justify-center py-4 text-earning">
                <Check className="h-5 w-5" />
                <span className="text-sm font-medium">Invitación enviada exitosamente</span>
              </div>
            ) : (
              <Button
                className="w-full"
                onClick={sendEmail}
                disabled={!employee.email || sending}
              >
                {sending ? "Enviando..." : (
                  <>
                    <Mail className="h-4 w-4 mr-2" />
                    Enviar invitación por email
                  </>
                )}
              </Button>
            )}

            {!employee.email && (
              <p className="text-[10px] text-warning text-center">
                ⚠️ Este empleado no tiene email registrado.
              </p>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
