import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { StaflyMark } from "@/components/brand/StaflyBrand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { CitySelect } from "@/components/apply/CitySelect";
import { LanguageMultiSelect } from "@/components/apply/LanguageMultiSelect";
import { AddressInput, type AddressData } from "@/components/apply/AddressInput";
import {
  ChevronRight, ChevronLeft, CheckCircle2, Loader2,
  UtensilsCrossed, Car, SprayCan, Briefcase, ChefHat,
  MapPin, Clock, Upload, Shield, FileText, AlertTriangle,
  Phone, Mail, User, Globe,
} from "lucide-react";

/* ─── Constants ─── */
const DEFAULT_WORKER_TYPES = [
  { value: "waiter", label: "Mesero", icon: UtensilsCrossed },
  { value: "driver", label: "Driver", icon: Car },
  { value: "cleaning", label: "Limpieza", icon: SprayCan },
  { value: "kitchen", label: "Cocina", icon: ChefHat },
  { value: "other", label: "Otro", icon: Briefcase },
];

const STEP_LABELS = ["Bienvenida", "Datos", "Perfil", "Ubicación", "Verificación", "Revisión", "Listo"];
const DRAFT_KEY_PREFIX = "stafly_application_draft_";

interface CompanyData {
  id: string;
  name: string;
  logo_url: string | null;
  brand_color: string | null;
  slug: string;
  application_intro: string | null;
  application_cover_url: string | null;
}

interface AppConfig {
  require_email: boolean;
  require_document: boolean;
  require_emergency_contact: boolean;
  allow_file_uploads: boolean;
  visible_worker_types: string[];
  intro_text: string | null;
  cover_image_url: string | null;
}

const DEFAULT_CONFIG: AppConfig = {
  require_email: false,
  require_document: false,
  require_emergency_contact: false,
  allow_file_uploads: true,
  visible_worker_types: ["waiter", "driver", "cleaning", "kitchen", "other"],
  intro_text: null,
  cover_image_url: null,
};

