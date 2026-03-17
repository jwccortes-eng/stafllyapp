import { useState, useRef, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { StaflyLogo } from "@/components/brand/StaflyBrand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  Camera, Upload, RotateCcw, Check, Loader2, UserPlus, Phone, Mail, User,
  CheckCircle2, Building2, ArrowRight, ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Step = "loading" | "form" | "photo" | "submitting" | "success" | "error";

interface CompanyInfo {
  id: string;
  name: string;
  logo_url: string | null;
  brand_color: string | null;
}

export default function JoinCompany() {
  const { inviteCode } = useParams<{ inviteCode: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [step, setStep] = useState<Step>("loading");
  const [company, setCompany] = useState<CompanyInfo | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  // Form fields
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  // Photo
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  // Validate invite code and fetch company
  useEffect(() => {
    if (!inviteCode) {
      setErrorMsg("Código de invitación no válido.");
      setStep("error");
      return;
    }

    const fetchCompany = async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("id, name, logo_url, brand_color")
        .eq("invite_code", inviteCode.toUpperCase())
        .eq("is_active", true)
        .maybeSingle();

      if (error || !data) {
        setErrorMsg("El enlace de invitación no es válido o la empresa no está activa.");
        setStep("error");
        return;
      }

      setCompany(data);
      setStep("form");
    };

    fetchCompany();
  }, [inviteCode]);

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      toast({ title: "Solo imágenes", description: "Selecciona un archivo JPG o PNG.", variant: "destructive" });
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      toast({ title: "Archivo muy grande", description: "Máximo 5 MB.", variant: "destructive" });
      return;
    }
    setPhotoFile(f);
    setPhotoPreview(URL.createObjectURL(f));
  };

  const validateForm = (): boolean => {
    if (!firstName.trim() || !lastName.trim()) {
      toast({ title: "Nombre requerido", description: "Ingresa tu nombre y apellido.", variant: "destructive" });
      return false;
    }
    if (!phone.trim() || phone.replace(/\D/g, "").length < 10) {
      toast({ title: "Teléfono requerido", description: "Ingresa un número de teléfono válido (10+ dígitos).", variant: "destructive" });
      return false;
    }
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      toast({ title: "Email inválido", description: "Verifica el formato del email.", variant: "destructive" });
      return false;
    }
    return true;
  };

  const goToPhoto = () => {
    if (!validateForm()) return;
    setStep("photo");
  };

  const handleSubmit = async () => {
    if (!company || !photoFile) return;
    setSubmitting(true);
    setStep("submitting");

    try {
      const cleanPhone = phone.replace(/\D/g, "");
      // Normalize US numbers
      const normalizedPhone = cleanPhone.length === 10 ? `1${cleanPhone}` : cleanPhone;

      // Check if employee already exists with this phone
      const { data: existing } = await supabase
        .from("employees")
        .select("id")
        .eq("company_id", company.id)
        .eq("phone_number", normalizedPhone)
        .maybeSingle();

      if (existing) {
        toast({
          title: "Ya registrado",
          description: "Este número de teléfono ya está registrado en esta empresa. Usa la app para iniciar sesión.",
          variant: "destructive",
        });
        setStep("form");
        setSubmitting(false);
        return;
      }

      // Generate PIN from last 4 digits of phone
      const defaultPin = normalizedPhone.slice(-4);

      // Create employee record
      const { data: newEmp, error: insertErr } = await supabase
        .from("employees")
        .insert({
          company_id: company.id,
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          phone_number: normalizedPhone,
          email: email.trim() || null,
          access_pin: defaultPin,
          is_active: true,
          portal_access_enabled: true,
          must_change_pin: true,
          added_via: "self_registration",
        })
        .select("id")
        .single();

      if (insertErr) throw insertErr;

      // Upload photo
      const ext = photoFile.name.split(".").pop() || "jpg";
      const path = `${newEmp.id}.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from("employee-avatars")
        .upload(path, photoFile, { upsert: true });

      if (uploadErr) {
        console.error("Photo upload error:", uploadErr);
      } else {
        const { data: urlData } = supabase.storage
          .from("employee-avatars")
          .getPublicUrl(path);
        const avatarUrl = `${urlData.publicUrl}?t=${Date.now()}`;
        await supabase.from("employees").update({ avatar_url: avatarUrl }).eq("id", newEmp.id);
      }

      setStep("success");
    } catch (err: any) {
      console.error("Registration error:", err);
      toast({ title: "Error al registrarse", description: err.message, variant: "destructive" });
      setStep("form");
    } finally {
      setSubmitting(false);
    }
  };

  // ─── LOADING ───
  if (step === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // ─── ERROR ───
  if (step === "error") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6">
        <div className="w-full max-w-sm text-center space-y-6">
          <StaflyLogo size={44} />
          <div className="bg-card rounded-2xl border p-8 space-y-4">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-destructive/10 flex items-center justify-center">
              <ShieldCheck className="h-7 w-7 text-destructive" />
            </div>
            <h1 className="text-lg font-bold text-foreground">Enlace no válido</h1>
            <p className="text-sm text-muted-foreground">{errorMsg}</p>
            <Button variant="outline" onClick={() => navigate("/")} className="w-full">
              Ir al inicio
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ─── SUCCESS ───
  if (step === "success") {
    const cleanPhone = phone.replace(/\D/g, "");
    const normalizedPhone = cleanPhone.length === 10 ? `1${cleanPhone}` : cleanPhone;
    const defaultPin = normalizedPhone.slice(-4);

    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6">
        <div className="w-full max-w-sm text-center space-y-6">
          <StaflyLogo size={44} />
          <div className="bg-card rounded-2xl border p-8 space-y-5">
            <div className="mx-auto w-16 h-16 rounded-full bg-earning/10 flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8 text-earning" />
            </div>
            <div className="space-y-1">
              <h1 className="text-xl font-bold text-foreground">¡Registro exitoso!</h1>
              <p className="text-sm text-muted-foreground">
                Ya puedes acceder al portal de <span className="font-semibold text-foreground">{company?.name}</span>
              </p>
            </div>

            <div className="bg-muted/30 rounded-xl p-4 space-y-2 text-left">
              <p className="text-xs font-semibold text-foreground">Tus credenciales de acceso:</p>
              <div className="flex items-center gap-2">
                <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-sm font-mono">{normalizedPhone}</span>
              </div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-sm">PIN temporal: <span className="font-bold font-mono text-primary">{defaultPin}</span></span>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                Se te pedirá cambiar tu PIN en el primer inicio de sesión.
              </p>
            </div>

            <Button onClick={() => navigate("/auth")} className="w-full gap-2">
              <ArrowRight className="h-4 w-4" />
              Ir a iniciar sesión
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ─── SUBMITTING ───
  if (step === "submitting") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6">
        <div className="w-full max-w-sm text-center space-y-6">
          <StaflyLogo size={44} />
          <div className="bg-card rounded-2xl border p-8 space-y-4">
            <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
            <p className="text-sm text-muted-foreground">Creando tu cuenta...</p>
          </div>
        </div>
      </div>
    );
  }

  // ─── PHOTO STEP ───
  if (step === "photo") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6">
        <div className="w-full max-w-sm space-y-6">
          <div className="flex flex-col items-center">
            <StaflyLogo size={44} />
          </div>

          <div className="bg-card rounded-2xl border p-6 space-y-5">
            <div className="text-center space-y-2">
              <div className="mx-auto w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                <Camera className="h-6 w-6 text-primary" />
              </div>
              <h2 className="text-lg font-bold text-foreground">Foto de perfil</h2>
              <p className="text-xs text-muted-foreground">
                Sube una foto clara de tu rostro para identificarte
              </p>
            </div>

            {/* Preview */}
            <div className="relative mx-auto w-40 h-40 rounded-full bg-muted/30 border-2 border-dashed border-border overflow-hidden flex items-center justify-center">
              {photoPreview ? (
                <img src={photoPreview} alt="Preview" className="h-full w-full object-cover" />
              ) : (
                <div className="text-center space-y-1 p-4">
                  <Camera className="h-8 w-8 text-muted-foreground/30 mx-auto" />
                  <p className="text-[10px] text-muted-foreground">Tu foto aquí</p>
                </div>
              )}
            </div>

            {/* Guidelines */}
            <div className="text-[10px] text-muted-foreground bg-muted/30 rounded-xl p-3 space-y-0.5">
              <p className="font-semibold text-foreground text-xs mb-1">Requisitos:</p>
              <p>✓ Foto clara de tu rostro</p>
              <p>✓ Sin lentes de sol ni mascarilla</p>
              <p>✓ Sin fotos grupales</p>
            </div>

            <input ref={cameraInputRef} type="file" accept="image/*" capture="user" onChange={handlePhotoSelect} className="hidden" />
            <input ref={galleryInputRef} type="file" accept="image/*" onChange={handlePhotoSelect} className="hidden" />

            {photoPreview ? (
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 gap-1.5" onClick={() => { setPhotoFile(null); setPhotoPreview(null); }}>
                  <RotateCcw className="h-3.5 w-3.5" />
                  Otra foto
                </Button>
                <Button className="flex-1 gap-1.5" onClick={handleSubmit} disabled={submitting}>
                  {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  Completar registro
                </Button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 gap-1.5" onClick={() => cameraInputRef.current?.click()}>
                  <Camera className="h-3.5 w-3.5" />
                  Cámara
                </Button>
                <Button variant="outline" className="flex-1 gap-1.5" onClick={() => galleryInputRef.current?.click()}>
                  <Upload className="h-3.5 w-3.5" />
                  Galería
                </Button>
              </div>
            )}

            <Button variant="ghost" size="sm" className="w-full text-xs text-muted-foreground" onClick={() => setStep("form")}>
              ← Volver al formulario
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ─── FORM STEP ───
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center">
          <StaflyLogo size={44} />
        </div>

        <div className="bg-card rounded-2xl border p-6 space-y-5">
          {/* Company header */}
          <div className="text-center space-y-3">
            {company?.logo_url ? (
              <img src={company.logo_url} alt={company.name} className="h-12 mx-auto rounded-xl object-contain" />
            ) : (
              <div className="mx-auto w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                <Building2 className="h-6 w-6 text-primary" />
              </div>
            )}
            <div>
              <h1 className="text-lg font-bold text-foreground">Únete a {company?.name}</h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                Completa tus datos para registrarte como empleado
              </p>
            </div>
          </div>

          {/* Form */}
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="firstName" className="text-xs">Nombre *</Label>
                <Input
                  id="firstName"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Juan"
                  className="h-10"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="lastName" className="text-xs">Apellido *</Label>
                <Input
                  id="lastName"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Pérez"
                  className="h-10"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="phone" className="text-xs">Teléfono *</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(786) 555-1234"
                  className="h-10 pl-9"
                />
              </div>
              <p className="text-[10px] text-muted-foreground">Este será tu usuario para iniciar sesión</p>
            </div>

            <div className="space-y-1">
              <Label htmlFor="email" className="text-xs">Email (opcional)</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@email.com"
                  className="h-10 pl-9"
                />
              </div>
            </div>
          </div>

          <Button onClick={goToPhoto} className="w-full h-11 gap-2 text-sm font-semibold">
            <UserPlus className="h-4 w-4" />
            Continuar
          </Button>

          <p className="text-[10px] text-center text-muted-foreground">
            Al registrarte aceptas los{" "}
            <a href="/terms" className="underline hover:text-foreground">términos de servicio</a>{" "}
            y la{" "}
            <a href="/privacy" className="underline hover:text-foreground">política de privacidad</a>.
          </p>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          ¿Ya tienes cuenta?{" "}
          <button onClick={() => navigate("/auth")} className="text-primary font-semibold hover:underline">
            Iniciar sesión
          </button>
        </p>
      </div>
    </div>
  );
}
