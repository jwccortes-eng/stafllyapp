import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import { getUserFriendlyError } from "@/lib/error-helpers";
import { UserPlus, ArrowRight, Loader2, CheckCircle2, Phone, Mail, User, KeyRound } from "lucide-react";
import { EmployeeInviteDialog } from "./EmployeeInviteDialog";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEmployeeCreated?: () => void;
}

export function QuickAddInviteWizard({ open, onOpenChange, onEmployeeCreated }: Props) {
  const { toast } = useToast();
  const { user } = useAuth();
  const { selectedCompanyId, companies } = useCompany();
  const companyName = companies.find(c => c.id === selectedCompanyId)?.name ?? "la empresa";

  const [step, setStep] = useState<1 | 2>(1);
  const [saving, setSaving] = useState(false);
  const [createdEmployee, setCreatedEmployee] = useState<Record<string, any> | null>(null);

  // Form fields
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  // Invite dialog
  const [inviteOpen, setInviteOpen] = useState(false);

  const reset = () => {
    setStep(1);
    setFirstName("");
    setLastName("");
    setPhone("");
    setEmail("");
    setCreatedEmployee(null);
    setSaving(false);
  };

  const handleClose = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const handleCreateAndInvite = async () => {
    if (!selectedCompanyId || !user?.id) return;
    if (!firstName.trim()) {
      toast({ title: "Nombre requerido", variant: "destructive" });
      return;
    }
    if (!phone.trim()) {
      toast({ title: "Teléfono requerido", description: "Se necesita para el acceso al portal", variant: "destructive" });
      return;
    }

    setSaving(true);

    // Auto-generate PIN from last 4 digits of phone
    const digits = phone.replace(/\D/g, "");
    const autoPin = digits.length >= 4 ? digits.slice(-4) : String(Math.floor(1000 + Math.random() * 9000));

    const insertData: Record<string, any> = {
      company_id: selectedCompanyId,
      first_name: firstName.trim(),
      last_name: lastName.trim() || null,
      phone_number: digits,
      email: email.trim() || null,
      access_pin: autoPin,
      is_active: true,
    };

    const { data, error } = await supabase
      .from("employees")
      .insert(insertData as any)
      .select("id, first_name, last_name, phone_number, email, access_pin, company_id, avatar_url, gender, user_id")
      .single();

    if (error) {
      toast({ title: "Error al crear empleado", description: getUserFriendlyError(error), variant: "destructive" });
      setSaving(false);
      return;
    }

    setCreatedEmployee(data as Record<string, any>);
    onEmployeeCreated?.();
    setStep(2);
    setSaving(false);
  };

  const openInviteDialog = () => {
    setInviteOpen(true);
  };

  const handleFinish = () => {
    handleClose(false);
  };

  return (
    <>
      <Dialog open={open && !inviteOpen} onOpenChange={handleClose}>
        <DialogContent className="max-w-md p-0 overflow-hidden">
          {/* Step indicator */}
          <div className="bg-gradient-to-br from-primary/[0.04] to-transparent border-b px-5 pt-5 pb-4">
            <DialogHeader className="space-y-1">
              <DialogTitle className="text-base font-bold flex items-center gap-2">
                <UserPlus className="h-4.5 w-4.5 text-primary" />
                {step === 1 ? "Agregar e invitar empleado" : "Empleado creado"}
              </DialogTitle>
              <DialogDescription className="text-[11px]">
                {step === 1
                  ? "Crea un perfil mínimo y envía la invitación al portal"
                  : "Ahora puedes enviar las credenciales de acceso"}
              </DialogDescription>
            </DialogHeader>
            {/* Step dots */}
            <div className="flex items-center gap-2 mt-3">
              <div className={`h-1.5 flex-1 rounded-full transition-colors ${step >= 1 ? "bg-primary" : "bg-muted"}`} />
              <div className={`h-1.5 flex-1 rounded-full transition-colors ${step >= 2 ? "bg-primary" : "bg-muted"}`} />
            </div>
          </div>

          <div className="px-5 pb-5 pt-4 space-y-4">
            {step === 1 && (
              <>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs flex items-center gap-1">
                        <User className="h-3 w-3" /> Nombre *
                      </Label>
                      <Input
                        value={firstName}
                        onChange={e => setFirstName(e.target.value)}
                        placeholder="Nombre"
                        className="h-9 text-sm"
                        autoFocus
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Apellido</Label>
                      <Input
                        value={lastName}
                        onChange={e => setLastName(e.target.value)}
                        placeholder="Apellido"
                        className="h-9 text-sm"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs flex items-center gap-1">
                      <Phone className="h-3 w-3" /> Teléfono *
                    </Label>
                    <Input
                      type="tel"
                      inputMode="numeric"
                      value={phone}
                      onChange={e => setPhone(e.target.value)}
                      placeholder="Número de teléfono"
                      className="h-9 text-sm"
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Se usará para login. El PIN se generará automáticamente con los últimos 4 dígitos.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs flex items-center gap-1">
                      <Mail className="h-3 w-3" /> Email
                      <Badge variant="outline" className="text-[8px] ml-1">Opcional</Badge>
                    </Label>
                    <Input
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="correo@ejemplo.com"
                      className="h-9 text-sm"
                    />
                  </div>
                </div>

                <div className="rounded-lg border border-border/40 bg-muted/30 px-3 py-2 text-[10px] text-muted-foreground">
                  <KeyRound className="h-3 w-3 inline mr-1" />
                  El PIN de acceso se generará automáticamente. Podrás cambiarlo después desde la pestaña Acceso.
                </div>

                <Button
                  className="w-full"
                  onClick={handleCreateAndInvite}
                  disabled={saving || !firstName.trim() || !phone.trim()}
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <ArrowRight className="h-4 w-4 mr-2" />
                  )}
                  {saving ? "Creando..." : "Crear e invitar"}
                </Button>
              </>
            )}

            {step === 2 && createdEmployee && (
              <>
                <div className="flex flex-col items-center gap-3 py-4 text-center">
                  <div className="h-14 w-14 rounded-full bg-[hsl(var(--earning))]/10 flex items-center justify-center">
                    <CheckCircle2 className="h-7 w-7 text-[hsl(var(--earning))]" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-foreground">
                      {createdEmployee.first_name} {createdEmployee.last_name}
                    </h3>
                    <p className="text-sm text-muted-foreground">Empleado creado en {companyName}</p>
                  </div>
                </div>

                <div className="rounded-lg border bg-muted/30 p-3 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground text-xs">Teléfono</span>
                    <span className="font-mono text-xs">{createdEmployee.phone_number}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground text-xs">PIN</span>
                    <span className="font-mono font-bold tracking-widest text-xs">{createdEmployee.access_pin}</span>
                  </div>
                  {createdEmployee.email && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground text-xs">Email</span>
                      <span className="text-xs">{createdEmployee.email}</span>
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={handleFinish}>
                    Cerrar
                  </Button>
                  <Button className="flex-1" onClick={openInviteDialog}>
                    <ArrowRight className="h-4 w-4 mr-2" />
                    Enviar invitación
                  </Button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Invite dialog for the newly created employee */}
      {createdEmployee && (
        <EmployeeInviteDialog
          open={inviteOpen}
          onOpenChange={(v) => {
            setInviteOpen(v);
            if (!v) handleClose(false);
          }}
          employee={createdEmployee}
          onInviteSent={() => {
            toast({ title: "Invitación enviada ✅" });
          }}
        />
      )}
    </>
  );
}
