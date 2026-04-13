import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import { useOnboardingConfig } from "@/hooks/useOnboardingConfig";
import { getUserFriendlyError } from "@/lib/error-helpers";
import { UserPlus, ArrowRight, Loader2, CheckCircle2, Phone, Mail, User, KeyRound } from "lucide-react";
import { EmployeeInviteDialog } from "./EmployeeInviteDialog";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEmployeeCreated?: (employee: Record<string, any>) => void;
}

export function QuickAddInviteWizard({ open, onOpenChange, onEmployeeCreated }: Props) {
  const { toast } = useToast();
  const { user } = useAuth();
  const { selectedCompanyId, companies } = useCompany();
  const { config: onboardingConfig } = useOnboardingConfig();
  const companyName = companies.find(c => c.id === selectedCompanyId)?.name ?? "the company";

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

  const createEmployee = async (): Promise<boolean> => {
    if (!selectedCompanyId || !user?.id) return false;
    if (!firstName.trim()) {
      toast({ title: "Name required", variant: "destructive" });
      return false;
    }
    if (!phone.trim()) {
      toast({ title: "Phone required", description: "Required for portal access", variant: "destructive" });
      return false;
    }
    // Configurable: require email
    if (onboardingConfig.require_email && !email.trim()) {
      toast({ title: "Email required", description: "Your company requires an email for all employees", variant: "destructive" });
      return false;
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
      toast({ title: "Error creating employee", description: getUserFriendlyError(error), variant: "destructive" });
      setSaving(false);
      return false;
    }

    const emp = data as Record<string, any>;
    setCreatedEmployee(emp);
    onEmployeeCreated?.(emp);
    setStep(2);
    setSaving(false);
    return true;
  };

  const handleCreateOnly = async () => {
    const success = await createEmployee();
    // If auto_send_invite_on_create is enabled, auto-open invite after creation
    if (success && onboardingConfig.auto_send_invite_on_create) {
      setTimeout(() => setInviteOpen(true), 150);
    }
  };

  const handleCreateAndInvite = async () => {
    const success = await createEmployee();
    if (success) {
      setTimeout(() => setInviteOpen(true), 150);
    }
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
                {step === 1 ? "Add new employee" : "Employee created"}
              </DialogTitle>
              <DialogDescription className="text-[11px]">
                {step === 1
                  ? "Create a minimal profile. You can invite them now or later."
                  : "You can send access credentials now or close and do it later."}
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
                        <User className="h-3 w-3" /> First name *
                      </Label>
                      <Input
                        value={firstName}
                        onChange={e => setFirstName(e.target.value)}
                        placeholder="First name"
                        className="h-9 text-sm"
                        autoFocus
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Last name</Label>
                      <Input
                        value={lastName}
                        onChange={e => setLastName(e.target.value)}
                        placeholder="Last name"
                        className="h-9 text-sm"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs flex items-center gap-1">
                      <Phone className="h-3 w-3" /> Phone *
                    </Label>
                    <Input
                      type="tel"
                      inputMode="numeric"
                      value={phone}
                      onChange={e => setPhone(e.target.value)}
                      placeholder="Phone number"
                      className="h-9 text-sm"
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Used for portal login. PIN will be auto-generated from last 4 digits.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs flex items-center gap-1">
                      <Mail className="h-3 w-3" /> Email
                      {onboardingConfig.require_email
                        ? <span className="text-destructive ml-0.5">*</span>
                        : <Badge variant="outline" className="text-[8px] ml-1">Optional</Badge>
                      }
                    </Label>
                    <Input
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="email@example.com"
                      className="h-9 text-sm"
                    />
                  </div>
                </div>

                <div className="rounded-lg border border-border/40 bg-muted/30 px-3 py-2 text-[10px] text-muted-foreground">
                  <KeyRound className="h-3 w-3 inline mr-1" />
                  Access PIN will be auto-generated. You can change it later from the Access tab.
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={handleCreateOnly}
                    disabled={saving || !firstName.trim() || !phone.trim()}
                  >
                    {saving ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <UserPlus className="h-4 w-4 mr-2" />
                    )}
                    Create only
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={handleCreateAndInvite}
                    disabled={saving || !firstName.trim() || !phone.trim()}
                  >
                    {saving ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <ArrowRight className="h-4 w-4 mr-2" />
                    )}
                    Create & invite
                  </Button>
                </div>
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
                    <p className="text-sm text-muted-foreground">Employee created in {companyName}</p>
                  </div>
                </div>

                <div className="rounded-lg border bg-muted/30 p-3 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground text-xs">Phone</span>
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
                    Done
                  </Button>
                  <Button className="flex-1" onClick={openInviteDialog}>
                    <ArrowRight className="h-4 w-4 mr-2" />
                    Send invitation
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
            toast({ title: "Invitation sent ✅" });
          }}
        />
      )}
    </>
  );
}
