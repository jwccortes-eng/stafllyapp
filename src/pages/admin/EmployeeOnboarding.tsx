/**
 * STAFly employee onboarding wizard — premium edition.
 *
 *   Layout:    Top bar (logo + company) → Progress bar → Centered card (max-w-[480px])
 *   Steps:     1. Basic info  2. Identification  3. Address  4. Work profile  5. Documents
 *   UX:        48px inputs, chips for worker type, date picker, drag & drop docs,
 *              autosave on Next, inline validation, mobile-first.
 *   Backend:   Same as before — employees + employee_documents + storage bucket
 *              "employee-documents". The DB triggers recompute profile_status.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { format, parseISO } from "date-fns";
import {
  CalendarIcon, ChevronLeft, ChevronRight, CheckCircle2, Loader2, Upload,
  Trash2, AlertCircle, ArrowLeft, IdCard, MapPin, Briefcase, FileText, User,
  FileWarning, Camera, X, Eye, Building2, Sparkles,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ProfileStatusBadge } from "@/components/employee/ProfileStatusBadge";
import { resolveEmployeeDocumentUrl, openEmployeeDocument } from "@/lib/employee-documents";
import { US_STATES, WORKER_TYPES } from "@/lib/onboarding/us-states";
import {
  DOCUMENT_CATEGORIES,
  getRequiredDocumentsForCompany,
  type DocumentCategory,
} from "@/lib/onboarding/required-documents";
import type { ProfileStatus } from "@/lib/onboarding/profile-status";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface EmployeeRow {
  id: string;
  company_id: string;
  first_name: string;
  last_name: string;
  phone_number: string | null;
  email: string | null;
  date_of_birth: string | null;
  ssn_last4: string | null;
  address_line: string | null;
  address_city: string | null;
  address_state: string | null;
  address_zip: string | null;
  employee_role: string | null;
  can_drive: boolean | null;
  available_for_work: boolean;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  profile_status: ProfileStatus;
  avatar_url: string | null;
}

interface DocRow {
  id: string;
  category: string | null;
  name: string;
  file_url: string;
  file_type: string | null;
  status?: string | null;
  created_at: string;
}

const STEP_LABELS = [
  { id: "basic",    label: "Basic info",     short: "Basic",    icon: User },
  { id: "id",       label: "Identification", short: "ID",       icon: IdCard },
  { id: "address",  label: "Address",        short: "Address",  icon: MapPin },
  { id: "work",     label: "Work profile",   short: "Work",     icon: Briefcase },
  { id: "docs",     label: "Documents",      short: "Docs",     icon: FileText },
] as const;
type StepId = typeof STEP_LABELS[number]["id"];

const STEP_DESCRIPTIONS: Record<StepId, string> = {
  basic:   "Identity and contact details. We'll use these to invite the worker to the portal.",
  id:      "For payroll and 1099 reporting. We never store the full SSN.",
  address: "Required for tax forms and scheduling logistics.",
  work:    "Role, availability and an emergency contact.",
  docs:    "Upload one file per category. Required documents are marked with a star.",
};

// ─────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────

export default function EmployeeOnboarding() {
  const { id: employeeId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { selectedCompany } = useCompany();

  const [employee, setEmployee] = useState<EmployeeRow | null>(null);
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [requiredDocs, setRequiredDocs] = useState<DocumentCategory[]>(["w9", "id"]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState<StepId>("basic");

  // Form state
  const [form, setForm] = useState({
    first_name: "", last_name: "", phone_number: "", email: "",
    date_of_birth: "" as string,
    ssn_last4: "", can_drive: false,
    address_line: "", address_city: "", address_state: "", address_zip: "",
    employee_role: "", available_for_work: true,
    emergency_contact_name: "", emergency_contact_phone: "",
  });

  // Initial load
  useEffect(() => {
    if (!employeeId) return;
    (async () => {
      setLoading(true);
      const { data: emp, error } = await supabase
        .from("employees")
        .select("*")
        .eq("id", employeeId)
        .maybeSingle();
      if (error || !emp) {
        toast({ title: "Could not load employee", variant: "destructive" });
        setLoading(false);
        return;
      }
      const row = emp as unknown as EmployeeRow;
      setEmployee(row);
      setForm({
        first_name: row.first_name ?? "",
        last_name: row.last_name ?? "",
        phone_number: row.phone_number ?? "",
        email: row.email ?? "",
        date_of_birth: row.date_of_birth ?? "",
        ssn_last4: row.ssn_last4 ?? "",
        can_drive: !!row.can_drive,
        address_line: row.address_line ?? "",
        address_city: row.address_city ?? "",
        address_state: row.address_state ?? "",
        address_zip: row.address_zip ?? "",
        employee_role: row.employee_role ?? "",
        available_for_work: row.available_for_work ?? true,
        emergency_contact_name: row.emergency_contact_name ?? "",
        emergency_contact_phone: row.emergency_contact_phone ?? "",
      });

      const [{ data: docsData }, reqList] = await Promise.all([
        supabase.from("employee_documents")
          .select("id, category, name, file_url, file_type, created_at")
          .eq("employee_id", row.id)
          .order("created_at", { ascending: false }),
        getRequiredDocumentsForCompany(row.company_id, { canDrive: !!row.can_drive }),
      ]);
      setDocs((docsData ?? []) as DocRow[]);
      setRequiredDocs(reqList);
      setLoading(false);
    })();
  }, [employeeId]);

  // Recompute required docs when can_drive toggles in the form
  useEffect(() => {
    if (!employee) return;
    getRequiredDocumentsForCompany(employee.company_id, { canDrive: form.can_drive })
      .then(setRequiredDocs);
  }, [form.can_drive, employee]);

  // Per-step validation
  const stepErrors = useMemo(() => {
    const errs: Partial<Record<StepId, string[]>> = {};
    const e: string[] = [];
    if (!form.first_name.trim()) e.push("First name");
    if (!form.last_name.trim()) e.push("Last name");
    if (!form.phone_number.trim()) e.push("Phone");
    if (!form.date_of_birth) e.push("Date of birth");
    if (e.length) errs.basic = e;

    const id: string[] = [];
    if (!form.ssn_last4 || form.ssn_last4.length !== 4) id.push("Last 4 of SSN");
    if (id.length) errs.id = id;

    const ad: string[] = [];
    if (!form.address_line.trim()) ad.push("Street");
    if (!form.address_city.trim()) ad.push("City");
    if (!form.address_state) ad.push("State");
    if (!form.address_zip.trim()) ad.push("ZIP");
    if (ad.length) errs.address = ad;

    const wk: string[] = [];
    if (!form.employee_role) wk.push("Worker type");
    if (wk.length) errs.work = wk;

    const presentCats = new Set(docs.map(d => (d.category ?? "").toLowerCase()));
    const missingDocs = requiredDocs.filter(c => !presentCats.has(c));
    if (missingDocs.length) errs.docs = missingDocs.map(c => DOCUMENT_CATEGORIES[c].label);
    return errs;
  }, [form, docs, requiredDocs]);

  const stepIndex = STEP_LABELS.findIndex(s => s.id === step);
  const totalSteps = STEP_LABELS.length;
  const completedSteps = STEP_LABELS.filter(s => !stepErrors[s.id]).length;
  const progressPct = Math.round((completedSteps / totalSteps) * 100);

  // Save current step's data
  const persistForm = async () => {
    if (!employee) return false;
    setSaving(true);
    const { error } = await supabase
      .from("employees")
      .update({
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        phone_number: form.phone_number.trim() || null,
        email: form.email.trim() || null,
        date_of_birth: form.date_of_birth || null,
        ssn_last4: form.ssn_last4 || null,
        can_drive: form.can_drive,
        address_line: form.address_line.trim() || null,
        address_city: form.address_city.trim() || null,
        address_state: form.address_state || null,
        address_zip: form.address_zip.trim() || null,
        employee_role: form.employee_role || null,
        available_for_work: form.available_for_work,
        emergency_contact_name: form.emergency_contact_name.trim() || null,
        emergency_contact_phone: form.emergency_contact_phone.trim() || null,
      })
      .eq("id", employee.id);
    setSaving(false);
    if (error) {
      toast({ title: "Could not save", description: error.message, variant: "destructive" });
      return false;
    }
    const { data: refreshed } = await supabase
      .from("employees").select("profile_status").eq("id", employee.id).maybeSingle();
    if (refreshed) {
      setEmployee(prev => prev ? { ...prev, profile_status: refreshed.profile_status as ProfileStatus } : prev);
    }
    return true;
  };

  // Document upload
  const handleUpload = async (file: File, category: DocumentCategory) => {
    if (!employee || !user) return;
    if (file.size > 15 * 1024 * 1024) {
      toast({ title: "File too large", description: "Max 15 MB per file.", variant: "destructive" });
      return;
    }
    const ext = file.name.split(".").pop() ?? "bin";
    const path = `${employee.company_id}/${employee.id}/${category}_${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("employee-documents")
      .upload(path, file, { upsert: false });
    if (upErr) {
      toast({ title: "Upload failed", description: upErr.message, variant: "destructive" });
      return;
    }
    // Bucket is private; persist the storage path and sign on read.
    const { error: insErr } = await supabase.from("employee_documents").insert({
      employee_id: employee.id,
      company_id: employee.company_id,
      name: file.name,
      file_url: path,
      file_type: file.type,
      file_size: file.size,
      category,
      uploaded_by: user.id,
    });
    if (insErr) {
      toast({ title: "Could not record document", description: insErr.message, variant: "destructive" });
      return;
    }
    const { data: docsData } = await supabase.from("employee_documents")
      .select("id, category, name, file_url, file_type, created_at")
      .eq("employee_id", employee.id)
      .order("created_at", { ascending: false });
    setDocs((docsData ?? []) as DocRow[]);
    const { data: refreshed } = await supabase
      .from("employees").select("profile_status").eq("id", employee.id).maybeSingle();
    if (refreshed) setEmployee(prev => prev ? { ...prev, profile_status: refreshed.profile_status as ProfileStatus } : prev);
    toast({ title: `${DOCUMENT_CATEGORIES[category].label} uploaded` });
  };

  const handleDeleteDoc = async (doc: DocRow) => {
    await supabase.from("employee_documents").delete().eq("id", doc.id);
    setDocs(d => d.filter(x => x.id !== doc.id));
    if (employee) {
      const { data: refreshed } = await supabase
        .from("employees").select("profile_status").eq("id", employee.id).maybeSingle();
      if (refreshed) setEmployee(prev => prev ? { ...prev, profile_status: refreshed.profile_status as ProfileStatus } : prev);
    }
  };

  const goNext = async () => {
    const ok = await persistForm();
    if (!ok) return;
    const next = STEP_LABELS[Math.min(stepIndex + 1, totalSteps - 1)].id;
    setStep(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const goBack = () => {
    if (stepIndex === 0) return;
    setStep(STEP_LABELS[stepIndex - 1].id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const finish = async () => {
    const ok = await persistForm();
    if (!ok) return;
    toast({ title: "Onboarding saved", description: "Profile updated successfully." });
    navigate("/app/employees");
  };

  // ─── Render ─────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-onboarding flex items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
      </div>
    );
  }
  if (!employee) {
    return (
      <div className="min-h-screen bg-onboarding flex items-center justify-center p-6">
        <div className="text-center space-y-3">
          <p className="text-sm text-muted-foreground">Employee not found.</p>
          <Button onClick={() => navigate("/app/employees")} variant="outline" size="sm">Back to employees</Button>
        </div>
      </div>
    );
  }

  const currentStep = STEP_LABELS[stepIndex];
  const StepIcon = currentStep.icon;
  const today = new Date();

  return (
    <div className="min-h-screen bg-onboarding">
      {/* Top bar */}
      <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-md border-b border-border/50">
        <div className="max-w-[920px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => navigate("/app/employees")}
              className="h-8 w-8 -ml-1 rounded-lg flex items-center justify-center hover:bg-muted transition-colors"
              aria-label="Back"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-sm">
              <Sparkles className="h-3.5 w-3.5 text-primary-foreground" />
            </div>
            <div className="min-w-0">
              <p className="text-[13px] font-bold text-foreground leading-none truncate">
                {selectedCompany?.name ?? "STAFly"}
              </p>
              <p className="text-[10px] text-muted-foreground leading-none mt-0.5">Employee onboarding</p>
            </div>
          </div>
          <ProfileStatusBadge status={employee.profile_status} size="sm" />
        </div>
        {/* Progress bar */}
        <div className="h-1 bg-muted/40 relative">
          <div
            className="absolute inset-y-0 left-0 bg-gradient-to-r from-primary via-primary to-primary/70 transition-all duration-700 ease-out"
            style={{ width: `${Math.max(progressPct, 4)}%` }}
          />
        </div>
      </header>

      {/* Main */}
      <main className="max-w-[920px] mx-auto px-4 sm:px-6 py-6 sm:py-10">
        {/* Stepper rail (desktop) */}
        <div className="hidden md:flex items-center justify-center gap-2 mb-8">
          {STEP_LABELS.map((s, i) => {
            const Icon = s.icon;
            const hasError = !!stepErrors[s.id];
            const isCurrent = s.id === step;
            const isPast = i < stepIndex;
            const reached = isPast || isCurrent || !hasError;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setStep(s.id)}
                className="group flex items-center gap-2"
              >
                <div className={cn(
                  "h-9 w-9 rounded-full flex items-center justify-center text-[12px] font-bold border-2 transition-all",
                  isCurrent && "bg-primary text-primary-foreground border-primary shadow-md shadow-primary/20 scale-110",
                  !isCurrent && isPast && !hasError && "bg-earning text-white border-earning",
                  !isCurrent && !isPast && !hasError && "bg-card text-muted-foreground border-border",
                  !isCurrent && hasError && isPast && "bg-warning/10 text-warning border-warning/40",
                )}>
                  {!isCurrent && isPast && !hasError ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                </div>
                <span className={cn(
                  "text-[12px] font-semibold transition-colors",
                  isCurrent ? "text-foreground" : "text-muted-foreground",
                )}>
                  {s.short}
                </span>
                {i < STEP_LABELS.length - 1 && (
                  <div className={cn(
                    "h-px w-8 mx-1 transition-colors",
                    i < stepIndex ? "bg-earning" : "bg-border",
                  )} />
                )}
              </button>
            );
          })}
        </div>

        {/* Mobile step indicator */}
        <div className="md:hidden flex items-center justify-between mb-5 px-1">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
            Step {stepIndex + 1} of {totalSteps}
          </p>
          <p className="text-[11px] font-bold text-primary tabular-nums">{progressPct}%</p>
        </div>

        {/* Centered card */}
        <div className="max-w-[480px] mx-auto">
          <div className="bg-card rounded-2xl border border-border/60 shadow-onboarding p-6 sm:p-8">
            {/* Step header */}
            <div className="flex items-center gap-3 mb-1">
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <StepIcon className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h1 className="text-lg sm:text-xl font-bold font-heading text-foreground leading-tight">
                  {currentStep.label}
                </h1>
                <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">
                  {employee.first_name} {employee.last_name}
                </p>
              </div>
            </div>
            <p className="text-[13px] text-muted-foreground mb-6 leading-relaxed">
              {STEP_DESCRIPTIONS[step]}
            </p>

            {/* Step body */}
            <div className="space-y-5">
              {step === "basic"   && <BasicStep form={form} setForm={setForm} today={today} />}
              {step === "id"      && <IdStep form={form} setForm={setForm} />}
              {step === "address" && <AddressStep form={form} setForm={setForm} />}
              {step === "work"    && <WorkStep form={form} setForm={setForm} />}
              {step === "docs"    && (
                <DocsStep
                  docs={docs}
                  requiredDocs={requiredDocs}
                  onUpload={handleUpload}
                  onDelete={handleDeleteDoc}
                />
              )}
            </div>

            {/* Inline errors */}
            {stepErrors[step] && stepErrors[step]!.length > 0 && (
              <div className="mt-5 flex items-start gap-2 p-3 rounded-xl border border-warning/20 bg-warning/5 text-[12px] text-warning">
                <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold mb-0.5">Still missing:</p>
                  <p className="text-warning/90">{stepErrors[step]!.join(" · ")}</p>
                </div>
              </div>
            )}

            {/* Navigation */}
            <div className="mt-7 pt-5 border-t border-border/40 flex items-center justify-between">
              <Button
                variant="ghost"
                onClick={goBack}
                disabled={stepIndex === 0 || saving}
                className="h-11 px-3 text-[13px] font-semibold disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4 mr-1" /> Back
              </Button>
              {stepIndex < totalSteps - 1 ? (
                <Button
                  onClick={goNext}
                  disabled={saving}
                  className="h-11 px-5 text-[13px] font-semibold rounded-xl shadow-sm"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Continue <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              ) : (
                <Button
                  onClick={finish}
                  disabled={saving}
                  className="h-11 px-5 text-[13px] font-semibold rounded-xl shadow-sm bg-gradient-to-r from-primary to-primary/85"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                  Finish onboarding
                </Button>
              )}
            </div>
          </div>

          {/* Footer microcopy */}
          <p className="text-center text-[11px] text-muted-foreground mt-5 px-4">
            Auto-saves on continue · You can come back anytime to finish
          </p>
        </div>
      </main>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Reusable primitives
