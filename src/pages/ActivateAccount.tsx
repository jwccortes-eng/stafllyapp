import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { StaflyLogo } from "@/components/brand/StaflyBrand";
import { NumericKeypad } from "@/components/auth/NumericKeypad";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  Loader2, CheckCircle2, XCircle, Clock, Shield, Camera, ArrowRight,
  Building2, Sparkles, Phone, KeyRound,
} from "lucide-react";
import { cn } from "@/lib/utils";

type PageState = "loading" | "valid" | "expired" | "used" | "invalid";
type WizardStep = "welcome" | "pin" | "photo" | "ready";

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
  const fileRef = useRef<HTMLInputElement>(null);

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

      // Mark opened
      if (!markedOpened.current && data.status !== "opened" && data.status !== "accepted") {
        markedOpened.current = true;
        await (supabase.from("employee_invitations" as any)
          .update({ status: "opened", opened_at: data.opened_at ?? new Date().toISOString() })
          .eq("id", data.id) as any);
      }

      // Fetch employee + company
      const { data: emp } = await supabase
        .from("employees")
        .select("first_name, last_name, company_id, phone_number, avatar_url")
        .eq("id", data.employee_id)
        .single();

      if (!emp) { setPageState("invalid"); return; }

      const { data: co } = await supabase
        .from("companies")
        .select("name, logo_url, brand_color")
        .eq("id", emp.company_id)
        .single();

      // If already has avatar, skip photo step
      if (emp.avatar_url) setAvatarPreview(emp.avatar_url);

      setInvite({
        ...data,
        company_id: emp.company_id,
        company_name: co?.name ?? "",
        company_logo: co?.logo_url ?? null,
        brand_color: co?.brand_color ?? null,
        employee_name: `${emp.first_name ?? ""} ${emp.last_name ?? ""}`.trim(),
        employee_phone: emp.phone_number ?? "",
        employee_first_name: emp.first_name ?? "",
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
    // If already has avatar, skip photo
    if (avatarPreview) {
      handleActivate(p);
    } else {
      setWizardStep("photo");
    }
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

  // ─── Activate ───
  const handleActivate = async (pinToUse?: string) => {
    if (!invite) return;
    setBusy(true);
    setError("");

    try {
      let avatarUrl: string | undefined;

      // Upload avatar if new file
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
          pin: pinToUse ?? pin,
          avatar_url: avatarUrl,
        },
      });

      if (fnErr || data?.error) {
        setError(data?.error || "Error al activar. Intenta de nuevo.");
        setBusy(false);
        return;
      }

      // Mark invitation accepted
      await (supabase.from("employee_invitations" as any)
        .update({ status: "accepted", accepted_at: new Date().toISOString() })
        .eq("id", invite.id) as any);

      await supabase.from("employees")
        .update({ portal_access_enabled: true } as any)
        .eq("id", invite.employee_id);

      // Set session and go to portal
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

  // ─── Computed ───
  const maskedPhone = invite?.employee_phone
    ? invite.employee_phone.replace(/\d(?=\d{4})/g, "•")
    : "";

  const stepIndex = wizardStep === "welcome" ? 0 : wizardStep === "pin" ? 1 : wizardStep === "photo" ? 2 : 3;
  const totalSteps = avatarPreview && !avatarFile ? 3 : 4; // Skip photo if already has avatar

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
      <div className="w-full max-w-sm">
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
              <div className="flex items-center gap-1.5">
                {Array.from({ length: totalSteps }).map((_, i) => (
                  <div
                    key={i}
                    className={cn(
                      "h-1 rounded-full flex-1 transition-all duration-500",
                      i <= stepIndex ? "bg-primary" : "bg-border"
                    )}
                  />
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground mt-1.5 text-right">
                Paso {stepIndex + 1} de {totalSteps}
              </p>
            </div>
          )}

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
                    Estás a punto de activar tu acceso al portal de empleados
                  </p>
                </div>

                {/* Pre-filled info */}
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
                      <p className="text-[10px] text-muted-foreground">Acceso</p>
                      <p className="text-sm font-medium text-foreground">Teléfono + PIN de 4 dígitos</p>
                    </div>
                  </div>
                </div>

                <Button
                  onClick={() => setWizardStep("pin")}
                  className="w-full h-12 rounded-xl text-base font-semibold gap-2"
                >
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
                    {pinPhase === "create"
                      ? "Elige un PIN de 4 dígitos para acceder"
                      : "Ingresa el mismo PIN para confirmar"}
                  </p>
                </div>

                {/* Phase indicator */}
                <div className="flex items-center justify-center gap-2">
                  <div className={cn("h-1.5 rounded-full transition-all duration-300",
                    pinPhase === "create" ? "w-10 bg-primary" : "w-5 bg-primary/30")} />
                  <div className={cn("h-1.5 rounded-full transition-all duration-300",
                    pinPhase === "confirm" ? "w-10 bg-primary" : "w-5 bg-border")} />
                </div>

                {error && (
                  <p className="text-xs text-destructive text-center font-medium">{error}</p>
                )}

                {pinPhase === "create" ? (
                  <NumericKeypad value={pin} maxLength={4} onChange={setPin} onComplete={handlePinCreate} />
                ) : (
                  <NumericKeypad value={confirmPin} maxLength={4} onChange={setConfirmPin} onComplete={handlePinConfirm} />
                )}

                {busy && (
                  <div className="flex justify-center">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  </div>
                )}
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

                <button
                  onClick={() => fileRef.current?.click()}
                  className="group mx-auto block relative"
                >
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

                <Button
                  onClick={() => handleActivate()}
                  disabled={!avatarPreview || busy}
                  className="w-full h-12 rounded-xl text-base font-semibold gap-2"
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
                    Acceso configurado
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
        </div>

        <p className="text-center text-[10px] text-muted-foreground/40 mt-4">
          Powered by Stafly
        </p>
      </div>
    </div>
  );
}
