/**
 * STAFly employee onboarding wizard — 5 steps:
 *
 *   1. Basic info        (name, phone, email, DOB)
 *   2. Identification    (last 4 SSN, can_drive)
 *   3. Address           (line, city, state dropdown, ZIP)
 *   4. Work profile      (role / worker type, availability, emergency contact)
 *   5. Documents         (W9, ID, optional Driver License)
 *
 * Visual progress, hard validations, date pickers everywhere, dropdowns for
 * states and worker_type. Keeps the existing Quick-Add and Edit dialogs intact.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { CalendarIcon, ChevronLeft, ChevronRight, CheckCircle2, Loader2, Upload, Trash2, AlertCircle, ArrowLeft, IdCard, MapPin, Briefcase, FileText, User, FileWarning } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";
import { Switch } from "@/components/ui/switch";
import { ProfileStatusBadge } from "@/components/employee/ProfileStatusBadge";
import { US_STATES, WORKER_TYPES } from "@/lib/onboarding/us-states";
import {
  DOCUMENT_CATEGORIES,
  getRequiredDocumentsForCompany,
  type DocumentCategory,
} from "@/lib/onboarding/required-documents";
import { missingPersonalFields, type ProfileStatus } from "@/lib/onboarding/profile-status";

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
  created_at: string;
}

const STEP_LABELS = [
  { id: "basic",    label: "Basic info",     icon: User },
  { id: "id",       label: "Identification", icon: IdCard },
  { id: "address",  label: "Address",        icon: MapPin },
  { id: "work",     label: "Work profile",   icon: Briefcase },
  { id: "docs",     label: "Documents",      icon: FileText },
] as const;
type StepId = typeof STEP_LABELS[number]["id"];

// ─────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────

export default function EmployeeOnboarding() {
  const { id: employeeId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { selectedCompanyId } = useCompany();

  const [employee, setEmployee] = useState<EmployeeRow | null>(null);
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [requiredDocs, setRequiredDocs] = useState<DocumentCategory[]>(["w9", "id"]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState<StepId>("basic");

  // Form state
  const [form, setForm] = useState({
    first_name: "", last_name: "", phone_number: "", email: "",
    date_of_birth: "" as string, // YYYY-MM-DD
    ssn_last4: "", can_drive: false,
    address_line: "", address_city: "", address_state: "", address_zip: "",
    employee_role: "", available_for_work: true,
    emergency_contact_name: "", emergency_contact_phone: "",
  });

  // Load
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

      // Documents + required list
      const [{ data: docsData }, reqList] = await Promise.all([
        supabase.from("employee_documents")
          .select("id, category, name, file_url, created_at")
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

  // Save current step's data (debounced/explicit on Next click)
  const persistForm = async () => {
    if (!employee) return;
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
    // Refresh status
    const { data: refreshed } = await supabase
      .from("employees")
      .select("profile_status")
      .eq("id", employee.id)
      .maybeSingle();
    if (refreshed) {
      setEmployee(prev => prev ? { ...prev, profile_status: refreshed.profile_status as ProfileStatus } : prev);
    }
    return true;
  };

  // Document upload
  const handleUpload = async (file: File, category: DocumentCategory) => {
    if (!employee || !user) return;
    const ext = file.name.split(".").pop() ?? "bin";
    const path = `${employee.company_id}/${employee.id}/${category}_${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("employee-documents")
      .upload(path, file, { upsert: false });
    if (upErr) {
      toast({ title: "Upload failed", description: upErr.message, variant: "destructive" });
      return;
    }
    const { data: urlData } = supabase.storage.from("employee-documents").getPublicUrl(path);
    const { error: insErr } = await supabase.from("employee_documents").insert({
      employee_id: employee.id,
      company_id: employee.company_id,
      name: file.name,
      file_url: urlData.publicUrl,
      file_type: file.type,
      file_size: file.size,
      category,
      uploaded_by: user.id,
    });
    if (insErr) {
      toast({ title: "Could not record document", description: insErr.message, variant: "destructive" });
      return;
    }
    // Reload docs
    const { data: docsData } = await supabase.from("employee_documents")
      .select("id, category, name, file_url, created_at")
      .eq("employee_id", employee.id)
      .order("created_at", { ascending: false });
    setDocs((docsData ?? []) as DocRow[]);
    // Refresh status
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
  };

  const goBack = () => {
    if (stepIndex === 0) return;
    setStep(STEP_LABELS[stepIndex - 1].id);
  };

  const finish = async () => {
    const ok = await persistForm();
    if (!ok) return;
    navigate("/app/employees");
  };

  // ─── Render ─────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!employee) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">Employee not found.</p>
        <Button onClick={() => navigate("/app/employees")} variant="outline" size="sm" className="mt-3">Back</Button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" className="h-8 -ml-2" onClick={() => navigate("/app/employees")}>
          <ArrowLeft className="h-4 w-4 mr-1.5" /> Employees
        </Button>
      </div>

      <div className="bg-card rounded-2xl border border-border/60 p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold font-heading text-foreground">
              {employee.first_name} {employee.last_name}
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Onboarding wizard · complete every step to enable shift assignments
            </p>
          </div>
          <ProfileStatusBadge status={employee.profile_status} />
        </div>

        {/* Progress */}
        <div className="mt-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-medium text-muted-foreground">
              {completedSteps}/{totalSteps} steps complete
            </span>
            <span className="text-[11px] font-bold text-primary tabular-nums">{progressPct}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-primary to-earning rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {/* Step pills */}
        <div className="mt-4 flex items-center gap-1 overflow-x-auto -mx-1 px-1">
          {STEP_LABELS.map((s, i) => {
            const Icon = s.icon;
            const hasError = !!stepErrors[s.id];
            const isCurrent = s.id === step;
            const isPast = i < stepIndex;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setStep(s.id)}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-all",
                  isCurrent && "bg-primary text-primary-foreground shadow-sm",
                  !isCurrent && !hasError && (isPast ? "bg-earning/10 text-earning" : "bg-muted text-muted-foreground"),
                  !isCurrent && hasError && "bg-warning/10 text-warning",
                )}
              >
                {!isCurrent && !hasError && isPast ? (
                  <CheckCircle2 className="h-3 w-3" />
                ) : !isCurrent && hasError ? (
                  <FileWarning className="h-3 w-3" />
                ) : (
                  <Icon className="h-3 w-3" />
                )}
                <span className="hidden sm:inline">{s.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Step body */}
      <div className="bg-card rounded-2xl border border-border/60 p-5 shadow-sm space-y-4">
        {step === "basic" && (
          <BasicStep form={form} setForm={setForm} />
        )}
        {step === "id" && (
          <IdStep form={form} setForm={setForm} />
        )}
        {step === "address" && (
          <AddressStep form={form} setForm={setForm} />
        )}
        {step === "work" && (
          <WorkStep form={form} setForm={setForm} />
        )}
        {step === "docs" && (
          <DocsStep
            docs={docs}
            requiredDocs={requiredDocs}
            onUpload={handleUpload}
            onDelete={handleDeleteDoc}
          />
        )}

        {/* Per-step error summary */}
        {stepErrors[step] && stepErrors[step]!.length > 0 && (
          <div className="flex items-start gap-2 p-3 rounded-lg border border-warning/20 bg-warning/5 text-[11px] text-warning">
            <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold mb-0.5">Missing to mark this step complete:</p>
              <p>{stepErrors[step]!.join(" · ")}</p>
            </div>
          </div>
        )}

        {/* Nav */}
        <div className="flex items-center justify-between pt-3 border-t border-border/40">
          <Button variant="ghost" size="sm" onClick={goBack} disabled={stepIndex === 0 || saving}>
            <ChevronLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          {stepIndex < totalSteps - 1 ? (
            <Button size="sm" onClick={goNext} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
              Save & continue <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button size="sm" onClick={finish} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <CheckCircle2 className="h-4 w-4 mr-1.5" />}
              Finish
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Step components
// ─────────────────────────────────────────────────────────────

type FormShape = ReturnType<typeof useState<{
  first_name: string; last_name: string; phone_number: string; email: string;
  date_of_birth: string; ssn_last4: string; can_drive: boolean;
  address_line: string; address_city: string; address_state: string; address_zip: string;
  employee_role: string; available_for_work: boolean;
  emergency_contact_name: string; emergency_contact_phone: string;
}>>[0];

interface StepProps {
  form: NonNullable<FormShape>;
  setForm: React.Dispatch<React.SetStateAction<NonNullable<FormShape>>>;
}

function DatePickerField({
  value, onChange, label, required, hint, max,
}: {
  value: string; onChange: (v: string) => void;
  label: string; required?: boolean; hint?: string; max?: Date;
}) {
  const date = value ? parseISO(value) : undefined;
  return (
    <FormField label={label} required={required} hint={hint}>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              "w-full h-9 justify-start text-left font-normal text-sm",
              !date && "text-muted-foreground",
            )}
          >
            <CalendarIcon className="h-3.5 w-3.5 mr-2" />
            {date ? format(date, "PPP") : "Pick a date"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={date}
            onSelect={(d) => onChange(d ? format(d, "yyyy-MM-dd") : "")}
            disabled={(d) => (max ? d > max : false) || d < new Date("1900-01-01")}
            initialFocus
            captionLayout="dropdown-buttons"
            fromYear={1940}
            toYear={new Date().getFullYear()}
            className={cn("p-3 pointer-events-auto")}
          />
        </PopoverContent>
      </Popover>
    </FormField>
  );
}

