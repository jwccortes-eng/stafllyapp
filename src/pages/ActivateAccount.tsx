import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { StaflyLogo } from "@/components/brand/StaflyBrand";
import { NumericKeypad } from "@/components/auth/NumericKeypad";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Loader2, CheckCircle2, XCircle, Clock, Shield, Camera, ArrowRight, ArrowLeft,
  Building2, Sparkles, Phone, KeyRound, MapPin, Globe, Heart, Car, User,
} from "lucide-react";
import { cn } from "@/lib/utils";

type PageState = "loading" | "valid" | "expired" | "used" | "invalid";
type WizardStep = "welcome" | "pin" | "personal" | "address" | "details" | "photo" | "ready";

const STEPS: WizardStep[] = ["welcome", "pin", "personal", "address", "details", "photo", "ready"];
const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY","DC",
];

const LANGUAGES = ["English", "Spanish", "Portuguese", "French", "Creole", "Mandarin", "Other"];

interface InviteData {
  id: string;
  employee_id: string;
  status: string;
  expires_at: string | null;
  company_id: string;
  company_name: string;
  company_logo: string | null;
  brand_color: string | null;
  employee_name: string;
  employee_phone: string;
  employee_first_name: string;
  employee_last_name: string;
  employee_email: string;
}

interface ProfileForm {
  first_name: string;
  last_name: string;
  email: string;
  date_of_birth: string;
  address_line: string;
  address_city: string;
  address_state: string;
  address_zip: string;
  languages: string[];
  emergency_contact_name: string;
  emergency_contact_phone: string;
  can_drive: boolean;
  has_vehicle: boolean;
  ssn: string;
}

