import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  CalendarDays, DollarSign, Users, Clock, Shield,
  ArrowRight, CheckCircle2, Globe, Menu, X, Upload,
  Building2, Smartphone, UserCog, Zap, BarChart3,
  MapPin, Star, ChevronRight, Activity, Bell, FileText,
  TrendingUp, CircleDot, UserPlus,
} from "lucide-react";
import { StaflyLogo, StaflyMark } from "@/components/brand/StaflyBrand";

/* ───────── i18n ───────── */
const i18n = {
  es: {
    nav: { features: "Funciones", pricing: "Precios", employers: "Empresas", workers: "Trabajadores" },
    login: "Iniciar sesión",
    ctaPrimary: "Comienza gratis",
    ctaPortal: "Acceso empleados",
    hero: {
      badge: "Plataforma operativa de workforce",
      h1: "Gestión de personal\nconstruida para operaciones reales",
      sub: "Turnos, asistencia, payroll y activación de trabajadores en una sola plataforma. Control total para empresas que operan con equipos grandes.",
      pills: ["Sin tarjeta de crédito", "Activo en 5 min", "Plan free disponible"],
    },
    trust: [
      "Operaciones en tiempo real",
      "Scheduling + attendance + payroll",
      "Multi-empresa listo",
      "Portal de trabajadores incluido",
    ],
    capabilities: {
      eyebrow: "Capacidades principales",
      title: "Todo lo que necesitas para operar tu equipo",
      sub: "Herramientas potentes diseñadas para staffing companies, restaurantes, eventos y operaciones de alto volumen.",
      cards: [
        { icon: "calendar", title: "Programación de Turnos", desc: "Crea y asigna turnos con vista semanal y mensual. Notificaciones automáticas a tu equipo." },
        { icon: "clock", title: "Control de Asistencia", desc: "Clock-in/out con geolocalización, PIN, QR o kiosco. Tiempo real, sin hojas de papel." },
        { icon: "dollar", title: "Payroll Operativo", desc: "Calcula horas, overtime, conceptos y genera reportes de nómina al instante." },
        { icon: "users", title: "Gestión de Personal", desc: "Perfiles completos, roles, tags, búsqueda avanzada y portal individual para cada trabajador." },
        { icon: "shield", title: "Roles y Permisos", desc: "Control granular de acceso: owner, admin, supervisor, worker. Multi-empresa nativo." },
        { icon: "upload", title: "Importación Masiva", desc: "Importa cientos de empleados desde Excel en minutos con mapeo automático de columnas." },
      ],
    },
    employers: {
      eyebrow: "Para empresas",
      title: "Controla tu operación de personal completa",
      sub: "Desde el primer turno hasta el cierre de nómina. Una plataforma para todo.",
      points: [
        "Organiza turnos y asignaciones por cliente, ubicación o equipo",
        "Controla asistencia con clock-in geolocalizado en tiempo real",
        "Centraliza payroll con cálculo automático de horas y conceptos",
        "Administra múltiples empresas desde una sola cuenta",
        "Activa onboarding digital para nuevos trabajadores",
        "Genera reportes operativos y de nómina al instante",
      ],
      cta: "Crear cuenta de empresa",
    },
    workers: {
      eyebrow: "Para trabajadores",
      title: "Tu portal personal de trabajo",
      sub: "Accede a tus turnos, marca asistencia y mantén tu información al día.",
      points: [
        "Activa tu cuenta con el código de tu empresa",
        "Ve tus turnos asignados y próximos",
        "Marca entrada y salida desde tu celular",
        "Consulta tu historial de horas y pagos",
        "Aplica a nuevas posiciones directamente",
        "Mantén tu perfil y documentos actualizados",
      ],
      cta: "Acceso empleados",
      ctaApply: "Aplicar a trabajo",
    },
    quickAccess: {
      title: "Acceso rápido",
      cards: [
        { label: "Iniciar sesión", desc: "Accede a tu cuenta admin o empresa", href: "/auth", icon: "login" },
        { label: "My Staff Solution", desc: "Aplica a posiciones disponibles", href: "/apply/my-staff-solution", icon: "apply" },
        { label: "Quality Staff by Keury", desc: "Aplica a posiciones disponibles", href: "/apply/quality-staff-by-keury", icon: "apply" },
      ],
    },
    pricing: {
      title: "Planes para cada etapa",
      sub: "Empieza gratis. Escala cuando lo necesites. Sin contratos.",
      plans: [
        {
          name: "Free",
          desc: "Para equipos que están empezando.",
          price: "$0",
          period: "para siempre",
          features: ["Hasta 10 empleados", "Turnos ilimitados", "Control de asistencia", "Reportes básicos", "Portal de empleados"],
          cta: "Comienza gratis",
          highlighted: false,
        },
        {
          name: "Professional",
          desc: "Para empresas en crecimiento.",
          price: "$49",
          period: "/mes",
          features: ["Hasta 200 empleados", "Todo de Free", "Importación masiva", "Payroll avanzado", "Geolocalización", "Multi-empresa", "Soporte prioritario"],
          cta: "Solicitar plan",
          highlighted: true,
        },
        {
          name: "Enterprise",
          desc: "Operaciones grandes con necesidades específicas.",
          price: "Custom",
          period: "",
          features: ["Empleados ilimitados", "Todo de Professional", "API & Webhooks", "SSO / SAML", "SLA garantizado", "Account manager dedicado"],
          cta: "Contactar equipo",
          highlighted: false,
        },
      ],
      popular: "Recomendado",
    },
    finalCta: {
      title: "¿Listo para operar mejor?",
      sub: "Únete a empresas que ya gestionan su personal con StaflyApps. Gratis para empezar, potente para escalar.",
      cta: "Comienza gratis ahora",
    },
    footer: { product: "Producto", pricing: "Precios", portal: "Portal empleados", help: "Ayuda", privacy: "Privacidad", terms: "Términos" },
  },
  en: {
    nav: { features: "Features", pricing: "Pricing", employers: "Employers", workers: "Workers" },
    login: "Sign in",
    ctaPrimary: "Start free",
    ctaPortal: "Employee access",
    hero: {
      badge: "Operational workforce platform",
      h1: "Workforce management\nbuilt for real operations",
      sub: "Shifts, attendance, payroll and worker activation in one platform. Full control for companies running large teams.",
      pills: ["No credit card", "Active in 5 min", "Free plan available"],
    },
    trust: [
      "Real-time operations",
      "Scheduling + attendance + payroll",
      "Multi-company ready",
      "Worker portal included",
    ],
    capabilities: {
      eyebrow: "Core capabilities",
      title: "Everything you need to run your team",
      sub: "Powerful tools designed for staffing companies, restaurants, events and high-volume operations.",
      cards: [
        { icon: "calendar", title: "Shift Scheduling", desc: "Create and assign shifts with weekly and monthly views. Automatic notifications to your team." },
        { icon: "clock", title: "Attendance Tracking", desc: "Clock in/out with geolocation, PIN, QR or kiosk. Real-time, no paper sheets." },
        { icon: "dollar", title: "Operational Payroll", desc: "Calculate hours, overtime, concepts and generate payroll reports instantly." },
        { icon: "users", title: "Staff Management", desc: "Complete profiles, roles, tags, advanced search and individual portal for each worker." },
        { icon: "shield", title: "Roles & Permissions", desc: "Granular access control: owner, admin, supervisor, worker. Native multi-company." },
        { icon: "upload", title: "Bulk Import", desc: "Import hundreds of employees from Excel in minutes with automatic column mapping." },
      ],
    },
    employers: {
      eyebrow: "For employers",
      title: "Control your entire staffing operation",
      sub: "From the first shift to payroll close. One platform for everything.",
      points: [
        "Organize shifts and assignments by client, location or team",
        "Track attendance with real-time geolocated clock-in",
        "Centralize payroll with automatic hour and concept calculation",
        "Manage multiple companies from a single account",
        "Activate digital onboarding for new workers",
        "Generate operational and payroll reports instantly",
      ],
      cta: "Create company account",
    },
    workers: {
      eyebrow: "For workers",
      title: "Your personal work portal",
      sub: "Access your shifts, clock in and keep your information up to date.",
      points: [
        "Activate your account with your company code",
        "See your assigned and upcoming shifts",
        "Clock in and out from your phone",
        "Check your hours and payment history",
        "Apply to new positions directly",
        "Keep your profile and documents updated",
      ],
      cta: "Employee access",
      ctaApply: "Apply to job",
    },
    quickAccess: {
      title: "Quick access",
      cards: [
        { label: "Sign in", desc: "Access your admin or company account", href: "/auth", icon: "login" },
        { label: "My Staff Solution", desc: "Apply to available positions", href: "/apply/my-staff-solution", icon: "apply" },
        { label: "Quality Staff by Keury", desc: "Apply to available positions", href: "/apply/quality-staff-by-keury", icon: "apply" },
      ],
    },
    pricing: {
      title: "Plans for every stage",
      sub: "Start free. Scale when you need to. No contracts.",
      plans: [
        {
          name: "Free",
          desc: "For teams just getting started.",
          price: "$0",
          period: "forever",
          features: ["Up to 10 employees", "Unlimited shifts", "Attendance tracking", "Basic reports", "Employee portal"],
          cta: "Start free",
          highlighted: false,
        },
        {
          name: "Professional",
          desc: "For growing companies.",
          price: "$49",
          period: "/mo",
          features: ["Up to 200 employees", "Everything in Free", "Bulk import", "Advanced payroll", "Geolocation", "Multi-company", "Priority support"],
          cta: "Request plan",
          highlighted: true,
        },
        {
          name: "Enterprise",
          desc: "Large operations with specific needs.",
          price: "Custom",
          period: "",
          features: ["Unlimited employees", "Everything in Professional", "API & Webhooks", "SSO / SAML", "Guaranteed SLA", "Dedicated account manager"],
          cta: "Contact team",
          highlighted: false,
        },
      ],
      popular: "Recommended",
    },
    finalCta: {
      title: "Ready to operate better?",
      sub: "Join companies already managing their staff with StaflyApps. Free to start, powerful to scale.",
      cta: "Start free now",
    },
    footer: { product: "Product", pricing: "Pricing", portal: "Employee portal", help: "Help", privacy: "Privacy", terms: "Terms" },
  },
};