// ─────────────────────────────────────────────────────────────

interface FieldProps {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}
function Field({ label, required, hint, error, children }: FieldProps) {
  return (
    <div className="space-y-1.5">
      <label className="text-[12px] font-semibold text-foreground/90 flex items-center gap-1">
        {label}
        {required && <span className="text-primary">*</span>}
      </label>
      {children}
      {error && <p className="text-[11px] text-destructive font-medium">{error}</p>}
      {hint && !error && <p className="text-[11px] text-muted-foreground leading-snug">{hint}</p>}
    </div>
  );
}

const inputCls =
  "h-12 w-full rounded-xl border border-input bg-background px-3.5 text-[14px] " +
  "placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-2 " +
  "focus-visible:ring-ring/40 focus-visible:border-primary transition-colors";

function PremiumInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(inputCls, props.className)} />;
}

function DateField({
  value, onChange, label, required, hint, max, min,
}: {
  value: string; onChange: (v: string) => void;
  label: string; required?: boolean; hint?: string;
  max?: Date; min?: Date;
}) {
  const date = value ? parseISO(value) : undefined;
  return (
    <Field label={label} required={required} hint={hint}>
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              inputCls,
              "flex items-center justify-start gap-2 text-left",
              !date && "text-muted-foreground/70",
            )}
          >
            <CalendarIcon className="h-4 w-4 text-muted-foreground shrink-0" />
            {date ? format(date, "PPP") : "Pick a date"}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={date}
            onSelect={(d) => onChange(d ? format(d, "yyyy-MM-dd") : "")}
            disabled={(d) => (max ? d > max : false) || (min ? d < min : false) || d < new Date("1900-01-01")}
            initialFocus
            captionLayout="dropdown-buttons"
            fromYear={1940}
            toYear={new Date().getFullYear()}
            className={cn("p-3 pointer-events-auto")}
          />
        </PopoverContent>
      </Popover>
    </Field>
  );
}

