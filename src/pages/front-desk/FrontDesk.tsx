/**
 * Stafly Front Desk — Tablet kiosk for office check-ins.
 *
 * Flow: welcome → phone → pin → summary → visit type → service action → rating → complete
 * Auto-resets after success or 90s of inactivity.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, ArrowLeft, ArrowRight, X, Phone, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { StaflyLogo } from "@/components/brand/StaflyBrand";
import { useFrontDesk, type FrontDeskEmployee, type FrontDeskSummary, type VisitType, type RatingValue, VISIT_TYPES, getVisitTypeMeta } from "@/hooks/useFrontDesk";
import { FrontDeskStepper } from "@/components/front-desk/FrontDeskStepper";
import { NumericKeypad } from "@/components/front-desk/NumericKeypad";

type Step = "welcome" | "phone" | "pin" | "summary" | "visit_type" | "in_service" | "rating" | "complete";
type Lang = "es" | "en";

const INACTIVITY_MS = 90_000;

const STEP_ORDER: Step[] = ["phone", "summary", "visit_type", "in_service", "rating"];

const T = {
  es: {
    welcome: "Bienvenido a Stafly Front Desk",
    welcomeSub: "Atención presencial para nuestro equipo",
    start: "Empezar",
    enterPhone: "Ingresa tu número de teléfono",
    enterPin: "Ingresa tu PIN de acceso",
    pinHint: "Tu PIN tiene 4 dígitos",
    continue: "Continuar",
    back: "Atrás",
    cancel: "Cancelar",
    summaryTitle: "Hola",
    pendingTitle: "Pendientes detectados",
    noPending: "Todo en orden — sin pendientes",
    portalActive: "Portal activo",
    portalPending: "Invitación pendiente",
    portalNone: "Sin acceso al portal",
    profileComplete: "Perfil completo",
    profileIncomplete: "Perfil",
    docsComplete: "Documentos OK",
    docsRejected: "Documentos rechazados",
    docsPending: "Docs en revisión",
    docsIncomplete: "Faltan documentos",
    visitTypeTitle: "¿Por qué visitas hoy?",
    visitTypeSub: "Selecciona el motivo principal",
    inServiceTitle: "Atención en curso",
    inServiceSub: "Cuando termines, califica el servicio",
    detailLabel: "Detalle (opcional)",
    detailPlaceholder: "Notas o detalles adicionales...",
    finishVisit: "Terminar visita",
    requireFollowup: "Requiere seguimiento",
    ratingTitle: "¿Cómo fue tu atención hoy?",
    ratingSub: "Tu opinión nos ayuda a mejorar",
    ratingComment: "¿Qué podemos mejorar? (opcional)",
    submitRating: "Enviar y terminar",
    skipRating: "Saltar y terminar",
    completeTitle: "¡Gracias por tu visita!",
    completeSub: "Hasta pronto",
    newVisit: "Nueva visita",
    excellent: "Excelente",
    good: "Buena",
    regular: "Regular",
    bad: "Mala",
    invalid: "Datos incorrectos",
  },
  en: {
    welcome: "Welcome to Stafly Front Desk",
    welcomeSub: "In-person support for our team",
    start: "Start",
    enterPhone: "Enter your phone number",
    enterPin: "Enter your access PIN",
    pinHint: "Your PIN has 4 digits",
    continue: "Continue",
    back: "Back",
    cancel: "Cancel",
    summaryTitle: "Hello",
    pendingTitle: "Pending items detected",
    noPending: "All set — no pending items",
    portalActive: "Portal active",
    portalPending: "Invitation pending",
    portalNone: "No portal access",
    profileComplete: "Profile complete",
    profileIncomplete: "Profile",
    docsComplete: "Documents OK",
    docsRejected: "Documents rejected",
    docsPending: "Docs in review",
    docsIncomplete: "Missing documents",
    visitTypeTitle: "Why are you here today?",
    visitTypeSub: "Pick the main reason",
    inServiceTitle: "Visit in progress",
    inServiceSub: "When done, please rate the service",
    detailLabel: "Detail (optional)",
    detailPlaceholder: "Notes or extra context...",
    finishVisit: "Finish visit",
    requireFollowup: "Needs follow-up",
    ratingTitle: "How was your visit today?",
    ratingSub: "Your feedback helps us improve",
    ratingComment: "What could we improve? (optional)",
    submitRating: "Submit & finish",
    skipRating: "Skip & finish",
    completeTitle: "Thanks for your visit!",
    completeSub: "See you soon",
    newVisit: "New visit",
    excellent: "Excellent",
    good: "Good",
    regular: "Regular",
    bad: "Bad",
    invalid: "Invalid credentials",
  },
};

export default function FrontDesk() {
  const navigate = useNavigate();
  const { lookupEmployee, createVisit, submitRating, loading } = useFrontDesk();

  const [step, setStep] = useState<Step>("welcome");
  const [lang, setLang] = useState<Lang>("es");
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [employee, setEmployee] = useState<FrontDeskEmployee | null>(null);
  const [summary, setSummary] = useState<FrontDeskSummary | null>(null);
  const [visitType, setVisitType] = useState<VisitType | null>(null);
  const [visitDetail, setVisitDetail] = useState("");
  const [visitId, setVisitId] = useState<string | null>(null);
  const [rating, setRating] = useState<RatingValue | null>(null);
  const [ratingComment, setRatingComment] = useState("");
  const [needsFollowup, setNeedsFollowup] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const inactivityRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const t = T[lang];

  // Live clock
  useEffect(() => {
    const id = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const resetAll = useCallback(() => {
    setStep("welcome");
    setPhone("");
    setPin("");
    setEmployee(null);
    setSummary(null);
    setVisitType(null);
    setVisitDetail("");
    setVisitId(null);
    setRating(null);
    setRatingComment("");
    setNeedsFollowup(false);
  }, []);

  // Inactivity reset
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
  }, [step, phone, pin, visitType, rating, resetAll, lang]);

  const stepIndex = STEP_ORDER.indexOf(step as any);
  const showStepper = stepIndex >= 0;

  // === ACTIONS ===
  const handleLookup = async () => {
    try {
      const res = await lookupEmployee(phone, pin);
      setEmployee(res.employee);
      setSummary(res.summary);
      setStep("summary");
    } catch (err) {
      const msg = err instanceof Error ? err.message : t.invalid;
      toast.error(msg);
      setPin("");
    }
  };

  const handleSelectVisitType = async (type: VisitType) => {
    if (!employee) return;
    setVisitType(type);
    try {
      const id = await createVisit({
        employee_id: employee.id,
        visit_type: type,
        pending_items: summary?.pending_items,
        language: lang,
      });
      setVisitId(id);
      setStep("in_service");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    }
  };

  const handleFinishService = () => {
    setStep("rating");
  };

  const handleSubmitRating = async (skipRating = false) => {
    if (!visitId) return;
    try {
      await submitRating({
        visit_id: visitId,
        rating: skipRating ? undefined : rating ?? undefined,
        rating_comment: ratingComment || undefined,
        status: needsFollowup ? "pending_followup" : "resolved",
      });
      setStep("complete");
      // Auto-reset after 6s
      setTimeout(resetAll, 6000);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    }
  };

  // === RENDERS ===
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30 flex flex-col">
      {/* Header */}
      <header className="border-b bg-card/60 backdrop-blur sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <StaflyLogo size={28} />
            <div className="hidden sm:block border-l border-border/60 pl-3">
              <p className="text-sm font-semibold leading-tight">Front Desk</p>
              <p className="text-xs text-muted-foreground">
                {currentTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} ·{" "}
                {currentTime.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" })}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-full bg-muted p-1 text-xs font-medium">
              <button
                onClick={() => setLang("es")}
                className={cn(
                  "px-3 py-1 rounded-full transition-colors",
                  lang === "es" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"
                )}
              >
                ES
              </button>
              <button
                onClick={() => setLang("en")}
                className={cn(
                  "px-3 py-1 rounded-full transition-colors",
                  lang === "en" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"
                )}
              >
                EN
              </button>
            </div>
            {step !== "welcome" && step !== "complete" && (
              <Button variant="ghost" size="sm" onClick={resetAll}>
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
        {showStepper && (
          <FrontDeskStepper
            steps={STEP_ORDER.map((s) => ({ key: s, label: s }))}
            currentIndex={stepIndex}
          />
        )}
      </header>

      <main className="flex-1 flex items-start justify-center px-4 py-6 sm:py-10">
        <div className="w-full max-w-3xl">
          {step === "welcome" && (
            <Card className="p-10 sm:p-16 text-center shadow-lg border-2">
              <div className="mx-auto mb-6 h-20 w-20 rounded-3xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-lg">
                <Phone className="h-10 w-10 text-primary-foreground" />
              </div>
              <h1 className="text-3xl sm:text-4xl font-bold mb-3">{t.welcome}</h1>
              <p className="text-lg text-muted-foreground mb-10">{t.welcomeSub}</p>
              <Button size="lg" className="h-14 px-10 text-base rounded-2xl" onClick={() => setStep("phone")}>
                {t.start}
                <ArrowRight className="h-5 w-5 ml-2" />
              </Button>
            </Card>
          )}

          {step === "phone" && (
            <Card className="p-6 sm:p-10 shadow-lg">
              <div className="text-center mb-6">
                <h2 className="text-2xl font-bold mb-2">{t.enterPhone}</h2>
                <div className="mx-auto mt-4 inline-flex items-center gap-3 px-6 py-3 bg-muted/50 rounded-2xl border-2 border-dashed min-w-[200px]">
                  <Phone className="h-5 w-5 text-muted-foreground" />
                  <span className="text-2xl font-mono tracking-wider">
                    {phone || "—"}
                  </span>
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
                  onClick={() => setStep("pin")}
                  disabled={phone.length < 7}
                  className="h-12 px-8 rounded-xl"
                  size="lg"
                >
                  {t.continue} <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </Card>
          )}

          {step === "pin" && (
            <Card className="p-6 sm:p-10 shadow-lg">
              <div className="text-center mb-6">
                <h2 className="text-2xl font-bold mb-2">{t.enterPin}</h2>
                <p className="text-sm text-muted-foreground mb-4">{t.pinHint}</p>
                <div className="flex gap-2 justify-center mb-2">
                  {[0, 1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className={cn(
                        "h-12 w-12 rounded-xl border-2 flex items-center justify-center text-2xl font-bold",
                        pin.length > i ? "bg-primary border-primary text-primary-foreground" : "border-border bg-muted/30"
                      )}
                    >
                      {pin[i] ? "•" : ""}
                    </div>
                  ))}
                </div>
              </div>
              <div className="max-w-sm mx-auto">
                <NumericKeypad
                  onDigit={(d) => setPin((p) => (p.length < 6 ? p + d : p))}
                  onBackspace={() => setPin((p) => p.slice(0, -1))}
                  onClear={() => setPin("")}
                />
              </div>
              <div className="flex gap-3 mt-6 justify-center">
                <Button variant="ghost" onClick={() => setStep("phone")} className="h-12 px-6">
                  <ArrowLeft className="h-4 w-4 mr-1" /> {t.back}
                </Button>
                <Button
                  onClick={handleLookup}
                  disabled={pin.length < 4 || loading}
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

          {step === "summary" && employee && summary && (
            <SummaryStep
              t={t}
              employee={employee}
              summary={summary}
              onContinue={() => setStep("visit_type")}
            />
          )}

          {step === "visit_type" && (
            <Card className="p-6 sm:p-10 shadow-lg">
              <div className="text-center mb-8">
                <h2 className="text-2xl font-bold mb-1">{t.visitTypeTitle}</h2>
                <p className="text-sm text-muted-foreground">{t.visitTypeSub}</p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {VISIT_TYPES.map((vt) => (
                  <button
                    key={vt.key}
                    onClick={() => handleSelectVisitType(vt.key)}
                    disabled={loading}
                    className="group p-5 rounded-2xl border-2 border-border bg-card hover:border-primary hover:shadow-md active:scale-95 transition-all text-left disabled:opacity-50"
                  >
                    <div className="text-3xl mb-2">{vt.icon}</div>
                    <div className="font-semibold text-sm leading-tight">
                      {lang === "es" ? vt.labelEs : vt.labelEn}
                    </div>
                  </button>
                ))}
              </div>
            </Card>
          )}

          {step === "in_service" && employee && visitType && (
            <Card className="p-6 sm:p-10 shadow-lg">
              <div className="text-center mb-6">
                <div className="inline-block px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-3">
                  {getVisitTypeMeta(visitType).icon} {lang === "es" ? getVisitTypeMeta(visitType).labelEs : getVisitTypeMeta(visitType).labelEn}
                </div>
                <h2 className="text-2xl font-bold mb-1">{t.inServiceTitle}</h2>
                <p className="text-sm text-muted-foreground">{t.inServiceSub}</p>
              </div>

              <div className="space-y-4 max-w-lg mx-auto">
                <div>
                  <label className="text-sm font-medium mb-2 block">{t.detailLabel}</label>
                  <Textarea
                    value={visitDetail}
                    onChange={(e) => setVisitDetail(e.target.value)}
                    placeholder={t.detailPlaceholder}
                    rows={3}
                    className="resize-none"
                  />
                </div>

                <label className="flex items-center gap-3 p-4 rounded-xl border-2 border-dashed cursor-pointer hover:border-primary/50 transition-colors">
                  <input
                    type="checkbox"
                    checked={needsFollowup}
                    onChange={(e) => setNeedsFollowup(e.target.checked)}
                    className="h-5 w-5 rounded border-border text-primary"
                  />
                  <span className="font-medium">{t.requireFollowup}</span>
                </label>
              </div>

              <div className="flex justify-center mt-8">
                <Button
                  onClick={handleFinishService}
                  size="lg"
                  className="h-14 px-10 rounded-xl text-base"
                >
                  {t.finishVisit} <ArrowRight className="h-5 w-5 ml-2" />
                </Button>
              </div>
            </Card>
          )}

          {step === "rating" && (
            <Card className="p-6 sm:p-10 shadow-lg">
              <div className="text-center mb-8">
                <h2 className="text-2xl font-bold mb-1">{t.ratingTitle}</h2>
                <p className="text-sm text-muted-foreground">{t.ratingSub}</p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-2xl mx-auto mb-6">
                {(["excellent", "good", "regular", "bad"] as RatingValue[]).map((r) => {
                  const meta = {
                    excellent: { emoji: "🤩", label: t.excellent, ring: "ring-emerald-400 bg-emerald-50" },
                    good: { emoji: "🙂", label: t.good, ring: "ring-blue-400 bg-blue-50" },
                    regular: { emoji: "😐", label: t.regular, ring: "ring-amber-400 bg-amber-50" },
                    bad: { emoji: "😞", label: t.bad, ring: "ring-rose-400 bg-rose-50" },
                  }[r];
                  const selected = rating === r;
                  return (
                    <button
                      key={r}
                      onClick={() => setRating(r)}
                      className={cn(
                        "p-5 rounded-2xl border-2 border-border bg-card hover:border-primary/50 active:scale-95 transition-all",
                        selected && `border-transparent ring-4 ${meta.ring}`
                      )}
                    >
                      <div className="text-4xl mb-2">{meta.emoji}</div>
                      <div className="font-semibold text-sm">{meta.label}</div>
                    </button>
                  );
                })}
              </div>

              <div className="max-w-lg mx-auto">
                <label className="text-sm font-medium mb-2 block">{t.ratingComment}</label>
                <Textarea
                  value={ratingComment}
                  onChange={(e) => setRatingComment(e.target.value)}
                  rows={2}
                  className="resize-none"
                />
              </div>

              <div className="flex gap-3 justify-center mt-8">
                <Button variant="ghost" onClick={() => handleSubmitRating(true)} disabled={loading}>
                  {t.skipRating}
                </Button>
                <Button
                  onClick={() => handleSubmitRating(false)}
                  disabled={loading}
                  size="lg"
                  className="h-14 px-10 rounded-xl"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : t.submitRating}
                </Button>
              </div>
            </Card>
          )}

          {step === "complete" && (
            <Card className="p-10 sm:p-16 text-center shadow-lg">
              <div className="mx-auto mb-6 h-20 w-20 rounded-3xl bg-emerald-500 flex items-center justify-center shadow-lg">
                <span className="text-4xl">✓</span>
              </div>
              <h2 className="text-3xl font-bold mb-2">{t.completeTitle}</h2>
              <p className="text-lg text-muted-foreground mb-8">{t.completeSub}</p>
              <Button size="lg" variant="outline" onClick={resetAll} className="h-12 px-8 rounded-xl">
                {t.newVisit}
              </Button>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}

// === Summary sub-component ===
function SummaryStep({
  t,
  employee,
  summary,
  onContinue,
}: {
  t: typeof T.es;
  employee: FrontDeskEmployee;
  summary: FrontDeskSummary;
  onContinue: () => void;
}) {
  const initials = `${employee.first_name?.[0] ?? ""}${employee.last_name?.[0] ?? ""}`.toUpperCase();
  const portalLabel = summary.portal_status === "active" ? t.portalActive : summary.portal_status === "pending" ? t.portalPending : t.portalNone;
  const portalTone = summary.portal_status === "active" ? "bg-emerald-100 text-emerald-800 border-emerald-200" : summary.portal_status === "pending" ? "bg-amber-100 text-amber-800 border-amber-200" : "bg-rose-100 text-rose-800 border-rose-200";

  return (
    <div className="space-y-4">
      <Card className="p-6 sm:p-8 shadow-lg">
        <div className="flex items-center gap-5">
          <Avatar className="h-20 w-20 border-2 border-primary/20">
            {employee.avatar_url ? <AvatarImage src={employee.avatar_url} /> : null}
            <AvatarFallback className="text-2xl bg-primary/10 text-primary font-bold">{initials}</AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <p className="text-sm text-muted-foreground">{t.summaryTitle},</p>
            <h2 className="text-2xl font-bold mb-1">
              {employee.first_name} {employee.last_name}
            </h2>
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              <span>{employee.phone_number}</span>
              {employee.email && <span>· {employee.email}</span>}
              {employee.employee_role && <span>· {employee.employee_role}</span>}
            </div>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatusTile
          label={t.portalActive.split(" ")[0]}
          value={portalLabel}
          tone={portalTone}
        />
        <StatusTile
          label="Profile"
          value={`${summary.profile_completeness}%`}
          tone={summary.profile_completeness === 100 ? "bg-emerald-100 text-emerald-800 border-emerald-200" : "bg-amber-100 text-amber-800 border-amber-200"}
        />
        <StatusTile
          label="Docs"
          value={
            summary.documents_status === "rejected" ? t.docsRejected :
            summary.documents_status === "pending_review" ? t.docsPending :
            summary.documents_status === "complete" ? t.docsComplete : t.docsIncomplete
          }
          tone={
            summary.documents_status === "complete" ? "bg-emerald-100 text-emerald-800 border-emerald-200" :
            summary.documents_status === "rejected" ? "bg-rose-100 text-rose-800 border-rose-200" :
            "bg-amber-100 text-amber-800 border-amber-200"
          }
        />
        <StatusTile
          label="Pendientes"
          value={String(summary.pending_total)}
          tone={summary.pending_total === 0 ? "bg-emerald-100 text-emerald-800 border-emerald-200" : "bg-amber-100 text-amber-800 border-amber-200"}
        />
      </div>

      {summary.pending_items.length > 0 && (
        <Card className="p-5">
          <p className="text-sm font-semibold mb-3">{t.pendingTitle}</p>
          <div className="flex flex-wrap gap-2">
            {summary.pending_items.map((item) => (
              <Badge
                key={item.key}
                variant="outline"
                className={cn(
                  "px-3 py-1.5 text-xs font-medium rounded-full border",
                  item.severity === "high" && "bg-rose-50 text-rose-800 border-rose-200",
                  item.severity === "medium" && "bg-amber-50 text-amber-800 border-amber-200",
                  item.severity === "low" && "bg-blue-50 text-blue-800 border-blue-200"
                )}
              >
                {item.label}
              </Badge>
            ))}
          </div>
        </Card>
      )}

      {summary.pending_total === 0 && (
        <Card className="p-5 bg-emerald-50/50 border-emerald-200">
          <p className="text-sm text-emerald-800 font-medium">✓ {t.noPending}</p>
        </Card>
      )}

      <div className="flex justify-end pt-2">
        <Button onClick={onContinue} size="lg" className="h-14 px-8 rounded-xl">
          {t.continue} <ArrowRight className="h-5 w-5 ml-2" />
        </Button>
      </div>
    </div>
  );
}

function StatusTile({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className={cn("p-4 rounded-2xl border", tone)}>
      <div className="text-[10px] uppercase font-semibold tracking-wider opacity-70">{label}</div>
      <div className="text-sm font-bold mt-1 leading-tight">{value}</div>
    </div>
  );
}