function BasicStep({ form, setForm }: StepProps) {
  const today = new Date();
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-bold text-foreground">Basic information</h2>
      <p className="text-[11px] text-muted-foreground -mt-2">Identity and contact details.</p>
      <div className="grid sm:grid-cols-2 gap-3">
        <FormField label="First name" required>
          <Input value={form.first_name} onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))} className="h-9 text-sm" />
        </FormField>
        <FormField label="Last name" required>
          <Input value={form.last_name} onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))} className="h-9 text-sm" />
        </FormField>
        <FormField label="Phone" required hint="Used for portal sign-in">
          <Input value={form.phone_number} onChange={e => setForm(f => ({ ...f, phone_number: e.target.value }))} className="h-9 text-sm" placeholder="(555) 555-5555" />
        </FormField>
        <FormField label="Email" hint="Optional but recommended">
          <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className="h-9 text-sm" />
        </FormField>
        <DatePickerField
          label="Date of birth"
          required
          value={form.date_of_birth}
          onChange={(v) => setForm(f => ({ ...f, date_of_birth: v }))}
          max={today}
          hint="Must be 18 or older to work"
        />
      </div>
    </div>
  );
}

function IdStep({ form, setForm }: StepProps) {
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-bold text-foreground">Identification</h2>
      <p className="text-[11px] text-muted-foreground -mt-2">For payroll & 1099 reporting. We never store the full SSN.</p>
      <div className="grid sm:grid-cols-2 gap-3">
        <FormField label="Last 4 of SSN" required hint="Only the last 4 digits — full SSN never stored">
          <Input
            inputMode="numeric"
            maxLength={4}
            value={form.ssn_last4}
            onChange={e => setForm(f => ({ ...f, ssn_last4: e.target.value.replace(/\D/g, "").slice(0, 4) }))}
            className="h-9 text-sm font-mono tracking-wider"
            placeholder="••••"
          />
        </FormField>
        <FormField label="Can drive?" hint="If yes, a driver's license document will be required">
          <div className="flex items-center gap-2 h-9">
            <Switch checked={form.can_drive} onCheckedChange={v => setForm(f => ({ ...f, can_drive: v }))} />
            <span className="text-sm text-muted-foreground">{form.can_drive ? "Yes" : "No"}</span>
          </div>
        </FormField>
      </div>
    </div>
  );
}