function ToggleRow({
  label, hint, checked, onChange,
}: {
  label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 p-3.5 rounded-xl border border-border/60 bg-muted/30">
      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-foreground">{label}</p>
        {hint && <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{hint}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Step components
// ─────────────────────────────────────────────────────────────

type FormState = {
  first_name: string; last_name: string; phone_number: string; email: string;
  date_of_birth: string; ssn_last4: string; can_drive: boolean;
  address_line: string; address_city: string; address_state: string; address_zip: string;
  employee_role: string; available_for_work: boolean;
  emergency_contact_name: string; emergency_contact_phone: string;
};

interface StepProps {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
}

function BasicStep({ form, setForm, today }: StepProps & { today: Date }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Field label="First name" required>
          <PremiumInput
            value={form.first_name}
            onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))}
            placeholder="Jane"
          />
        </Field>
        <Field label="Last name" required>
          <PremiumInput
            value={form.last_name}
            onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))}
            placeholder="Doe"
          />
        </Field>
      </div>
      <Field label="Phone" required hint="Used for portal sign-in via WhatsApp / SMS">
        <PremiumInput
          value={form.phone_number}
          onChange={e => setForm(f => ({ ...f, phone_number: e.target.value }))}
          placeholder="+1 (555) 555-5555"
          inputMode="tel"
        />
      </Field>
      <Field label="Email" hint="Optional but recommended for tax documents">
        <PremiumInput
          type="email"
          value={form.email}
          onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
          placeholder="jane@example.com"
        />
      </Field>
      <DateField
        label="Date of birth"
        required
        value={form.date_of_birth}
        onChange={(v) => setForm(f => ({ ...f, date_of_birth: v }))}
        max={today}
        hint="Must be 18 or older to work"
      />
    </>
  );
}

