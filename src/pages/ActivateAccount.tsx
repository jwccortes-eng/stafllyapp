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
import { Badge } from "@/components/ui/badge";
import {
  Loader2, CheckCircle2, XCircle, Clock, Shield, Camera, ArrowRight, ArrowLeft,
  Building2, Sparkles, Phone, KeyRound, MapPin, Globe, Heart, Car, User,
  FileText, Upload, AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PremiumAddressField } from "@/components/address";
import { useToast } from "@/hooks/use-toast";
import {
  normalizeFromLegacyColumns,
  recomputeDerived,
  type StructuredAddress,
} from "@/lib/address";

type PageState = "loading" | "valid" | "expired" | "used" | "invalid";
type WizardStep = "welcome" | "pin" | "personal" | "address" | "details" | "documents" | "photo" | "ready";

const BASE_STEPS: WizardStep[] = ["welcome", "pin", "personal", "address", "details", "photo", "ready"];
const STEPS_WITH_DOCS: WizardStep[] = ["welcome", "pin", "personal", "address", "details", "documents", "photo", "ready"];

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
  company_slug?: string | null;
  company_logo: string | null;
  brand_color: string | null;
  employee_name: string;
  employee_phone: string;
  employee_first_name: string;
  employee_last_name: string;
  employee_email: string;
}

const STEP_LABELS: Record<Exclude<WizardStep, "welcome" | "ready">, string> = {
  pin: "PIN",
  personal: "Profile",
  address: "Home Address",
  details: "Details",
  documents: "Documents",
  photo: "Photo",
};

function normalizeEmergencyName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function isRealEmergencyContactName(value: string): boolean {
  const v = normalizeEmergencyName(value);
  if (v.length < 3) return false;
  if (!/[A-Za-zÀ-ÿ]/.test(v)) return false;

  const banned = new Set(["dd", "aa", "test", "gold", "none", "n/a", "na"]);
  if (banned.has(v.toLowerCase())) return false;

  const letters = v.replace(/[^A-Za-zÀ-ÿ]/g, "");
  if (letters.length < 3) return false;

  return true;
}