export default function Apply() {
  const { companySlug } = useParams<{ companySlug: string }>();
  const [searchParams] = useSearchParams();
  const [step, setStep] = useState(0);
  const [company, setCompany] = useState<CompanyData | null>(null);
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [referenceCode, setReferenceCode] = useState("");
  const [duplicateWarning, setDuplicateWarning] = useState(false);
  const [consent, setConsent] = useState(false);
  const [applicationDisabledCompany, setApplicationDisabledCompany] = useState<string | null>(null);

  // Form
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [workerType, setWorkerType] = useState(searchParams.get("role") ?? "");
  const [city, setCity] = useState("");
  const [availability, setAvailability] = useState("full_time");
  const [canDrive, setCanDrive] = useState(false);
  const [hasCar, setHasCar] = useState(false);
  const [canTravel, setCanTravel] = useState(false);
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [emergencyContact, setEmergencyContact] = useState("");
  const [experienceSummary, setExperienceSummary] = useState("");
  const [languages, setLanguages] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [address, setAddress] = useState<AddressData>({ address_line: "", address_city: "", address_state: "", address_zip: "" });

  const source = searchParams.get("source") ?? "direct_link";
  const draftKey = companySlug ? `${DRAFT_KEY_PREFIX}${companySlug}` : null;

  // Load company + config
  useEffect(() => {
    if (!companySlug) return;
    (async () => {
      // First check if company exists at all
      const { data: coCheck } = await supabase
        .from("companies")
        .select("id, name, logo_url, brand_color, slug, application_intro, application_cover_url, is_active, application_enabled")
        .eq("slug", companySlug.toLowerCase())
        .maybeSingle();

      if (coCheck && (!coCheck.is_active || !coCheck.application_enabled)) {
        setCompany(null);
        setApplicationDisabledCompany(coCheck.name);
        setLoading(false);
        return;
      }

      const co = coCheck?.is_active && coCheck?.application_enabled ? coCheck : null;
      setCompany(co);

      if (co) {
        const { data: cfg } = await supabase
          .from("application_configs")
          .select("*")
          .eq("company_id", co.id)
          .maybeSingle();
        if (cfg) {
          setConfig({
            require_email: cfg.require_email,
            require_document: cfg.require_document,
            require_emergency_contact: cfg.require_emergency_contact,
            allow_file_uploads: cfg.allow_file_uploads,
            visible_worker_types: (cfg.visible_worker_types as string[]) ?? DEFAULT_CONFIG.visible_worker_types,
            intro_text: cfg.intro_text,
            cover_image_url: cfg.cover_image_url,
          });
        }
        // Restore draft
        if (draftKey) {
          try {
            const saved = localStorage.getItem(draftKey);
            if (saved) {
              const d = JSON.parse(saved);
              if (d.firstName) setFirstName(d.firstName);
              if (d.lastName) setLastName(d.lastName);
              if (d.phone) setPhone(d.phone);
              if (d.email) setEmail(d.email);
              if (d.workerType) setWorkerType(d.workerType);
              if (d.city) setCity(d.city);
              if (d.availability) setAvailability(d.availability);
              if (d.hasCar) setHasCar(d.hasCar);
              if (d.canTravel) setCanTravel(d.canTravel);
              if (d.emergencyContact) setEmergencyContact(d.emergencyContact);
              if (d.experienceSummary) setExperienceSummary(d.experienceSummary);
              if (d.languages) setLanguages(d.languages);
              if (d.step && d.step > 0 && d.step < 5) setStep(d.step);
            }
          } catch { /* ignore */ }
        }
      }
      setLoading(false);
    })();
  }, [companySlug]);

  // Autosave draft
  const autosaveTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    if (!draftKey || step >= 5) return;
    clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      localStorage.setItem(draftKey, JSON.stringify({
        firstName, lastName, phone, email, workerType, city,
        availability, hasCar, canTravel, emergencyContact, experienceSummary, languages, step, address,
      }));
    }, 800);
    return () => clearTimeout(autosaveTimer.current);
  }, [firstName, lastName, phone, email, workerType, city, availability, hasCar, canTravel, emergencyContact, experienceSummary, languages, step, draftKey, address]);

  // Duplicate check
  const checkDuplicate = useCallback(async () => {
    if (!company || !phone.trim()) return;
    const { count } = await supabase
      .from("job_applications")
      .select("id", { count: "exact", head: true })
      .eq("company_id", company.id)
      .eq("phone", phone.trim());
    setDuplicateWarning((count ?? 0) > 0);
  }, [company, phone]);

  const progressPercent = Math.round((step / (STEP_LABELS.length - 1)) * 100);
  const visibleTypes = DEFAULT_WORKER_TYPES.filter((t) => config.visible_worker_types.includes(t.value));

  /* ─── Validation ─── */
  const validateBasicInfo = () => {
    const e: Record<string, string> = {};
    if (!firstName.trim()) e.firstName = "Requerido";
    if (!lastName.trim()) e.lastName = "Requerido";
    if (!phone.trim() || phone.trim().length < 7) e.phone = "Teléfono inválido";
    if (config.require_email && (!email.trim() || !email.includes("@"))) e.email = "Email requerido";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const validateWorkerType = () => {
    if (!workerType) { setErrors({ workerType: "Selecciona un tipo" }); return false; }
    setErrors({});
    return true;
  };

  const handleNext = async () => {
    if (step === 1) {
      if (!validateBasicInfo()) return;
      await checkDuplicate();
    }
    if (step === 2 && !validateWorkerType()) return;
    setStep((s) => Math.min(s + 1, STEP_LABELS.length - 1));
  };

  const handleBack = () => setStep((s) => Math.max(s - 1, 0));
  const goToStep = (s: number) => { if (s < step) setStep(s); };

  /* ─── Submit ─── */
  const handleSubmit = async () => {
    if (!company || !consent) return;
    setSubmitting(true);
    try {
      let documentUrl: string | undefined;
      if (documentFile) {
        const ext = documentFile.name.split(".").pop();
        const path = `${company.id}/${Date.now()}.${ext}`;
        await supabase.storage.from("application-documents").upload(path, documentFile);
        documentUrl = path;
      }

      const { data, error } = await supabase
        .from("job_applications")
        .insert({
          company_id: company.id,
          application_type: "internal",
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          phone: phone.trim(),
          email: email.trim() || null,
          worker_type: workerType,
          city: city.trim() || null,
          availability,
          can_drive: canDrive,
          has_car: hasCar,
          can_travel: canTravel,
          document_url: documentUrl ?? null,
          emergency_contact: emergencyContact.trim() || null,
          experience_summary: experienceSummary.trim() || null,
          languages: languages.trim() ? languages.split(",").map((l) => l.trim()) : null,
          source,
          role_suggestion: searchParams.get("role") ?? null,
          address_line: address.address_line.trim() || null,
          address_city: address.address_city.trim() || null,
          address_state: address.address_state.trim() || null,
          address_zip: address.address_zip.trim() || null,
          formatted_address: [address.address_line, address.address_city, address.address_state, address.address_zip].filter(Boolean).join(", ") || null,
        })
        .select("id, reference_code")
        .single();

      if (error) throw error;

      // Create audit event
      await supabase.from("application_events").insert({
        application_id: data.id,
        event_type: "submitted",
        event_data: { source, device: navigator.userAgent.slice(0, 100) },
      });

      // Upload document record
      if (documentUrl && data.id) {
        await supabase.from("application_documents").insert({
          application_id: data.id,
          file_url: documentUrl,
          file_type: "id_document",
          file_name: documentFile?.name ?? "document",
        });
      }

      setReferenceCode(data.reference_code);
      setStep(6);
      if (draftKey) localStorage.removeItem(draftKey);
    } catch (err) {
      console.error("Submit error:", err);
    } finally {
      setSubmitting(false);
    }
  };

  /* ─── Render ─── */
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
        {applicationDisabledCompany ? (
          <>
            <h1 className="text-xl font-heading font-bold mt-4 text-foreground">Aplicaciones cerradas</h1>
            <p className="text-sm text-muted-foreground mt-2 max-w-sm">
              <strong>{applicationDisabledCompany}</strong> no está aceptando aplicaciones en este momento. Intenta más tarde o contacta a la empresa directamente.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-xl font-heading font-bold mt-4 text-foreground">Empresa no encontrada</h1>
            <p className="text-sm text-muted-foreground mt-2">El enlace que usaste no es válido o la empresa no existe.</p>
          </>
        )}
      </div>
    );
  }

  const coverImage = config.cover_image_url ?? company.application_cover_url;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-card/80 backdrop-blur-lg border-b border-border/40 px-4 py-3 safe-top">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          {company.logo_url ? (
            <img src={company.logo_url} alt={company.name} className="h-8 w-8 rounded-lg object-cover" />
          ) : (
            <StaflyMark size={32} />
          )}
          <span className="font-heading font-bold text-sm text-foreground truncate">{company.name}</span>
          {step > 0 && step < 6 && (
            <span className="ml-auto text-[10px] font-semibold text-primary tabular-nums bg-primary/10 px-2 py-0.5 rounded-full">
              {step}/{STEP_LABELS.length - 1}
            </span>
          )}
        </div>
      </header>

      {/* Progress */}
      {step > 0 && step < 6 && (
        <div className="px-4 pt-3 max-w-lg mx-auto w-full">
          <Progress
            value={progressPercent}
            className="h-1.5 bg-muted/60 [&>div]:bg-gradient-to-r [&>div]:from-primary [&>div]:to-primary-glow [&>div]:rounded-full rounded-full"
          />
          <div className="flex justify-between mt-2">
            {STEP_LABELS.slice(1, 6).map((l, i) => (
              <button
                key={l}
                onClick={() => goToStep(i + 1)}
                className={cn(
                  "text-[9px] font-medium transition-colors",
                  i + 1 === step ? "text-primary font-semibold" : i + 1 < step ? "text-muted-foreground cursor-pointer" : "text-muted-foreground/40"
                )}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Duplicate warning */}
      {duplicateWarning && step === 1 && (
        <div className="px-4 max-w-lg mx-auto w-full mt-3">
          <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
            <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-800 dark:text-amber-200">
              Parece que ya existe una solicitud con este teléfono. Puedes continuar, pero un administrador verificará.
            </p>
          </div>
        </div>
      )}

      {/* Content */}
      <main className="flex-1 flex flex-col max-w-lg mx-auto w-full px-4 py-6">
        {step === 0 && <StepWelcome companyName={company.name} introText={config.intro_text ?? company.application_intro} coverImage={coverImage} onStart={handleNext} />}
        {step === 1 && <StepBasicInfo {...{ firstName, setFirstName, lastName, setLastName, phone, setPhone, email, setEmail, errors, requireEmail: config.require_email }} />}
        {step === 2 && <StepWorkerType selected={workerType} onSelect={setWorkerType} error={errors.workerType} types={visibleTypes} />}
        {step === 3 && <StepLocation {...{ city, setCity, availability, setAvailability, hasCar, setHasCar, canTravel, setCanTravel, address, setAddress }} />}
        {step === 4 && <StepVerification {...{ documentFile, setDocumentFile, emergencyContact, setEmergencyContact, experienceSummary, setExperienceSummary, languages, setLanguages, config }} />}
        {step === 5 && (
          <StepReview
            data={{ firstName, lastName, phone, email, workerType, city, availability, hasCar, canTravel, emergencyContact, experienceSummary, languages, address }}
            consent={consent}
            setConsent={setConsent}
            onEdit={goToStep}
          />
        )}
        {step === 6 && <StepConfirmation referenceCode={referenceCode} companyName={company.name} />}

        {/* Navigation */}
        {step > 0 && step < 6 && (
          <div className="flex gap-3 mt-auto pt-6 pb-safe">
            <Button variant="outline" onClick={handleBack} className="flex-1 h-12 rounded-xl">
              <ChevronLeft className="h-4 w-4 mr-1" /> Atrás
            </Button>
            {step < 5 ? (
              <Button onClick={handleNext} className="flex-1 h-12 rounded-xl text-primary-foreground">
                Continuar <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            ) : (
              <Button onClick={handleSubmit} disabled={submitting || !consent} className="flex-1 h-12 rounded-xl text-primary-foreground">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enviar solicitud"}
              </Button>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════ */
/*  STEP COMPONENTS                                          */
/* ═══════════════════════════════════════════════════════════ */

function StepWelcome({ companyName, introText, coverImage, onStart }: { companyName: string; introText: string | null; coverImage: string | null; onStart: () => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center gap-6">
      {coverImage && (
        <img src={coverImage} alt="" className="w-full max-h-40 object-cover rounded-2xl" />
      )}
      <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-primary to-primary-dark flex items-center justify-center shadow-lg">
        <Briefcase className="h-10 w-10 text-primary-foreground" />
      </div>
      <div>
        <h1 className="text-2xl font-heading font-bold text-foreground">Trabaja con {companyName}</h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-xs mx-auto">
          {introText ?? "Completa este proceso rápido para comenzar a trabajar con nosotros."}
        </p>
      </div>
      <Button onClick={onStart} size="lg" className="h-14 px-10 rounded-2xl text-lg font-semibold text-primary-foreground shadow-md">
        Empezar aplicación <ChevronRight className="h-5 w-5 ml-2" />
      </Button>
    </div>
  );
}

function StepBasicInfo({ firstName, setFirstName, lastName, setLastName, phone, setPhone, email, setEmail, errors, requireEmail }: any) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-heading font-bold text-foreground">Información básica</h2>
        <p className="text-sm text-muted-foreground">Cuéntanos sobre ti</p>
      </div>
      <div className="space-y-4">
        <FieldInput label="Nombre" required value={firstName} onChange={setFirstName} error={errors.firstName} autoComplete="given-name" icon={<User className="h-4 w-4" />} />
        <FieldInput label="Apellido" required value={lastName} onChange={setLastName} error={errors.lastName} autoComplete="family-name" icon={<User className="h-4 w-4" />} />
        <FieldInput label="Teléfono" required value={phone} onChange={setPhone} error={errors.phone} type="tel" autoComplete="tel" icon={<Phone className="h-4 w-4" />} />
        <FieldInput label="Email" value={email} onChange={setEmail} error={errors.email} type="email" autoComplete="email" icon={<Mail className="h-4 w-4" />} required={requireEmail} hint={requireEmail ? undefined : "Opcional"} />
      </div>
    </div>
  );
}

function StepWorkerType({ selected, onSelect, error, types }: { selected: string; onSelect: (v: string) => void; error?: string; types: typeof DEFAULT_WORKER_TYPES }) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-heading font-bold text-foreground">¿Qué tipo de trabajo buscas?</h2>
        <p className="text-sm text-muted-foreground">Selecciona tu área principal</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {types.map((wt) => {
          const Icon = wt.icon;
          const isSelected = selected === wt.value;
          return (
            <button key={wt.value} onClick={() => onSelect(wt.value)} className={cn(
              "flex flex-col items-center gap-3 p-5 rounded-2xl border-2 transition-all duration-200",
              isSelected ? "border-primary bg-primary/5 shadow-sm" : "border-border/60 bg-card hover:border-primary/40"
            )}>
              <div className={cn("h-12 w-12 rounded-xl flex items-center justify-center", isSelected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                <Icon className="h-6 w-6" />
              </div>
              <span className={cn("text-sm font-semibold", isSelected ? "text-primary" : "text-foreground")}>{wt.label}</span>
            </button>
          );
        })}
      </div>
      {error && <p className="text-xs text-destructive font-medium">{error}</p>}
    </div>
  );
}

function StepLocation({ city, setCity, availability, setAvailability, hasCar, setHasCar, canTravel, setCanTravel, address, setAddress }: any) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-heading font-bold text-foreground">Ubicación y disponibilidad</h2>
        <p className="text-sm text-muted-foreground">¿Dónde y cuándo puedes trabajar?</p>
      </div>
      <div className="space-y-4">
        <CitySelect value={city} onChange={setCity} />
        <AddressInput value={address} onChange={setAddress} />
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">Disponibilidad</label>
          <div className="grid grid-cols-2 gap-2">
            {[
              { value: "full_time", label: "Tiempo completo" },
              { value: "part_time", label: "Medio tiempo" },
              { value: "weekends", label: "Fines de semana" },
              { value: "flexible", label: "Flexible" },
            ].map((opt) => (
              <button key={opt.value} onClick={() => setAvailability(opt.value)} className={cn(
                "flex items-center justify-center gap-2 p-3 rounded-xl border-2 transition-all text-xs font-semibold",
                availability === opt.value ? "border-primary bg-primary/5 text-primary" : "border-border/60 bg-card text-foreground hover:border-primary/40"
              )}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <ToggleRow label="¿Tienes vehículo?" value={hasCar} onChange={setHasCar} icon={<Car className="h-4 w-4" />} />
        <ToggleRow label="¿Puedes desplazarte a otras zonas?" value={canTravel} onChange={setCanTravel} icon={<Globe className="h-4 w-4" />} />
      </div>
    </div>
  );
}

function StepVerification({ documentFile, setDocumentFile, emergencyContact, setEmergencyContact, experienceSummary, setExperienceSummary, languages, setLanguages, config }: any) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-heading font-bold text-foreground">Información adicional</h2>
        <p className="text-sm text-muted-foreground">Completa los campos que apliquen</p>
      </div>
      <div className="space-y-4">
        {config.allow_file_uploads && (
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">
              Documento de identificación
              {config.require_document && <span className="text-destructive ml-0.5">*</span>}
            </label>
            <label className={cn(
              "flex flex-col items-center gap-2 p-6 rounded-2xl border-2 border-dashed cursor-pointer transition-all",
              documentFile ? "border-primary bg-primary/5" : "border-border/60 bg-card hover:border-primary/40"
            )}>
              <input type="file" accept="image/*,.pdf" className="hidden" onChange={(e) => setDocumentFile(e.target.files?.[0] ?? null)} />
              {documentFile ? (
                <>
                  <CheckCircle2 className="h-8 w-8 text-primary" />
                  <span className="text-xs font-semibold text-primary truncate max-w-full">{documentFile.name}</span>
                </>
              ) : (
                <>
                  <Upload className="h-8 w-8 text-muted-foreground" />
                  <span className="text-xs font-medium text-foreground">Subir documento</span>
                  <span className="text-[10px] text-muted-foreground">ID, licencia o pasaporte</span>
                </>
              )}
            </label>
          </div>
        )}
        {(config.require_emergency_contact || true) && (
          <FieldInput label="Contacto de emergencia" value={emergencyContact} onChange={setEmergencyContact} hint="Nombre y teléfono" required={config.require_emergency_contact} icon={<Phone className="h-4 w-4" />} />
        )}
        <LanguageMultiSelect value={languages} onChange={setLanguages} />
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">Experiencia relevante</label>
          <Textarea value={experienceSummary} onChange={(e) => setExperienceSummary(e.target.value)} placeholder="Cuéntanos brevemente sobre tu experiencia..." className="min-h-[80px] rounded-xl text-sm" />
        </div>
      </div>
      <div className="flex items-start gap-2 p-3 rounded-xl bg-muted/50">
        <Shield className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
        <p className="text-[10px] text-muted-foreground">Tu información está protegida y solo será revisada por el equipo de la empresa.</p>
      </div>
    </div>
  );
}

function StepReview({ data, consent, setConsent, onEdit }: { data: any; consent: boolean; setConsent: (v: boolean) => void; onEdit: (s: number) => void }) {
  const WORKER_LABELS: Record<string, string> = { waiter: "Mesero", driver: "Driver", cleaning: "Limpieza", kitchen: "Cocina", other: "Otro" };
  const AVAIL_LABELS: Record<string, string> = { full_time: "Tiempo completo", part_time: "Medio tiempo", weekends: "Fines de semana", flexible: "Flexible" };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-heading font-bold text-foreground">Revisa tu solicitud</h2>
        <p className="text-sm text-muted-foreground">Confirma que todo esté correcto antes de enviar</p>
      </div>

      <ReviewSection title="Datos personales" onEdit={() => onEdit(1)}>
        <ReviewRow label="Nombre" value={`${data.firstName} ${data.lastName}`} />
        <ReviewRow label="Teléfono" value={data.phone} />
        {data.email && <ReviewRow label="Email" value={data.email} />}
      </ReviewSection>

      <ReviewSection title="Perfil" onEdit={() => onEdit(2)}>
        <ReviewRow label="Tipo" value={WORKER_LABELS[data.workerType] ?? data.workerType} />
      </ReviewSection>

      <ReviewSection title="Ubicación" onEdit={() => onEdit(3)}>
        {data.city && <ReviewRow label="Ciudad" value={data.city} />}
        {data.address?.address_line && <ReviewRow label="Dirección" value={[data.address.address_line, data.address.address_city, data.address.address_state, data.address.address_zip].filter(Boolean).join(", ")} />}
        <ReviewRow label="Disponibilidad" value={AVAIL_LABELS[data.availability] ?? data.availability} />
        <ReviewRow label="Vehículo" value={data.hasCar ? "Sí" : "No"} />
        <ReviewRow label="Desplazamiento" value={data.canTravel ? "Sí" : "No"} />
      </ReviewSection>

      {(data.emergencyContact || data.experienceSummary || data.languages) && (
        <ReviewSection title="Información adicional" onEdit={() => onEdit(4)}>
          {data.emergencyContact && <ReviewRow label="Emergencia" value={data.emergencyContact} />}
          {data.languages && <ReviewRow label="Idiomas" value={data.languages} />}
          {data.experienceSummary && <ReviewRow label="Experiencia" value={data.experienceSummary} />}
        </ReviewSection>
      )}

      <div className="flex items-start gap-3 p-4 rounded-xl bg-card border border-border/60">
        <Checkbox id="consent" checked={consent} onCheckedChange={(c) => setConsent(!!c)} className="mt-0.5" />
        <label htmlFor="consent" className="text-xs text-muted-foreground leading-relaxed cursor-pointer">
          Confirmo que la información proporcionada es correcta y autorizo su uso para fines de contratación.
        </label>
      </div>
    </div>
  );
}

function ReviewSection({ title, onEdit, children }: { title: string; onEdit: () => void; children: React.ReactNode }) {
  return (
    <div className="bg-card rounded-xl border border-border/60 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 bg-muted/30 border-b border-border/40">
        <span className="text-xs font-semibold text-foreground">{title}</span>
        <button onClick={onEdit} className="text-[10px] font-semibold text-primary hover:underline">Editar</button>
      </div>
      <div className="px-4 py-3 space-y-2">{children}</div>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs font-medium text-foreground text-right max-w-[60%] truncate">{value}</span>
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
        <h1 className="text-2xl font-heading font-bold text-foreground">¡Solicitud enviada!</h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-xs mx-auto">
          Un administrador de <span className="font-semibold text-foreground">{companyName}</span> revisará tu aplicación pronto.
        </p>
      </div>
      {referenceCode && (
        <div className="bg-card border border-border/60 rounded-xl px-6 py-4">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Número de solicitud</p>
          <p className="text-xl font-heading font-bold text-primary mt-1 tracking-wider">{referenceCode}</p>
        </div>
      )}
      <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-primary/5 border border-primary/10">
        <Clock className="h-4 w-4 text-primary shrink-0" />
        <p className="text-xs text-muted-foreground">Estado: <span className="font-semibold text-foreground">Pendiente de revisión</span></p>
      </div>
      <p className="text-xs text-muted-foreground max-w-xs">Guarda tu número de solicitud. Te contactaremos cuando haya una actualización.</p>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════ */
/*  SHARED UI                                                */
/* ═══════════════════════════════════════════════════════════ */

function FieldInput({ label, value, onChange, error, hint, required, type = "text", autoComplete, icon }: {
  label: string; value: string; onChange: (v: string) => void;
  error?: string; hint?: string; required?: boolean; type?: string; autoComplete?: string; icon?: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-foreground">
        {label}{required && <span className="text-destructive ml-0.5">*</span>}
        {hint && <span className="text-muted-foreground font-normal ml-1.5 text-xs">({hint})</span>}
      </label>
      <div className="relative">
        {icon && <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">{icon}</div>}
        <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} className={cn("h-12 text-base rounded-xl", icon && "pl-10", error && "border-destructive")} />
      </div>
      {error && <p className="text-xs text-destructive font-medium">{error}</p>}
    </div>
  );
}

function ToggleRow({ label, value, onChange, icon }: { label: string; value: boolean; onChange: (v: boolean) => void; icon: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between p-3 rounded-xl border border-border/60 bg-card">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">{icon}</span>
        <span className="text-sm font-medium text-foreground">{label}</span>
      </div>
      <button onClick={() => onChange(!value)} className={cn("h-7 w-12 rounded-full transition-colors relative", value ? "bg-primary" : "bg-muted")}>
        <span className={cn("absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-transform", value ? "translate-x-6" : "translate-x-1")} />
      </button>
    </div>
  );
}
