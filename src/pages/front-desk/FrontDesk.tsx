/**
 * Stafly Front Desk — Employee Help Assistant for tablet/office.
 *
 * Phone-only access. After identification, employees access a hub with
 * 6 self-service options: update data, pending items, request, comment,
 * payments, profile.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import {
  Loader2, ArrowLeft, ArrowRight, X, Phone, Sparkles,
  UserCog, AlertCircle, Send, MessageSquare, Wallet, IdCard,
  CheckCircle2, Mail, MapPin, ShieldAlert, Camera, FileText,
  Building2, Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { StaflyLogo } from "@/components/brand/StaflyBrand";
import {
  useFrontDesk,
  type FrontDeskEmployee,
  type FrontDeskSummary,
  type InquiryCategory,
  type PaymentRow,
} from "@/hooks/useFrontDesk";
import { NumericKeypad } from "@/components/front-desk/NumericKeypad";

type Step =
  | "welcome"
  | "phone"
  | "hub"
  | "update_data"
  | "pending"
  | "request"
  | "comment"
  | "payments"
  | "profile"
  | "complete";

type Lang = "es" | "en";

const INACTIVITY_MS = 120_000;

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
    hello: "Hola",
    helloSub: "¿En qué te ayudamos hoy?",
    notYou: "No soy yo",
    pendingBadge: "pendiente",
    pendingBadgePlural: "pendientes",
    actions: {
      update_data: { title: "Actualizar mis datos", desc: "Teléfono, dirección, contacto de emergencia" },
      pending: { title: "Consultar pendientes", desc: "Documentos o información por completar" },
      request: { title: "Hacer una solicitud", desc: "Pide algo al equipo administrativo" },
      comment: { title: "Dejar un comentario", desc: "Sugerencias, dudas o feedback" },
      payments: { title: "Revisar mis pagos", desc: "Historial reciente y estado" },
      profile: { title: "Ver mi perfil", desc: "Datos completos de tu cuenta" },
    },
    updateDataTitle: "Actualizar mis datos",
    updateDataSub: "Para actualizar tu información, envíanos una solicitud y te contactamos.",
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
    completeTitle: "¡Gracias por tu visita!",
    completeSub: "Hasta pronto",
    newSession: "Nueva sesión",
    actNow: "Resolver",
    helpRequest: "Pedir ayuda",
    notFoundCta: "Dejar una solicitud sin perfil",
    profile: {
      name: "Nombre",
      phone: "Teléfono",
      email: "Correo",
      address: "Dirección",
      role: "Rol",
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
    hello: "Hi",
    helloSub: "How can we help today?",
    notYou: "Not me",
    pendingBadge: "pending",
    pendingBadgePlural: "pending",
    actions: {
      update_data: { title: "Update my info", desc: "Phone, address, emergency contact" },
      pending: { title: "Check pending items", desc: "Missing documents or info" },
      request: { title: "Make a request", desc: "Ask the admin team for something" },
      comment: { title: "Leave a comment", desc: "Suggestions, questions or feedback" },
      payments: { title: "Review my payments", desc: "Recent history and status" },
      profile: { title: "View my profile", desc: "Your full account info" },
    },
    updateDataTitle: "Update my info",
    updateDataSub: "To update your data, send us a request and we'll get in touch.",
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
    completeTitle: "Thanks for your visit!",
    completeSub: "See you soon",
    newSession: "New session",
    actNow: "Resolve",
    helpRequest: "Get help",
    notFoundCta: "Send a request without profile",
    profile: {
      name: "Name",
      phone: "Phone",
      email: "Email",
      address: "Address",
      role: "Role",
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
  },
};

const ACTION_CARDS = [
  { key: "update_data" as Step, icon: UserCog, accent: "from-blue-500 to-cyan-500" },
  { key: "pending" as Step, icon: AlertCircle, accent: "from-amber-500 to-orange-500" },
  { key: "request" as Step, icon: Send, accent: "from-violet-500 to-fuchsia-500" },
  { key: "comment" as Step, icon: MessageSquare, accent: "from-emerald-500 to-teal-500" },
  { key: "payments" as Step, icon: Wallet, accent: "from-rose-500 to-pink-500" },
  { key: "profile" as Step, icon: IdCard, accent: "from-indigo-500 to-purple-500" },
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
  const { lookupByPhone, createInquiry, listPayments, loading } = useFrontDesk();

  const [step, setStep] = useState<Step>("welcome");
  const [lang, setLang] = useState<Lang>("es");
  const [phone, setPhone] = useState("");
  const [employee, setEmployee] = useState<FrontDeskEmployee | null>(null);
  const [summary, setSummary] = useState<FrontDeskSummary | null>(null);
  const [category, setCategory] = useState<InquiryCategory>("support");
  const [message, setMessage] = useState("");
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [paymentsLoaded, setPaymentsLoaded] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const inactivityRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const t = T[lang];

  useEffect(() => {
    const id = setInterval(() => setCurrentTime(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const resetAll = useCallback(() => {
    setStep("welcome");
    setPhone("");
    setEmployee(null);
    setSummary(null);
    setCategory("support");
    setMessage("");
    setPayments([]);
    setPaymentsLoaded(false);
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
  }, [step, phone, message, resetAll, lang]);

  const handleLookup = async () => {
    try {
      const res = await lookupByPhone(phone);
      setEmployee(res.employee);
      setSummary(res.summary);
      setStep("hub");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    }
  };

  const handleOpenPayments = async () => {
    setStep("payments");
    if (paymentsLoaded) return;
    try {
      const rows = await listPayments(phone);
      setPayments(rows);
      setPaymentsLoaded(true);
    } catch {
      setPaymentsLoaded(true);
    }
  };

  const handleSend = async (kind: "request" | "comment") => {
    if (!message.trim()) {
      toast.error(lang === "es" ? "Escribe un mensaje" : "Write a message");
      return;
    }
    try {
      await createInquiry({
        phone,
        category,
        message: message.trim(),
        inquiry_kind: kind,
        language: lang,
      });
      setMessage("");
      setStep("complete");
      setTimeout(resetAll, 5000);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    }
  };

  const goHub = () => setStep("hub");

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/40 flex flex-col">
      {/* Header */}
      <header className="border-b border-border/60 bg-card/80 backdrop-blur-md sticky top-0 z-10">
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

      <main className="flex-1 flex items-start justify-center px-4 py-6 sm:py-10">
        <div className="w-full max-w-3xl">

          {/* ============ WELCOME ============ */}
          {step === "welcome" && (
            <Card className="p-10 sm:p-16 text-center shadow-xl border-2 border-border/60 rounded-3xl bg-gradient-to-br from-card to-card/80">
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
            <Card className="p-6 sm:p-10 shadow-xl rounded-3xl border-2">
              <div className="text-center mb-6">
                <h2 className="text-2xl font-bold mb-2">{t.enterPhone}</h2>
                <p className="text-sm text-muted-foreground mb-4">{t.enterPhoneSub}</p>
                <div className="mx-auto inline-flex items-center gap-3 px-6 py-4 bg-muted/40 rounded-2xl border-2 border-dashed min-w-[260px]">
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
                    <p className="text-sm text-muted-foreground mt-0.5">{t.helloSub}</p>
                  </div>
                  {summary.pending_total > 0 && (
                    <Badge className="bg-amber-500/15 text-amber-700 hover:bg-amber-500/20 border-amber-500/30 dark:text-amber-300 px-3 py-1.5 rounded-full">
                      {summary.pending_total} {summary.pending_total === 1 ? t.pendingBadge : t.pendingBadgePlural}
                    </Badge>
                  )}
                </div>
              </Card>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {ACTION_CARDS.map(({ key, icon: Icon, accent }) => {
                  const meta = (t.actions as any)[key];
                  const isPending = key === "pending" && summary.pending_total > 0;
                  return (
                    <button
                      key={key}
                      onClick={() => {
                        if (key === "payments") return handleOpenPayments();
                        setStep(key);
                      }}
                      className="group text-left p-6 rounded-3xl border-2 border-border bg-card hover:border-primary/60 hover:shadow-lg active:scale-[0.98] transition-all"
                    >
                      <div className="flex items-start gap-4">
                        <div className={cn(
                          "h-12 w-12 rounded-2xl bg-gradient-to-br flex items-center justify-center shadow-md flex-shrink-0",
                          accent
                        )}>
                          <Icon className="h-6 w-6 text-white" />
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

          {/* ============ UPDATE DATA ============ */}
          {step === "update_data" && (
            <SectionCard title={t.updateDataTitle} onBack={goHub} t={t}>
              <p className="text-muted-foreground mb-6">{t.updateDataSub}</p>
              <Button
                size="lg"
                className="w-full h-12 rounded-xl"
                onClick={() => { setCategory("profile"); setStep("request"); }}
              >
                <Send className="h-4 w-4 mr-2" /> {t.actions.request.title}
              </Button>
            </SectionCard>
          )}

          {/* ============ PENDING ============ */}
          {step === "pending" && summary && (
            <SectionCard title={t.pendingTitle} onBack={goHub} t={t}>
              {summary.pending_total === 0 ? (
                <EmptyState icon={CheckCircle2} title={t.noPending} accent="success" />
              ) : (
                <ul className="space-y-3">
                  {summary.pending_items.map((item) => (
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
                        onClick={() => { setCategory("support"); setMessage(item.label); setStep("request"); }}
                      >
                        {t.actNow}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
          )}

          {/* ============ REQUEST / COMMENT ============ */}
          {(step === "request" || step === "comment") && (
            <SectionCard
              title={step === "request" ? t.requestTitle : t.commentTitle}
              subtitle={step === "request" ? t.requestSub : t.commentSub}
              onBack={goHub}
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
                  disabled={loading || !message.trim()}
                >
                  {loading ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> {t.sending}</>
                  ) : (
                    <><Send className="h-4 w-4 mr-2" /> {t.send}</>
                  )}
                </Button>
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
                <ProfileRow
                  icon={Building2}
                  label={t.profile.portal}
                  value={
                    summary.portal_status === "active" ? t.profile.portal_active :
                    summary.portal_status === "pending" ? t.profile.portal_pending :
                    t.profile.portal_none
                  }
                />
              </dl>
            </SectionCard>
          )}

          {/* ============ COMPLETE ============ */}
          {step === "complete" && (
            <Card className="p-10 sm:p-16 text-center shadow-xl rounded-3xl border-2 border-emerald-500/30 bg-gradient-to-br from-emerald-500/5 to-card">
              <div className="mx-auto mb-6 h-20 w-20 rounded-3xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-500/30">
                <CheckCircle2 className="h-10 w-10 text-white" />
              </div>
              <h2 className="text-3xl font-bold mb-2">{t.sentTitle}</h2>
              <p className="text-lg text-muted-foreground mb-8">{t.sentSub}</p>
              <Button size="lg" onClick={resetAll} className="h-12 px-8 rounded-xl">
                {t.newSession}
              </Button>
            </Card>
          )}
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
