import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { NumericKeypad } from "./NumericKeypad";
import { StaflyLogo } from "@/components/brand/StaflyBrand";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  Phone, Loader2, ShieldCheck, Lock, CheckCircle2, Camera, Mail, ArrowLeft, Sparkles, UserCheck
} from "lucide-react";
import { cn } from "@/lib/utils";

type EmployeeStep = "phone" | "activate_pin" | "activate_profile" | "login_pin" | "force_change_pin";

interface EmployeeInfo {
  found: boolean;
  requires_activation: boolean;
  is_active: boolean;
}

/** Extract real error message from supabase.functions.invoke error */
async function extractErrorMsg(error: any): Promise<string> {
  try {
    const ctx = error?.context;
    if (ctx && typeof ctx.json === "function") {
      const body = await ctx.json();
      if (body?.error) return body.error;
    }
  } catch { /* ignore */ }
  return error?.message || "Error de conexión. Verifica tu internet e intenta de nuevo.";
}

export function EmployeeAuthFlow({ onSessionReady }: { onSessionReady: () => void }) {
  const { toast } = useToast();
  const [step, setStep] = useState<EmployeeStep>("phone");
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [pinPhase, setPinPhase] = useState<"create" | "confirm">("create");
  const [employeeInfo, setEmployeeInfo] = useState<EmployeeInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePhoneCheck = async () => {
    if (!phone.trim() || phone.replace(/\D/g, "").length < 7) {
      toast({ title: "Error", description: "Ingresa un número de teléfono válido", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("employee-auth", {
        body: { action: "check", phone: phone.trim() },
      });

      if (error) {
        const msg = await extractErrorMsg(error);
        toast({ title: "Error", description: msg, variant: "destructive" });
        return;
      }

      if (data?.error) {
        toast({ title: "Error", description: data.error, variant: "destructive" });
      } else if (!data?.found) {
        toast({ title: "No encontrado", description: "No hay cuenta asociada a este número. Verifica con tu administrador.", variant: "destructive" });
      } else if (!data.is_active) {
        toast({ title: "Cuenta inactiva", description: "Tu cuenta está inactiva. Contacta al administrador.", variant: "destructive" });
      } else {
        setEmployeeInfo(data);
        if (!data.requires_activation) {
          setStep("login_pin");
        } else {
          setStep("activate_pin");
        }
      }
    } catch (e: any) {
      toast({ title: "Error", description: e?.message || "Error de conexión. Verifica tu internet e intenta de nuevo.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (enteredPin: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("employee-auth", {
        body: { action: "login", phone: phone.trim(), pin: enteredPin },
      });

      if (error) {
        const msg = await extractErrorMsg(error);
        toast({ title: "Error", description: msg, variant: "destructive" });
        setPin("");
        return;
      }

      if (data?.error) {
        toast({ title: "Error", description: data.error, variant: "destructive" });
        setPin("");
      } else if (data?.session) {
        await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        });
        onSessionReady();
      }
    } catch (e: any) {
      toast({ title: "Error", description: e?.message || "Error al iniciar sesión. Verifica tu internet.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handlePinCreate = (enteredPin: string) => {
    if (pinPhase === "create") {
      setPin(enteredPin);
      setPinPhase("confirm");
      setConfirmPin("");
    }
  };

  const handlePinConfirm = (enteredPin: string) => {
    if (enteredPin !== pin) {
      toast({ title: "No coinciden", description: "Los PINs no coinciden. Intenta de nuevo.", variant: "destructive" });
      setPinPhase("create");
      setPin("");
      setConfirmPin("");
      return;
    }
    setConfirmPin(enteredPin);
    setStep("activate_profile");
  };

  const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Archivo muy grande", description: "La imagen debe ser menor a 5MB", variant: "destructive" });
      return;
    }
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const handleActivate = async () => {
    setLoading(true);
    try {
      let avatarUrl: string | undefined;

      // Upload avatar if selected
      if (avatarFile) {
        const ext = avatarFile.name.split(".").pop() || "jpg";
        const path = `${phone.replace(/\D/g, "")}_${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("employee-avatars")
          .upload(path, avatarFile, { upsert: true });
        if (!uploadError) {
          const { data: urlData } = supabase.storage.from("employee-avatars").getPublicUrl(path);
          avatarUrl = urlData.publicUrl;
        }
      }

      const { data, error } = await supabase.functions.invoke("employee-auth", {
        body: {
          action: "activate",
          phone: phone.trim(),
          pin,
          email: email.trim() || undefined,
          avatar_url: avatarUrl,
        },
      });

      if (error) {
        const msg = await extractErrorMsg(error);
        toast({ title: "Error", description: msg, variant: "destructive" });
        return;
      }

      if (data?.error) {
        toast({ title: "Error", description: data.error, variant: "destructive" });
        return;
      }

      if (data?.session) {
        await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        });
        toast({ title: "¡Cuenta activada! 🎉", description: "Bienvenido a StaflyApps" });
        onSessionReady();
      }
    } catch (e: any) {
      toast({ title: "Error", description: e?.message || "Error al activar cuenta. Verifica tu internet.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const initials = "EP";

  return (
    <div className="w-full max-w-[400px] mx-auto">
      {/* Logo */}
      <div className="flex flex-col items-center mb-8">
        <StaflyLogo size={44} />
      </div>

      {/* Step: Phone entry */}
      {step === "phone" && (
        <div className="bg-card rounded-2xl shadow-sm border border-border/40 px-8 py-9 space-y-6">
          <div className="text-center space-y-1">
            <h1 className="text-lg font-semibold font-heading text-foreground tracking-tight">
              Acceso empleado
            </h1>
            <p className="text-sm text-muted-foreground">
              Ingresa tu número de teléfono registrado
            </p>
          </div>

          <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-primary/[0.06] border border-primary/10">
            <Phone className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs text-primary font-medium">Modo empleado</span>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="phone" className="text-xs font-semibold text-foreground/80">Teléfono</Label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
              <Input
                id="phone"
                type="tel"
                inputMode="numeric"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Tu número de teléfono"
                className="pl-9 h-12 bg-muted/30 border-border/50 rounded-xl text-sm focus:bg-card transition-colors"
                onKeyDown={(e) => e.key === "Enter" && handlePhoneCheck()}
              />
            </div>
          </div>

          <Button
            onClick={handlePhoneCheck}
            disabled={loading}
            className="w-full h-12 text-sm font-semibold rounded-xl shadow-sm"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Continuar"}
          </Button>
        </div>
      )}

      {/* Step: Login PIN */}
      {step === "login_pin" && employeeInfo && (
        <div className="bg-card rounded-2xl shadow-sm border border-border/40 px-8 py-9 space-y-6">
          <button
            onClick={() => { setStep("phone"); setPin(""); }}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-3 w-3" /> Cambiar número
          </button>

          <div className="text-center space-y-2">
            <Avatar className="h-16 w-16 mx-auto border-2 border-primary/20">
              <AvatarFallback className="bg-primary/10 text-primary font-bold text-lg">
                {initials}
              </AvatarFallback>
            </Avatar>
            <h1 className="text-lg font-semibold font-heading text-foreground tracking-tight">
              Ingresa tu PIN
            </h1>
            <p className="text-sm text-muted-foreground">Ingresa tu PIN de 4 dígitos</p>
          </div>

          <NumericKeypad
            value={pin}
            maxLength={4}
            onChange={setPin}
            onComplete={handleLogin}
          />

          {loading && (
            <div className="flex justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          )}
        </div>
      )}

      {/* Step: Activation - Create PIN */}
      {step === "activate_pin" && employeeInfo && (
        <div className="bg-card rounded-2xl shadow-sm border border-border/40 px-8 py-9 space-y-6">
          <button
            onClick={() => { setStep("phone"); setPin(""); setPinPhase("create"); }}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-3 w-3" /> Volver
          </button>

          <div className="text-center space-y-2">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
              <Sparkles className="h-7 w-7 text-primary" />
            </div>
            <h1 className="text-lg font-semibold font-heading text-foreground tracking-tight">
              ¡Activa tu cuenta!
            </h1>
            <p className="text-sm text-muted-foreground">
              {pinPhase === "create" ? "Crea un PIN de 4 dígitos" : "Confirma tu PIN"}
            </p>
          </div>

          {/* Progress dots */}
          <div className="flex items-center justify-center gap-2">
            <div className={cn("h-1.5 rounded-full transition-all", pinPhase === "create" ? "w-8 bg-primary" : "w-4 bg-primary/30")} />
            <div className={cn("h-1.5 rounded-full transition-all", pinPhase === "confirm" ? "w-8 bg-primary" : "w-4 bg-border")} />
          </div>

          {pinPhase === "create" ? (
            <NumericKeypad
              value={pin}
              maxLength={4}
              onChange={setPin}
              onComplete={handlePinCreate}
              label="Elige tu PIN"
            />
          ) : (
            <NumericKeypad
              value={confirmPin}
              maxLength={4}
              onChange={setConfirmPin}
              onComplete={handlePinConfirm}
              label="Confirma tu PIN"
            />
          )}
        </div>
      )}

      {/* Step: Activation - Profile data */}
      {step === "activate_profile" && employeeInfo && (
        <div className="bg-card rounded-2xl shadow-sm border border-border/40 px-8 py-9 space-y-6">
          <div className="text-center space-y-2">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
              <UserCheck className="h-7 w-7 text-primary" />
            </div>
            <h1 className="text-lg font-semibold font-heading text-foreground tracking-tight">
              Completa tu perfil
            </h1>
            <p className="text-sm text-muted-foreground">
              Opcional — puedes hacerlo después
            </p>
          </div>

          {/* Avatar upload */}
          <div className="flex flex-col items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="user"
              className="hidden"
              onChange={handleAvatarSelect}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="group relative"
            >
              <Avatar className="h-20 w-20 border-2 border-dashed border-border group-hover:border-primary/50 transition-colors">
                {avatarPreview ? (
                  <AvatarImage src={avatarPreview} />
                ) : (
                  <AvatarFallback className="bg-muted/50 text-muted-foreground">
                    <Camera className="h-6 w-6" />
                  </AvatarFallback>
                )}
              </Avatar>
              <div className="absolute -bottom-1 -right-1 bg-primary text-primary-foreground rounded-full p-1 shadow-sm">
                <Camera className="h-3 w-3" />
              </div>
            </button>
            <span className="text-xs text-muted-foreground">Toca para agregar foto</span>
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-xs font-semibold text-foreground/80">
              Email personal <span className="text-muted-foreground font-normal">(opcional)</span>
            </Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
              <Input
                id="email"
                type="email"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@email.com"
                className="pl-9 h-11 bg-muted/30 border-border/50 rounded-xl text-sm focus:bg-card transition-colors"
              />
            </div>
          </div>

          {/* Phone confirmation */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-foreground/80">Teléfono registrado</Label>
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-muted/30 border border-border/50">
              <Phone className="h-4 w-4 text-muted-foreground/50" />
              <span className="text-sm text-foreground">{phone}</span>
              <CheckCircle2 className="h-4 w-4 text-emerald-500 ml-auto" />
            </div>
          </div>

          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={handleActivate}
              disabled={loading}
              className="flex-1 h-11 rounded-xl text-sm"
            >
              Omitir
            </Button>
            <Button
              onClick={handleActivate}
              disabled={loading}
              className="flex-1 h-11 rounded-xl text-sm font-semibold shadow-sm"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-1.5" />
                  Activar cuenta
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-center gap-1.5 mt-8 text-muted-foreground/40">
        <Lock className="h-3 w-3" />
        <span className="text-[11px]">Acceso seguro · staflyapps.com</span>
      </div>
    </div>
  );
}