function isValidUsPhone(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 10 && !(digits.length === 11 && digits.startsWith("1"))) return false;
  const normalized = digits.length === 11 ? digits.slice(1) : digits;
  if (/^(\d)\1{9}$/.test(normalized)) return false;
  return true;
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
  /** Premium structured address — source of truth for the wizard. */
  address_structured: StructuredAddress | null;
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
  const { toast } = useToast();

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
    address_structured: null,
    languages: [], emergency_contact_name: "", emergency_contact_phone: "",
    can_drive: false, has_vehicle: false, ssn: "",
  });

  // Document uploads for vehicle owners
  const [driverLicenseFile, setDriverLicenseFile] = useState<File | null>(null);
  const [driverLicensePreview, setDriverLicensePreview] = useState<string | null>(null);
  const [vehicleRegFile, setVehicleRegFile] = useState<File | null>(null);
  const [vehicleRegPreview, setVehicleRegPreview] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const driverLicenseRef = useRef<HTMLInputElement>(null);
  const vehicleRegRef = useRef<HTMLInputElement>(null);

  // Dynamic steps based on has_vehicle
  const steps = profileForm.has_vehicle ? STEPS_WITH_DOCS : BASE_STEPS;
  const progressSteps = steps.filter((s): s is Exclude<WizardStep, "welcome" | "ready"> => s !== "welcome" && s !== "ready");
  const stepIndex = progressSteps.indexOf(wizardStep as Exclude<WizardStep, "welcome" | "ready">);
  const totalVisibleSteps = progressSteps.length;
  const requiredStepCopy = progressSteps.map((step) => STEP_LABELS[step]).join(" → ");

  const updateForm = (key: keyof ProfileForm, value: any) => {
    setProfileForm(prev => ({ ...prev, [key]: value }));
  };

  // ─── Load invite ───
  useEffect(() => {
    if (!token) { setPageState("invalid"); return; }

    (async () => {
      console.info("[activate] token received:", token);
      const { data: inviteRows, error: fetchErr } = await (supabase
        .rpc("get_invitation_by_token", { _token: token }) as any);
      const data = Array.isArray(inviteRows) ? inviteRows[0] : inviteRows;
      console.info("[activate] invite rpc result:", { error: fetchErr?.message, status: data?.status, expires_at: data?.expires_at, employee_id: data?.employee_id });

      if (fetchErr) { console.error("[activate] invite rpc failed", fetchErr); setPageState("invalid"); return; }
      if (!data) { console.warn("[activate] no invitation row for token"); setPageState("invalid"); return; }
      if (data.status === "revoked") { setPageState("invalid"); return; }
      if (data.status === "accepted") { setPageState("used"); return; }

      if (data.expires_at && new Date(data.expires_at) < new Date()) {
        if (data.status !== "expired") {
          await (supabase.rpc("update_invitation_status_by_token", {
            _token: token,
            _new_status: "expired",
          }) as any);
        }
        setPageState("expired"); return;
      }

      // SECURITY: Use invitation's company_id as authoritative source
      const invitationCompanyId = data.company_id;
      if (!invitationCompanyId) { console.error("[activate] invite missing company_id"); setPageState("invalid"); return; }

      // Use security-definer RPC to bypass RLS (activation page is unauthenticated).
      // IMPORTANT: call BEFORE marking the invite as 'opened', so a transient
      // RPC failure doesn't leave the invitation in a half-consumed state.
      const { data: empRows, error: empErr } = await supabase.rpc("get_employee_for_activation", {
        _employee_id: data.employee_id,
        _invite_token: token,
      });
      const emp = Array.isArray(empRows) ? empRows[0] : empRows;
      console.info("[activate] employee rpc result:", { error: empErr?.message, found: !!emp, has_user_id: !!(emp as any)?.user_id, onboarding_status: (emp as any)?.onboarding_status });

      if (empErr) { console.error("[activate] employee rpc failed", empErr); setPageState("invalid"); return; }
      if (!emp) { console.warn("[activate] employee rpc returned no rows (invite may be stale or token mismatch)"); setPageState("invalid"); return; }

      // Only mark the invite as 'opened' once we know the data layer is healthy.
      if (!markedOpened.current && data.status !== "opened" && data.status !== "accepted") {
        markedOpened.current = true;
        await (supabase.rpc("update_invitation_status_by_token", {
          _token: token,
          _new_status: "opened",
        }) as any);
      }

      // SECURITY: Validate employee belongs to the invitation's company
      if (emp.company_id !== invitationCompanyId) {
        console.error("[activate] company_id mismatch: invitation=%s employee=%s", invitationCompanyId, emp.company_id);
        setPageState("invalid");
        return;
      }

      const companyName = data.company_name?.trim() || data.company_slug?.trim() || "Company";

      // Fetch branding from the INVITATION's company
      const { data: co } = await supabase
        .from("companies")
        .select("name, logo_url, brand_color, slug")
        .eq("id", invitationCompanyId)
        .single();

      if (emp.avatar_url) setAvatarPreview(emp.avatar_url);

      // Hydrate address: prefer JSONB, fall back to legacy columns.
      const storedStructured = (emp as any).address_structured as StructuredAddress | null | undefined;
      let hydratedAddress: StructuredAddress | null = null;
      if (storedStructured && typeof storedStructured === "object" && storedStructured.formatted_address) {
        hydratedAddress = recomputeDerived(storedStructured);
      } else {
        hydratedAddress = normalizeFromLegacyColumns({
          address_line: (emp as any).address_line ?? null,
          address_city: (emp as any).address_city ?? null,
          address_state: (emp as any).address_state ?? null,
          address_zip: (emp as any).address_zip ?? null,
          address: (emp as any).address ?? null,
          county: (emp as any).county ?? null,
          latitude: (emp as any).approx_latitude ?? null,
          longitude: (emp as any).approx_longitude ?? null,
        });
      }

      setProfileForm(prev => ({
        ...prev,
        first_name: emp.first_name ?? "",
        last_name: emp.last_name ?? "",
        email: emp.email ?? "",
        address_line: (emp as any).address_line ?? hydratedAddress?.address_line1 ?? "",
        address_city: (emp as any).address_city ?? hydratedAddress?.city ?? "",
        address_state: (emp as any).address_state ?? hydratedAddress?.state ?? "",
        address_zip: (emp as any).address_zip ?? hydratedAddress?.postal_code ?? "",
        address_structured: hydratedAddress,
      }));

      setInvite({
        ...data,
        company_id: invitationCompanyId,
        company_name: co?.name?.trim() || companyName,
        company_slug: co?.slug ?? data.company_slug ?? null,
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
      setError("PINs don't match. Try again.");
      setPinPhase("create");
      setPin("");
      setConfirmPin("");
      return;
    }
    setError("");
    setWizardStep("personal");
  };

  // ─── File handlers ───
  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith("image/")) return;
    if (f.size > 5 * 1024 * 1024) { setError("Image too large. Max 5 MB."); return; }
    setAvatarFile(f);
    setAvatarPreview(URL.createObjectURL(f));
    setError("");
  };

  const handleDocSelect = (e: React.ChangeEvent<HTMLInputElement>, type: "license" | "registration") => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) { setError("File too large. Max 10 MB."); return; }
    const preview = f.type.startsWith("image/") ? URL.createObjectURL(f) : f.name;
    if (type === "license") { setDriverLicenseFile(f); setDriverLicensePreview(preview); }
    else { setVehicleRegFile(f); setVehicleRegPreview(preview); }
    setError("");
  };

  // ─── Validation ───
  const isPersonalValid = profileForm.first_name.trim() && profileForm.last_name.trim() && profileForm.email.trim() && profileForm.date_of_birth && profileForm.ssn.replace(/\D/g, "").length >= 4;
  // ─── Validation ───
  const addr = profileForm.address_structured;
  const emergencyName = profileForm.emergency_contact_name.trim();
  const emergencyPhoneDigits = profileForm.emergency_contact_phone.replace(/\D/g, "");
  const isAddressValid =
    !!addr &&
    !!(addr.formatted_address || addr.address_line1) &&
    !!addr.city &&
    !!addr.state &&
    !!addr.postal_code &&
    addr.postal_code.replace(/\D/g, "").length >= 5;
  const isEmergencyNameValid = isRealEmergencyContactName(emergencyName);
  const isEmergencyPhoneValid = isValidUsPhone(profileForm.emergency_contact_phone);
  const isDetailsValid = isEmergencyNameValid && isEmergencyPhoneValid;
  const isDocsValid = !profileForm.has_vehicle || (!!driverLicenseFile && !!vehicleRegFile);

  useEffect(() => {
    console.info("[activate] current wizard step", wizardStep);
  }, [wizardStep]);

  useEffect(() => {
    if (wizardStep === "address") {
      console.info("[activate] address valid", isAddressValid);
      console.info("[activate] address_structured", profileForm.address_structured);
    }
  }, [wizardStep, isAddressValid, profileForm.address_structured]);

  // ─── Save progress ───
  const saveProgress = async () => {
    if (!invite) return;
    const sa = profileForm.address_structured;

    // Build legacy fallback so anything still reading plain `address` works.
    const legacyAddressText =
      sa?.formatted_address?.trim() ||
      [profileForm.address_line, profileForm.address_city, profileForm.address_state, profileForm.address_zip]
        .map((s) => (s ?? "").trim())
        .filter(Boolean)
        .join(", ") ||
      profileForm.address_line.trim() ||
      null;

    const updates: Record<string, any> = {
      first_name: profileForm.first_name.trim(),
      last_name: profileForm.last_name.trim(),
      email: profileForm.email.trim() || null,
      date_of_birth: profileForm.date_of_birth || null,
      // Premium structured address (JSONB)
      address_structured: sa ?? null,
      // Legacy text/columns kept in sync for payroll/exports/etc.
      address: legacyAddressText,
      address_line: sa?.address_line1 ?? (profileForm.address_line.trim() || null),
      address_city: sa?.city ?? (profileForm.address_city.trim() || null),
      address_state: sa?.state ?? (profileForm.address_state || null),
      address_zip: sa?.postal_code ?? (profileForm.address_zip.trim() || null),
      county: sa?.county ?? null,
      approx_latitude: sa?.latitude ?? null,
      approx_longitude: sa?.longitude ?? null,
      emergency_contact_name: profileForm.emergency_contact_name.trim() || null,
      emergency_contact_phone: profileForm.emergency_contact_phone.trim() || null,
      can_drive: profileForm.can_drive,
      has_vehicle: profileForm.has_vehicle,
      languages: profileForm.languages.length > 0 ? profileForm.languages : null,
      onboarding_status: "incomplete",
    };

    if (profileForm.ssn.trim()) {
      const digits = profileForm.ssn.replace(/\D/g, "");
      updates.ssn_last4 = digits.slice(-4);
    }

    await supabase.from("employees").update(updates as any).eq("id", invite.employee_id);
  };

  // ─── Upload documents ───
  const uploadDocuments = async (): Promise<boolean> => {
    if (!invite || !profileForm.has_vehicle) return true;
    if (!driverLicenseFile || !vehicleRegFile) return false;

    const uploadDoc = async (file: File, docType: string) => {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${invite.employee_id}/${docType}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("employee-documents")
        .upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      // Bucket is private; store the path. Consumers sign on read.
      return path;
    };

    try {
      const licenseUrl = await uploadDoc(driverLicenseFile, "driver_license");
      const regUrl = await uploadDoc(vehicleRegFile, "vehicle_registration");

      // Save document records
      for (const doc of [
        { document_type: "driver_license", file_url: licenseUrl, file_name: driverLicenseFile.name },
        { document_type: "vehicle_registration", file_url: regUrl, file_name: vehicleRegFile.name },
      ]) {
        await supabase.from("employee_onboarding_documents" as any).upsert({
          employee_id: invite.employee_id,
          company_id: invite.company_id,
          ...doc,
          status: "pending",
        } as any, { onConflict: "employee_id,document_type" });
      }
      return true;
    } catch (err: any) {
      setError("Error uploading documents: " + (err?.message || "Please try again."));
      return false;
    }
  };

  // ─── Activate ───
  const handleActivate = async () => {
    if (!invite) return;
    setBusy(true);
    setError("");

    try {
      // Pre-flight: errores específicos visibles antes de tocar backend
      if (!pin || pin.length !== 4) {
        setError("Missing PIN. Go back and create a 4-digit PIN.");
        setBusy(false);
        return;
      }
      if (profileForm.has_vehicle && (!driverLicenseFile || !vehicleRegFile)) {
        setError("Driver's license and vehicle registration are required when you have a vehicle.");
        setBusy(false);
        return;
      }

      await saveProgress();

      // Upload vehicle documents if required
      if (profileForm.has_vehicle) {
        const docsOk = await uploadDocuments();
        if (!docsOk) { setBusy(false); return; }
      }

      // Activate — pass phone if known, plus employee_id and invite_token as fallbacks
      const { data, error: fnErr } = await supabase.functions.invoke("employee-auth", {
        body: {
          action: "activate",
          phone: invite.employee_phone || undefined,
          employee_id: invite.employee_id,
          invite_token: token,
          pin,
        },
      });

      // When the edge function returns a non-2xx status, supabase-js puts the
      // error in fnErr and leaves data null. The real JSON body lives on
      // fnErr.context (a Response). Parse it so we can surface code/error/detail.
      let parsedErr: { error?: string; code?: string; detail?: string } | null = null;
      if (fnErr) {
        const ctx: any = (fnErr as any)?.context;
        if (ctx && typeof ctx.clone === "function") {
          try {
            parsedErr = await ctx.clone().json();
          } catch {
            try {
              const txt = await ctx.clone().text();
              parsedErr = { error: txt };
            } catch {
              parsedErr = null;
            }
          }
        }
        console.error("[activate] edge function error", { fnErr, parsedErr });
      }

      if (fnErr || data?.error) {
        const code = (parsedErr?.code ?? data?.code) as string | undefined;
        const backendMsg = (parsedErr?.error ?? data?.error) as string | undefined;
        const detail = (parsedErr?.detail ?? data?.detail) as string | undefined;

        const friendly: Record<string, string> = {
          missing_pin: "Missing PIN. Go back and create a 4-digit PIN.",
          invalid_pin: "PIN must be exactly 4 digits.",
          missing_identity:
            "We couldn't identify your account. Your invitation link may be incomplete — request a new one.",
          employee_not_found:
            "Employee record not found. Ask your administrator to verify your invitation.",
          inactive: "Your account is inactive. Contact your administrator.",
          already_activated: "This account is already activated. Sign in with your phone and PIN.",
          invitation_used: "This invitation has already been used.",
          invitation_expired: "This invitation has expired. Request a new one.",
          auth_create_failed: "We couldn't create your login account. Try again or contact support.",
          signin_failed: "Account activated, but sign-in failed. Go to sign-in and try manually.",
          internal_error: "Server error during activation. Please try again in a moment.",
        };

        const msg =
          (code && friendly[code]) ||
          backendMsg ||
          fnErr?.message ||
          "Activation failed. Please try again.";

        setError(detail ? `${msg} (${detail})` : msg);
        setBusy(false);
        return;
      }

      // Establish session BEFORE attempting any storage upload (RLS requires authenticated role)
      if (data?.session) {
        await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        });
      }

      // Now that we're authenticated, upload the avatar (storage policy allows it)
      let avatarUrl: string | undefined;
      if (avatarFile) {
        try {
          const ext = avatarFile.name.split(".").pop() || "jpg";
          const path = `${invite.employee_id}.${ext}`;
          const { error: upErr } = await supabase.storage
            .from("employee-avatars")
            .upload(path, avatarFile, { upsert: true });
          if (upErr) {
            console.error("[activate] avatar upload failed:", upErr);
          } else {
            const { data: urlData } = supabase.storage.from("employee-avatars").getPublicUrl(path);
            avatarUrl = `${urlData.publicUrl}?t=${Date.now()}`;
          }
        } catch (uploadErr) {
          console.error("[activate] avatar upload exception:", uploadErr);
          // Don't block activation on photo failure — user can re-upload from portal
        }
      }

      await (supabase.rpc("update_invitation_status_by_token", {
        _token: token,
        _new_status: "accepted",
      }) as any);

      await supabase.from("employees")
        .update({
          portal_access_enabled: true,
          onboarding_status: "complete",
          onboarding_completed_at: new Date().toISOString(),
          ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
        } as any)
        .eq("id", invite.employee_id);

      setWizardStep("ready");
    } catch (err: any) {
      setError(err?.message || "Unexpected error during activation.");
    } finally {
      setBusy(false);
    }
  };

  const maskedPhone = invite?.employee_phone
    ? invite.employee_phone.replace(/\d(?=\d{4})/g, "•")
    : "";

  const goBack = () => {
    const idx = steps.indexOf(wizardStep);
    if (idx > 0) setWizardStep(steps[idx - 1]);
  };

  const goNext = async () => {
    if (wizardStep === "address" && !isAddressValid) {
      setError("Complete your home address before continuing.");
      toast({ title: "Home address required", description: "Complete address, city, state and ZIP to continue.", variant: "destructive" });
      return;
    }

    if (wizardStep === "details" && !isDetailsValid) {
      setError("Complete a real emergency contact name and a valid emergency phone number.");
      toast({
        title: "Emergency contact required",
        description: !isEmergencyNameValid
          ? "Enter a real emergency contact name."
          : "Enter a valid 10-digit emergency phone number.",
        variant: "destructive",
      });
      return;
    }

    const idx = steps.indexOf(wizardStep);
    if (["personal", "address", "details"].includes(wizardStep)) {
      await saveProgress();
    }
    if (idx < steps.length - 1) setWizardStep(steps[idx + 1]);
  };

  // ─── Error / expired / used states ───
  if (pageState !== "valid" && pageState !== "loading") {
    const configs: Record<string, { icon: React.ReactNode; title: string; desc: string }> = {
      invalid: {
        icon: <XCircle className="h-8 w-8 text-destructive" />,
        title: "Invalid link",
        desc: "This activation link is not valid. Please request a new one from your administrator.",
      },
      expired: {
        icon: <Clock className="h-8 w-8 text-warning" />,
        title: "Link expired",
        desc: "This link has expired. Ask your administrator to send a new one.",
      },
      used: {
        icon: <CheckCircle2 className="h-8 w-8 text-earning" />,
        title: "Account already activated",
        desc: "Your account has already been activated. Sign in with your phone and PIN.",
      },
    };
    const cfg = configs[pageState] ?? configs.invalid;

    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-gradient-to-b from-background to-muted/20 p-4">
        <div className="w-full max-w-sm">
          <div className="bg-card rounded-3xl border border-border/50 shadow-xl overflow-hidden">
            <div className="px-8 pt-8 pb-4 flex flex-col items-center"><StaflyLogo size={28} /></div>
            <div className="px-8 pb-8 flex flex-col items-center gap-4 text-center">
              <div className="h-16 w-16 rounded-2xl bg-muted/50 flex items-center justify-center">{cfg.icon}</div>
              <h2 className="text-xl font-bold text-foreground">{cfg.title}</h2>
              <p className="text-sm text-muted-foreground max-w-[280px]">{cfg.desc}</p>
              <Button onClick={() => navigate("/auth")} className="w-full h-12 rounded-xl mt-2">Go to sign in</Button>
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
        <p className="text-sm text-muted-foreground">Verifying invitation...</p>
      </div>
    );
  }

  // ─── Wizard ───
  // Footer visibility: hide on welcome/pin/ready (those steps have their own custom action UX)
  const showWizardFooter = wizardStep !== "welcome" && wizardStep !== "pin" && wizardStep !== "ready";
  const isPhotoStep = wizardStep === "photo";
  const nextDisabled =
    (wizardStep === "personal" && !isPersonalValid) ||
    (wizardStep === "address" && !isAddressValid) ||
    (wizardStep === "details" && !isDetailsValid) ||
    (wizardStep === "documents" && !isDocsValid);

  return (
    <div className="min-h-[100dvh] flex items-start sm:items-center justify-center bg-gradient-to-b from-background to-muted/20 p-3 sm:p-4">
      <div className="w-full max-w-md flex flex-col" style={{ maxHeight: "calc(100dvh - 1.5rem)" }}>
        <div className="bg-card rounded-3xl border border-border/50 shadow-xl overflow-hidden flex flex-col flex-1 min-h-0">
          {/* Company header */}
          <div className="shrink-0 bg-gradient-to-br from-primary/[0.06] to-transparent px-6 pt-6 pb-4 flex flex-col items-center gap-2 border-b border-border/30">
            {invite?.company_logo ? (
              <img src={invite.company_logo} alt="" className="h-12 w-12 rounded-xl object-cover shadow-md" />
            ) : (
              <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <Building2 className="h-6 w-6 text-primary" />
              </div>
            )}
            <span className="text-xs font-semibold text-muted-foreground tracking-wide">{invite?.company_name?.trim() || invite?.company_slug?.trim() || "Company"}</span>

            {/* ─── DEBUG: Company Scoping Validation (temporary migration tool) ─── */}
            {invite && (
              <div className="w-full mt-2 rounded-lg border border-border/40 bg-muted/30 px-3 py-2 text-[9px] font-mono space-y-0.5">
                <div className="flex items-center gap-1.5 font-semibold text-[10px] text-muted-foreground mb-1">
                  <Shield className="h-3 w-3" /> Company validation
                </div>
                <div className="flex justify-between"><span className="text-muted-foreground">Inv. company_id</span><span className="text-foreground">{invite.company_id?.slice(0, 8)}…</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Company name</span><span className="text-foreground font-semibold">{invite.company_name?.trim() || invite.company_slug?.trim() || "Company"}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">employee_id</span><span className="text-foreground">{invite.employee_id?.slice(0, 8)}…</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">invite_token</span><span className="text-foreground">{token?.slice(0, 12)}…</span></div>
                <div className="flex justify-between items-center"><span className="text-muted-foreground">Validation</span><span className="flex items-center gap-1 text-[hsl(var(--earning))] font-bold"><CheckCircle2 className="h-3 w-3" /> Match ✅</span></div>
              </div>
            )}
          </div>

          {/* Progress bar */}
          {wizardStep !== "ready" && (
            <div className="shrink-0 px-6 pt-4">
              <div className="flex items-center gap-1">
                {progressSteps.map((s, i) => (
                  <div key={s} className={cn("h-1 rounded-full flex-1 transition-all duration-500", i <= stepIndex ? "bg-primary" : "bg-border")} />
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground mt-1.5 text-right">Step {Math.max(stepIndex + 1, 1)} of {totalVisibleSteps}</p>
            </div>
          )}

          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
            <div className="px-6 py-6 space-y-5">
              {/* ── STEP: Welcome ── */}
              {wizardStep === "welcome" && invite && (
                <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div className="text-center space-y-2">
                    <Sparkles className="h-6 w-6 text-primary mx-auto" />
                    <h2 className="text-xl font-bold text-foreground">
                      Hello{invite.employee_first_name ? `, ${invite.employee_first_name}` : ""}!
                    </h2>
                    <p className="text-sm text-muted-foreground">Complete your profile to activate your employee portal</p>
                  </div>

                  <div className="rounded-xl border border-border/50 bg-muted/20 divide-y divide-border/30">
                    <div className="flex items-center gap-3 px-4 py-3">
                      <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] text-muted-foreground">Company</p>
                        <p className="text-sm font-semibold text-foreground truncate">{invite.company_name?.trim() || invite.company_slug?.trim() || "Company"}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 px-4 py-3">
                      <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] text-muted-foreground">Your phone</p>
                        <p className="text-sm font-semibold text-foreground">{maskedPhone}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 px-4 py-3">
                      <KeyRound className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] text-muted-foreground">Required steps</p>
                        <p className="text-sm font-medium text-foreground">{requiredStepCopy}</p>
                      </div>
                    </div>
                  </div>

                  <Button onClick={() => setWizardStep("pin")} className="w-full h-12 rounded-xl text-base font-semibold gap-2">
                    Start activation <ArrowRight className="h-4 w-4" />
                  </Button>
                  <div className="flex items-center gap-1.5 justify-center">
                    <Shield className="h-3 w-3 text-muted-foreground/40" />
                    <p className="text-[10px] text-muted-foreground/50">Your information is protected</p>
                  </div>
                </div>
              )}

              {/* ── STEP: PIN ── */}
              {wizardStep === "pin" && (
                <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div className="text-center space-y-1">
                    <h2 className="text-lg font-bold text-foreground">
                      {pinPhase === "create" ? "Create your PIN" : "Confirm your PIN"}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      {pinPhase === "create" ? "Choose a 4-digit PIN to access your portal" : "Enter the same PIN to confirm"}
                    </p>
                  </div>
                  <div className="flex items-center justify-center gap-2">
                    <div className={cn("h-1.5 rounded-full transition-all duration-300", pinPhase === "create" ? "w-10 bg-primary" : "w-5 bg-primary/30")} />
                    <div className={cn("h-1.5 rounded-full transition-all duration-300", pinPhase === "confirm" ? "w-10 bg-primary" : "w-5 bg-border")} />
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
                    <h2 className="text-lg font-bold">Personal information</h2>
                    <p className="text-xs text-muted-foreground">Required basic details</p>
                  </div>
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">First name <span className="text-destructive">*</span></Label>
                        <Input value={profileForm.first_name} onChange={e => updateForm("first_name", e.target.value)} placeholder="John" className="h-9 text-sm" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Last name <span className="text-destructive">*</span></Label>
                        <Input value={profileForm.last_name} onChange={e => updateForm("last_name", e.target.value)} placeholder="Doe" className="h-9 text-sm" />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Email <span className="text-destructive">*</span></Label>
                      <Input type="email" value={profileForm.email} onChange={e => updateForm("email", e.target.value)} placeholder="juan@email.com" className="h-9 text-sm" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Date of birth <span className="text-destructive">*</span></Label>
                      <Input type="date" value={profileForm.date_of_birth} onChange={e => updateForm("date_of_birth", e.target.value)} className="h-9 text-sm" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">SSN (last 4 digits minimum) <span className="text-destructive">*</span></Label>
                      <Input
                        type="password"
                        value={profileForm.ssn}
                        onChange={e => updateForm("ssn", e.target.value.replace(/[^0-9-]/g, ""))}
                        placeholder="XXX-XX-XXXX or last 4 digits"
                        maxLength={11}
                        className="h-9 text-sm font-mono"
                      />
                      <p className="text-[9px] text-muted-foreground/60">Only the last 4 digits are stored. Your information is protected.</p>
                    </div>
                  </div>
                </div>
              )}

              {/* ── STEP: Address ── */}
              {wizardStep === "address" && (
                <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div className="text-center space-y-1">
                    <MapPin className="h-5 w-5 text-primary mx-auto" />
                    <h2 className="text-lg font-bold">Home address</h2>
                    <p className="text-xs text-muted-foreground">
                      This helps us organize zones, transportation and meeting points.
                    </p>
                  </div>
                  <PremiumAddressField
                    value={profileForm.address_structured}
                    onChange={(next) =>
                      setProfileForm((prev) => ({
                        ...prev,
                        address_structured: next,
                        address_line: next?.address_line1 ?? prev.address_line,
                        address_city: next?.city ?? prev.address_city,
                        address_state: next?.state ?? prev.address_state,
                        address_zip: next?.postal_code ?? prev.address_zip,
                      }))
                    }
                    label="Home address"
                    helper="Start typing your street and pick a suggestion. You can also enter it manually."
                    placeholder="Start typing your address…"
                    required
                    country="US"
                    compact
                  />
                  {!isAddressValid && profileForm.address_structured && (
                    <p className="text-[11px] text-amber-600 dark:text-amber-400">
                      Complete address, city, state and ZIP to continue.
                    </p>
                  )}
                </div>
              )}

              {/* ── STEP: Details (emergency, driving, languages) ── */}
              {wizardStep === "details" && (
                <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div className="text-center space-y-1">
                    <Heart className="h-5 w-5 text-primary mx-auto" />
                    <h2 className="text-lg font-bold">Additional details</h2>
                    <p className="text-xs text-muted-foreground">Emergency contact and availability</p>
                  </div>
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Emergency contact name <span className="text-destructive">*</span></Label>
                      <Input
                        value={profileForm.emergency_contact_name}
                        onChange={e => updateForm("emergency_contact_name", e.target.value)}
                        placeholder="Full name"
                        autoComplete="name"
                        className="h-9 text-sm"
                      />
                        {profileForm.emergency_contact_name.trim().length > 0 && !isEmergencyNameValid && (
                          <p className="text-[10px] text-destructive">Enter a real emergency contact name.</p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Emergency phone <span className="text-destructive">*</span></Label>
                      <Input
                        type="tel"
                        inputMode="tel"
                        value={profileForm.emergency_contact_phone}
                        onChange={e => updateForm("emergency_contact_phone", e.target.value)}
                        placeholder="+1 (305) 555-0123"
                        autoComplete="tel"
                        className="h-9 text-sm"
                      />
                      {profileForm.emergency_contact_phone.trim().length > 0 && !isEmergencyPhoneValid && (
                        <p className="text-[10px] text-destructive">Enter a valid 10-digit emergency phone number.</p>
                      )}
                    </div>

                    {/* Languages */}
                    <div className="space-y-1.5">
                      <Label className="text-xs">Languages</Label>
                      <div className="flex flex-wrap gap-1.5">
                        {LANGUAGES.map(lang => (
                          <button
                            key={lang} type="button"
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
                          <span className="text-sm">Can you drive?</span>
                        </div>
                        <Switch checked={profileForm.can_drive} onCheckedChange={v => updateForm("can_drive", v)} />
                      </div>
                      <div className="flex items-center justify-between px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Car className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">Do you have a vehicle?</span>
                        </div>
                        <Switch checked={profileForm.has_vehicle} onCheckedChange={v => updateForm("has_vehicle", v)} />
                      </div>
                    </div>

                    {profileForm.has_vehicle && (
                      <div className="flex items-start gap-2 rounded-lg bg-primary/5 border border-primary/20 p-3">
                        <AlertTriangle className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                        <p className="text-xs text-primary">
                          Since you have a vehicle, you'll need to upload your <strong>driver's license</strong> and <strong>vehicle registration</strong> in the next step.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── STEP: Documents (only if has_vehicle) ── */}
              {wizardStep === "documents" && profileForm.has_vehicle && (
                <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div className="text-center space-y-1">
                    <FileText className="h-5 w-5 text-primary mx-auto" />
                    <h2 className="text-lg font-bold">Required documents</h2>
                    <p className="text-xs text-muted-foreground">Upload your license and vehicle registration</p>
                  </div>

                  <div className="space-y-3">
                    {/* Driver License */}
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold flex items-center gap-1.5">
                        Driver's license <span className="text-destructive">*</span>
                        {driverLicenseFile && <CheckCircle2 className="h-3.5 w-3.5 text-earning" />}
                      </Label>
                      <input ref={driverLicenseRef} type="file" accept="image/*,.pdf" onChange={e => handleDocSelect(e, "license")} className="hidden" />
                      <button
                        onClick={() => driverLicenseRef.current?.click()}
                        className={cn(
                          "w-full rounded-xl border-2 border-dashed p-4 flex flex-col items-center gap-2 transition-colors",
                          driverLicenseFile ? "border-earning/30 bg-earning/5" : "border-border hover:border-primary/30"
                        )}
                      >
                        {driverLicensePreview && driverLicensePreview.startsWith("blob:") ? (
                          <img src={driverLicensePreview} alt="" className="h-20 rounded-lg object-cover" />
                        ) : driverLicenseFile ? (
                          <div className="flex items-center gap-2">
                            <FileText className="h-5 w-5 text-earning" />
                            <span className="text-xs font-medium text-earning truncate max-w-[200px]">{driverLicenseFile.name}</span>
                          </div>
                        ) : (
                          <>
                             <Upload className="h-6 w-6 text-muted-foreground/50" />
                            <span className="text-xs text-muted-foreground">Tap to upload photo or PDF</span>
                          </>
                        )}
                      </button>
                    </div>

                    {/* Vehicle Registration */}
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold flex items-center gap-1.5">
                        Vehicle registration <span className="text-destructive">*</span>
                        {vehicleRegFile && <CheckCircle2 className="h-3.5 w-3.5 text-earning" />}
                      </Label>
                      <input ref={vehicleRegRef} type="file" accept="image/*,.pdf" onChange={e => handleDocSelect(e, "registration")} className="hidden" />
                      <button
                        onClick={() => vehicleRegRef.current?.click()}
                        className={cn(
                          "w-full rounded-xl border-2 border-dashed p-4 flex flex-col items-center gap-2 transition-colors",
                          vehicleRegFile ? "border-earning/30 bg-earning/5" : "border-border hover:border-primary/30"
                        )}
                      >
                        {vehicleRegPreview && vehicleRegPreview.startsWith("blob:") ? (
                          <img src={vehicleRegPreview} alt="" className="h-20 rounded-lg object-cover" />
                        ) : vehicleRegFile ? (
                          <div className="flex items-center gap-2">
                            <FileText className="h-5 w-5 text-earning" />
                            <span className="text-xs font-medium text-earning truncate max-w-[200px]">{vehicleRegFile.name}</span>
                          </div>
                        ) : (
                          <>
                            <Upload className="h-6 w-6 text-muted-foreground/50" />
                            <span className="text-xs text-muted-foreground">Tap to upload photo or PDF</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {error && <p className="text-xs text-destructive text-center">{error}</p>}

                </div>
              )}

              {/* ── STEP: Photo ── */}
              {wizardStep === "photo" && (
                <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div className="text-center space-y-1">
                    <h2 className="text-lg font-bold text-foreground">Profile photo</h2>
                    <p className="text-sm text-muted-foreground">Upload a clear photo of your face for identification</p>
                  </div>

                  <input ref={fileRef} type="file" accept="image/*" capture="user" onChange={handlePhotoSelect} className="hidden" />

                  <button onClick={() => fileRef.current?.click()} className="group mx-auto block relative">
                    <Avatar className="h-28 w-28 border-2 border-dashed border-border group-hover:border-primary/50 transition-colors">
                      {avatarPreview ? (
                        <AvatarImage src={avatarPreview} />
                      ) : (
                        <AvatarFallback className="bg-muted/30 text-muted-foreground"><Camera className="h-8 w-8" /></AvatarFallback>
                      )}
                    </Avatar>
                    <div className="absolute -bottom-1 -right-1 bg-primary text-primary-foreground rounded-full p-1.5 shadow-md">
                      <Camera className="h-3.5 w-3.5" />
                    </div>
                  </button>

                  {error && <p className="text-xs text-destructive text-center">{error}</p>}

                  <div className="text-[10px] text-muted-foreground bg-muted/20 rounded-xl p-3 space-y-0.5">
                     <p className="font-semibold text-foreground text-xs mb-1">Requirements:</p>
                    <p>✓ Clear photo of your face</p>
                    <p>✓ No sunglasses or masks</p>
                    <p>✓ Good lighting</p>
                  </div>

                  <div className="flex gap-2">
                    <Button variant="outline" onClick={goBack} className="h-10 rounded-xl gap-1"><ArrowLeft className="h-4 w-4" /> Back</Button>
                    <Button onClick={handleActivate} disabled={!avatarPreview || busy} className="flex-1 h-12 rounded-xl text-base font-semibold gap-2">
                      {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Activating...</> : <>Activate my account <ArrowRight className="h-4 w-4" /></>}
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
                    <h2 className="text-xl font-bold text-foreground">You're all set! 🎉</h2>
                    <p className="text-sm text-muted-foreground">Your portal is activated. You can now view shifts, confirm attendance and chat with your team.</p>
                  </div>
                  <div className="rounded-xl border border-earning/20 bg-earning/5 p-4 space-y-2 text-left">
                    <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <CheckCircle2 className="h-3.5 w-3.5 text-earning" /> Profile complete
                    </p>
                    <div className="text-xs text-muted-foreground space-y-1 ml-5">
                      <p>• View and confirm shifts</p>
                      <p>• Clock in and out</p>
                      <p>• Chat with your team</p>
                      <p>• View payments and announcements</p>
                    </div>
                  </div>
                  <Button onClick={() => navigate("/portal")} className="w-full h-12 rounded-xl text-base font-semibold gap-2">
                    Go to my portal <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Sticky footer with primary actions — always visible */}
          {showWizardFooter && (
            <div
              className="shrink-0 border-t border-border/40 bg-card px-6 pt-3 pb-3"
              style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
            >
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={goBack}
                  className="h-11 rounded-xl gap-1 px-4"
                >
                  <ArrowLeft className="h-4 w-4" /> Back
                </Button>
                {isPhotoStep ? (
                  <Button
                    onClick={handleActivate}
                    disabled={!avatarPreview || busy}
                    className="flex-1 h-11 rounded-xl text-base font-semibold gap-2"
                  >
                    {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Activating...</> : <>Activate my account <ArrowRight className="h-4 w-4" /></>}
                  </Button>
                ) : (
                  <Button
                    onClick={goNext}
                    disabled={nextDisabled}
                    className="flex-1 h-11 rounded-xl text-base font-semibold gap-1"
                  >
                    Next <ArrowRight className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>

        <p className="shrink-0 text-center text-[10px] text-muted-foreground/40 mt-2">Powered by Stafly</p>
      </div>
    </div>
  );
}
