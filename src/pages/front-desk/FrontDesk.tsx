/**
 * Stafly Front Desk — Premium Help Assistant Kiosk for employees.
 *
 * Phone-only access (no PIN). Supports multi-tenant phone matches via a
 * profile picker. After identification, employees access a 6-card hub:
 * direct self-service edit, pending items, request, comment, payments,
 * profile.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import {
  Loader2, ArrowLeft, ArrowRight, X, Phone, Sparkles,
  UserCog, AlertCircle, Send, MessageSquare, Wallet, IdCard,
  CheckCircle2, Mail, MapPin, ShieldAlert, Building2,
  Users, RefreshCw, Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { StaflyLogo } from "@/components/brand/StaflyBrand";
import {
  useFrontDesk,
  type FrontDeskEmployee,
  type FrontDeskSummary,
  type InquiryCategory,
  type PaymentRow,
  type SelfUpdatePayload,
  type ActiveCase,
  type IntakeReason,
  type FinalResolution,
  type RatingValue,
} from "@/hooks/useFrontDesk";
import { NumericKeypad } from "@/components/front-desk/NumericKeypad";
import { AttractMode } from "@/components/front-desk/AttractMode";
import { FrontDeskBackdrop } from "@/components/front-desk/FrontDeskArtwork";
import { TicketBadge } from "@/components/front-desk/TicketBadge";
import { IntakeReasonStep } from "@/components/front-desk/IntakeReasonStep";
import { PhotoCaptureStep } from "@/components/front-desk/PhotoCaptureStep";
import { ResolutionStep } from "@/components/front-desk/ResolutionStep";
import { RatingStep } from "@/components/front-desk/RatingStep";
import { ensureFrontDeskBundleFresh } from "@/lib/front-desk-cache-bust";

type Step =
  | "welcome"
  | "phone"
  | "select_profile"
  | "not_found"
  | "intake"
  | "hub"
  | "update_data"
  | "pending"
  | "request"
  | "comment"
  | "payments"
  | "profile"
  | "photo_capture"
  | "resolution"
  | "rating"
  | "complete";

type Lang = "es" | "en";
type CompleteKind = "request" | "comment" | "update";

const INACTIVITY_MS = 120_000;
const ATTRACT_IDLE_MS = 45_000; // welcome screen → attract mode after 45s idle

const T = {
  es: {
    appName: "Front Desk",
    welcome: "Hola, estamos aquí para ayudarte",
    welcomeSub: "Consulta tu información o realiza una solicitud en segundos",
    start: "Comenzar",
    enterPhone: "Ingresa tu número de teléfono",
    enterPhoneSub: "Te identificaremos para ofrecerte ayuda personalizada",
    continue: "Continuar",
    back: "Atrás",
    cancel: "Cancelar",
    finish: "Finalizar",
    save: "Guardar cambios",
    saving: "Guardando…",
    hello: "Hola",
    helloSub: "¿En qué te ayudamos hoy?",
    notYou: "No soy yo",
    pendingBadge: "pendiente",
    pendingBadgePlural: "pendientes",
    selectProfileTitle: "Encontramos varios perfiles",
    selectProfileSub: "Selecciona el perfil al que deseas ingresar",
    notFoundTitle: "No encontramos tu perfil",
    notFoundSub: "Verifica el número o pide ayuda al equipo",
    tryAgain: "Intentar de nuevo",
    leaveRequest: "Dejar una solicitud",
    leaveComment: "Dejar un comentario",
    actions: {
      update_data: { title: "Actualizar mis datos", desc: "Teléfono, dirección, contacto de emergencia" },
      pending: { title: "Consultar pendientes", desc: "Documentos o información por completar" },
      request: { title: "Hacer una solicitud", desc: "Pide algo al equipo administrativo" },
      comment: { title: "Dejar un comentario", desc: "Sugerencias, dudas o feedback" },
      payments: { title: "Revisar mis pagos", desc: "Historial reciente y estado" },
      profile: { title: "Ver mi perfil", desc: "Datos completos de tu cuenta" },
    },
    updateDataTitle: "Actualizar mis datos",
    updateDataSub: "Edita directamente la información permitida. Los cambios se guardan al instante.",
    fields: {
      phone_number: "Teléfono",
      email: "Correo electrónico",
      address: "Dirección",
      emergency_contact_name: "Contacto de emergencia",
      emergency_contact_phone: "Teléfono del contacto",
    },
    lockedTitle: "Datos protegidos",
    lockedSub: "Estos campos requieren ayuda del equipo administrativo",
    lockedFields: {
      company: "Empresa",
      role: "Rol interno",
      payroll: "Datos de nómina",
    },
    requestChange: "Solicitar cambio",
    pendingTitle: "Tus pendientes",
    noPending: "Todo en orden — no tienes pendientes",
    paymentsTitle: "Mis pagos recientes",
    noPayments: "No hay pagos registrados todavía",
    profileTitle: "Mi perfil",
    requestTitle: "Hacer una solicitud",
    requestSub: "Cuéntanos qué necesitas",
    commentTitle: "Dejar un comentario",
    commentSub: "Tu opinión nos ayuda a mejorar",
    selectCategory: "¿Sobre qué tema?",
    messageLabel: "Mensaje",
    messagePlaceholder: "Escribe tu mensaje…",
    send: "Enviar",
    sending: "Enviando…",
    sentTitle: "¡Mensaje enviado!",
    sentSub: "Nuestro equipo lo revisará pronto",
    updatedTitle: "¡Datos actualizados!",
    updatedSub: "Tu información se guardó correctamente",
    completeTitle: "¡Gracias por tu visita!",
    completeSub: "Hasta pronto",
    newSession: "Nueva sesión",
    backHome: "Volver al inicio",
    actNow: "Resolver",
    helpRequest: "Pedir ayuda",
    profile: {
      name: "Nombre",
      phone: "Teléfono",
      email: "Correo",
      address: "Dirección",
      role: "Rol",
      company: "Empresa",
      emergency: "Contacto emergencia",
      portal: "Portal",
      portal_active: "Activo",
      portal_pending: "Invitación pendiente",
      portal_none: "No activado",
      missing: "Pendiente",
    },
    categories: {
      payments: "Pagos",
      documents: "Documentos",
      profile: "Perfil",
      support: "Soporte general",
      schedule: "Horarios o turnos",
      other: "Otro",
    } as Record<InquiryCategory, string>,
    invalidEmail: "Correo electrónico inválido",
    invalidPhone: "Teléfono inválido",
    noChanges: "No hay cambios para guardar",
  },
  en: {
    appName: "Front Desk",
    welcome: "Hi, we're here to help",
    welcomeSub: "Check your info or request something in seconds",
    start: "Start",
    enterPhone: "Enter your phone number",
    enterPhoneSub: "We'll identify you for personalized help",
    continue: "Continue",
    back: "Back",
    cancel: "Cancel",
    finish: "Finish",
    save: "Save changes",
    saving: "Saving…",
    hello: "Hi",
    helloSub: "How can we help today?",
    notYou: "Not me",
    pendingBadge: "pending",
    pendingBadgePlural: "pending",
    selectProfileTitle: "We found multiple profiles",
    selectProfileSub: "Select the profile you want to access",
    notFoundTitle: "We couldn't find your profile",
    notFoundSub: "Check the number or ask the team for help",
    tryAgain: "Try again",
    leaveRequest: "Leave a request",
    leaveComment: "Leave a comment",
    actions: {
      update_data: { title: "Update my info", desc: "Phone, address, emergency contact" },
      pending: { title: "Check pending items", desc: "Missing documents or info" },
      request: { title: "Make a request", desc: "Ask the admin team for something" },
      comment: { title: "Leave a comment", desc: "Suggestions, questions or feedback" },
      payments: { title: "Review my payments", desc: "Recent history and status" },
      profile: { title: "View my profile", desc: "Your full account info" },
    },
    updateDataTitle: "Update my info",
    updateDataSub: "Edit your allowed information directly. Changes are saved instantly.",
    fields: {
      phone_number: "Phone",
      email: "Email",
      address: "Address",
      emergency_contact_name: "Emergency contact",
      emergency_contact_phone: "Contact phone",
    },
    lockedTitle: "Protected fields",
    lockedSub: "These fields require help from the admin team",
    lockedFields: {
      company: "Company",
      role: "Internal role",
      payroll: "Payroll data",
    },
    requestChange: "Request change",
    pendingTitle: "Your pending items",
    noPending: "All set — no pending items",
    paymentsTitle: "My recent payments",
    noPayments: "No payments registered yet",
    profileTitle: "My profile",
    requestTitle: "Make a request",
    requestSub: "Tell us what you need",
    commentTitle: "Leave a comment",
    commentSub: "Your feedback helps us improve",
    selectCategory: "What topic?",
    messageLabel: "Message",
    messagePlaceholder: "Type your message…",
    send: "Send",
    sending: "Sending…",
    sentTitle: "Message sent!",
    sentSub: "Our team will review it soon",
    updatedTitle: "Info updated!",
    updatedSub: "Your information was saved successfully",
    completeTitle: "Thanks for your visit!",
    completeSub: "See you soon",
    newSession: "New session",
    backHome: "Back to home",
    actNow: "Resolve",
    helpRequest: "Get help",
    profile: {
      name: "Name",
      phone: "Phone",
      email: "Email",
      address: "Address",
      role: "Role",
      company: "Company",
      emergency: "Emergency contact",
      portal: "Portal",
      portal_active: "Active",
      portal_pending: "Invitation pending",
      portal_none: "Not activated",
      missing: "Pending",
    },
    categories: {
      payments: "Payments",
      documents: "Documents",
      profile: "Profile",
      support: "General support",
      schedule: "Schedule or shifts",
      other: "Other",
    } as Record<InquiryCategory, string>,
    invalidEmail: "Invalid email address",
    invalidPhone: "Invalid phone number",
    noChanges: "No changes to save",
  },
};

const ACTION_CARDS = [
  { key: "update_data" as Step, icon: UserCog, iconWrap: "bg-primary/12 text-primary" },
  { key: "pending" as Step, icon: AlertCircle, iconWrap: "bg-accent/15 text-accent-foreground" },
  { key: "request" as Step, icon: Send, iconWrap: "bg-secondary text-secondary-foreground" },
  { key: "comment" as Step, icon: MessageSquare, iconWrap: "bg-primary/10 text-primary" },
  { key: "payments" as Step, icon: Wallet, iconWrap: "bg-accent/12 text-accent-foreground" },
  { key: "profile" as Step, icon: IdCard, iconWrap: "bg-secondary text-secondary-foreground" },
];

const CATEGORIES: InquiryCategory[] = ["payments", "documents", "profile", "schedule", "support", "other"];

function fullName(e: FrontDeskEmployee | null): string {
  if (!e) return "";
  return `${e.first_name ?? ""} ${e.last_name ?? ""}`.trim();
}

function initials(e: FrontDeskEmployee | null): string {
  if (!e) return "?";
  return `${e.first_name?.[0] ?? ""}${e.last_name?.[0] ?? ""}`.toUpperCase() || "?";
}

export default function FrontDesk() {
  const {
    lookupByPhone, selectEmployee, updateSelf, createInquiry, listPayments,
    startVisit, closeVisit, captureKioskPhoto,
    loading,
  } = useFrontDesk();

  const [step, setStep] = useState<Step>("welcome");
  const [lang, setLang] = useState<Lang>("es");
  const [phone, setPhone] = useState("");
  const [employee, setEmployee] = useState<FrontDeskEmployee | null>(null);
  const [summary, setSummary] = useState<FrontDeskSummary | null>(null);
  const [matches, setMatches] = useState<FrontDeskEmployee[]>([]);
  const [category, setCategory] = useState<InquiryCategory>("support");
  const [message, setMessage] = useState("");
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [paymentsLoaded, setPaymentsLoaded] = useState(false);
  const [completeKind, setCompleteKind] = useState<CompleteKind>("request");
  const [currentTime, setCurrentTime] = useState(new Date());
  const [attract, setAttract] = useState(true);

  // ===== Phase 2: CRM case state =====
  const [activeCase, setActiveCase] = useState<ActiveCase | null>(null);
  const [pendingResolution, setPendingResolution] = useState<FinalResolution | null>(null);
  const [pendingNote, setPendingNote] = useState<string | undefined>(undefined);
  const [closedCase, setClosedCase] = useState<
    (ActiveCase & { rating?: RatingValue; resolution?: FinalResolution }) | null
  >(null);

  const inactivityRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attractRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Form state for direct self-update
  const [formValues, setFormValues] = useState<SelfUpdatePayload>({});
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof SelfUpdatePayload, string>>>({});

  const t = T[lang];

  useEffect(() => {
    const id = setInterval(() => setCurrentTime(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Cache-busting: on mount and every time the tablet wakes/refocuses,
  // verify the served HTML still references the same /assets/index-*.js
  // bundle the running app was loaded from. If a newer Publish has happened,
  // wipe caches/SW and hard-reload exactly once. Anti-loop guard inside.
  useEffect(() => {
    void ensureFrontDeskBundleFresh();
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void ensureFrontDeskBundleFresh();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    // Re-check periodically while the kiosk stays open all day.
    const poll = setInterval(() => void ensureFrontDeskBundleFresh(), 5 * 60_000);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      clearInterval(poll);
    };
  }, []);

  const resetAll = useCallback(() => {
    setStep("welcome");
    setPhone("");
    setEmployee(null);
    setSummary(null);
    setMatches([]);
    setCategory("support");
    setMessage("");
    setPayments([]);
    setPaymentsLoaded(false);
    setFormValues({});
    setFormErrors({});
    setActiveCase(null);
    setPendingResolution(null);
    setPendingNote(undefined);
    setClosedCase(null);
    // After resetting from any active session, return to attract mode so the
    // next visitor sees a clean welcome and no leftover data.
    setAttract(true);
  }, []);

  /** Open a CRM case after the intake reason is selected. */
  const handlePickIntake = async (reason: IntakeReason) => {
    if (!employee) return;
    try {
      const opened = await startVisit({
        employee_id: employee.id,
        intake_reason: reason,
        language: lang,
      });
      setActiveCase(opened);
      // Route directly into the relevant action when possible.
      if (reason === "update_data") {
        seedFormFromEmployee(employee);
        setStep("update_data");
      } else if (reason === "check_pending") {
        setStep("pending");
      } else if (reason === "payment_issue") {
        setCategory("payments");
        setMessage("");
        setStep("request");
      } else if (reason === "documents_help") {
        setCategory("documents");
        setMessage("");
        setStep("request");
      } else if (reason === "portal_help") {
        setCategory("support");
        setMessage("");
        setStep("request");
      } else if (reason === "leave_request") {
        setCategory("support");
        setMessage("");
        setStep("request");
      } else if (reason === "leave_comment") {
        setCategory("support");
        setMessage("");
        setStep("comment");
      } else if (reason === "pickup_check") {
        setStep("payments");
        if (!paymentsLoaded) {
          try {
            const rows = await listPayments({ employee_id: employee.id });
            setPayments(rows);
            setPaymentsLoaded(true);
          } catch { setPaymentsLoaded(true); }
        }
      } else {
        setStep("hub");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    }
  };

  // Inactivity reset (during an active session)
  useEffect(() => {
    if (step === "welcome") return;
    if (inactivityRef.current) clearTimeout(inactivityRef.current);
    inactivityRef.current = setTimeout(() => {
      resetAll();
      toast.info(lang === "es" ? "Sesión cerrada por inactividad" : "Session closed for inactivity");
    }, INACTIVITY_MS);
    return () => {
      if (inactivityRef.current) clearTimeout(inactivityRef.current);
    };
  }, [step, phone, message, formValues, resetAll, lang]);

  // Attract mode: when sitting on the welcome screen, slide into the attract
  // loop after ATTRACT_IDLE_MS so the kiosk never looks abandoned.
  useEffect(() => {
    if (step !== "welcome" || attract) return;
    if (attractRef.current) clearTimeout(attractRef.current);
    attractRef.current = setTimeout(() => setAttract(true), ATTRACT_IDLE_MS);
    return () => {
      if (attractRef.current) clearTimeout(attractRef.current);
    };
  }, [step, attract]);

  const seedFormFromEmployee = useCallback((emp: FrontDeskEmployee) => {
    setFormValues({
      phone_number: emp.phone_number ?? "",
      email: emp.email ?? "",
      address: emp.address ?? "",
      emergency_contact_name: emp.emergency_contact_name ?? "",
      emergency_contact_phone: emp.emergency_contact_phone ?? "",
    });
    setFormErrors({});
  }, []);

  const handleLookup = async () => {
    try {
      const res = await lookupByPhone(phone);
      if (res.multiple) {
        setMatches(res.matches);
        setStep("select_profile");
        return;
      }
      if (res.employee && res.summary) {
        setEmployee(res.employee);
        setSummary(res.summary);
        setStep("intake");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error";
      toast.error(msg);
      setStep("not_found");
    }
  };

  const handlePickProfile = async (id: string) => {
    try {
      const res = await selectEmployee(id);
      setEmployee(res.employee);
      setSummary(res.summary);
      setMatches([]);
      setStep("intake");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    }
  };

  const handleOpenPayments = async () => {
    setStep("payments");
    if (paymentsLoaded || !employee) return;
    try {
      const rows = await listPayments({ employee_id: employee.id });
      setPayments(rows);
      setPaymentsLoaded(true);
    } catch {
      setPaymentsLoaded(true);
    }
  };

  const handleOpenUpdate = () => {
    if (employee) seedFormFromEmployee(employee);
    setStep("update_data");
  };

  const handleSaveSelf = async () => {
    if (!employee) return;
    // Validate
    const errs: Partial<Record<keyof SelfUpdatePayload, string>> = {};
    if (formValues.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formValues.email.trim())) {
      errs.email = t.invalidEmail;
    }
    if (formValues.phone_number && formValues.phone_number.replace(/\D/g, "").length < 7) {
      errs.phone_number = t.invalidPhone;
    }
    if (Object.keys(errs).length > 0) {
      setFormErrors(errs);
      return;
    }

    // Compute changed fields only
    const updates: SelfUpdatePayload = {};
    (Object.keys(formValues) as Array<keyof SelfUpdatePayload>).forEach((k) => {
      const next = (formValues[k] ?? "").toString().trim();
      const prev = ((employee as any)[k] ?? "").toString().trim();
      if (next !== prev) (updates as any)[k] = next;
    });

    if (Object.keys(updates).length === 0) {
      // Even with no field changes, advance the kiosk flow toward photo step.
      if (!employee.avatar_url) return setStep("photo_capture");
      return setStep("resolution");
    }

    try {
      const res = await updateSelf({
        employee_id: employee.id,
        updates,
        language: lang,
        visit_id: activeCase?.id,
      });
      setEmployee(res.employee);
      setSummary(res.summary);
      setCompleteKind("update");
      // Offer photo capture right after a successful update if missing.
      if (!res.employee.avatar_url) {
        setStep("photo_capture");
      } else {
        setStep("resolution");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    }
  };

  /** Save photo captured in the kiosk and continue to resolution. */
  const handleSavePhoto = async (base64: string) => {
    if (!employee) return;
    try {
      const res = await captureKioskPhoto({
        employee_id: employee.id,
        photo_base64: base64,
        visit_id: activeCase?.id,
      });
      setEmployee(res.employee);
      toast.success(lang === "es" ? "Foto guardada" : "Photo saved");
      setStep("resolution");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    }
  };

  /** From resolution → rating step. */
  const handlePickResolution = (resolution: FinalResolution, note?: string) => {
    setPendingResolution(resolution);
    setPendingNote(note);
    setStep("rating");
  };

  /** Submit final rating + close the case. */
  const handleSubmitRating = async (rating: RatingValue, comment?: string) => {
    if (!activeCase) {
      // Defensive: if no case, just go to complete.
      setStep("complete");
      return;
    }
    try {
      const closed = await closeVisit({
        visit_id: activeCase.id,
        final_resolution: pendingResolution ?? "resolved",
        resolution_note: pendingNote,
        rating,
        rating_comment: comment,
      });
      setClosedCase({
        ...activeCase,
        ...closed,
        rating,
        resolution: pendingResolution ?? "resolved",
      });
      setStep("complete");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    }
  };

  const handleSkipRating = async () => {
    if (!activeCase) return setStep("complete");
    try {
      const closed = await closeVisit({
        visit_id: activeCase.id,
        final_resolution: pendingResolution ?? "resolved",
        resolution_note: pendingNote,
      });
      setClosedCase({
        ...activeCase,
        ...closed,
        resolution: pendingResolution ?? "resolved",
      });
      setStep("complete");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    }
  };

  const handleSend = async (kind: "request" | "comment") => {
    if (!message.trim()) {
      toast.error(lang === "es" ? "Escribe un mensaje" : "Write a message");
      return;
    }
    try {
      await createInquiry({
        employee_id: employee?.id,
        phone: employee ? undefined : phone,
        category,
        message: message.trim(),
        inquiry_kind: kind,
        language: lang,
      });
      setMessage("");
      setCompleteKind(kind);
      // Inside an active case → ask for resolution + rating before closing.
      if (activeCase) {
        setStep("resolution");
      } else {
        setStep("complete");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    }
  };

  const goHub = () => setStep("hub");
  /** Back from any in-case action returns to the intake picker. */
  const goIntake = () => setStep("intake");

  return (
    <div className="relative min-h-screen overflow-hidden bg-background flex flex-col">
      <FrontDeskBackdrop />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-background/10 via-background/40 to-background/85" />
      {/* Premium attract / idle screen — dismissed on any interaction */}
      {attract && (
        <AttractMode
          lang={lang}
          onDismiss={() => {
            setAttract(false);
            if (step === "welcome") setStep("phone");
          }}
        />
      )}
      {/* Header */}
      <header className="border-b border-border/60 bg-card/60 backdrop-blur-xl sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <StaflyLogo size={28} />
            <div className="hidden sm:block border-l border-border/60 pl-3">
              <p className="text-sm font-semibold leading-tight">{t.appName}</p>
              <p className="text-xs text-muted-foreground">
                {currentTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} ·{" "}
                {currentTime.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" })}
              </p>
            </div>
            {/* Persistent ticket badge while a case is open */}
            {activeCase?.case_code && (
              <TicketBadge
                caseCode={activeCase.case_code}
                status={activeCase.status}
                className="hidden md:inline-flex"
              />
            )}
          </div>

          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-full bg-muted p-1 text-xs font-medium">
              {(["es", "en"] as Lang[]).map((l) => (
                <button
                  key={l}
                  onClick={() => setLang(l)}
                  className={cn(
                    "px-3 py-1 rounded-full transition-colors uppercase",
                    lang === l ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"
                  )}
                >
                  {l}
                </button>
              ))}
            </div>
            {step !== "welcome" && step !== "complete" && (
              <Button variant="ghost" size="sm" onClick={resetAll}>
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="relative z-[1] flex-1 flex items-start justify-center px-4 py-6 sm:py-10">
        <div className="w-full max-w-3xl">
          {/* Mobile ticket badge */}
          {activeCase?.case_code && step !== "complete" && (
            <div className="mb-4 flex justify-center md:hidden">
              <TicketBadge caseCode={activeCase.case_code} status={activeCase.status} />
            </div>
          )}

          {/* ============ WELCOME ============ */}
          {step === "welcome" && (
            <Card className="border-border/50 bg-card/68 p-10 text-center shadow-xl backdrop-blur-xl sm:p-16 rounded-3xl">
              <div className="mx-auto mb-6 h-20 w-20 rounded-3xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-lg shadow-primary/30">
                <Sparkles className="h-10 w-10 text-primary-foreground" />
              </div>
              <h1 className="text-3xl sm:text-4xl font-bold mb-3 tracking-tight">{t.welcome}</h1>
              <p className="text-lg text-muted-foreground mb-10 max-w-md mx-auto">{t.welcomeSub}</p>
              <Button
                size="lg"
                className="h-14 px-10 text-base rounded-2xl shadow-md"
                onClick={() => setStep("phone")}
              >
                {t.start}
                <ArrowRight className="h-5 w-5 ml-2" />
              </Button>
            </Card>
          )}

          {/* ============ PHONE ============ */}
          {step === "phone" && (
            <Card className="rounded-3xl border border-border/50 bg-card/72 p-6 shadow-xl backdrop-blur-xl sm:p-10">
              <div className="text-center mb-6">
                <h2 className="text-2xl font-bold mb-2">{t.enterPhone}</h2>
                <p className="text-sm text-muted-foreground mb-4">{t.enterPhoneSub}</p>
                <div className="mx-auto inline-flex min-w-[260px] items-center gap-3 rounded-2xl border border-border/70 bg-background/55 px-6 py-4 shadow-sm backdrop-blur-sm">
                  <Phone className="h-5 w-5 text-muted-foreground" />
                  <span className="text-2xl font-mono tracking-wider">{phone || "—"}</span>
                </div>
              </div>
              <div className="max-w-sm mx-auto">
                <NumericKeypad
                  onDigit={(d) => setPhone((p) => (p.length < 15 ? p + d : p))}
                  onBackspace={() => setPhone((p) => p.slice(0, -1))}
                  onClear={() => setPhone("")}
                />
              </div>
              <div className="flex gap-3 mt-6 justify-center">
                <Button variant="ghost" onClick={resetAll} className="h-12 px-6">
                  <ArrowLeft className="h-4 w-4 mr-1" /> {t.cancel}
                </Button>
                <Button
                  onClick={handleLookup}
                  disabled={phone.length < 7 || loading}
                  className="h-12 px-8 rounded-xl"
                  size="lg"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : (
                    <>{t.continue} <ArrowRight className="h-4 w-4 ml-1" /></>
                  )}
                </Button>
              </div>
            </Card>
          )}

          {/* ============ SELECT PROFILE (multi-tenant) ============ */}
          {step === "select_profile" && (
            <Card className="p-6 sm:p-8 rounded-3xl border-2 shadow-xl">
              <div className="text-center mb-6">
                <div className="mx-auto mb-4 h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <Users className="h-7 w-7 text-primary" />
                </div>
                <h2 className="text-2xl font-bold mb-1">{t.selectProfileTitle}</h2>
                <p className="text-sm text-muted-foreground">{t.selectProfileSub}</p>
              </div>
              <div className="space-y-3">
                {matches.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => handlePickProfile(m.id)}
                    disabled={loading}
                    className="w-full flex items-center gap-4 p-4 rounded-2xl border-2 border-border bg-card hover:border-primary/60 hover:shadow-md active:scale-[0.99] transition-all text-left disabled:opacity-50"
                  >
                    <Avatar className="h-14 w-14 ring-2 ring-primary/20">
                      <AvatarImage src={m.avatar_url ?? undefined} />
                      <AvatarFallback className="font-semibold bg-primary/10 text-primary">
                        {initials(m)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-base truncate">{fullName(m)}</p>
                      <p className="text-xs text-muted-foreground truncate flex items-center gap-1.5 mt-0.5">
                        <Building2 className="h-3 w-3" /> {m.company_name ?? "—"}
                      </p>
                      {m.employee_role && (
                        <p className="text-xs text-muted-foreground truncate mt-0.5">{m.employee_role}</p>
                      )}
                    </div>
                    <ArrowRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                  </button>
                ))}
              </div>
              <div className="mt-6 text-center">
                <Button variant="ghost" onClick={resetAll} className="h-10">
                  <ArrowLeft className="h-4 w-4 mr-1" /> {t.cancel}
                </Button>
              </div>
            </Card>
          )}

          {/* ============ INTAKE REASON ============ */}
          {step === "intake" && employee && (
            <IntakeReasonStep
              lang={lang}
              loading={loading}
              employeeName={fullName(employee)}
              onPick={handlePickIntake}
              onBack={resetAll}
            />
          )}

          {/* ============ PHOTO CAPTURE ============ */}
          {step === "photo_capture" && employee && (
            <PhotoCaptureStep
              lang={lang}
              saving={loading}
              onSave={handleSavePhoto}
              onSkip={() => setStep("resolution")}
              onBack={() => setStep("update_data")}
            />
          )}

          {/* ============ RESOLUTION ============ */}
          {step === "resolution" && (
            <ResolutionStep
              lang={lang}
              loading={loading}
              onContinue={handlePickResolution}
              onBack={goIntake}
            />
          )}

          {/* ============ RATING ============ */}
          {step === "rating" && (
            <RatingStep
              lang={lang}
              loading={loading}
              onSubmit={handleSubmitRating}
              onSkip={handleSkipRating}
            />
          )}

          {/* ============ NOT FOUND ============ */}
          {step === "not_found" && (
            <Card className="p-8 sm:p-12 text-center shadow-xl rounded-3xl border-2">
              <div className="mx-auto mb-5 h-16 w-16 rounded-2xl bg-amber-500/10 flex items-center justify-center">
                <AlertCircle className="h-8 w-8 text-amber-600" />
              </div>
              <h2 className="text-2xl font-bold mb-2">{t.notFoundTitle}</h2>
              <p className="text-muted-foreground mb-8 max-w-md mx-auto">{t.notFoundSub}</p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button variant="outline" onClick={() => { setPhone(""); setStep("phone"); }} className="h-12 px-6 rounded-xl">
                  <RefreshCw className="h-4 w-4 mr-2" /> {t.tryAgain}
                </Button>
                <Button
                  onClick={() => { setCategory("support"); setMessage(""); setStep("request"); }}
                  className="h-12 px-6 rounded-xl"
                >
                  <Send className="h-4 w-4 mr-2" /> {t.leaveRequest}
                </Button>
              </div>
            </Card>
          )}

          {/* ============ HUB ============ */}
          {step === "hub" && employee && summary && (
            <div className="space-y-6">
              <Card className="p-6 sm:p-8 rounded-3xl border-2 shadow-md bg-gradient-to-br from-card to-primary/5">
                <div className="flex items-center gap-4">
                  <Avatar className="h-16 w-16 ring-2 ring-primary/30">
                    <AvatarImage src={employee.avatar_url ?? undefined} />
                    <AvatarFallback className="text-lg font-semibold bg-primary/10 text-primary">
                      {initials(employee)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-muted-foreground">{t.hello},</p>
                    <h2 className="text-2xl font-bold truncate">{fullName(employee)}</h2>
                    <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-1.5">
                      {employee.company_name && (
                        <>
                          <Building2 className="h-3.5 w-3.5" />
                          <span className="truncate">{employee.company_name}</span>
                        </>
                      )}
                    </p>
                  </div>
                  {summary.pending_total > 0 && (
                    <Badge className="bg-amber-500/15 text-amber-700 hover:bg-amber-500/20 border-amber-500/30 dark:text-amber-300 px-3 py-1.5 rounded-full">
                      {summary.pending_total} {summary.pending_total === 1 ? t.pendingBadge : t.pendingBadgePlural}
                    </Badge>
                  )}
                </div>
              </Card>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {ACTION_CARDS.map(({ key, icon: Icon, iconWrap }) => {
                  const meta = (t.actions as any)[key];
                  const isPending = key === "pending" && summary.pending_total > 0;
                  return (
                    <button
                      key={key}
                      onClick={() => {
                        if (key === "payments") return handleOpenPayments();
                        if (key === "update_data") return handleOpenUpdate();
                        setStep(key);
                      }}
                      className="group text-left p-6 rounded-3xl border-2 border-border bg-card hover:border-primary/60 hover:shadow-lg active:scale-[0.98] transition-all"
                    >
                      <div className="flex items-start gap-4">
                          <div className={cn(
                           "h-12 w-12 rounded-2xl flex items-center justify-center shadow-md flex-shrink-0",
                           iconWrap
                         )}>
                           <Icon className="h-6 w-6" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-base leading-tight">{meta.title}</h3>
                            {isPending && (
                              <span className="inline-flex h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground mt-1 leading-snug">{meta.desc}</p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ============ UPDATE DATA (direct edit) ============ */}
          {step === "update_data" && employee && (
            <SectionCard title={t.updateDataTitle} subtitle={t.updateDataSub} onBack={goHub} t={t}>
              <div className="space-y-5">
                <FormField
                  label={t.fields.phone_number}
                  htmlFor="phone_number"
                  error={formErrors.phone_number}
                >
                  <Input
                    id="phone_number"
                    inputMode="tel"
                    value={formValues.phone_number ?? ""}
                    onChange={(e) => setFormValues((v) => ({ ...v, phone_number: e.target.value }))}
                    className="h-12 text-base"
                    placeholder="—"
                  />
                </FormField>

                <FormField
                  label={t.fields.email}
                  htmlFor="email"
                  error={formErrors.email}
                >
                  <Input
                    id="email"
                    type="email"
                    inputMode="email"
                    value={formValues.email ?? ""}
                    onChange={(e) => setFormValues((v) => ({ ...v, email: e.target.value }))}
                    className="h-12 text-base"
                    placeholder="—"
                  />
                </FormField>

                <FormField label={t.fields.address} htmlFor="address">
                  <Input
                    id="address"
                    value={formValues.address ?? ""}
                    onChange={(e) => setFormValues((v) => ({ ...v, address: e.target.value }))}
                    className="h-12 text-base"
                    placeholder="—"
                  />
                </FormField>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField label={t.fields.emergency_contact_name} htmlFor="ec_name">
                    <Input
                      id="ec_name"
                      value={formValues.emergency_contact_name ?? ""}
                      onChange={(e) => setFormValues((v) => ({ ...v, emergency_contact_name: e.target.value }))}
                      className="h-12 text-base"
                      placeholder="—"
                    />
                  </FormField>
                  <FormField label={t.fields.emergency_contact_phone} htmlFor="ec_phone">
                    <Input
                      id="ec_phone"
                      inputMode="tel"
                      value={formValues.emergency_contact_phone ?? ""}
                      onChange={(e) => setFormValues((v) => ({ ...v, emergency_contact_phone: e.target.value }))}
                      className="h-12 text-base"
                      placeholder="—"
                    />
                  </FormField>
                </div>

                {/* Locked fields explanation */}
                <div className="mt-2 p-4 rounded-2xl border-2 border-dashed border-border bg-muted/30">
                  <div className="flex items-start gap-3 mb-3">
                    <Lock className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-sm">{t.lockedTitle}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{t.lockedSub}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {Object.values(t.lockedFields).map((label) => (
                      <span key={label} className="text-xs px-2.5 py-1 rounded-full bg-muted border border-border text-muted-foreground">
                        {label}
                      </span>
                    ))}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-xl"
                    onClick={() => { setCategory("profile"); setMessage(""); setStep("request"); }}
                  >
                    <Send className="h-3.5 w-3.5 mr-2" /> {t.requestChange}
                  </Button>
                </div>

                <Button
                  size="lg"
                  className="w-full h-13 rounded-xl mt-2"
                  onClick={handleSaveSelf}
                  disabled={loading}
                >
                  {loading ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> {t.saving}</>
                  ) : (
                    <><CheckCircle2 className="h-4 w-4 mr-2" /> {t.save}</>
                  )}
                </Button>
              </div>
            </SectionCard>
          )}

          {/* ============ PENDING ============ */}
          {step === "pending" && summary && (
            <SectionCard title={t.pendingTitle} onBack={goHub} t={t}>
              {summary.pending_total === 0 ? (
                <EmptyState icon={CheckCircle2} title={t.noPending} accent="success" />
              ) : (
                <ul className="space-y-3">
                  {summary.pending_items.map((item) => {
                    // Items the user can fix directly via update_data form
                    const directlyFixable = ["missing_email", "missing_address", "missing_emergency"].includes(item.key);
                    return (
                      <li
                        key={item.key}
                        className={cn(
                          "flex items-start justify-between gap-3 p-4 rounded-2xl border-2",
                          item.severity === "high" ? "bg-rose-500/5 border-rose-500/30" :
                          item.severity === "medium" ? "bg-amber-500/5 border-amber-500/30" :
                          "bg-muted/40 border-border"
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <ShieldAlert className={cn(
                            "h-5 w-5 mt-0.5 flex-shrink-0",
                            item.severity === "high" ? "text-rose-600" :
                            item.severity === "medium" ? "text-amber-600" : "text-muted-foreground"
                          )} />
                          <span className="text-sm font-medium">{item.label}</span>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="rounded-xl flex-shrink-0"
                          onClick={() => {
                            if (directlyFixable) return handleOpenUpdate();
                            setCategory("support");
                            setMessage(item.label);
                            setStep("request");
                          }}
                        >
                          {directlyFixable ? t.actNow : t.helpRequest}
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </SectionCard>
          )}

          {/* ============ REQUEST / COMMENT ============ */}
          {(step === "request" || step === "comment") && (
            <SectionCard
              title={step === "request" ? t.requestTitle : t.commentTitle}
              subtitle={step === "request" ? t.requestSub : t.commentSub}
              onBack={employee ? goHub : resetAll}
              t={t}
            >
              <div className="space-y-5">
                <div>
                  <label className="text-sm font-semibold mb-3 block">{t.selectCategory}</label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {CATEGORIES.map((cat) => (
                      <button
                        key={cat}
                        onClick={() => setCategory(cat)}
                        className={cn(
                          "px-4 py-3 rounded-xl border-2 text-sm font-medium transition-all",
                          category === cat
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border bg-card hover:border-primary/40"
                        )}
                      >
                        {t.categories[cat]}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-sm font-semibold mb-2 block">{t.messageLabel}</label>
                  <Textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder={t.messagePlaceholder}
                    rows={5}
                    className="resize-none rounded-xl text-base"
                  />
                </div>

                <Button
                  size="lg"
                  className="w-full h-13 rounded-xl"
                  onClick={() => handleSend(step === "request" ? "request" : "comment")}
                  disabled={loading || !message.trim() || !employee}
                >
                  {loading ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> {t.sending}</>
                  ) : (
                    <><Send className="h-4 w-4 mr-2" /> {t.send}</>
                  )}
                </Button>
                {!employee && (
                  <p className="text-xs text-muted-foreground text-center">
                    {lang === "es" ? "Identifícate primero para enviar." : "Identify yourself first to send."}
                  </p>
                )}
              </div>
            </SectionCard>
          )}

          {/* ============ PAYMENTS ============ */}
          {step === "payments" && (
            <SectionCard title={t.paymentsTitle} onBack={goHub} t={t}>
              {!paymentsLoaded ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : payments.length === 0 ? (
                <EmptyState icon={Wallet} title={t.noPayments} />
              ) : (
                <ul className="divide-y divide-border/60">
                  {payments.map((p, i) => (
                    <li key={i} className="flex items-center justify-between py-4">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                          <Wallet className="h-5 w-5 text-emerald-600" />
                        </div>
                        <div>
                          <p className="font-semibold text-sm">
                            {p.work_date ? new Date(p.work_date).toLocaleDateString(lang, {
                              day: "numeric", month: "short", year: "numeric"
                            }) : "—"}
                          </p>
                          <p className="text-xs text-muted-foreground capitalize">
                            {p.pay_type ?? ""} {p.total_hours ? `· ${p.total_hours}h` : ""}
                          </p>
                        </div>
                      </div>
                      <p className="font-bold text-base tabular-nums">
                        {p.total_pay != null ? `$${Number(p.total_pay).toFixed(2)}` : "—"}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
          )}

          {/* ============ PROFILE ============ */}
          {step === "profile" && employee && summary && (
            <SectionCard title={t.profileTitle} onBack={goHub} t={t}>
              <div className="flex items-center gap-4 mb-6 p-4 rounded-2xl bg-muted/40">
                <Avatar className="h-16 w-16 ring-2 ring-primary/30">
                  <AvatarImage src={employee.avatar_url ?? undefined} />
                  <AvatarFallback className="text-lg font-semibold bg-primary/10 text-primary">
                    {initials(employee)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <h3 className="font-bold text-lg">{fullName(employee)}</h3>
                  {employee.employee_role && (
                    <p className="text-sm text-muted-foreground">{employee.employee_role}</p>
                  )}
                </div>
              </div>

              <dl className="space-y-3">
                <ProfileRow icon={Phone} label={t.profile.phone} value={employee.phone_number} />
                <ProfileRow icon={Mail} label={t.profile.email} value={employee.email} missingText={t.profile.missing} />
                <ProfileRow icon={MapPin} label={t.profile.address} value={employee.address} missingText={t.profile.missing} />
                <ProfileRow
                  icon={ShieldAlert}
                  label={t.profile.emergency}
                  value={employee.emergency_contact_name ? `${employee.emergency_contact_name} · ${employee.emergency_contact_phone ?? ""}` : null}
                  missingText={t.profile.missing}
                />
                {employee.company_name && (
                  <ProfileRow icon={Building2} label={t.profile.company} value={employee.company_name} />
                )}
                <ProfileRow
                  icon={IdCard}
                  label={t.profile.portal}
                  value={
                    summary.portal_status === "active" ? t.profile.portal_active :
                    summary.portal_status === "pending" ? t.profile.portal_pending :
                    t.profile.portal_none
                  }
                />
              </dl>

              <Button
                variant="outline"
                className="w-full mt-6 h-12 rounded-xl"
                onClick={handleOpenUpdate}
              >
                <UserCog className="h-4 w-4 mr-2" /> {t.actions.update_data.title}
              </Button>
            </SectionCard>
          )}

          {/* ============ COMPLETE (premium with case + status) ============ */}
          {step === "complete" && (() => {
            const isPending = closedCase?.resolution === "pending_followup";
            const accent = isPending
              ? "border-amber-500/30 bg-gradient-to-br from-amber-500/5 to-card"
              : "border-emerald-500/30 bg-gradient-to-br from-emerald-500/5 to-card";
            const iconBg = isPending
              ? "bg-gradient-to-br from-amber-500 to-orange-500 shadow-amber-500/30"
              : "bg-gradient-to-br from-emerald-500 to-teal-500 shadow-emerald-500/30";
            const Icon = isPending ? Clock : CheckCircle2;
            const title = closedCase
              ? isPending
                ? lang === "es" ? "Caso registrado" : "Case registered"
                : lang === "es" ? "¡Listo!" : "All done!"
              : completeKind === "update" ? t.updatedTitle : t.sentTitle;
            const subtitle = closedCase
              ? isPending
                ? lang === "es"
                  ? "Nuestro equipo continuará el seguimiento contigo."
                  : "Our team will continue the follow-up with you."
                : lang === "es"
                  ? "Gracias por tu visita. Nos vemos pronto."
                  : "Thanks for your visit. See you soon."
              : completeKind === "update" ? t.updatedSub : t.sentSub;
            return (
              <Card className={cn("p-10 sm:p-14 text-center shadow-xl rounded-3xl border-2", accent)}>
                <div className={cn("mx-auto mb-6 h-20 w-20 rounded-3xl flex items-center justify-center shadow-lg", iconBg)}>
                  <Icon className="h-10 w-10 text-white" />
                </div>
                {closedCase?.case_code && (
                  <div className="mb-5 flex justify-center">
                    <TicketBadge caseCode={closedCase.case_code} />
                  </div>
                )}
                <h2 className="text-3xl font-bold mb-2 tracking-tight">{title}</h2>
                <p className="text-lg text-muted-foreground mb-8 max-w-md mx-auto">{subtitle}</p>
                {closedCase && (
                  <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/60 px-4 py-2 text-sm">
                    <span className="text-muted-foreground">{lang === "es" ? "Estado:" : "Status:"}</span>
                    <span className={cn("font-semibold", isPending ? "text-amber-600" : "text-emerald-600")}>
                      {isPending
                        ? (lang === "es" ? "Pendiente de seguimiento" : "Pending follow-up")
                        : (lang === "es" ? "Resuelto" : "Resolved")}
                    </span>
                  </div>
                )}
                <div className="flex justify-center">
                  <Button size="lg" onClick={resetAll} className="h-12 px-8 rounded-xl">
                    {t.newSession}
                  </Button>
                </div>
              </Card>
            );
          })()}

        </div>
      </main>
    </div>
  );
}

// ============================================================
// Sub-components
// ============================================================

function SectionCard({
  title,
  subtitle,
  onBack,
  children,
  t,
}: {
  title: string;
  subtitle?: string;
  onBack: () => void;
  children: React.ReactNode;
  t: typeof T["es"];
}) {
  return (
    <Card className="p-6 sm:p-8 rounded-3xl border-2 shadow-md">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={onBack} className="rounded-xl flex-shrink-0">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight truncate">{title}</h2>
          {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {children}
    </Card>
  );
}

function EmptyState({
  icon: Icon,
  title,
  accent,
}: {
  icon: typeof CheckCircle2;
  title: string;
  accent?: "success";
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className={cn(
        "h-16 w-16 rounded-2xl flex items-center justify-center mb-4",
        accent === "success" ? "bg-emerald-500/10" : "bg-muted"
      )}>
        <Icon className={cn(
          "h-8 w-8",
          accent === "success" ? "text-emerald-600" : "text-muted-foreground"
        )} />
      </div>
      <p className="font-semibold text-base">{title}</p>
    </div>
  );
}

function ProfileRow({
  icon: Icon,
  label,
  value,
  missingText,
}: {
  icon: typeof Phone;
  label: string;
  value: string | null | undefined;
  missingText?: string;
}) {
  const isMissing = !value;
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl border border-border/60 bg-card">
      <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className={cn(
          "text-sm font-medium truncate",
          isMissing && "text-amber-600 italic"
        )}>
          {value || missingText || "—"}
        </dd>
      </div>
    </div>
  );
}
