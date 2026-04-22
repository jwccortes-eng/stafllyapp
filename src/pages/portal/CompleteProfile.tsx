/**
 * CompleteProfile — editable wizard the worker uses to fill in the personal-info
 * fields gated by `compute_employee_profile_status` in Postgres.
 *
 * Flow:
 *   - Loads the live employee record + missing checklist (same source of truth as ReadinessCard).
 *   - Renders only the fields that are actually missing, so the page stays focused.
 *   - Saves a single UPDATE; the DB trigger recomputes profile_status automatically.
 *   - On success, shows confirmation + auto-navigates back to /portal.
 *
 * Security: the worker can only update their own row via the
 * "Employees can update own profile" RLS policy (user_id = auth.uid()).
 */
import { useEffect, useState, useMemo } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveEmployee } from "@/hooks/useEffectiveEmployee";
import { useEmployeeReadiness } from "@/hooks/useEmployeeReadiness";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AddressInput, type AddressData } from "@/components/apply/AddressInput";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  Calendar,
  Hash,
  Phone,
  User as UserIcon,
  Briefcase,
  FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface FormState {
  first_name: string;
  last_name: string;
  phone_number: string;
  date_of_birth: string;
  ssn_last4: string;
  employee_role: string;
  address_line: string;
  address_city: string;
  address_state: string;
  address_zip: string;
}

const ROLE_OPTIONS = [
  { value: "Server", label: "Server" },
  { value: "Bartender", label: "Bartender" },
  { value: "Cook", label: "Cook" },
  { value: "Cleaner", label: "Cleaner" },
  { value: "Driver", label: "Driver" },
  { value: "General Worker", label: "General Worker" },
  { value: "Supervisor", label: "Supervisor" },
];

const FIELD_TO_KEY: Record<string, keyof FormState> = {
  "First name": "first_name",
  "Last name": "last_name",
  Phone: "phone_number",
  "Date of birth": "date_of_birth",
  "Last 4 of SSN": "ssn_last4",
  "Street address": "address_line",
  City: "address_city",
  State: "address_state",
  ZIP: "address_zip",
  "Worker type / role": "employee_role",
};