export default function ActivateAccount() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const markedOpened = useRef(false);

  const [pageState, setPageState] = useState<PageState>("loading");
  const [invite, setInvite] = useState<InviteData | null>(null);
  const [wizardStep, setWizardStep] = useState<WizardStep>("welcome");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [pinPhase, setPinPhase] = useState<"create" | "confirm">("create");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [profileForm, setProfileForm] = useState<ProfileForm>({
    first_name: "", last_name: "", email: "", date_of_birth: "",
    address_line: "", address_city: "", address_state: "", address_zip: "",
    languages: [], emergency_contact_name: "", emergency_contact_phone: "",
    can_drive: false, has_vehicle: false, ssn: "",
  });
  const fileRef = useRef<HTMLInputElement>(null);

  const stepIndex = STEPS.indexOf(wizardStep);
  const totalSteps = STEPS.length;

  const updateForm = (key: keyof ProfileForm, value: any) => {
    setProfileForm(prev => ({ ...prev, [key]: value }));
  };

  // ─── Load invite ───
  useEffect(() => {
    if (!token) { setPageState("invalid"); return; }

    (async () => {
      const { data, error: fetchErr } = await (supabase
        .from("employee_invitations" as any)
        .select("id, employee_id, status, expires_at, company_id, opened_at")
        .eq("invite_token", token)
        .single() as any);

      if (fetchErr || !data) { setPageState("invalid"); return; }
      if (data.status === "accepted") { setPageState("used"); return; }

      if (data.expires_at && new Date(data.expires_at) < new Date()) {
        if (data.status !== "expired") {
          await (supabase.from("employee_invitations" as any)
            .update({ status: "expired" }).eq("id", data.id) as any);
        }
        setPageState("expired"); return;
      }

      if (!markedOpened.current && data.status !== "opened" && data.status !== "accepted") {
        markedOpened.current = true;
        await (supabase.from("employee_invitations" as any)
          .update({ status: "opened", opened_at: data.opened_at ?? new Date().toISOString() })
          .eq("id", data.id) as any);
      }

      const { data: emp } = await supabase
        .from("employees")
        .select("first_name, last_name, company_id, phone_number, avatar_url, email")
        .eq("id", data.employee_id)
        .single();

      if (!emp) { setPageState("invalid"); return; }

      const { data: co } = await supabase
        .from("companies")
        .select("name, logo_url, brand_color")
        .eq("id", emp.company_id)
        .single();

      if (emp.avatar_url) setAvatarPreview(emp.avatar_url);

      setProfileForm(prev => ({
        ...prev,
        first_name: emp.first_name ?? "",
        last_name: emp.last_name ?? "",
        email: emp.email ?? "",
      }));

      setInvite({
        ...data,
        company_id: emp.company_id,
        company_name: co?.name ?? "",
        company_logo: co?.logo_url ?? null,
        brand_color: co?.brand_color ?? null,
        employee_name: `${emp.first_name ?? ""} ${emp.last_name ?? ""}`.trim(),
        employee_phone: emp.phone_number ?? "",
        employee_first_name: emp.first_name ?? "",
        employee_last_name: emp.last_name ?? "",
        employee_email: emp.email ?? "",
      });
      setPageState("valid");
    })();
  }, [token]);

  // ─── PIN handlers ───
  const handlePinCreate = (p: string) => {
    setPin(p);
    setPinPhase("confirm");
    setConfirmPin("");
  };

  const handlePinConfirm = (p: string) => {
    if (p !== pin) {
      setError("Los PINs no coinciden. Intenta de nuevo.");
      setPinPhase("create");
      setPin("");
      setConfirmPin("");
      return;
    }
    setError("");
    setWizardStep("personal");
  };

  // ─── Photo handler ───
  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith("image/")) return;
    if (f.size > 5 * 1024 * 1024) {
      setError("Imagen demasiado grande. Máximo 5 MB.");
      return;
    }
    setAvatarFile(f);
    setAvatarPreview(URL.createObjectURL(f));
    setError("");
  };

  // ─── Validation ───
  const isPersonalValid = profileForm.first_name.trim() && profileForm.last_name.trim() && profileForm.email.trim() && profileForm.date_of_birth;
  const isAddressValid = profileForm.address_line.trim() && profileForm.address_city.trim() && profileForm.address_state && profileForm.address_zip.trim().length >= 5;
  const isDetailsValid = profileForm.emergency_contact_name.trim() && profileForm.emergency_contact_phone.trim() && profileForm.ssn.replace(/\D/g, "").length >= 4;

  // ─── Save progress ───
  const saveProgress = async () => {
    if (!invite) return;
    const updates: Record<string, any> = {
      first_name: profileForm.first_name.trim(),
      last_name: profileForm.last_name.trim(),
      email: profileForm.email.trim() || null,
      date_of_birth: profileForm.date_of_birth || null,
      address_line: profileForm.address_line.trim() || null,
      address_city: profileForm.address_city.trim() || null,
      address_state: profileForm.address_state || null,
      address_zip: profileForm.address_zip.trim() || null,
      emergency_contact_name: profileForm.emergency_contact_name.trim() || null,
      emergency_contact_phone: profileForm.emergency_contact_phone.trim() || null,
      can_drive: profileForm.can_drive,
      has_vehicle: profileForm.has_vehicle,
      onboarding_status: "incomplete",
    };

    // SSN: only store last 4 digits
    if (profileForm.ssn.trim()) {
      const digits = profileForm.ssn.replace(/\D/g, "");
      updates.ssn_last4 = digits.slice(-4);
    }

    await supabase.from("employees").update(updates as any).eq("id", invite.employee_id);
  };

  // ─── Activate ───
  const handleActivate = async () => {
    if (!invite) return;
    setBusy(true);
    setError("");

    try {
      // Save all profile data first
      await saveProgress();

      let avatarUrl: string | undefined;
      if (avatarFile) {
        const ext = avatarFile.name.split(".").pop() || "jpg";
        const path = `${invite.employee_id}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("employee-avatars")
          .upload(path, avatarFile, { upsert: true });
        if (!upErr) {
          const { data: urlData } = supabase.storage.from("employee-avatars").getPublicUrl(path);
          avatarUrl = `${urlData.publicUrl}?t=${Date.now()}`;
        }
      }

      // Activate via edge function
      const { data, error: fnErr } = await supabase.functions.invoke("employee-auth", {
        body: {
          action: "activate",
          phone: invite.employee_phone,
          pin: pin,
          avatar_url: avatarUrl,
        },
      });

      if (fnErr || data?.error) {
        setError(data?.error || "Error al activar. Intenta de nuevo.");
        setBusy(false);
        return;
      }

      // Mark invitation accepted + onboarding complete
      await (supabase.from("employee_invitations" as any)
        .update({ status: "accepted", accepted_at: new Date().toISOString() })
        .eq("id", invite.id) as any);

      await supabase.from("employees")
        .update({
          portal_access_enabled: true,
          onboarding_status: "complete",
          onboarding_completed_at: new Date().toISOString(),
        } as any)
        .eq("id", invite.employee_id);

      if (data?.session) {
        await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        });
      }

      setWizardStep("ready");
    } catch (err: any) {
      setError(err?.message || "Error inesperado.");
    } finally {
      setBusy(false);
    }
  };

  const maskedPhone = invite?.employee_phone
    ? invite.employee_phone.replace(/\d(?=\d{4})/g, "•")
    : "";

  const goBack = () => {
    const idx = STEPS.indexOf(wizardStep);
    if (idx > 0) setWizardStep(STEPS[idx - 1]);
  };

  const goNext = async () => {
    const idx = STEPS.indexOf(wizardStep);
    if (wizardStep === "personal" || wizardStep === "address" || wizardStep === "details") {
      await saveProgress();
    }
    if (idx < STEPS.length - 1) setWizardStep(STEPS[idx + 1]);
  };

  // ─── Error / expired / used states ───
  if (pageState !== "valid" && pageState !== "loading") {
    const configs: Record<string, { icon: React.ReactNode; title: string; desc: string }> = {
      invalid: {
        icon: <XCircle className="h-8 w-8 text-destructive" />,
        title: "Enlace inválido",
        desc: "Este enlace de activación no es válido. Solicita uno nuevo a tu administrador.",
      },
      expired: {
        icon: <Clock className="h-8 w-8 text-warning" />,
        title: "Enlace expirado",
        desc: "Este enlace ha expirado. Pide a tu administrador que te envíe uno nuevo.",
      },
      used: {
        icon: <CheckCircle2 className="h-8 w-8 text-earning" />,
        title: "Cuenta ya activada",
        desc: "Tu cuenta ya fue activada. Inicia sesión con tu teléfono y PIN.",
      },
    };
    const cfg = configs[pageState] ?? configs.invalid;

    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-gradient-to-b from-background to-muted/20 p-4">
        <div className="w-full max-w-sm">
          <div className="bg-card rounded-3xl border border-border/50 shadow-xl overflow-hidden">
            <div className="px-8 pt-8 pb-4 flex flex-col items-center">
              <StaflyLogo size={28} />
            </div>
            <div className="px-8 pb-8 flex flex-col items-center gap-4 text-center">
              <div className="h-16 w-16 rounded-2xl bg-muted/50 flex items-center justify-center">
                {cfg.icon}
              </div>
              <h2 className="text-xl font-bold text-foreground">{cfg.title}</h2>
              <p className="text-sm text-muted-foreground max-w-[280px]">{cfg.desc}</p>
              <Button onClick={() => navigate("/auth")} className="w-full h-12 rounded-xl mt-2">
                Ir a iniciar sesión
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (pageState === "loading") {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-background gap-4">
        <StaflyLogo size={32} />
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Verificando invitación...</p>
      </div>
    );
  }

  // ─── Wizard ───
  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-gradient-to-b from-background to-muted/20 p-4">
      <div className="w-full max-w-md">
        <div className="bg-card rounded-3xl border border-border/50 shadow-xl overflow-hidden">
          {/* Company header */}
          <div className="bg-gradient-to-br from-primary/[0.06] to-transparent px-6 pt-6 pb-4 flex flex-col items-center gap-2 border-b border-border/30">
            {invite?.company_logo ? (
              <img src={invite.company_logo} alt="" className="h-12 w-12 rounded-xl object-cover shadow-md" />
            ) : (
              <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <Building2 className="h-6 w-6 text-primary" />
              </div>
            )}
            <span className="text-xs font-semibold text-muted-foreground tracking-wide">
              {invite?.company_name}
            </span>
          </div>

          {/* Progress bar */}
          {wizardStep !== "ready" && (
            <div className="px-6 pt-4">
              <div className="flex items-center gap-1">
                {STEPS.filter(s => s !== "ready").map((s, i) => (
                  <div
                    key={s}
                    className={cn(
                      "h-1 rounded-full flex-1 transition-all duration-500",
                      i <= stepIndex ? "bg-primary" : "bg-border"
                    )}
                  />
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground mt-1.5 text-right">
                Paso {stepIndex + 1} de {totalSteps - 1}
              </p>
            </div>
          )}

          <ScrollArea className="max-h-[65vh]">
            <div className="px-6 py-6 space-y-5">
              {/* ── STEP: Welcome ── */}
              {wizardStep === "welcome" && invite && (
                <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div className="text-center space-y-2">
                    <Sparkles className="h-6 w-6 text-primary mx-auto" />
                    <h2 className="text-xl font-bold text-foreground">
                      ¡Hola{invite.employee_first_name ? `, ${invite.employee_first_name}` : ""}!
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      Completa tu perfil para activar tu portal de empleado
                    </p>
                  </div>

                  <div className="rounded-xl border border-border/50 bg-muted/20 divide-y divide-border/30">
                    <div className="flex items-center gap-3 px-4 py-3">
                      <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] text-muted-foreground">Empresa</p>
                        <p className="text-sm font-semibold text-foreground truncate">{invite.company_name}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 px-4 py-3">
                      <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] text-muted-foreground">Tu teléfono</p>
                        <p className="text-sm font-semibold text-foreground">{maskedPhone}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 px-4 py-3">
                      <KeyRound className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] text-muted-foreground">Pasos requeridos</p>
                        <p className="text-sm font-medium text-foreground">PIN → Perfil → Dirección → Foto</p>
                      </div>
                    </div>
                  </div>

                  <Button onClick={() => setWizardStep("pin")} className="w-full h-12 rounded-xl text-base font-semibold gap-2">
                    Comenzar activación
                    <ArrowRight className="h-4 w-4" />
                  </Button>

                  <div className="flex items-center gap-1.5 justify-center">
                    <Shield className="h-3 w-3 text-muted-foreground/40" />
                    <p className="text-[10px] text-muted-foreground/50">Tu información está protegida</p>
                  </div>
                </div>
              )}

              {/* ── STEP: PIN ── */}
              {wizardStep === "pin" && (
                <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div className="text-center space-y-1">
                    <h2 className="text-lg font-bold text-foreground">
                      {pinPhase === "create" ? "Crea tu PIN" : "Confirma tu PIN"}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      {pinPhase === "create" ? "Elige un PIN de 4 dígitos para acceder" : "Ingresa el mismo PIN para confirmar"}
                    </p>
                  </div>

                  <div className="flex items-center justify-center gap-2">
                    <div className={cn("h-1.5 rounded-full transition-all duration-300",
                      pinPhase === "create" ? "w-10 bg-primary" : "w-5 bg-primary/30")} />
                    <div className={cn("h-1.5 rounded-full transition-all duration-300",
                      pinPhase === "confirm" ? "w-10 bg-primary" : "w-5 bg-border")} />
                  </div>

                  {error && <p className="text-xs text-destructive text-center font-medium">{error}</p>}

                  {pinPhase === "create" ? (
                    <NumericKeypad value={pin} maxLength={4} onChange={setPin} onComplete={handlePinCreate} />
                  ) : (
                    <NumericKeypad value={confirmPin} maxLength={4} onChange={setConfirmPin} onComplete={handlePinConfirm} />
                  )}
                </div>
              )}

              {/* ── STEP: Personal info ── */}
              {wizardStep === "personal" && (
                <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div className="text-center space-y-1">
                    <User className="h-5 w-5 text-primary mx-auto" />
                    <h2 className="text-lg font-bold">Información personal</h2>
                    <p className="text-xs text-muted-foreground">Datos básicos requeridos</p>
                  </div>

                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Nombre <span className="text-destructive">*</span></Label>
                        <Input value={profileForm.first_name} onChange={e => updateForm("first_name", e.target.value)} placeholder="Juan" className="h-9 text-sm" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Apellido <span className="text-destructive">*</span></Label>
                        <Input value={profileForm.last_name} onChange={e => updateForm("last_name", e.target.value)} placeholder="García" className="h-9 text-sm" />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">Email <span className="text-destructive">*</span></Label>
                      <Input type="email" value={profileForm.email} onChange={e => updateForm("email", e.target.value)} placeholder="juan@email.com" className="h-9 text-sm" />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">Fecha de nacimiento <span className="text-destructive">*</span></Label>
                      <Input type="date" value={profileForm.date_of_birth} onChange={e => updateForm("date_of_birth", e.target.value)} className="h-9 text-sm" />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">SSN <span className="text-destructive">*</span></Label>
                      <Input
                        type="password"
                        value={profileForm.ssn}
                        onChange={e => updateForm("ssn", e.target.value.replace(/[^0-9-]/g, ""))}
                        placeholder="XXX-XX-XXXX"
                        maxLength={11}
                        className="h-9 text-sm font-mono"
                      />
                      <p className="text-[9px] text-muted-foreground/60">Solo se guardan los últimos 4 dígitos. Dato encriptado.</p>
                    </div>
                  </div>

                  <div className="flex gap-2 pt-1">
                    <Button variant="outline" onClick={goBack} className="h-10 rounded-xl gap-1">
                      <ArrowLeft className="h-4 w-4" /> Atrás
                    </Button>
                    <Button onClick={goNext} disabled={!isPersonalValid} className="flex-1 h-10 rounded-xl gap-1">
                      Siguiente <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}

              {/* ── STEP: Address ── */}
              {wizardStep === "address" && (
                <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div className="text-center space-y-1">
                    <MapPin className="h-5 w-5 text-primary mx-auto" />
                    <h2 className="text-lg font-bold">Dirección</h2>
                    <p className="text-xs text-muted-foreground">Dirección completa requerida</p>
                  </div>

                  <div className="space-y-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Dirección <span className="text-destructive">*</span></Label>
                      <Input value={profileForm.address_line} onChange={e => updateForm("address_line", e.target.value)} placeholder="123 Main St, Apt 4" className="h-9 text-sm" />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Ciudad <span className="text-destructive">*</span></Label>
                        <Input value={profileForm.address_city} onChange={e => updateForm("address_city", e.target.value)} placeholder="Miami" className="h-9 text-sm" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Estado <span className="text-destructive">*</span></Label>
                        <Select value={profileForm.address_state} onValueChange={v => updateForm("address_state", v)}>
                          <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Estado" /></SelectTrigger>
                          <SelectContent>{US_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">ZIP Code <span className="text-destructive">*</span></Label>
                      <Input
                        value={profileForm.address_zip}
                        onChange={e => updateForm("address_zip", e.target.value.replace(/\D/g, "").slice(0, 5))}
                        placeholder="33101"
                        maxLength={5}
                        className="h-9 text-sm w-32"
                      />
                    </div>
                  </div>

                  <div className="flex gap-2 pt-1">
                    <Button variant="outline" onClick={goBack} className="h-10 rounded-xl gap-1">
                      <ArrowLeft className="h-4 w-4" /> Atrás
                    </Button>
                    <Button onClick={goNext} disabled={!isAddressValid} className="flex-1 h-10 rounded-xl gap-1">
                      Siguiente <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}

              {/* ── STEP: Details (emergency, driving, languages) ── */}
              {wizardStep === "details" && (
                <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div className="text-center space-y-1">
                    <Heart className="h-5 w-5 text-primary mx-auto" />
                    <h2 className="text-lg font-bold">Detalles adicionales</h2>
                    <p className="text-xs text-muted-foreground">Contacto de emergencia y disponibilidad</p>
                  </div>

                  <div className="space-y-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Contacto de emergencia <span className="text-destructive">*</span></Label>
                      <Input value={profileForm.emergency_contact_name} onChange={e => updateForm("emergency_contact_name", e.target.value)} placeholder="Nombre del contacto" className="h-9 text-sm" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Teléfono de emergencia <span className="text-destructive">*</span></Label>
                      <Input value={profileForm.emergency_contact_phone} onChange={e => updateForm("emergency_contact_phone", e.target.value)} placeholder="+1 (305) 555-0123" className="h-9 text-sm" />
                    </div>

                    {/* Languages */}
                    <div className="space-y-1.5">
                      <Label className="text-xs">Idiomas</Label>
                      <div className="flex flex-wrap gap-1.5">
                        {LANGUAGES.map(lang => (
                          <button
                            key={lang}
                            type="button"
                            onClick={() => {
                              setProfileForm(prev => ({
                                ...prev,
                                languages: prev.languages.includes(lang)
                                  ? prev.languages.filter(l => l !== lang)
                                  : [...prev.languages, lang],
                              }));
                            }}
                            className={cn(
                              "px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors",
                              profileForm.languages.includes(lang)
                                ? "bg-primary/10 text-primary border-primary/30"
                                : "bg-muted/30 text-muted-foreground border-border/50 hover:border-primary/20"
                            )}
                          >
                            {lang}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Driving */}
                    <div className="rounded-xl border border-border/50 bg-muted/20 divide-y divide-border/30">
                      <div className="flex items-center justify-between px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Car className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">¿Puedes conducir?</span>
                        </div>
                        <Switch checked={profileForm.can_drive} onCheckedChange={v => updateForm("can_drive", v)} />
                      </div>
                      <div className="flex items-center justify-between px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Car className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">¿Tienes vehículo?</span>
                        </div>
                        <Switch checked={profileForm.has_vehicle} onCheckedChange={v => updateForm("has_vehicle", v)} />
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2 pt-1">
                    <Button variant="outline" onClick={goBack} className="h-10 rounded-xl gap-1">
                      <ArrowLeft className="h-4 w-4" /> Atrás
                    </Button>
                    <Button onClick={goNext} disabled={!isDetailsValid} className="flex-1 h-10 rounded-xl gap-1">
                      Siguiente <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}

              {/* ── STEP: Photo ── */}
              {wizardStep === "photo" && (
                <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div className="text-center space-y-1">
                    <h2 className="text-lg font-bold text-foreground">Foto de perfil</h2>
                    <p className="text-sm text-muted-foreground">
                      Sube una foto clara de tu rostro para identificarte
                    </p>
                  </div>

                  <input ref={fileRef} type="file" accept="image/*" capture="user" onChange={handlePhotoSelect} className="hidden" />

                  <button onClick={() => fileRef.current?.click()} className="group mx-auto block relative">
                    <Avatar className="h-28 w-28 border-2 border-dashed border-border group-hover:border-primary/50 transition-colors">
                      {avatarPreview ? (
                        <AvatarImage src={avatarPreview} />
                      ) : (
                        <AvatarFallback className="bg-muted/30 text-muted-foreground">
                          <Camera className="h-8 w-8" />
                        </AvatarFallback>
                      )}
                    </Avatar>
                    <div className="absolute -bottom-1 -right-1 bg-primary text-primary-foreground rounded-full p-1.5 shadow-md">
                      <Camera className="h-3.5 w-3.5" />
                    </div>
                  </button>

                  {error && <p className="text-xs text-destructive text-center">{error}</p>}

                  <div className="text-[10px] text-muted-foreground bg-muted/20 rounded-xl p-3 space-y-0.5">
                    <p className="font-semibold text-foreground text-xs mb-1">Requisitos:</p>
                    <p>✓ Foto clara de tu rostro</p>
                    <p>✓ Sin lentes de sol ni mascarilla</p>
                    <p>✓ Buena iluminación</p>
                  </div>

                  <div className="flex gap-2">
                    <Button variant="outline" onClick={goBack} className="h-10 rounded-xl gap-1">
                      <ArrowLeft className="h-4 w-4" /> Atrás
                    </Button>
                    <Button
                      onClick={handleActivate}
                      disabled={!avatarPreview || busy}
                      className="flex-1 h-12 rounded-xl text-base font-semibold gap-2"
                    >
                      {busy ? (
                        <><Loader2 className="h-4 w-4 animate-spin" /> Activando...</>
                      ) : (
                        <>
                          Activar mi cuenta
                          <ArrowRight className="h-4 w-4" />
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              )}

              {/* ── STEP: Ready ── */}
              {wizardStep === "ready" && (
                <div className="space-y-5 text-center animate-in fade-in zoom-in-95 duration-500">
                  <div className="h-18 w-18 mx-auto rounded-full bg-gradient-to-br from-earning to-[hsl(var(--status-confirmed))] flex items-center justify-center shadow-lg">
                    <CheckCircle2 className="h-10 w-10 text-white" />
                  </div>
                  <div className="space-y-1">
                    <h2 className="text-xl font-bold text-foreground">¡Todo listo! 🎉</h2>
                    <p className="text-sm text-muted-foreground">
                      Tu portal está activado. Ya puedes ver turnos, confirmar asistencia y chatear.
                    </p>
                  </div>

                  <div className="rounded-xl border border-earning/20 bg-earning/5 p-4 space-y-2 text-left">
                    <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <CheckCircle2 className="h-3.5 w-3.5 text-earning" />
                      Perfil completo
                    </p>
                    <div className="text-xs text-muted-foreground space-y-1 ml-5">
                      <p>• Ver y confirmar turnos</p>
                      <p>• Registrar entrada y salida</p>
                      <p>• Chat con tu equipo</p>
                      <p>• Ver pagos y anuncios</p>
                    </div>
                  </div>

                  <Button
                    onClick={() => navigate("/portal")}
                    className="w-full h-12 rounded-xl text-base font-semibold gap-2"
                  >
                    Ir a mi portal
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>

        <p className="text-center text-[10px] text-muted-foreground/40 mt-4">
          Powered by Stafly
        </p>
      </div>
    </div>
  );
}
