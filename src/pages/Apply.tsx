import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { StaflyMark } from "@/components/brand/StaflyBrand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import {
  ChevronRight, ChevronLeft, CheckCircle2, Loader2,
  UtensilsCrossed, Car, SprayCan, Briefcase,
  MapPin, Clock, Upload, Shield,
} from "lucide-react";

const WORKER_TYPES = [
  { value: "waiter", label: "Mesero", icon: UtensilsCrossed },
  { value: "driver", label: "Driver", icon: Car },
  { value: "cleaning", label: "Limpieza", icon: SprayCan },
  { value: "other", label: "Otro", icon: Briefcase },
];

const STEPS = ["Bienvenida", "Datos", "Tipo", "Ubicación", "Verificación", "Listo"];

export default function Apply() {
  const { companySlug } = useParams<{ companySlug: string }>();
  const [step, setStep] = useState(0);
  const [company, setCompany] = useState<{ id: string; name: string; logo_url: string | null; brand_color: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [referenceCode, setReferenceCode] = useState("");

  // Form data
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [workerType, setWorkerType] = useState("");
  const [city, setCity] = useState("");
  const [availability, setAvailability] = useState("full_time");
  const [canDrive, setCanDrive] = useState(false);
  const [documentFile, setDocumentFile] = useState<File | null>(null);

  // Validation
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!companySlug) return;
    supabase
      .from("companies")
      .select("id, name, logo_url, brand_color")
      .eq("slug", companySlug)
      .eq("is_active", true)
      .maybeSingle()
      .then(({ data }) => {
        setCompany(data);
        setLoading(false);
      });
  }, [companySlug]);

  const progressPercent = Math.round((step / (STEPS.length - 1)) * 100);

  const validateStep2 = () => {
    const e: Record<string, string> = {};
    if (!firstName.trim()) e.firstName = "Requerido";
    if (!lastName.trim()) e.lastName = "Requerido";
    if (!phone.trim() || phone.trim().length < 7) e.phone = "Teléfono inválido";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const validateStep3 = () => {
    if (!workerType) {
      setErrors({ workerType: "Selecciona un tipo" });
      return false;
    }
    setErrors({});
    return true;
  };

  const handleNext = () => {
    if (step === 1 && !validateStep2()) return;
    if (step === 2 && !validateStep3()) return;
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const handleBack = () => setStep((s) => Math.max(s - 1, 0));

  const handleSubmit = async () => {
    if (!company) return;
    setSubmitting(true);

    try {
      let documentUrl: string | undefined;
      if (documentFile) {
        const ext = documentFile.name.split(".").pop();
        const path = `${company.id}/${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("application-documents")
          .upload(path, documentFile);
        if (!uploadError) {
          documentUrl = path;
        }
      }

      const { data, error } = await supabase
        .from("job_applications")
        .insert({
          company_id: company.id,
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          phone: phone.trim(),
          email: email.trim() || null,
          worker_type: workerType,
          city: city.trim() || null,
          availability,
          can_drive: canDrive,
          document_url: documentUrl ?? null,
        })
        .select("reference_code")
        .single();

      if (error) throw error;
      setReferenceCode(data.reference_code);
      setStep(5);
    } catch (err) {
      console.error("Submit error:", err);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!company) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6 text-center">
        <StaflyMark size={48} />
        <h1 className="text-xl font-heading font-bold mt-4 text-foreground">Empresa no encontrada</h1>
        <p className="text-sm text-muted-foreground mt-2">El enlace que usaste no es válido o la empresa no está activa.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-card/80 backdrop-blur-lg border-b border-border/40 px-4 py-3">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          {company.logo_url ? (
            <img src={company.logo_url} alt={company.name} className="h-8 w-8 rounded-lg object-cover" />
          ) : (
            <StaflyMark size={32} />
          )}
          <span className="font-heading font-bold text-sm text-foreground">{company.name}</span>
        </div>
      </header>

      {/* Progress */}
      {step < 5 && (
        <div className="px-4 pt-4 max-w-lg mx-auto w-full">
          <div className="flex items-center gap-3 mb-1">
            <Progress
              value={progressPercent}
              className="h-2 flex-1 bg-muted/60 [&>div]:bg-gradient-to-r [&>div]:from-primary [&>div]:to-primary-glow [&>div]:rounded-full rounded-full"
            />
            <span className="text-[11px] font-semibold text-primary tabular-nums">
              {step + 1}/{STEPS.length}
            </span>
          </div>
          <p className="text-[10px] text-muted-foreground">{STEPS[step]}</p>
        </div>
      )}

      {/* Content */}
      <main className="flex-1 flex flex-col max-w-lg mx-auto w-full px-4 py-6">
        {step === 0 && (
          <StepWelcome companyName={company.name} onStart={handleNext} />
        )}
        {step === 1 && (
          <StepBasicInfo
            firstName={firstName} setFirstName={setFirstName}
            lastName={lastName} setLastName={setLastName}
            phone={phone} setPhone={setPhone}
            email={email} setEmail={setEmail}
            errors={errors}
          />
        )}
        {step === 2 && (
          <StepWorkerType selected={workerType} onSelect={setWorkerType} error={errors.workerType} />
        )}
        {step === 3 && (
          <StepLocation
            city={city} setCity={setCity}
            availability={availability} setAvailability={setAvailability}
            canDrive={canDrive} setCanDrive={setCanDrive}
          />
        )}
        {step === 4 && (
          <StepVerification documentFile={documentFile} setDocumentFile={setDocumentFile} />
        )}
        {step === 5 && (
          <StepConfirmation referenceCode={referenceCode} companyName={company.name} />
        )}

        {/* Navigation */}
        {step > 0 && step < 5 && (
          <div className="flex gap-3 mt-auto pt-6">
            <Button variant="outline" onClick={handleBack} className="flex-1 h-12 rounded-xl">
              <ChevronLeft className="h-4 w-4 mr-1" /> Atrás
            </Button>
            {step < 4 ? (
              <Button onClick={handleNext} className="flex-1 h-12 rounded-xl text-primary-foreground">
                Continuar <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            ) : (
              <Button onClick={handleSubmit} disabled={submitting} className="flex-1 h-12 rounded-xl text-primary-foreground">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enviar solicitud"}
              </Button>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

/* ─── Step Components ─── */

function StepWelcome({ companyName, onStart }: { companyName: string; onStart: () => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center gap-6">
      <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-primary to-primary-dark flex items-center justify-center shadow-lg">
        <Briefcase className="h-10 w-10 text-primary-foreground" />
      </div>
      <div>
        <h1 className="text-2xl font-heading font-bold text-foreground">
          Trabaja con {companyName}
        </h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-xs mx-auto">
          Completa este proceso rápido para comenzar a trabajar con nosotros.
        </p>
      </div>
      <Button onClick={onStart} size="lg" className="h-14 px-10 rounded-2xl text-lg font-semibold text-primary-foreground shadow-md">
        Empezar aplicación <ChevronRight className="h-5 w-5 ml-2" />
      </Button>
    </div>
  );
}

function StepBasicInfo({
  firstName, setFirstName, lastName, setLastName,
  phone, setPhone, email, setEmail, errors,
}: any) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-heading font-bold text-foreground">Información básica</h2>
        <p className="text-sm text-muted-foreground">Cuéntanos sobre ti</p>
      </div>
      <div className="space-y-4">
        <FieldInput label="Nombre" required value={firstName} onChange={setFirstName} error={errors.firstName} autoComplete="given-name" />
        <FieldInput label="Apellido" required value={lastName} onChange={setLastName} error={errors.lastName} autoComplete="family-name" />
        <FieldInput label="Teléfono" required value={phone} onChange={setPhone} error={errors.phone} type="tel" autoComplete="tel" />
        <FieldInput label="Email" value={email} onChange={setEmail} type="email" autoComplete="email" hint="Opcional" />
      </div>
    </div>
  );
}

function StepWorkerType({ selected, onSelect, error }: { selected: string; onSelect: (v: string) => void; error?: string }) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-heading font-bold text-foreground">¿Qué tipo de trabajo buscas?</h2>
        <p className="text-sm text-muted-foreground">Selecciona tu área principal</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {WORKER_TYPES.map((wt) => {
          const Icon = wt.icon;
          const isSelected = selected === wt.value;
          return (
            <button
              key={wt.value}
              onClick={() => onSelect(wt.value)}
              className={cn(
                "flex flex-col items-center gap-3 p-5 rounded-2xl border-2 transition-all duration-200",
                isSelected
                  ? "border-primary bg-primary/5 shadow-sm"
                  : "border-border/60 bg-card hover:border-primary/40"
              )}
            >
              <div className={cn(
                "h-12 w-12 rounded-xl flex items-center justify-center",
                isSelected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              )}>
                <Icon className="h-6 w-6" />
              </div>
              <span className={cn("text-sm font-semibold", isSelected ? "text-primary" : "text-foreground")}>
                {wt.label}
              </span>
            </button>
          );
        })}
      </div>
      {error && <p className="text-xs text-destructive font-medium">{error}</p>}
    </div>
  );
}

function StepLocation({
  city, setCity, availability, setAvailability, canDrive, setCanDrive,
}: any) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-heading font-bold text-foreground">Ubicación y disponibilidad</h2>
        <p className="text-sm text-muted-foreground">¿Dónde y cuándo puedes trabajar?</p>
      </div>
      <div className="space-y-4">
        <FieldInput label="Ciudad" value={city} onChange={setCity} icon={<MapPin className="h-4 w-4" />} />
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">Disponibilidad</label>
          <div className="grid grid-cols-2 gap-3">
            {[
              { value: "full_time", label: "Tiempo completo", icon: Clock },
              { value: "part_time", label: "Medio tiempo", icon: Clock },
            ].map((opt) => (
              <button
                key={opt.value}
                onClick={() => setAvailability(opt.value)}
                className={cn(
                  "flex items-center gap-2 p-3 rounded-xl border-2 transition-all text-sm font-medium",
                  availability === opt.value
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-border/60 bg-card text-foreground hover:border-primary/40"
                )}
              >
                <opt.icon className="h-4 w-4" />
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between p-3 rounded-xl border border-border/60 bg-card">
          <div className="flex items-center gap-2">
            <Car className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">¿Puedes conducir?</span>
          </div>
          <button
            onClick={() => setCanDrive(!canDrive)}
            className={cn(
              "h-7 w-12 rounded-full transition-colors relative",
              canDrive ? "bg-primary" : "bg-muted"
            )}
          >
            <span className={cn(
              "absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-transform",
              canDrive ? "translate-x-6" : "translate-x-1"
            )} />
          </button>
        </div>
      </div>
    </div>
  );
}

function StepVerification({ documentFile, setDocumentFile }: { documentFile: File | null; setDocumentFile: (f: File | null) => void }) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-heading font-bold text-foreground">Verificación</h2>
        <p className="text-sm text-muted-foreground">Sube un documento de identificación (opcional)</p>
      </div>
      <label className={cn(
        "flex flex-col items-center gap-3 p-8 rounded-2xl border-2 border-dashed cursor-pointer transition-all",
        documentFile ? "border-primary bg-primary/5" : "border-border/60 bg-card hover:border-primary/40"
      )}>
        <input
          type="file"
          accept="image/*,.pdf"
          className="hidden"
          onChange={(e) => setDocumentFile(e.target.files?.[0] ?? null)}
        />
        {documentFile ? (
          <>
            <CheckCircle2 className="h-10 w-10 text-primary" />
            <span className="text-sm font-semibold text-primary">{documentFile.name}</span>
            <span className="text-xs text-muted-foreground">Toca para cambiar</span>
          </>
        ) : (
          <>
            <div className="h-14 w-14 rounded-xl bg-muted flex items-center justify-center">
              <Upload className="h-7 w-7 text-muted-foreground" />
            </div>
            <span className="text-sm font-medium text-foreground">Subir documento</span>
            <span className="text-xs text-muted-foreground">ID, licencia o pasaporte</span>
          </>
        )}
      </label>
      <div className="flex items-start gap-2 p-3 rounded-xl bg-muted/50">
        <Shield className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
        <p className="text-[11px] text-muted-foreground">
          Tu información está protegida y solo será revisada por el equipo de {" "}
          <span className="font-medium">recursos humanos</span>.
        </p>
      </div>
    </div>
  );
}

function StepConfirmation({ referenceCode, companyName }: { referenceCode: string; companyName: string }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center gap-6">
      <div className="h-20 w-20 rounded-full bg-gradient-to-br from-earning to-status-confirmed flex items-center justify-center shadow-lg animate-in zoom-in-50 duration-500">
        <CheckCircle2 className="h-10 w-10 text-white" />
      </div>
      <div>
        <h1 className="text-2xl font-heading font-bold text-foreground">
          ¡Solicitud enviada!
        </h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-xs mx-auto">
          Un administrador de {companyName} revisará tu aplicación pronto.
        </p>
      </div>
      {referenceCode && (
        <div className="bg-card border border-border/60 rounded-xl px-6 py-4">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Número de solicitud</p>
          <p className="text-xl font-heading font-bold text-primary mt-1 tracking-wider">{referenceCode}</p>
        </div>
      )}
      <p className="text-xs text-muted-foreground max-w-xs">
        Guarda tu número de solicitud. Te contactaremos cuando haya una actualización.
      </p>
    </div>
  );
}

/* ─── Shared Field ─── */

function FieldInput({
  label, value, onChange, error, hint, required, type = "text", autoComplete, icon,
}: {
  label: string; value: string; onChange: (v: string) => void;
  error?: string; hint?: string; required?: boolean; type?: string; autoComplete?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-foreground">
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
        {hint && <span className="text-muted-foreground font-normal ml-1.5 text-xs">({hint})</span>}
      </label>
      <div className="relative">
        {icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
            {icon}
          </div>
        )}
        <Input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          className={cn("h-12 text-base rounded-xl", icon && "pl-10", error && "border-destructive")}
        />
      </div>
      {error && <p className="text-xs text-destructive font-medium">{error}</p>}
    </div>
  );
}