export default function CompleteProfile() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { effectiveEmployeeId } = useEffectiveEmployee();
  const readiness = useEmployeeReadiness(effectiveEmployeeId);

  const [form, setForm] = useState<FormState>({
    first_name: "",
    last_name: "",
    phone_number: "",
    date_of_birth: "",
    ssn_last4: "",
    employee_role: "",
    address_line: "",
    address_city: "",
    address_state: "",
    address_zip: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  // ─── Load current employee state ────────────────────────────────
  useEffect(() => {
    if (!effectiveEmployeeId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("employees")
        .select(
          "first_name, last_name, phone_number, date_of_birth, ssn_last4, employee_role, address_line, address_city, address_state, address_zip",
        )
        .eq("id", effectiveEmployeeId)
        .maybeSingle();

      if (cancelled || !data) {
        setLoading(false);
        return;
      }

      setForm({
        first_name: data.first_name ?? "",
        last_name: data.last_name ?? "",
        phone_number: data.phone_number ?? "",
        date_of_birth: data.date_of_birth ?? "",
        ssn_last4: data.ssn_last4 ?? "",
        employee_role: data.employee_role ?? "",
        address_line: data.address_line ?? "",
        address_city: data.address_city ?? "",
        address_state: data.address_state ?? "",
        address_zip: data.address_zip ?? "",
      });
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [effectiveEmployeeId]);

  // ─── Build the visible-fields set from the readiness checklist ──
  const visibleKeys = useMemo<Set<keyof FormState>>(() => {
    const set = new Set<keyof FormState>();
    // If any address sub-field is missing, show the whole address block.
    let addressNeeded = false;
    readiness.missingPersonal.forEach((label) => {
      const key = FIELD_TO_KEY[label];
      if (!key) return;
      if (
        key === "address_line" ||
        key === "address_city" ||
        key === "address_state" ||
        key === "address_zip"
      ) {
        addressNeeded = true;
      } else {
        set.add(key);
      }
    });
    if (addressNeeded) {
      set.add("address_line");
      set.add("address_city");
      set.add("address_state");
      set.add("address_zip");
    }
    return set;
  }, [readiness.missingPersonal]);

  const showAddress =
    visibleKeys.has("address_line") ||
    visibleKeys.has("address_city") ||
    visibleKeys.has("address_state") ||
    visibleKeys.has("address_zip");

  // ─── Validation ─────────────────────────────────────────────────
  const validationErrors = useMemo(() => {
    const errs: string[] = [];
    if (visibleKeys.has("first_name") && !form.first_name.trim()) errs.push("First name");
    if (visibleKeys.has("last_name") && !form.last_name.trim()) errs.push("Last name");
    if (visibleKeys.has("phone_number") && form.phone_number.replace(/\D/g, "").length < 10)
      errs.push("Phone (10 digits)");
    if (visibleKeys.has("date_of_birth") && !form.date_of_birth) errs.push("Date of birth");
    if (visibleKeys.has("ssn_last4") && form.ssn_last4.length !== 4) errs.push("Last 4 of SSN");
    if (visibleKeys.has("employee_role") && !form.employee_role) errs.push("Worker type / role");
    if (showAddress) {
      if (!form.address_line.trim()) errs.push("Street address");
      if (!form.address_city.trim()) errs.push("City");
      if (!form.address_state) errs.push("State");
      if (form.address_zip.replace(/\D/g, "").length < 5) errs.push("ZIP");
    }
    return errs;
  }, [form, visibleKeys, showAddress]);

  const canSave = validationErrors.length === 0 && !saving;

  // ─── Save ───────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!effectiveEmployeeId || !canSave) return;
    setSaving(true);
    try {
      const updates: Record<string, any> = {};
      if (visibleKeys.has("first_name")) updates.first_name = form.first_name.trim();
      if (visibleKeys.has("last_name")) updates.last_name = form.last_name.trim();
      if (visibleKeys.has("phone_number"))
        updates.phone_number = form.phone_number.replace(/\D/g, "");
      if (visibleKeys.has("date_of_birth")) updates.date_of_birth = form.date_of_birth;
      if (visibleKeys.has("ssn_last4")) updates.ssn_last4 = form.ssn_last4;
      if (visibleKeys.has("employee_role")) updates.employee_role = form.employee_role;
      if (showAddress) {
        updates.address_line = form.address_line.trim();
        updates.address_city = form.address_city.trim();
        updates.address_state = form.address_state;
        updates.address_zip = form.address_zip.replace(/\D/g, "").slice(0, 5);
      }

      const { error } = await supabase
        .from("employees")
        .update(updates)
        .eq("id", effectiveEmployeeId);

      if (error) throw error;

      // Trigger recomputes profile_status automatically; refresh local snapshot
      // so the success/incomplete branch below renders against fresh data.
      await readiness.refresh();
      setSuccess(true);
      toast({
        title: "Profile updated ✅",
        description: "Your information has been saved.",
      });

      // Send the worker back to their profile page (where the banner lives) so
      // they see the status change immediately. `replace` avoids a back-button
      // loop into the wizard. PortalProfile re-fetches via location.key.
      setTimeout(() => navigate("/portal/profile", { replace: true }), 1200);
    } catch (err: any) {
      toast({
        title: "Could not save",
        description: err.message ?? "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  // ─── States ─────────────────────────────────────────────────────
  if (loading || readiness.loading) {
    return (
      <div className="space-y-3 pt-4 pb-24">
        <div className="h-12 animate-pulse bg-muted rounded-2xl" />
        <div className="h-40 animate-pulse bg-muted rounded-2xl" />
        <div className="h-32 animate-pulse bg-muted rounded-2xl" />
      </div>
    );
  }

  // Already complete? Show a confirmation card with a way back.
  const allDone = readiness.status === "ready" || readiness.status === "active";

  if (allDone && !success) {
    return (
      <div className="space-y-5 animate-fade-in pb-24">
        <Link to="/portal" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to portal
        </Link>
        <div className="rounded-2xl border border-earning/20 bg-earning/[0.05] p-6 text-center space-y-3">
          <div className="h-14 w-14 mx-auto rounded-2xl bg-earning/12 flex items-center justify-center">
            <CheckCircle2 className="h-7 w-7 text-earning" />
          </div>
          <p className="text-base font-bold text-foreground">Profile complete</p>
          <p className="text-xs text-muted-foreground/80 max-w-[280px] mx-auto">
            Your profile is ready. You can be assigned to shifts.
          </p>
          <Button onClick={() => navigate("/portal/profile")} variant="outline" className="mt-2">
            View my profile
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in pb-24">
      {/* Back */}
      <Link
        to="/portal"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back
      </Link>

      {/* Header */}
      <div className="rounded-2xl border-2 border-deduction/25 bg-deduction/[0.05] p-4">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-background/60 flex items-center justify-center shrink-0">
            <AlertTriangle className="h-5 w-5 text-deduction" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-base font-bold font-heading text-foreground tracking-tight">
              Complete your profile
            </h1>
            <p className="text-[11.5px] text-muted-foreground/80 mt-1 leading-relaxed">
              We need a few more details before you can be assigned to shifts. This stays private.
            </p>
            {/* Progress */}
            <div className="mt-3 h-1.5 w-full rounded-full bg-background/60 overflow-hidden">
              <div
                className="h-full rounded-full bg-deduction transition-all"
                style={{ width: `${readiness.progressPct}%` }}
              />
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground/70 font-semibold tabular-nums">
              {readiness.completedRequirements} / {readiness.totalRequirements} complete
            </p>
          </div>
        </div>
      </div>

      {/* Personal info */}
      {(visibleKeys.has("first_name") ||
        visibleKeys.has("last_name") ||
        visibleKeys.has("phone_number")) && (
        <Section title="Basic info" icon={<UserIcon className="h-4 w-4" />}>
          {visibleKeys.has("first_name") && (
            <Field label="First name" required>
              <Input
                value={form.first_name}
                onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))}
                placeholder="John"
                className="h-11"
                autoComplete="given-name"
              />
            </Field>
          )}
          {visibleKeys.has("last_name") && (
            <Field label="Last name" required>
              <Input
                value={form.last_name}
                onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))}
                placeholder="Smith"
                className="h-11"
                autoComplete="family-name"
              />
            </Field>
          )}
          {visibleKeys.has("phone_number") && (
            <Field label="Phone" required>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="tel"
                  inputMode="tel"
                  value={form.phone_number}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, phone_number: e.target.value.replace(/\D/g, "").slice(0, 11) }))
                  }
                  placeholder="3055551234"
                  className="h-11 pl-9 tabular-nums"
                  autoComplete="tel"
                />
              </div>
            </Field>
          )}
        </Section>
      )}

      {/* Identity */}
      {(visibleKeys.has("date_of_birth") || visibleKeys.has("ssn_last4")) && (
        <Section title="Identity verification" icon={<FileText className="h-4 w-4" />}>
          {visibleKeys.has("date_of_birth") && (
            <Field label="Date of birth" required>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="date"
                  value={form.date_of_birth}
                  onChange={(e) => setForm((f) => ({ ...f, date_of_birth: e.target.value }))}
                  max={new Date().toISOString().split("T")[0]}
                  className="h-11 pl-9"
                />
              </div>
            </Field>
          )}
          {visibleKeys.has("ssn_last4") && (
            <Field label="Last 4 digits of SSN" required hint="Used only for tax & payroll. We never store the full SSN.">
              <div className="relative">
                <Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="text"
                  inputMode="numeric"
                  maxLength={4}
                  value={form.ssn_last4}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, ssn_last4: e.target.value.replace(/\D/g, "").slice(0, 4) }))
                  }
                  placeholder="••••"
                  className="h-11 pl-9 font-mono tracking-[0.5em] text-center text-base"
                />
              </div>
            </Field>
          )}
        </Section>
      )}

      {/* Role */}
      {visibleKeys.has("employee_role") && (
        <Section title="Worker type" icon={<Briefcase className="h-4 w-4" />}>
          <Field label="Role" required>
            <div className="grid grid-cols-2 gap-2">
              {ROLE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, employee_role: opt.value }))}
                  className={cn(
                    "h-11 rounded-xl border-2 text-sm font-medium transition-all",
                    form.employee_role === opt.value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border/50 hover:border-border bg-card",
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </Field>
        </Section>
      )}

      {/* Address */}
      {showAddress && (
        <Section title="Address" icon={<UserIcon className="h-4 w-4" />}>
          <AddressInput
            value={{
              address_line: form.address_line,
              address_city: form.address_city,
              address_state: form.address_state,
              address_zip: form.address_zip,
            }}
            onChange={(v: AddressData) =>
              setForm((f) => ({
                ...f,
                address_line: v.address_line,
                address_city: v.address_city,
                address_state: v.address_state,
                address_zip: v.address_zip,
              }))
            }
            required
          />
        </Section>
      )}

      {/* No missing personal but documents pending */}
      {visibleKeys.size === 0 && readiness.missingDocuments.length > 0 && (
        <div className="rounded-2xl border-2 border-warning/25 bg-warning/[0.06] p-4 space-y-2">
          <p className="text-sm font-bold text-foreground">Documents pending</p>
          <p className="text-[11.5px] text-muted-foreground/80">
            Your basic info is complete. The following documents are still required:
          </p>
          <ul className="space-y-1 mt-2">
            {readiness.missingDocuments.map((d) => (
              <li key={d.category} className="flex items-center gap-2 text-[11.5px] text-foreground/80">
                <span className="h-1.5 w-1.5 rounded-full bg-warning shrink-0" />
                {d.label}
              </li>
            ))}
          </ul>
          <p className="text-[10.5px] text-muted-foreground/70 mt-3">
            Documents are added by your team admin. Reach out to your supervisor.
          </p>
        </div>
      )}

      {/* Validation summary */}
      {validationErrors.length > 0 && (
        <div className="rounded-xl border border-deduction/20 bg-deduction/[0.04] p-3">
          <p className="text-[11px] font-bold text-deduction mb-1">Still missing:</p>
          <ul className="space-y-0.5">
            {validationErrors.map((e) => (
              <li key={e} className="text-[10.5px] text-deduction/80">• {e}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Save */}
      {visibleKeys.size > 0 && (
        <div className="sticky bottom-20 z-10 -mx-4 px-4 pb-2 bg-gradient-to-t from-background via-background/95 to-transparent pt-3">
          <Button
            onClick={handleSave}
            disabled={!canSave}
            className="w-full h-12 text-sm font-bold shadow-lg"
            size="lg"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : success ? (
              <>
                <CheckCircle2 className="h-4 w-4 mr-1.5" /> Saved
              </>
            ) : (
              "Save & continue"
            )}
          </Button>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border/30 bg-card p-4 space-y-4">
      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
        <span className="text-primary/70">{icon}</span>
        {title}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold text-foreground/80">
        {label} {required && <span className="text-deduction">*</span>}
      </Label>
      {children}
      {hint && <p className="text-[10px] text-muted-foreground/70">{hint}</p>}
    </div>
  );
}