const featureIcons: Record<string, React.ReactNode> = {
  calendar: <CalendarDays className="h-6 w-6" />,
  clock: <Clock className="h-6 w-6" />,
  dollar: <DollarSign className="h-6 w-6" />,
  users: <Users className="h-6 w-6" />,
  shield: <Shield className="h-6 w-6" />,
  upload: <Upload className="h-6 w-6" />,
};

/* ───────── LANDING ───────── */
export default function Landing() {
  const [lang, setLang] = useState<"es" | "en">(() => {
    const nav = navigator.language?.slice(0, 2);
    return nav === "en" ? "en" : "es";
  });
  const c = i18n[lang];
  const [mobileMenu, setMobileMenu] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-background text-foreground font-body">

      {/* ══════════ HEADER ══════════ */}
      <header className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${scrolled ? "bg-card/90 backdrop-blur-xl shadow-sm border-b border-border/40" : "bg-transparent"}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16">
          <StaflyLogo size={28} />

          <nav className="hidden lg:flex items-center gap-8 text-[13px] font-medium text-muted-foreground">
            <a href="#capabilities" className="hover:text-foreground transition-colors">{c.nav.features}</a>
            <a href="#employers" className="hover:text-foreground transition-colors">{c.nav.employers}</a>
            <a href="#workers" className="hover:text-foreground transition-colors">{c.nav.workers}</a>
            <a href="#pricing" className="hover:text-foreground transition-colors">{c.nav.pricing}</a>
          </nav>

          <div className="flex items-center gap-2">
            <button onClick={() => setLang(lang === "es" ? "en" : "es")} className="hidden sm:flex items-center gap-1 text-[13px] px-2.5 py-1.5 rounded-lg hover:bg-accent transition-colors text-muted-foreground">
              <Globe className="h-3.5 w-3.5" />
              <span className="font-medium">{lang === "es" ? "EN" : "ES"}</span>
            </button>
            <Link to="/auth" className="hidden sm:inline-flex text-[13px] font-medium px-4 py-2 rounded-lg border border-border hover:bg-accent transition-colors text-foreground">
              {c.login}
            </Link>
            <Link
              to="/auth?register=true"
              className="rounded-full px-5 h-9 text-[13px] font-semibold text-primary-foreground bg-primary hover:bg-primary/90 shadow-[0_2px_16px_-4px_hsl(210_100%_50%/0.4)] transition-all active:scale-[0.97] inline-flex items-center"
            >
              {c.ctaPrimary}
            </Link>
            <button className="lg:hidden p-2 rounded-lg hover:bg-accent transition-colors" onClick={() => setMobileMenu(!mobileMenu)}>
              {mobileMenu ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {mobileMenu && (
          <div className="lg:hidden bg-card/95 backdrop-blur-xl border-t border-border/40 animate-fade-in">
            <div className="max-w-7xl mx-auto px-4 py-3 space-y-1">
              <a href="#capabilities" onClick={() => setMobileMenu(false)} className="block text-sm font-medium py-2.5 px-3 rounded-lg hover:bg-accent transition-colors">{c.nav.features}</a>
              <a href="#employers" onClick={() => setMobileMenu(false)} className="block text-sm font-medium py-2.5 px-3 rounded-lg hover:bg-accent transition-colors">{c.nav.employers}</a>
              <a href="#workers" onClick={() => setMobileMenu(false)} className="block text-sm font-medium py-2.5 px-3 rounded-lg hover:bg-accent transition-colors">{c.nav.workers}</a>
              <a href="#pricing" onClick={() => setMobileMenu(false)} className="block text-sm font-medium py-2.5 px-3 rounded-lg hover:bg-accent transition-colors">{c.nav.pricing}</a>
              <Link to="/auth" onClick={() => setMobileMenu(false)} className="block text-sm font-medium py-2.5 px-3 rounded-lg hover:bg-accent text-primary">{c.login}</Link>
              <button onClick={() => { setLang(lang === "es" ? "en" : "es"); setMobileMenu(false); }} className="flex items-center gap-2 text-sm py-2.5 px-3 w-full rounded-lg hover:bg-accent text-muted-foreground">
                <Globe className="h-4 w-4" /> {lang === "es" ? "English" : "Español"}
              </button>
            </div>
          </div>
        )}
      </header>

      {/* ══════════ HERO — CINEMATIC ══════════ */}
      <section className="relative pt-24 pb-12 sm:pt-32 sm:pb-20 lg:pt-36 lg:pb-28 overflow-hidden">
        {/* Layered background */}
        <div className="absolute inset-0 pointer-events-none">
          <div style={{ background: "radial-gradient(ellipse 90% 70% at 50% -20%, hsl(210 100% 92% / 0.8), transparent 65%)" }} className="absolute inset-0" />
          <div style={{ background: "radial-gradient(ellipse 60% 50% at 80% 20%, hsl(210 100% 88% / 0.35), transparent 50%)" }} className="absolute inset-0" />
          <div style={{ background: "radial-gradient(ellipse 40% 40% at 20% 80%, hsl(200 100% 92% / 0.25), transparent 50%)" }} className="absolute inset-0" />
          <div style={{ background: "linear-gradient(to bottom, transparent 70%, hsl(var(--background)))" }} className="absolute inset-0" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">

            {/* LEFT — Copy */}
            <div className="text-center lg:text-left max-w-xl mx-auto lg:mx-0">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold tracking-widest uppercase mb-5 px-3.5 py-1.5 rounded-full bg-primary/[0.08] text-primary border border-primary/10">
                <Activity className="h-3 w-3" />
                {c.hero.badge}
              </span>

              <h1 className="text-[30px] sm:text-4xl md:text-5xl lg:text-[52px] font-extrabold tracking-tight leading-[1.06] text-foreground font-heading whitespace-pre-line">
                {c.hero.h1}
              </h1>

              <p className="mt-5 text-base sm:text-[17px] leading-relaxed text-muted-foreground max-w-lg mx-auto lg:mx-0">
                {c.hero.sub}
              </p>

              <div className="mt-8 flex flex-col sm:flex-row items-center lg:items-start justify-center lg:justify-start gap-3">
                <Link
                  to="/auth?register=true"
                  className="inline-flex items-center gap-2 rounded-full px-8 h-12 text-[15px] font-semibold text-primary-foreground bg-primary hover:bg-primary/90 shadow-[0_4px_28px_-4px_hsl(210_100%_50%/0.5)] transition-all active:scale-[0.97] hover:shadow-[0_6px_36px_-4px_hsl(210_100%_50%/0.55)]"
                >
                  {c.ctaPrimary} <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  to="/portal"
                  className="inline-flex items-center gap-1.5 rounded-full h-12 px-8 text-[15px] font-semibold border border-border/60 hover:bg-accent/60 backdrop-blur-sm transition-all active:scale-[0.97] text-foreground"
                >
                  {c.ctaPortal}
                </Link>
              </div>

              <div className="mt-5 flex items-center justify-center lg:justify-start gap-5 flex-wrap text-sm text-muted-foreground">
                {c.hero.pills.map((pill, i) => (
                  <span key={i} className="inline-flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                    {pill}
                  </span>
                ))}
              </div>
            </div>

            {/* RIGHT — Cinematic Product Scene */}
            <div className="relative hidden sm:block" style={{ perspective: "1200px" }}>
              {/* Ambient glow behind the scene */}
              <div className="absolute -inset-8 rounded-3xl pointer-events-none" style={{ background: "radial-gradient(ellipse at 50% 40%, hsl(210 100% 60% / 0.08), transparent 70%)" }} />

              {/* Main dashboard panel */}
              <div
                className="relative rounded-2xl border border-border/50 bg-card/95 backdrop-blur-md shadow-[0_24px_80px_-12px_hsl(220_25%_12%/0.2)] overflow-hidden"
                style={{ transform: "rotateY(-2deg) rotateX(1deg)" }}
              >
                {/* Top bar */}
                <div className="flex items-center gap-2 px-5 py-3 border-b border-border/40 bg-muted/30">
                  <div className="flex gap-1.5">
                    <div className="h-2.5 w-2.5 rounded-full bg-destructive/60" />
                    <div className="h-2.5 w-2.5 rounded-full bg-status-pending/60" />
                    <div className="h-2.5 w-2.5 rounded-full bg-status-confirmed/60" />
                  </div>
                  <div className="flex-1 flex justify-center">
                    <div className="bg-muted/60 rounded-md px-12 py-1 text-[10px] text-muted-foreground font-mono">app.staflyapps.com</div>
                  </div>
                  <div className="flex items-center gap-1.5 text-muted-foreground/40">
                    <Bell className="h-3.5 w-3.5" />
                  </div>
                </div>

                {/* Dashboard content */}
                <div className="p-5 space-y-4">
                  {/* KPI row */}
                  <div className="grid grid-cols-4 gap-3">
                    {[
                      { label: lang === "es" ? "Empleados" : "Employees", value: "847", icon: <Users className="h-3.5 w-3.5" />, trend: "+12" },
                      { label: lang === "es" ? "Turnos hoy" : "Shifts today", value: "124", icon: <CalendarDays className="h-3.5 w-3.5" />, trend: "" },
                      { label: lang === "es" ? "Clock-in" : "Clocked in", value: "94.2%", icon: <Clock className="h-3.5 w-3.5" />, trend: "" },
                      { label: "Payroll", value: "$48.3K", icon: <DollarSign className="h-3.5 w-3.5" />, trend: "" },
                    ].map((kpi, i) => (
                      <div key={i} className="bg-muted/30 rounded-xl p-3 border border-border/30">
                        <div className="flex items-center gap-1.5 text-muted-foreground mb-1.5">
                          {kpi.icon}
                          <span className="text-[10px] font-medium truncate">{kpi.label}</span>
                        </div>
                        <div className="flex items-baseline gap-1">
                          <span className="text-lg font-bold text-foreground font-heading tabular-nums">{kpi.value}</span>
                          {kpi.trend && <span className="text-[9px] font-semibold text-status-confirmed">↑{kpi.trend}</span>}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Employee list */}
                  <div className="bg-muted/20 rounded-xl border border-border/30 overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/20">
                      <span className="text-[11px] font-semibold text-foreground">{lang === "es" ? "Equipo activo" : "Active team"}</span>
                      <span className="inline-flex items-center gap-1 text-[9px] font-bold text-status-confirmed bg-status-confirmed/10 px-2 py-0.5 rounded-full">
                        <CircleDot className="h-2 w-2" /> Live
                      </span>
                    </div>
                    <div className="divide-y divide-border/20">
                      {[
                        { name: "Maria G.", role: lang === "es" ? "Supervisora" : "Supervisor", status: "active", shift: "8:00–4:00 PM" },
                        { name: "Carlos R.", role: lang === "es" ? "Operador" : "Operator", status: "active", shift: "6:00–2:00 PM" },
                        { name: "Ana L.", role: lang === "es" ? "Asistente" : "Assistant", status: "pending", shift: "10:00–6:00 PM" },
                        { name: "David M.", role: "Driver", status: "active", shift: "7:00–3:00 PM" },
                      ].map((emp, i) => (
                        <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                          <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary shrink-0">
                            {emp.name.split(" ").map(n => n[0]).join("")}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-semibold text-foreground truncate">{emp.name}</p>
                            <p className="text-[9px] text-muted-foreground">{emp.role}</p>
                          </div>
                          <span className="text-[9px] text-muted-foreground hidden sm:block">{emp.shift}</span>
                          <div className={`h-1.5 w-1.5 rounded-full shrink-0 ${emp.status === "active" ? "bg-status-confirmed" : "bg-status-pending"}`} />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Floating notification cards */}
              <div
                className="absolute -top-4 -right-6 sm:-right-10 bg-card rounded-xl border border-border/50 shadow-[0_8px_30px_-8px_hsl(220_25%_12%/0.18)] p-3.5 w-52 backdrop-blur-md z-10"
                style={{ animation: "hero-float 6s ease-in-out infinite", transform: "translateZ(40px)" }}
              >
                <div className="flex items-center gap-2.5">
                  <div className="h-8 w-8 rounded-lg bg-status-confirmed/10 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="h-4 w-4 text-status-confirmed" />
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-foreground">{lang === "es" ? "Turno asignado" : "Shift assigned"}</p>
                    <p className="text-[9px] text-muted-foreground">{lang === "es" ? "12 trabajadores" : "12 workers"}</p>
                  </div>
                </div>
              </div>

              <div
                className="absolute -bottom-3 -left-4 sm:-left-8 bg-card rounded-xl border border-border/50 shadow-[0_8px_30px_-8px_hsl(220_25%_12%/0.18)] p-3.5 w-48 backdrop-blur-md z-10"
                style={{ animation: "hero-float 6s ease-in-out 2s infinite", transform: "translateZ(30px)" }}
              >
                <div className="flex items-center gap-2.5">
                  <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <DollarSign className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-foreground">Payroll</p>
                    <p className="text-[9px] text-muted-foreground">{lang === "es" ? "Pendiente — $4,200" : "Pending — $4,200"}</p>
                  </div>
                </div>
              </div>

              <div
                className="absolute top-1/2 -right-3 sm:-right-6 bg-card rounded-xl border border-border/50 shadow-[0_8px_30px_-8px_hsl(220_25%_12%/0.18)] p-3 w-44 backdrop-blur-md z-10"
                style={{ animation: "hero-float 6s ease-in-out 4s infinite", transform: "translateZ(20px)" }}
              >
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-lg bg-accent-warm/10 flex items-center justify-center shrink-0">
                    <UserPlus className="h-3.5 w-3.5 text-accent-warm" />
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-foreground">{lang === "es" ? "Nueva solicitud" : "New application"}</p>
                    <p className="text-[9px] text-muted-foreground">{lang === "es" ? "Hace 2 min" : "2 min ago"}</p>
                  </div>
                </div>
              </div>

              <div
                className="absolute bottom-1/3 -left-2 sm:-left-5 bg-card rounded-lg border border-border/50 shadow-[0_4px_20px_-6px_hsl(220_25%_12%/0.15)] px-3 py-2 backdrop-blur-md z-10"
                style={{ animation: "hero-float 6s ease-in-out 3s infinite" }}
              >
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-status-confirmed animate-pulse" />
                  <span className="text-[9px] font-semibold text-foreground">{lang === "es" ? "3 ficharon ahora" : "3 clocked in now"}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════ TRUST BAND ══════════ */}
      <section className="py-8 sm:py-12 border-y border-border/40 bg-accent/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4">
            {c.trust.map((item, i) => (
              <div key={i} className="flex items-center gap-2.5 text-sm font-medium text-muted-foreground">
                <div className="h-2 w-2 rounded-full bg-primary/60" />
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════ CAPABILITIES ══════════ */}
      <section className="py-16 sm:py-24" id="capabilities">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary mb-3">{c.capabilities.eyebrow}</p>
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-foreground font-heading">
              {c.capabilities.title}
            </h2>
            <p className="mt-4 text-[15px] text-muted-foreground leading-relaxed">
              {c.capabilities.sub}
            </p>
            <div className="mt-5 flex items-center gap-2 justify-center">
              <div className="h-[3px] w-10 rounded-full bg-primary" />
              <div className="h-[3px] w-3 rounded-full bg-primary/30" />
            </div>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {c.capabilities.cards.map((card, i) => (
              <div key={i} className="group bg-card rounded-2xl border border-border p-7 shadow-xs hover:shadow-md hover:-translate-y-0.5 transition-all duration-300">
                <div className="h-12 w-12 rounded-xl flex items-center justify-center mb-5 bg-primary/[0.08] text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors duration-300">
                  {featureIcons[card.icon]}
                </div>
                <h3 className="font-semibold text-base mb-2 text-foreground font-heading">{card.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{card.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════ FOR EMPLOYERS ══════════ */}
      <section className="py-16 sm:py-24 bg-accent/20" id="employers">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary mb-3">{c.employers.eyebrow}</p>
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-foreground font-heading leading-tight">
                {c.employers.title}
              </h2>
              <p className="mt-4 text-[15px] text-muted-foreground leading-relaxed max-w-lg">
                {c.employers.sub}
              </p>
              <ul className="mt-8 space-y-3.5">
                {c.employers.points.map((point, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm text-foreground">
                    <CheckCircle2 className="h-4.5 w-4.5 text-primary shrink-0 mt-0.5" />
                    {point}
                  </li>
                ))}
              </ul>
              <div className="mt-8">
                <Link
                  to="/auth?register=true"
                  className="inline-flex items-center gap-2 rounded-full px-7 h-12 text-[15px] font-semibold text-primary-foreground bg-primary hover:bg-primary/90 shadow-[0_4px_24px_-4px_hsl(210_100%_50%/0.35)] transition-all active:scale-[0.97]"
                >
                  {c.employers.cta} <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>

            {/* Visual: stacked operational cards */}
            <div className="relative">
              <div className="space-y-4">
                {[
                  { icon: <CalendarDays className="h-5 w-5 text-primary" />, label: lang === "es" ? "Turnos esta semana" : "Shifts this week", value: "124", sub: lang === "es" ? "8 ubicaciones" : "8 locations" },
                  { icon: <Users className="h-5 w-5 text-primary" />, label: lang === "es" ? "Trabajadores activos" : "Active workers", value: "847", sub: lang === "es" ? "96% con asistencia" : "96% attendance" },
                  { icon: <Clock className="h-5 w-5 text-primary" />, label: lang === "es" ? "Clock-in hoy" : "Clock-in today", value: "94.2%", sub: lang === "es" ? "Tiempo real" : "Real-time" },
                  { icon: <DollarSign className="h-5 w-5 text-primary" />, label: lang === "es" ? "Payroll pendiente" : "Pending payroll", value: "$48,320", sub: lang === "es" ? "2 períodos abiertos" : "2 open periods" },
                ].map((card, i) => (
                  <div key={i} className="flex items-center gap-4 bg-card rounded-xl border border-border p-5 shadow-xs" style={{ animationDelay: `${i * 0.1}s` }}>
                    <div className="h-11 w-11 rounded-lg bg-primary/[0.08] flex items-center justify-center shrink-0">
                      {card.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-muted-foreground">{card.label}</p>
                      <p className="text-lg font-bold text-foreground font-heading tabular-nums">{card.value}</p>
                    </div>
                    <p className="text-xs text-muted-foreground hidden sm:block">{card.sub}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════ FOR WORKERS ══════════ */}
      <section className="py-16 sm:py-24" id="workers">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Visual: phone-style portal mockup */}
            <div className="order-2 lg:order-1 flex justify-center">
              <div className="w-72 sm:w-80 bg-card rounded-3xl border border-border shadow-lg overflow-hidden">
                <div className="bg-primary px-5 pt-6 pb-8 text-center">
                  <div className="h-16 w-16 rounded-full bg-primary-foreground/20 mx-auto flex items-center justify-center mb-3">
                    <Smartphone className="h-7 w-7 text-primary-foreground" />
                  </div>
                  <p className="text-primary-foreground font-heading font-bold text-lg">Portal</p>
                  <p className="text-primary-foreground/70 text-sm">StaflyApps</p>
                </div>
                <div className="p-5 space-y-3">
                  {[
                    { label: lang === "es" ? "Mi turno hoy" : "My shift today", value: "8:00 AM - 4:00 PM", color: "bg-primary/10 text-primary" },
                    { label: lang === "es" ? "Horas esta semana" : "Hours this week", value: "32.5 hrs", color: "bg-accent text-foreground" },
                    { label: lang === "es" ? "Próximo pago" : "Next payment", value: "$1,240.00", color: "bg-accent text-foreground" },
                  ].map((item, i) => (
                    <div key={i} className={`rounded-xl p-4 ${item.color}`}>
                      <p className="text-xs text-muted-foreground">{item.label}</p>
                      <p className="font-bold text-base font-heading mt-0.5">{item.value}</p>
                    </div>
                  ))}
                  <div className="flex gap-2 pt-1">
                    <div className="flex-1 rounded-lg bg-primary text-primary-foreground text-center py-2.5 text-sm font-semibold">Clock In</div>
                    <div className="flex-1 rounded-lg border border-border text-center py-2.5 text-sm font-medium text-muted-foreground">{lang === "es" ? "Mi perfil" : "My profile"}</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="order-1 lg:order-2">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary mb-3">{c.workers.eyebrow}</p>
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-foreground font-heading leading-tight">
                {c.workers.title}
              </h2>
              <p className="mt-4 text-[15px] text-muted-foreground leading-relaxed max-w-lg">
                {c.workers.sub}
              </p>
              <ul className="mt-8 space-y-3.5">
                {c.workers.points.map((point, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm text-foreground">
                    <CheckCircle2 className="h-4.5 w-4.5 text-primary shrink-0 mt-0.5" />
                    {point}
                  </li>
                ))}
              </ul>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  to="/portal"
                  className="inline-flex items-center gap-2 rounded-full px-7 h-12 text-[15px] font-semibold text-primary-foreground bg-primary hover:bg-primary/90 shadow-[0_4px_24px_-4px_hsl(210_100%_50%/0.35)] transition-all active:scale-[0.97]"
                >
                  {c.workers.cta}
                </Link>
                <Link
                  to="/apply/my-staff-solution"
                  className="inline-flex items-center gap-1.5 rounded-full h-12 px-7 text-[15px] font-semibold border border-border hover:bg-accent transition-all active:scale-[0.97] text-foreground"
                >
                  {c.workers.ctaApply} <ChevronRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════ QUICK ACCESS ══════════ */}
      <section className="py-12 sm:py-16 bg-accent/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-xl sm:text-2xl font-bold text-foreground font-heading text-center mb-8">{c.quickAccess.title}</h2>
          <div className="grid sm:grid-cols-3 gap-4 max-w-3xl mx-auto">
            {c.quickAccess.cards.map((card, i) => (
              <Link
                key={i}
                to={card.href}
                className="group bg-card rounded-xl border border-border p-5 shadow-xs hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 text-center"
              >
                <div className="h-10 w-10 rounded-lg bg-primary/[0.08] text-primary flex items-center justify-center mx-auto mb-3 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                  {card.icon === "login" ? <UserCog className="h-5 w-5" /> : <Building2 className="h-5 w-5" />}
                </div>
                <p className="font-semibold text-sm text-foreground font-heading">{card.label}</p>
                <p className="text-xs text-muted-foreground mt-1">{card.desc}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════ PRICING ══════════ */}
      <section className="py-16 sm:py-24" id="pricing">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-foreground font-heading">
              {c.pricing.title}
            </h2>
            <p className="mt-4 text-[15px] text-muted-foreground">{c.pricing.sub}</p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {c.pricing.plans.map((plan, i) => (
              <div
                key={i}
                className={`relative rounded-2xl p-8 flex flex-col ${
                  plan.highlighted
                    ? "border-2 border-primary bg-card shadow-lg shadow-primary/10"
                    : "border border-border bg-card shadow-xs"
                }`}
              >
                {plan.highlighted && (
                  <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 inline-flex items-center px-4 py-1 rounded-full text-xs font-bold bg-primary text-primary-foreground shadow-[0_2px_12px_-2px_hsl(210_100%_50%/0.4)]">
                    {c.pricing.popular}
                  </span>
                )}
                <h3 className="text-xl font-bold text-foreground font-heading">{plan.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{plan.desc}</p>
                <div className="mt-6 mb-6">
                  <span className="text-4xl font-extrabold text-foreground font-heading">{plan.price}</span>
                  <span className="text-sm text-muted-foreground ml-1">{plan.period}</span>
                </div>
                <ul className="space-y-3 flex-1">
                  {plan.features.map((feat, j) => (
                    <li key={j} className="flex items-start gap-2.5 text-sm text-foreground">
                      <CheckCircle2 className={`h-4 w-4 shrink-0 mt-0.5 ${plan.highlighted ? "text-primary" : "text-muted-foreground"}`} />
                      {feat}
                    </li>
                  ))}
                </ul>
                <div className="mt-8">
                  <Link
                    to={i === 2 ? "/help" : "/auth?register=true"}
                    className={`w-full inline-flex items-center justify-center rounded-xl h-12 text-[15px] font-semibold transition-all active:scale-[0.97] ${
                      plan.highlighted
                        ? "text-primary-foreground bg-primary hover:bg-primary/90 shadow-[0_2px_16px_-4px_hsl(210_100%_50%/0.4)]"
                        : "border border-border hover:bg-accent text-foreground"
                    }`}
                  >
                    {plan.cta}
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════ FINAL CTA ══════════ */}
      <section className="py-16 sm:py-24 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none" style={{
          background: "radial-gradient(ellipse 70% 50% at 50% 100%, hsl(210 100% 94% / 0.5), transparent 60%)",
        }} />
        <div className="relative max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-foreground font-heading leading-tight">
            {c.finalCta.title}
          </h2>
          <p className="mt-4 text-[15px] text-muted-foreground max-w-xl mx-auto">
            {c.finalCta.sub}
          </p>
          <div className="mt-8">
            <Link
              to="/auth?register=true"
              className="inline-flex items-center gap-2 rounded-full px-8 h-13 py-3 text-base font-semibold text-primary-foreground bg-primary hover:bg-primary/90 shadow-[0_4px_24px_-4px_hsl(210_100%_50%/0.45)] transition-all active:scale-[0.97]"
            >
              {c.finalCta.cta} <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ══════════ FOOTER ══════════ */}
      <footer className="border-t border-border py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
            <StaflyLogo size={26} />
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px] text-muted-foreground">
              <a href="#capabilities" className="hover:text-foreground transition-colors">{c.footer.product}</a>
              <a href="#pricing" className="hover:text-foreground transition-colors">{c.footer.pricing}</a>
              <Link to="/portal" className="font-medium hover:text-foreground transition-colors text-primary">{c.footer.portal}</Link>
              <Link to="/help" className="hover:text-foreground transition-colors">{c.footer.help}</Link>
              <Link to="/privacy" className="hover:text-foreground transition-colors">{c.footer.privacy}</Link>
              <Link to="/terms" className="hover:text-foreground transition-colors">{c.footer.terms}</Link>
            </div>
          </div>
          <div className="mt-8 pt-6 border-t border-border text-center">
            <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} StaflyApps. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