function IdStep({ form, setForm }: StepProps) {
  return (
    <>
      <Field label="Last 4 of SSN" required hint="Only the last 4 digits — full SSN is never stored">
        <PremiumInput
          inputMode="numeric"
          maxLength={4}
          value={form.ssn_last4}
          onChange={e => setForm(f => ({ ...f, ssn_last4: e.target.value.replace(/\D/g, "").slice(0, 4) }))}
          placeholder="••••"
          className="font-mono tracking-[0.5em] text-center text-lg"
        />
      </Field>
      <ToggleRow
        label="Can drive for the company?"
        hint="If yes, a driver's license document will be required in step 5"
        checked={form.can_drive}
        onChange={(v) => setForm(f => ({ ...f, can_drive: v }))}
      />
    </>
  );
}

function AddressStep({ form, setForm }: StepProps) {
  return (
    <>
      <Field label="Street address" required>
        <PremiumInput
          value={form.address_line}
          onChange={e => setForm(f => ({ ...f, address_line: e.target.value }))}
          placeholder="123 Main St, Apt 4"
        />
      </Field>
      <Field label="City" required>
        <PremiumInput
          value={form.address_city}
          onChange={e => setForm(f => ({ ...f, address_city: e.target.value }))}
          placeholder="Miami"
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="State" required>
          <Select value={form.address_state} onValueChange={v => setForm(f => ({ ...f, address_state: v }))}>
            <SelectTrigger className={cn(inputCls, "data-[placeholder]:text-muted-foreground/70")}>
              <SelectValue placeholder="Select" />
            </SelectTrigger>
            <SelectContent className="max-h-[280px]">
              {US_STATES.map(s => (
                <SelectItem key={s.code} value={s.code}>{s.code} — {s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="ZIP" required>
          <PremiumInput
            inputMode="numeric"
            maxLength={10}
            value={form.address_zip}
            onChange={e => setForm(f => ({ ...f, address_zip: e.target.value }))}
            placeholder="10001"
          />
        </Field>
      </div>
    </>
  );
}

function WorkStep({ form, setForm }: StepProps) {
  return (
    <>
      <Field label="Worker type" required hint="Tap a chip to select the role">
        <div className="flex flex-wrap gap-1.5">
          {WORKER_TYPES.map(w => {
            const active = form.employee_role === w.value;
            return (
              <button
                key={w.value}
                type="button"
                onClick={() => setForm(f => ({ ...f, employee_role: w.value }))}
                className={cn(
                  "px-3 h-9 rounded-full text-[12px] font-semibold border transition-all",
                  active
                    ? "bg-primary text-primary-foreground border-primary shadow-sm shadow-primary/20"
                    : "bg-background text-foreground border-border hover:border-primary/40 hover:bg-primary/5",
                )}
              >
                {w.label}
              </button>
            );
          })}
        </div>
      </Field>

      <ToggleRow
        label="Available for work"
        hint="Toggle off to pause shift offers temporarily"
        checked={form.available_for_work}
        onChange={(v) => setForm(f => ({ ...f, available_for_work: v }))}
      />

      <div className="pt-2">
        <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2.5">
          Emergency contact (optional)
        </p>
        <div className="space-y-3">
          <Field label="Contact name">
            <PremiumInput
              value={form.emergency_contact_name}
              onChange={e => setForm(f => ({ ...f, emergency_contact_name: e.target.value }))}
              placeholder="Maria Doe"
            />
          </Field>
          <Field label="Contact phone">
            <PremiumInput
              value={form.emergency_contact_phone}
              onChange={e => setForm(f => ({ ...f, emergency_contact_phone: e.target.value }))}
              placeholder="+1 (555) 555-5555"
              inputMode="tel"
            />
          </Field>
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// Documents step — drag & drop with preview + status
// ─────────────────────────────────────────────────────────────

function DocsStep({
  docs, requiredDocs, onUpload, onDelete,
}: {
  docs: DocRow[];
  requiredDocs: DocumentCategory[];
  onUpload: (f: File, c: DocumentCategory) => Promise<void>;
  onDelete: (d: DocRow) => Promise<void>;
}) {
  const byCategory = useMemo(() => {
    const m = new Map<string, DocRow[]>();
    for (const d of docs) {
      const key = (d.category ?? "other").toLowerCase();
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(d);
    }
    return m;
  }, [docs]);

  const optionalCats = Array.from(byCategory.keys())
    .filter(k => !requiredDocs.includes(k as DocumentCategory) && k in DOCUMENT_CATEGORIES) as DocumentCategory[];

  return (
    <div className="space-y-3">
      {requiredDocs.map(cat => (
        <DocCard
          key={cat}
          category={cat}
          files={byCategory.get(cat) ?? []}
          required
          onUpload={(f) => onUpload(f, cat)}
          onDelete={onDelete}
        />
      ))}
      {optionalCats.map(cat => (
        <DocCard
          key={cat}
          category={cat}
          files={byCategory.get(cat) ?? []}
          required={false}
          onUpload={(f) => onUpload(f, cat)}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}

type DocStatus = "pending" | "uploaded" | "approved";

function getDocStatus(files: DocRow[]): DocStatus {
  if (files.length === 0) return "pending";
  if (files.some(f => f.status === "approved")) return "approved";
  return "uploaded";
}

function DocCard({
  category, files, required, onUpload, onDelete,
}: {
  category: DocumentCategory;
  files: DocRow[];
  required: boolean;
  onUpload: (f: File) => Promise<void>;
  onDelete: (d: DocRow) => Promise<void>;
}) {
  const meta = DOCUMENT_CATEGORIES[category];
  const status = getDocStatus(files);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [previewOpen, setPreviewOpen] = useState<DocRow | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const openPreview = async (f: DocRow) => {
    setPreviewOpen(f);
    setPreviewUrl(null);
    const url = await resolveEmployeeDocumentUrl(f.file_url);
    setPreviewUrl(url);
  };
  const closePreview = () => { setPreviewOpen(null); setPreviewUrl(null); };
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);

  const handleFile = async (f: File | undefined | null) => {
    if (!f) return;
    setBusy(true);
    try { await onUpload(f); } finally { setBusy(false); }
  };

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) await handleFile(f);
  };

  const statusTone =
    status === "approved" ? "border-earning/40 bg-earning/[0.04]" :
    status === "uploaded" ? "border-primary/30 bg-primary/[0.03]" :
    required             ? "border-warning/30 bg-warning/[0.03]" :
                           "border-border/60 bg-card";

  const statusBadge =
    status === "approved" ? { tone: "bg-earning text-white", label: "Approved", icon: CheckCircle2 } :
    status === "uploaded" ? { tone: "bg-primary text-primary-foreground", label: "Uploaded", icon: CheckCircle2 } :
                            { tone: "bg-muted text-muted-foreground", label: "Pending", icon: AlertCircle };
  const SBIcon = statusBadge.icon;

  return (
    <>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={cn(
          "rounded-xl border-2 border-dashed p-4 transition-all",
          statusTone,
          dragOver && "border-primary/60 bg-primary/[0.06] scale-[1.01]",
        )}
      >
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="text-[13px] font-bold text-foreground">
                {meta.label}
                {required && <span className="text-primary ml-0.5">*</span>}
              </p>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{meta.hint}</p>
          </div>
          <span className={cn(
            "shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold",
            statusBadge.tone,
          )}>
            <SBIcon className="h-2.5 w-2.5" />
            {statusBadge.label}
          </span>
        </div>

        {/* Files */}
        {files.length > 0 ? (
          <div className="space-y-1.5 mb-2">
            {files.map(f => (
              <div key={f.id} className="flex items-center gap-2 bg-card border border-border/60 rounded-lg px-2.5 py-2">
                <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                  <FileText className="h-3.5 w-3.5 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-semibold text-foreground truncate">{f.name}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {format(new Date(f.created_at), "PP")}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => openPreview(f)}
                  className="h-7 w-7 rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-primary transition-colors"
                  aria-label="Preview"
                >
                  <Eye className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(f)}
                  className="h-7 w-7 rounded-md hover:bg-destructive/10 flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors"
                  aria-label="Delete"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-center text-[11px] text-muted-foreground/80 py-2">
            Drag & drop · or use a button below
          </p>
        )}

        {/* Upload buttons */}
        <div className="flex items-center gap-2 mt-1">
          <input
            ref={fileInput}
            type="file"
            className="sr-only"
            accept="image/*,application/pdf"
            onChange={e => { handleFile(e.target.files?.[0]); e.currentTarget.value = ""; }}
          />
          <input
            ref={cameraInput}
            type="file"
            className="sr-only"
            accept="image/*"
            capture="environment"
            onChange={e => { handleFile(e.target.files?.[0]); e.currentTarget.value = ""; }}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => fileInput.current?.click()}
            className="flex-1 h-9 rounded-lg bg-primary text-primary-foreground text-[12px] font-semibold flex items-center justify-center gap-1.5 hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            {files.length > 0 ? "Replace" : "Upload file"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => cameraInput.current?.click()}
            className="h-9 px-3 rounded-lg border border-border bg-background text-foreground text-[12px] font-semibold flex items-center justify-center gap-1.5 hover:border-primary/40 hover:bg-primary/5 transition-colors disabled:opacity-50"
            aria-label="Take photo"
          >
            <Camera className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Camera</span>
          </button>
        </div>
      </div>

      {/* Preview lightbox */}
      {previewOpen && (
        <div
          onClick={closePreview}
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
        >
          <button
            onClick={closePreview}
            className="absolute top-4 right-4 h-9 w-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white"
          >
            <X className="h-4 w-4" />
          </button>
          <div onClick={(e) => e.stopPropagation()} className="max-w-[92vw] max-h-[88vh] bg-card rounded-xl overflow-hidden shadow-2xl">
            {!previewUrl ? (
              <div className="w-[88vw] h-[80vh] flex items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : previewOpen.file_type?.startsWith("image/") ? (
              <img src={previewUrl} alt={previewOpen.name} className="max-w-full max-h-[88vh] object-contain" />
            ) : (
              <iframe src={previewUrl} title={previewOpen.name} className="w-[88vw] h-[80vh]" />
            )}
          </div>
        </div>
      )}
    </>
  );
}
