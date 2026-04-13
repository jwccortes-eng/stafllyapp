import { useState, useRef, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { StaflyLogo } from "@/components/brand/StaflyBrand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import {
  Camera, Upload, RotateCcw, Check, Loader2, Phone, Mail,
  CheckCircle2, Building2, ArrowRight, ShieldCheck, ArrowLeft, Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

type WizardStep = "loading" | "info" | "photo" | "activating" | "success" | "error";

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

  const [step, setStep] = useState<WizardStep>("loading");
  const [company, setCompany] = useState<CompanyInfo | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  const currentStepIndex = step === "info" ? 0 : step === "photo" ? 1 : step === "success" ? 2 : -1;
  const totalSteps = 3;

  useEffect(() => {
    if (!inviteCode) { setErrorMsg("Invalid invite code."); setStep("error"); return; }
    (async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("id, name, logo_url, brand_color")
        .eq("invite_code", inviteCode.toUpperCase())
        .eq("is_active", true)
        .maybeSingle();
      if (error || !data) { setErrorMsg("The invite link is not valid or the company is inactive."); setStep("error"); return; }
      setCompany(data);
      setStep("info");
    })();
  }, [inviteCode]);

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith("image/")) { toast({ title: "Images only", variant: "destructive" }); return; }
    if (f.size > 5 * 1024 * 1024) { toast({ title: "Max 5 MB", variant: "destructive" }); return; }
    setPhotoFile(f);
    setPhotoPreview(URL.createObjectURL(f));
  };

  const validateForm = (): boolean => {
    if (!firstName.trim() || !lastName.trim()) { toast({ title: "Name required", description: "Enter your first and last name.", variant: "destructive" }); return false; }
    if (!phone.trim() || phone.replace(/\D/g, "").length < 10) { toast({ title: "Phone required", description: "Enter a valid number (10+ digits).", variant: "destructive" }); return false; }
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { toast({ title: "Invalid email", variant: "destructive" }); return false; }
    return true;
  };

  const goToPhoto = () => { if (validateForm()) setStep("photo"); };

  const handleSubmit = async () => {
    if (!company || !photoFile) return;
    setStep("activating");

    try {
      const cleanPhone = phone.replace(/\D/g, "");
      const normalizedPhone = cleanPhone.length === 10 ? `1${cleanPhone}` : cleanPhone;

      const { data: existing } = await supabase
        .from("employees").select("id").eq("company_id", company.id).eq("phone_number", normalizedPhone).maybeSingle();

      if (existing) {
        toast({ title: "Already registered", description: "This number is already registered. Please sign in.", variant: "destructive" });
        setStep("info"); return;
      }

      const defaultPin = normalizedPhone.slice(-4);

      const { data: newEmp, error: insertErr } = await supabase
        .from("employees")
        .insert({
          company_id: company.id, first_name: firstName.trim(), last_name: lastName.trim(),
          phone_number: normalizedPhone, email: email.trim() || null,
          access_pin: defaultPin, is_active: true, portal_access_enabled: true,
          must_change_pin: true, added_via: "self_registration",
        })
        .select("id").single();

      if (insertErr) throw insertErr;

      const ext = photoFile.name.split(".").pop() || "jpg";
      const path = `${newEmp.id}.${ext}`;
      const { error: uploadErr } = await supabase.storage.from("employee-avatars").upload(path, photoFile, { upsert: true });
      if (!uploadErr) {
        const { data: urlData } = supabase.storage.from("employee-avatars").getPublicUrl(path);
        await supabase.from("employees").update({ avatar_url: `${urlData.publicUrl}?t=${Date.now()}` }).eq("id", newEmp.id);
      }

      setStep("success");
    } catch (err: any) {
      toast({ title: "Registration error", description: err.message, variant: "destructive" });
      setStep("info");
    }
  };

  // ─── Loading ───
  if (step === "loading") {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-background gap-4">
        <StaflyLogo size={32} />
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Verifying link...</p>
      </div>
    );
  }

  // ─── Error ───
  if (step === "error") {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-gradient-to-b from-background to-muted/20 p-4">
        <div className="w-full max-w-sm">
          <div className="bg-card rounded-3xl border border-border/50 shadow-xl overflow-hidden">
            <div className="px-8 pt-8 pb-4 flex flex-col items-center"><StaflyLogo size={28} /></div>
            <div className="px-8 pb-8 flex flex-col items-center gap-4 text-center">
              <div className="h-16 w-16 rounded-2xl bg-destructive/10 flex items-center justify-center">
                <ShieldCheck className="h-8 w-8 text-destructive" />
              </div>
              <h2 className="text-xl font-bold text-foreground">Invalid link</h2>
              <p className="text-sm text-muted-foreground">{errorMsg}</p>
              <Button variant="outline" onClick={() => navigate("/")} className="w-full rounded-xl">Go to home</Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Activating ───
  if (step === "activating") {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-background gap-4">
        <StaflyLogo size={32} />
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Creating your account...</p>
      </div>
    );
  }

  // ─── Success ───
  if (step === "success") {
    const cleanPhone = phone.replace(/\D/g, "");
    const normalizedPhone = cleanPhone.length === 10 ? `1${cleanPhone}` : cleanPhone;
    const defaultPin = normalizedPhone.slice(-4);

    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-gradient-to-b from-background to-muted/20 p-4">
        <div className="w-full max-w-sm">
          <div className="bg-card rounded-3xl border border-border/50 shadow-xl overflow-hidden">
            <div className="px-6 pt-6 pb-4 flex flex-col items-center gap-2 border-b border-border/30">
              {company?.logo_url ? (
                <img src={company.logo_url} alt="" className="h-12 w-12 rounded-xl object-cover shadow-md" />
              ) : <StaflyLogo size={28} />}
              <span className="text-xs font-semibold text-muted-foreground">{company?.name}</span>
            </div>

            {/* Progress complete */}
            <div className="px-6 pt-4">
              <div className="flex items-center gap-1.5">
                {Array.from({ length: totalSteps }).map((_, i) => (
                  <div key={i} className="h-1 rounded-full flex-1 bg-primary transition-all duration-500" />
                ))}
              </div>
            </div>

            <div className="px-6 py-6 space-y-5 animate-in fade-in zoom-in-95 duration-500">
              <div className="mx-auto h-16 w-16 rounded-full bg-gradient-to-br from-earning to-[hsl(var(--status-confirmed))] flex items-center justify-center shadow-lg">
                <CheckCircle2 className="h-8 w-8 text-white" />
              </div>
              <div className="text-center space-y-1">
                <h2 className="text-xl font-bold text-foreground">Registration complete! 🎉</h2>
                <p className="text-sm text-muted-foreground">
                  You can now access the <span className="font-semibold text-foreground">{company?.name}</span> portal
                </p>
              </div>

              <div className="bg-muted/20 rounded-xl p-4 space-y-2.5 border border-border/30">
                <p className="text-xs font-semibold text-foreground">Your credentials:</p>
                <div className="flex items-center gap-2">
                  <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-sm font-mono">{normalizedPhone}</span>
                </div>
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-sm">Temporary PIN: <span className="font-bold font-mono text-primary">{defaultPin}</span></span>
                </div>
                <p className="text-[10px] text-muted-foreground">You'll be asked to change your PIN on first login.</p>
              </div>

              <Button onClick={() => navigate("/auth")} className="w-full h-12 rounded-xl text-base font-semibold gap-2">
                <ArrowRight className="h-4 w-4" />
                Sign in now
              </Button>
            </div>
          </div>
          <p className="text-center text-[10px] text-muted-foreground/40 mt-4">Powered by Stafly</p>
        </div>
      </div>
    );
  }

  // ─── FORM / PHOTO STEPS ───
  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-gradient-to-b from-background to-muted/20 p-4">
      <div className="w-full max-w-sm">
        <div className="bg-card rounded-3xl border border-border/50 shadow-xl overflow-hidden">
          {/* Company header */}
          <div className="bg-gradient-to-br from-primary/[0.06] to-transparent px-6 pt-6 pb-4 flex flex-col items-center gap-2 border-b border-border/30">
            {company?.logo_url ? (
              <img src={company.logo_url} alt={company.name} className="h-12 w-12 rounded-xl object-cover shadow-md" />
            ) : (
              <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <Building2 className="h-6 w-6 text-primary" />
              </div>
            )}
            <span className="text-xs font-semibold text-muted-foreground tracking-wide">{company?.name}</span>
          </div>

          {/* Progress */}
          <div className="px-6 pt-4">
            <div className="flex items-center gap-1.5">
              {Array.from({ length: totalSteps }).map((_, i) => (
                <div
                  key={i}
                  className={cn(
                    "h-1 rounded-full flex-1 transition-all duration-500",
                    i <= currentStepIndex ? "bg-primary" : "bg-border"
                  )}
                />
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1.5 text-right">
              Step {currentStepIndex + 1} of {totalSteps}
            </p>
          </div>

          <div className="px-6 py-5">
            {/* ── Info Step ── */}
            {step === "info" && (
              <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="text-center space-y-1">
                  <Sparkles className="h-5 w-5 text-primary mx-auto" />
                  <h1 className="text-lg font-bold text-foreground">Join the team</h1>
                  <p className="text-xs text-muted-foreground">Fill in your details to register</p>
                </div>

                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label htmlFor="fn" className="text-xs">First name *</Label>
                      <Input id="fn" value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="John" className="h-10 rounded-xl" />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="ln" className="text-xs">Last name *</Label>
                      <Input id="ln" value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Doe" className="h-10 rounded-xl" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="ph" className="text-xs">Phone *</Label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input id="ph" type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="(786) 555-1234" className="h-10 pl-9 rounded-xl" />
                    </div>
                    <p className="text-[10px] text-muted-foreground">This will be your username to sign in</p>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="em" className="text-xs">Email (optional)</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input id="em" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@email.com" className="h-10 pl-9 rounded-xl" />
                    </div>
                  </div>
                </div>

                <Button onClick={goToPhoto} className="w-full h-11 rounded-xl gap-2 text-sm font-semibold">
                  Continue <ArrowRight className="h-4 w-4" />
                </Button>

                <p className="text-[10px] text-center text-muted-foreground">
                  By registering you agree to the <a href="/terms" className="underline hover:text-foreground">terms</a> and <a href="/privacy" className="underline hover:text-foreground">privacy policy</a>.
                </p>
              </div>
            )}

            {/* ── Photo Step ── */}
            {step === "photo" && (
              <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                <button onClick={() => setStep("info")} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                  <ArrowLeft className="h-3 w-3" /> Back
                </button>

                <div className="text-center space-y-1">
                  <Camera className="h-5 w-5 text-primary mx-auto" />
                  <h2 className="text-lg font-bold text-foreground">Profile photo</h2>
                  <p className="text-xs text-muted-foreground">A clear photo of your face</p>
                </div>

                <input ref={cameraRef} type="file" accept="image/*" capture="user" onChange={handlePhotoSelect} className="hidden" />
                <input ref={galleryRef} type="file" accept="image/*" onChange={handlePhotoSelect} className="hidden" />

                <div className="relative mx-auto w-32 h-32 rounded-full bg-muted/20 border-2 border-dashed border-border overflow-hidden flex items-center justify-center">
                  {photoPreview ? (
                    <img src={photoPreview} alt="Preview" className="h-full w-full object-cover" />
                  ) : (
                    <Camera className="h-8 w-8 text-muted-foreground/30" />
                  )}
                </div>

                {photoPreview ? (
                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1 gap-1.5 rounded-xl" onClick={() => { setPhotoFile(null); setPhotoPreview(null); }}>
                      <RotateCcw className="h-3.5 w-3.5" /> Retake
                    </Button>
                    <Button className="flex-1 gap-1.5 rounded-xl" onClick={handleSubmit}>
                      <Check className="h-3.5 w-3.5" /> Complete
                    </Button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1 gap-1.5 rounded-xl" onClick={() => cameraRef.current?.click()}>
                      <Camera className="h-3.5 w-3.5" /> Camera
                    </Button>
                    <Button variant="outline" className="flex-1 gap-1.5 rounded-xl" onClick={() => galleryRef.current?.click()}>
                      <Upload className="h-3.5 w-3.5" /> Gallery
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <p className="text-center mt-4">
          <span className="text-xs text-muted-foreground">Already have an account? </span>
          <button onClick={() => navigate("/auth")} className="text-xs text-primary font-semibold hover:underline">Sign in</button>
        </p>
        <p className="text-center text-[10px] text-muted-foreground/40 mt-2">Powered by Stafly</p>
      </div>
    </div>
  );
}