function AddressStep({ form, setForm }: StepProps) {
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-bold text-foreground">Address</h2>
      <p className="text-[11px] text-muted-foreground -mt-2">Required for tax forms and scheduling.</p>
      <FormField label="Street address" required>
        <Input value={form.address_line} onChange={e => setForm(f => ({ ...f, address_line: e.target.value }))} className="h-9 text-sm" />
      </FormField>
      <div className="grid sm:grid-cols-3 gap-3">
        <FormField label="City" required>
          <Input value={form.address_city} onChange={e => setForm(f => ({ ...f, address_city: e.target.value }))} className="h-9 text-sm" />
        </FormField>
        <FormField label="State" required>
          <Select value={form.address_state} onValueChange={v => setForm(f => ({ ...f, address_state: v }))}>
            <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select state" /></SelectTrigger>
            <SelectContent className="max-h-[280px]">
              {US_STATES.map(s => (
                <SelectItem key={s.code} value={s.code}>{s.code} — {s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <FormField label="ZIP" required>
          <Input
            inputMode="numeric"
            maxLength={10}
            value={form.address_zip}
            onChange={e => setForm(f => ({ ...f, address_zip: e.target.value }))}
            className="h-9 text-sm"
            placeholder="10001"
          />
        </FormField>
      </div>
    </div>
  );
}

function WorkStep({ form, setForm }: StepProps) {
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-bold text-foreground">Work profile</h2>
      <p className="text-[11px] text-muted-foreground -mt-2">Role, availability and emergency contact.</p>
      <div className="grid sm:grid-cols-2 gap-3">
        <FormField label="Worker type" required>
          <Select value={form.employee_role} onValueChange={v => setForm(f => ({ ...f, employee_role: v }))}>
            <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select role" /></SelectTrigger>
            <SelectContent>
              {WORKER_TYPES.map(w => <SelectItem key={w.value} value={w.value}>{w.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </FormField>
        <FormField label="Available for work" hint="Toggle off to pause shift offers">
          <div className="flex items-center gap-2 h-9">
            <Switch checked={form.available_for_work} onCheckedChange={v => setForm(f => ({ ...f, available_for_work: v }))} />
            <span className="text-sm text-muted-foreground">{form.available_for_work ? "Available" : "Paused"}</span>
          </div>
        </FormField>
      </div>
      <div className="pt-2 border-t border-border/40 mt-2">
        <p className="text-[11px] font-semibold text-muted-foreground mb-2">Emergency contact (optional)</p>
        <div className="grid sm:grid-cols-2 gap-3">
          <FormField label="Name">
            <Input value={form.emergency_contact_name} onChange={e => setForm(f => ({ ...f, emergency_contact_name: e.target.value }))} className="h-9 text-sm" />
          </FormField>
          <FormField label="Phone">
            <Input value={form.emergency_contact_phone} onChange={e => setForm(f => ({ ...f, emergency_contact_phone: e.target.value }))} className="h-9 text-sm" />
          </FormField>
        </div>
      </div>
    </div>
  );
}

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

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-bold text-foreground">Documents</h2>
      <p className="text-[11px] text-muted-foreground -mt-2">
        Upload one file per category. Required documents are marked with a star.
      </p>

      <div className="space-y-2">
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
        {/* Optional categories not in requiredDocs but present */}
        {Array.from(byCategory.keys())
          .filter(k => !requiredDocs.includes(k as DocumentCategory) && k in DOCUMENT_CATEGORIES)
          .map(k => (
            <DocCard
              key={k}
              category={k as DocumentCategory}
              files={byCategory.get(k) ?? []}
              required={false}
              onUpload={(f) => onUpload(f, k as DocumentCategory)}
              onDelete={onDelete}
            />
          ))}
      </div>
    </div>
  );
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
  const has = files.length > 0;
  return (
    <div className={cn(
      "border rounded-xl p-3 transition-colors",
      has ? "border-earning/30 bg-earning/[0.03]" : required ? "border-warning/30 bg-warning/[0.03]" : "border-border/60",
    )}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-[13px] font-semibold text-foreground">
              {meta.label}
              {required && <span className="text-warning ml-0.5">*</span>}
            </p>
            {has && <CheckCircle2 className="h-3.5 w-3.5 text-earning" />}
          </div>
          <p className="text-[10px] text-muted-foreground">{meta.hint}</p>
        </div>
        <label className="cursor-pointer">
          <input
            type="file"
            className="sr-only"
            accept="image/*,application/pdf"
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) onUpload(f);
              e.currentTarget.value = "";
            }}
          />
          <span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-primary text-primary-foreground text-[11px] font-semibold hover:bg-primary/90">
            <Upload className="h-3 w-3" /> Upload
          </span>
        </label>
      </div>
      {files.length > 0 && (
        <div className="mt-2 space-y-1">
          {files.map(f => (
            <div key={f.id} className="flex items-center justify-between gap-2 text-[11px] bg-card border border-border/40 rounded-md px-2 py-1.5">
              <a href={f.file_url} target="_blank" rel="noreferrer" className="truncate text-primary hover:underline">{f.name}</a>
              <button onClick={() => onDelete(f)} className="text-muted-foreground hover:text-destructive">
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
