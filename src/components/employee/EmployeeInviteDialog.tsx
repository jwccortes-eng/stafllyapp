import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useCompany } from "@/hooks/useCompany";
import { Send, MessageCircle, Phone, Copy, Check, Mail, Smartphone, CheckCircle2, AlertTriangle, Link2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee: Record<string, any>;
  onInviteSent?: (channel: "whatsapp" | "sms" | "email" | "copy" | "other") => void;
  inviteToken?: string | null;
}

const PRODUCTION_URL = "https://staflyapps.com";

export function EmployeeInviteDialog({ open, onOpenChange, employee, onInviteSent, inviteToken }: Props) {
  const { toast } = useToast();
  const { companies, selectedCompanyId } = useCompany();
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  const company = companies.find(c => c.id === selectedCompanyId);
  const companyName = company?.name ?? "la empresa";

  const portalUrl = `${PRODUCTION_URL}/auth`;
  const inviteUrl = inviteToken ? `${PRODUCTION_URL}/invite?token=${inviteToken}` : null;
  const pin = typeof employee.access_pin === "string" && employee.access_pin.trim() ? employee.access_pin.trim() : "—";
  const hasPin = pin !== "—";
  const hasPhone = !!(employee.phone_number ?? "").replace(/\D/g, "");
  const hasEmail = !!employee.email;

  const message = `¡Hola ${employee.first_name}! 👋\n\nTe invitamos a acceder al portal de empleados de *${companyName}*.\n\n📱 Portal: ${portalUrl}\n📞 Tu teléfono: ${employee.phone_number ?? "—"}\n🔑 Tu PIN: ${pin}\n\nSelecciona "Acceso empleado" e ingresa con tu número y PIN.\n\nDesde el portal podrás:\n✅ Ver tus turnos asignados\n✅ Registrar entrada y salida\n✅ Consultar tus pagos\n✅ Recibir comunicados\n\n— Equipo ${companyName}`;

  const phoneDigits = (employee.phone_number ?? "").replace(/\D/g, "");
  const normalizedPhone = phoneDigits.startsWith("00") ? phoneDigits.slice(2) : phoneDigits;
  const fullPhone = normalizedPhone.length === 10 ? `1${normalizedPhone}` : normalizedPhone;

  const waLink = `https://api.whatsapp.com/send?phone=${fullPhone}&text=${encodeURIComponent(message)}`;
  const smsLink = `sms:${employee.phone_number ?? ""}?body=${encodeURIComponent(message)}`;

  const copyMessage = async () => {
    await navigator.clipboard.writeText(message);
    setCopied(true);
    onInviteSent?.("copy");
    toast({ title: "Copiado al portapapeles" });
    setTimeout(() => setCopied(false), 2000);
  };

  const copyInviteLink = async () => {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl);
    setLinkCopied(true);
    toast({ title: "Enlace copiado", description: inviteUrl });
    setTimeout(() => setLinkCopied(false), 2000);
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
              <p style="font-size: 13px; color: hsl(220, 15%, 46%); line-height: 1.6;">Ingresa con tu número de teléfono y tu PIN de 4 dígitos.</p>
              <div style="margin: 24px 0;">
                <a href="${portalUrl}" style="display: inline-block; background: hsl(222, 100%, 59%); color: #ffffff; font-size: 14px; font-weight: 600; border-radius: 16px; padding: 12px 28px; text-decoration: none;">Ir al portal</a>
              </div>
              <p style="font-size: 12px; color: hsl(220, 15%, 46%); margin: 30px 0 0;">Si no esperabas esta invitación, ignora este correo.</p>
            </div>
          `,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setEmailSent(true);
      onInviteSent?.("email");
      toast({ title: "Email enviado ✅", description: `Invitación enviada a ${employee.email}` });
    } catch (err: any) {
      toast({ title: "Error al enviar", description: err.message ?? "Intenta de nuevo", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  // Readiness checks
  const readyChecks = [
    { label: "Teléfono", ok: hasPhone, detail: employee.phone_number || "No registrado" },
    { label: "PIN", ok: hasPin, detail: hasPin ? pin : "No asignado" },
    { label: "Email", ok: hasEmail, detail: employee.email || "No registrado" },
  ];
  const isReady = hasPhone && hasPin;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 overflow-hidden">
        {/* Header with employee identity */}
        <div className="bg-gradient-to-br from-primary/[0.04] to-transparent border-b px-5 pt-5 pb-4">
          <div className="flex items-center gap-3">
            <EmployeeAvatar firstName={employee.first_name ?? ""} lastName={employee.last_name ?? ""} avatarUrl={employee.avatar_url} gender={employee.gender} size="lg" className="ring-2 ring-background shadow" />
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-base font-bold">Invitar a {employee.first_name}</DialogTitle>
              <DialogDescription className="text-[11px] mt-0.5">Envía las credenciales de acceso al portal</DialogDescription>
            </div>
            <Send className="h-5 w-5 text-primary/30" />
          </div>
        </div>

        <div className="px-5 pb-5 space-y-4">
          {/* Readiness checklist */}
          <div className="rounded-lg border border-border/40 p-3 space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-1">Verificación</p>
            {readyChecks.map(c => (
              <div key={c.label} className="flex items-center gap-2 text-[11px]">
                {c.ok ? <CheckCircle2 className="h-3.5 w-3.5 text-[hsl(var(--earning))]" /> : <AlertTriangle className="h-3.5 w-3.5 text-warning" />}
                <span className="text-muted-foreground w-16">{c.label}</span>
                <span className={cn("font-medium", c.ok ? "text-foreground" : "text-warning")}>{c.detail}</span>
              </div>
            ))}
            {!isReady && (
              <p className="text-[10px] text-warning mt-1.5 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" /> Completa teléfono y PIN antes de invitar
              </p>
            )}
          </div>

          {/* Credentials */}
          <div className="bg-muted/40 rounded-lg p-3 space-y-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground">Portal</span>
              <a href={portalUrl} target="_blank" rel="noopener" className="text-primary font-medium text-[10px] hover:underline truncate max-w-[220px]">{portalUrl}</a>
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground">Teléfono</span>
              <span className="font-medium text-[10px]">{employee.phone_number || "—"}</span>
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground">PIN</span>
              <Badge variant="outline" className="font-mono text-[10px] tracking-widest">{pin}</Badge>
            </div>
          </div>

          {/* Send channels */}
          <Tabs defaultValue="link" className="w-full">
            <TabsList className="w-full grid grid-cols-2 h-8 bg-muted/30 rounded-lg">
              <TabsTrigger value="link" className="text-[10px] data-[state=active]:bg-card rounded-md gap-1">
                <MessageCircle className="h-3 w-3" /> Mensaje
              </TabsTrigger>
              <TabsTrigger value="email" className="text-[10px] data-[state=active]:bg-card rounded-md gap-1">
                <Mail className="h-3 w-3" /> Email
              </TabsTrigger>
            </TabsList>

            <TabsContent value="link" className="mt-2.5 space-y-2.5">
              <div className="bg-background rounded-lg border border-border/30 p-2.5">
                <p className="text-[10px] text-muted-foreground whitespace-pre-line leading-relaxed">{message}</p>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                <Button variant="outline" size="sm" className="flex-col h-auto py-2.5 gap-1 border-[#25D366]/30 hover:bg-[#25D366]/10 hover:border-[#25D366]/50 text-[9px]" asChild disabled={!hasPhone} onClick={() => onInviteSent?.("whatsapp")}>
                  <a href={waLink} target="_blank" rel="noopener"><MessageCircle className="h-4 w-4 text-[#25D366]" />WhatsApp</a>
                </Button>
                <Button variant="outline" size="sm" className="flex-col h-auto py-2.5 gap-1 border-primary/30 hover:bg-primary/10 text-[9px]" asChild disabled={!hasPhone} onClick={() => onInviteSent?.("sms")}>
                  <a href={smsLink}><Smartphone className="h-4 w-4 text-primary" />SMS</a>
                </Button>
                <Button variant="outline" size="sm" className={cn("flex-col h-auto py-2.5 gap-1 text-[9px]", copied && "border-[hsl(var(--earning)/0.5)] bg-[hsl(var(--earning)/0.1)]")} onClick={copyLink}>
                  {copied ? <Check className="h-4 w-4 text-[hsl(var(--earning))]" /> : <Copy className="h-4 w-4 text-muted-foreground" />}
                  {copied ? "Copiado" : "Copiar"}
                </Button>
              </div>
              {!hasPhone && <p className="text-[9px] text-warning text-center">⚠️ Sin teléfono registrado</p>}
            </TabsContent>

            <TabsContent value="email" className="mt-2.5 space-y-2.5">
              <div className="space-y-1.5">
                <Label className="text-[10px]">Email del empleado</Label>
                <Input value={employee.email ?? ""} disabled className="h-8 text-xs bg-muted/30" />
              </div>
              {emailSent ? (
                <div className="flex items-center gap-2 justify-center py-3 text-[hsl(var(--earning))]">
                  <CheckCircle2 className="h-5 w-5" />
                  <span className="text-xs font-medium">Invitación enviada ✅</span>
                </div>
              ) : (
                <Button className="w-full h-8 text-xs" onClick={sendEmail} disabled={!hasEmail || sending}>
                  {sending ? "Enviando..." : <><Mail className="h-3.5 w-3.5 mr-1.5" />Enviar invitación por email</>}
                </Button>
              )}
              {!hasEmail && <p className="text-[9px] text-warning text-center">⚠️ Sin email registrado</p>}
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}
