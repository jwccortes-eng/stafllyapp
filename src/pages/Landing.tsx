import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  CalendarDays, DollarSign, Users, Clock, BarChart3, Shield,
  ArrowRight, CheckCircle2, Globe, MapPin,
  Lock, Send, Eye, Download,
  Menu, X, Zap, ChevronRight, Smartphone, Building2, Utensils,
  HardHat, Briefcase, History, ClipboardCheck,
  LayoutDashboard, FileText,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { StaflyLogo } from "@/components/brand/StaflyBrand";
import heroDashboard from "@/assets/stafly-hero-dashboard.png";
import demoDashboard from "@/assets/demo/demo-dashboard.jpg";
import demoShifts from "@/assets/demo/demo-shifts.jpg";
import demoEmployees from "@/assets/demo/demo-employees.jpg";
import demoReports from "@/assets/demo/demo-reports.jpg";
import demoMobile from "@/assets/demo/demo-mobile.jpg";

/* ───────── i18n ───────── */
const i18n = {
  es: {
    nav: { product: "Producto", pricing: "Precios", security: "Seguridad" },
    login: "Iniciar sesión",
    portal: "Portal empleados",
    ctaPrimary: "Empezar gratis",
    ctaSecondary: "Agendar demo",
    ctaMicro: "Sin tarjeta · Setup en minutos · Cancela cuando quieras",
    hero: {
      badge: "Gestión de personal inteligente",
      h1: "Control total de tu equipo.\nSin el caos.",
      sub: "Programa turnos, registra asistencia con GPS, controla nómina semanal y genera reportes automáticamente desde una sola plataforma.",
      pills: ["Setup en minutos", "GPS verificado", "Exportación lista", "Permisos granulares"],
    },
    problem: {
      title: "Administrar personal no debería ser complicado.",
      p1: "Muchas empresas aún gestionan turnos, asistencia y pagos con hojas de cálculo, mensajes y múltiples herramientas.",
      p2: "Esto genera errores, desorden y pérdida de tiempo.",
      p3: "StaflyApps centraliza todo en un solo lugar.",
    },
    benefits: {
      title: "Todo lo que necesitas para administrar tu equipo.",
      cards: [
        { icon: "calendar", title: "Programación de turnos", desc: "Crea y organiza horarios en segundos." },
        { icon: "mapPin", title: "Clock-in / Clock-out con GPS", desc: "Verifica ubicación al registrar asistencia." },
        { icon: "dollar", title: "Nómina semanal", desc: "Controla horas trabajadas fácilmente." },
        { icon: "chart", title: "Reportes automáticos", desc: "Exporta datos claros para administración." },
        { icon: "shield", title: "Permisos por rol", desc: "Controla accesos y autorizaciones." },
        { icon: "smartphone", title: "Portal para empleados", desc: "Tus trabajadores pueden ver turnos y marcar asistencia desde su teléfono." },
      ],
    },
    howItWorks: {
      title: "Empieza en minutos.",
      steps: [
        { num: "01", title: "Crea tu equipo", desc: "Agrega empleados y configura roles." },
        { num: "02", title: "Programa turnos", desc: "Asigna horarios por cliente y ubicación." },
        { num: "03", title: "Controla asistencia y reportes", desc: "Monitorea en tiempo real y exporta datos." },
      ],
    },
    audience: {
      title: "Diseñado para equipos operativos.",
      chips: ["Empresas de limpieza", "Eventos y catering", "Hospitalidad", "Administración de edificios", "Equipos de campo", "Contratistas"],
    },
    capabilities: {
      title: "Capacidades clave",
      items: ["GPS al marcar asistencia", "Historial completo", "Auditoría de cambios", "Exportación de reportes", "Control por empresa", "Permisos avanzados", "Experiencia móvil"],
    },
    trust: {
      title: "Diseñado para operaciones reales.",
      sub: "StaflyApps fue construido para empresas que gestionan equipos operativos.",
      p1: "Simple para empleados.",
      p2: "Poderoso para administradores.",
    },
    finalCta: {
      h2: "Empieza a organizar tu equipo hoy.",
      sub: "Configura tu cuenta en minutos y comienza a controlar turnos, asistencia y reportes.",
    },
    form: { name: "Nombre", company: "Empresa", email: "Email", phone: "Teléfono", employees: "# Empleados", submit: "Agendar demo" },
    footer: { product: "Producto", pricing: "Precios", demo: "Demo", contact: "Contacto", portal: "Portal empleados", privacy: "Privacidad", terms: "Términos" },
  },
  en: {
    nav: { product: "Product", pricing: "Pricing", security: "Security" },
    login: "Sign in",
    portal: "Employee portal",
    ctaPrimary: "Start free",
    ctaSecondary: "Book a demo",
    ctaMicro: "No card required · Setup in minutes · Cancel anytime",
    hero: {
      badge: "Smart workforce management",
      h1: "Total control of your team.\nWithout the chaos.",
      sub: "Schedule shifts, track attendance with GPS, manage weekly payroll and generate reports automatically from a single platform.",
      pills: ["Setup in minutes", "GPS verified", "Export-ready", "Granular permissions"],
    },
    problem: {
      title: "Managing staff shouldn't be complicated.",
      p1: "Many businesses still manage shifts, attendance and payments with spreadsheets, messages and multiple tools.",
      p2: "This leads to errors, disorder and wasted time.",
      p3: "StaflyApps centralizes everything in one place.",
    },
    benefits: {
      title: "Everything you need to manage your team.",
      cards: [
        { icon: "calendar", title: "Shift scheduling", desc: "Create and organize schedules in seconds." },
        { icon: "mapPin", title: "Clock-in / Clock-out with GPS", desc: "Verify location when recording attendance." },
        { icon: "dollar", title: "Weekly payroll", desc: "Track hours worked easily." },
        { icon: "chart", title: "Automatic reports", desc: "Export clear data for management." },
        { icon: "shield", title: "Role-based permissions", desc: "Control access and authorizations." },
        { icon: "smartphone", title: "Employee portal", desc: "Your workers can view shifts and clock in from their phone." },
      ],
    },
    howItWorks: {
      title: "Get started in minutes.",
      steps: [
        { num: "01", title: "Create your team", desc: "Add employees and configure roles." },
        { num: "02", title: "Schedule shifts", desc: "Assign schedules by client and location." },
        { num: "03", title: "Track attendance & reports", desc: "Monitor in real time and export data." },
      ],
    },
    audience: {
      title: "Built for operational teams.",
      chips: ["Cleaning companies", "Events & catering", "Hospitality", "Building management", "Field teams", "Contractors"],
    },
    capabilities: {
      title: "Key capabilities",
      items: ["GPS clock-in", "Complete history", "Change audit", "Report export", "Multi-company control", "Advanced permissions", "Mobile experience"],
    },
    trust: {
      title: "Built for real operations.",
      sub: "StaflyApps was built for businesses managing operational teams.",
      p1: "Simple for employees.",
      p2: "Powerful for administrators.",
    },
    finalCta: {
      h2: "Start organizing your team today.",
      sub: "Set up your account in minutes and start managing shifts, attendance and reports.",
    },
    form: { name: "Name", company: "Company", email: "Email", phone: "Phone", employees: "# Employees", submit: "Book a demo" },
    footer: { product: "Product", pricing: "Pricing", demo: "Demo", contact: "Contact", portal: "Employee portal", privacy: "Privacy", terms: "Terms" },
  },
};

const iconComponents: Record<string, React.ReactNode> = {
  calendar: <CalendarDays className="h-5 w-5" />,
  clock: <Clock className="h-5 w-5" />,
  dollar: <DollarSign className="h-5 w-5" />,
  chart: <BarChart3 className="h-5 w-5" />,
  shield: <Shield className="h-5 w-5" />,
  mapPin: <MapPin className="h-5 w-5" />,
  smartphone: <Smartphone className="h-5 w-5" />,
  lock: <Lock className="h-5 w-5" />,
  eye: <Eye className="h-5 w-5" />,
  download: <Download className="h-5 w-5" />,
};

const audienceIcons = [Building2, Utensils, Building2, Building2, HardHat, Briefcase];

/* ───────── Demo Form ───────── */
function DemoForm({ lang }: { lang: "es" | "en" }) {
  const c = i18n[lang].form;
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ name: "", company: "", email: "", phone: "", employee_count: "" });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.company) return;
    setLoading(true);
    const { error } = await supabase.from("demo_requests" as any).insert([{ ...form, source: "landing" }] as any);
    setLoading(false);
    if (error) {
      toast.error(lang === "es" ? "Error al enviar. Intenta de nuevo." : "Error submitting. Try again.");
    } else {
      toast.success(lang === "es" ? "¡Solicitud enviada! Te contactaremos pronto." : "Request sent! We'll contact you soon.");
      setForm({ name: "", company: "", email: "", phone: "", employee_count: "" });
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <Input placeholder={c.name} required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="h-11 rounded-xl border-[hsl(220,13%,87%)]" />
      <Input placeholder={c.company} required value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} className="h-11 rounded-xl border-[hsl(220,13%,87%)]" />
      <div className="grid grid-cols-2 gap-3">
        <Input placeholder={c.email} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="h-11 rounded-xl border-[hsl(220,13%,87%)]" />
        <Input placeholder={c.phone} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="h-11 rounded-xl border-[hsl(220,13%,87%)]" />
      </div>
      <Input placeholder={c.employees} value={form.employee_count} onChange={(e) => setForm({ ...form, employee_count: e.target.value })} className="h-11 rounded-xl border-[hsl(220,13%,87%)]" />
      <button type="submit" disabled={loading} className="w-full rounded-xl h-12 text-base font-semibold text-white bg-[hsl(222,100%,59%)] hover:bg-[hsl(222,100%,52%)] shadow-[0_4px_14px_-3px_hsl(222,100%,59%/0.4)] transition-all disabled:opacity-50 flex items-center justify-center gap-2">
        {loading ? "..." : c.submit} <Send className="h-4 w-4" />
      </button>
    </form>
  );
}

/* ───────── Interactive Demo ───────── */
const demoTabs = [
  { key: "dashboard", icon: LayoutDashboard, img: demoDashboard },
  { key: "shifts", icon: CalendarDays, img: demoShifts },
  { key: "employees", icon: Users, img: demoEmployees },
  { key: "reports", icon: BarChart3, img: demoReports },
  { key: "mobile", icon: Smartphone, img: demoMobile },
] as const;

const demoLabels: Record<string, Record<string, string>> = {
  es: { dashboard: "Dashboard", shifts: "Calendario de turnos", employees: "Gestión de empleados", reports: "Reportes", mobile: "Portal móvil" },
  en: { dashboard: "Dashboard", shifts: "Shift calendar", employees: "Employee management", reports: "Reports", mobile: "Mobile portal" },
};

function InteractiveDemo({ lang }: { lang: "es" | "en" }) {
  const [active, setActive] = useState(0);
  const labels = demoLabels[lang];

  return (
    <section className="py-16 sm:py-24">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-10">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight" style={{ color: "hsl(220,25%,10%)" }}>
            {lang === "es" ? "Explora la plataforma" : "Explore the platform"}
          </h2>
          <p className="mt-3 text-[15px]" style={{ color: "hsl(220,10%,45%)" }}>
            {lang === "es" ? "Descubre cómo StaflyApps te ayuda a gestionar tu equipo." : "See how StaflyApps helps you manage your team."}
          </p>
        </div>

        {/* Tab buttons */}
        <div className="flex flex-wrap justify-center gap-2 mb-8">
          {demoTabs.map((tab, i) => {
            const Icon = tab.icon;
            const isActive = active === i;
            return (
              <button
                key={tab.key}
                onClick={() => setActive(i)}
                className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  isActive
                    ? "bg-primary text-primary-foreground shadow-[0_2px_8px_-2px_hsl(222,100%,59%/0.35)]"
                    : "bg-muted/40 text-muted-foreground hover:bg-muted"
                }`}
              >
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{labels[tab.key]}</span>
              </button>
            );
          })}
        </div>

        {/* Preview */}
        <div className="relative rounded-2xl overflow-hidden border border-border shadow-[0_12px_40px_-10px_rgba(0,0,0,0.08)]">
          <div className="bg-muted/30 border-b border-border px-4 py-2.5 flex items-center gap-2">
            <div className="flex gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-[hsl(0,70%,65%)]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[hsl(45,80%,60%)]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[hsl(140,50%,55%)]" />
            </div>
            <span className="text-[11px] font-medium text-muted-foreground ml-2">
              {labels[demoTabs[active].key]}
            </span>
          </div>
          <img
            src={demoTabs[active].img}
            alt={labels[demoTabs[active].key]}
            className="w-full h-auto block"
            loading="lazy"
          />
        </div>

        {/* Navigation dots */}
        <div className="flex justify-center gap-2 mt-6">
          {demoTabs.map((_, i) => (
            <button
              key={i}
              onClick={() => setActive(i)}
              className={`h-2 rounded-full transition-all ${
                active === i ? "w-6 bg-primary" : "w-2 bg-muted-foreground/20"
              }`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

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
    <div className="min-h-screen w-full overflow-x-hidden" style={{ fontFamily: "var(--font-heading), system-ui, sans-serif", background: "#ffffff", color: "hsl(220,20%,14%)" }}>

      {/* ── HEADER ── */}
      <header className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${scrolled ? "bg-white/90 backdrop-blur-xl shadow-[0_1px_2px_rgba(0,0,0,0.04)]" : "bg-transparent"}`}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between h-16">
          <StaflyLogo size={28} />

          <nav className="hidden lg:flex items-center gap-8 text-[13px] font-medium" style={{ color: "hsl(220,10%,50%)" }}>
            <a href="#producto" className="hover:text-[hsl(220,20%,14%)] transition-colors">{c.nav.product}</a>
            <a href="#precios" className="hover:text-[hsl(220,20%,14%)] transition-colors">{c.nav.pricing}</a>
            <a href="#seguridad" className="hover:text-[hsl(220,20%,14%)] transition-colors">{c.nav.security}</a>
          </nav>

          <div className="flex items-center gap-2">
            <button onClick={() => setLang(lang === "es" ? "en" : "es")} className="hidden sm:flex items-center gap-1 text-[13px] px-2.5 py-1.5 rounded-lg hover:bg-[hsl(220,20%,96%)] transition-colors" style={{ color: "hsl(220,10%,50%)" }}>
              <Globe className="h-3.5 w-3.5" />
              <span className="font-medium">{lang === "es" ? "EN" : "ES"}</span>
            </button>
            <Link to="/portal" className="hidden sm:inline-flex text-[13px] font-medium px-3 py-1.5 rounded-lg hover:bg-[hsl(220,20%,96%)] transition-colors" style={{ color: "hsl(220,10%,50%)" }}>
              {c.portal}
            </Link>
            <Link to="/auth" className="hidden sm:inline-flex text-[13px] font-medium px-3 py-1.5 rounded-lg hover:bg-[hsl(220,20%,96%)] transition-colors" style={{ color: "hsl(220,10%,50%)" }}>
              {c.login}
            </Link>
            <Dialog>
              <DialogTrigger asChild>
                <button className="rounded-full px-5 h-9 text-[13px] font-semibold text-white bg-[hsl(222,100%,59%)] hover:bg-[hsl(222,100%,52%)] shadow-[0_2px_8px_-2px_hsl(222,100%,59%/0.35)] transition-all active:scale-[0.97]">
                  {c.ctaPrimary}
                </button>
              </DialogTrigger>
              <DialogContent className="max-w-md rounded-2xl">
                <DialogHeader><DialogTitle>{c.ctaSecondary}</DialogTitle></DialogHeader>
                <DemoForm lang={lang} />
              </DialogContent>
            </Dialog>
            <button className="lg:hidden p-2 rounded-lg hover:bg-[hsl(220,20%,96%)] transition-colors" onClick={() => setMobileMenu(!mobileMenu)}>
              {mobileMenu ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {mobileMenu && (
          <div className="lg:hidden bg-white/95 backdrop-blur-xl border-t border-[hsl(220,13%,93%)]">
            <div className="max-w-6xl mx-auto px-4 py-3 space-y-1">
              {[
                { href: "#producto", label: c.nav.product },
                { href: "#precios", label: c.nav.pricing },
                { href: "#seguridad", label: c.nav.security },
              ].map(item => (
                <a key={item.href} href={item.href} onClick={() => setMobileMenu(false)} className="block text-sm font-medium py-2.5 px-3 rounded-lg hover:bg-[hsl(220,20%,96%)] transition-colors">{item.label}</a>
              ))}
              <Link to="/portal" onClick={() => setMobileMenu(false)} className="block text-sm font-medium py-2.5 px-3 rounded-lg hover:bg-[hsl(220,20%,96%)]" style={{ color: "hsl(222,100%,59%)" }}>{c.portal}</Link>
              <Link to="/auth" onClick={() => setMobileMenu(false)} className="block text-sm font-medium py-2.5 px-3 rounded-lg hover:bg-[hsl(220,20%,96%)]" style={{ color: "hsl(222,100%,59%)" }}>{c.login}</Link>
              <button onClick={() => { setLang(lang === "es" ? "en" : "es"); setMobileMenu(false); }} className="flex items-center gap-2 text-sm py-2.5 px-3 w-full rounded-lg hover:bg-[hsl(220,20%,96%)]" style={{ color: "hsl(220,10%,50%)" }}>
                <Globe className="h-4 w-4" /> {lang === "es" ? "English" : "Español"}
              </button>
            </div>
          </div>
        )}
      </header>

      {/* ── HERO ── */}
      <section className="relative pt-28 pb-12 sm:pt-36 sm:pb-20" id="producto">
        {/* Soft radial glow — no solid blocks */}
        <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse 70% 50% at 50% 0%, hsl(222,100%,96%), transparent 70%)" }} />

        <div className="relative max-w-3xl mx-auto px-4 sm:px-6 text-center">
          {/* Badge */}
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold tracking-wide mb-6 px-3.5 py-1.5 rounded-full" style={{ color: "hsl(222,100%,59%)", background: "hsl(222,100%,59%/0.07)" }}>
            <Zap className="h-3.5 w-3.5" />
            {c.hero.badge}
          </span>

          {/* Headline */}
          <h1 className="text-[28px] sm:text-5xl lg:text-[56px] font-extrabold tracking-tight leading-[1.12] whitespace-pre-line" style={{ color: "hsl(220,25%,10%)" }}>
            {c.hero.h1}
          </h1>

          {/* Subheadline */}
          <p className="mt-5 sm:mt-6 text-[15px] sm:text-lg leading-relaxed max-w-2xl mx-auto" style={{ color: "hsl(220,10%,45%)" }}>
            {c.hero.sub}
          </p>

          {/* CTAs */}
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              to="/auth?register=true"
              className="inline-flex items-center gap-2 rounded-full px-7 h-12 text-[15px] font-semibold text-white bg-[hsl(222,100%,59%)] hover:bg-[hsl(222,100%,52%)] shadow-[0_4px_16px_-4px_hsl(222,100%,59%/0.4)] transition-all active:scale-[0.97]"
            >
              {c.ctaPrimary} <ArrowRight className="h-4 w-4" />
            </Link>
            <Dialog>
              <DialogTrigger asChild>
                <button className="inline-flex items-center gap-1.5 rounded-full h-12 px-7 text-[15px] font-semibold border border-[hsl(220,13%,86%)] hover:bg-[hsl(220,20%,97%)] transition-all active:scale-[0.97]" style={{ color: "hsl(220,15%,25%)" }}>
                  {c.ctaSecondary} <ChevronRight className="h-4 w-4" />
                </button>
              </DialogTrigger>
              <DialogContent className="max-w-md rounded-2xl">
                <DialogHeader><DialogTitle>{c.ctaSecondary}</DialogTitle></DialogHeader>
                <DemoForm lang={lang} />
              </DialogContent>
            </Dialog>
          </div>

          <p className="mt-4 text-xs" style={{ color: "hsl(220,10%,58%)" }}>{c.ctaMicro}</p>

          {/* Pills */}
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {c.hero.pills.map((pill, i) => (
              <span key={i} className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border border-[hsl(220,13%,91%)] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03)]" style={{ color: "hsl(220,10%,42%)" }}>
                <CheckCircle2 className="h-3.5 w-3.5" style={{ color: "hsl(163,68%,45%)" }} /> {pill}
              </span>
            ))}
          </div>
        </div>

        {/* Dashboard mockup */}
        <div className="relative max-w-5xl mx-auto mt-14 px-4 sm:px-6">
          <div className="rounded-2xl overflow-hidden border border-[hsl(220,13%,91%)] shadow-[0_20px_50px_-12px_rgba(0,0,0,0.08)]">
            <img
              src={heroDashboard}
              alt="StaflyApps Dashboard"
              className="w-full h-auto block"
              loading="eager"
            />
          </div>
        </div>
      </section>

      {/* ── PROBLEM ── */}
      <section className="py-16 sm:py-24">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight" style={{ color: "hsl(220,25%,10%)" }}>
            {c.problem.title}
          </h2>
          <div className="mt-6 space-y-4 text-[15px] leading-relaxed" style={{ color: "hsl(220,10%,45%)" }}>
            <p>{c.problem.p1}</p>
            <p>{c.problem.p2}</p>
            <p className="font-semibold" style={{ color: "hsl(222,100%,59%)" }}>{c.problem.p3}</p>
          </div>
        </div>
      </section>

      {/* ── BENEFITS ── */}
      <section className="py-16 sm:py-24" style={{ background: "hsl(220,30%,98%)" }} id="seguridad">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-center" style={{ color: "hsl(220,25%,10%)" }}>
            {c.benefits.title}
          </h2>
          <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {c.benefits.cards.map((card, i) => (
              <div key={i} className="bg-white rounded-2xl border border-[hsl(220,13%,91%)] p-6 shadow-[0_1px_3px_rgba(0,0,0,0.03)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)] hover:-translate-y-0.5 transition-all duration-300">
                <div className="h-10 w-10 rounded-xl flex items-center justify-center mb-4" style={{ background: "hsl(222,100%,59%/0.08)", color: "hsl(222,100%,59%)" }}>
                  {iconComponents[card.icon]}
                </div>
                <h3 className="font-semibold text-[15px] mb-1.5" style={{ color: "hsl(220,25%,10%)" }}>{card.title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: "hsl(220,10%,50%)" }}>{card.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="py-16 sm:py-24">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-center" style={{ color: "hsl(220,25%,10%)" }}>
            {c.howItWorks.title}
          </h2>
          <div className="mt-12 grid md:grid-cols-3 gap-8">
            {c.howItWorks.steps.map((step, i) => (
              <div key={i} className="text-center">
                <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl text-xl font-bold mb-5" style={{ background: "hsl(222,100%,59%/0.08)", color: "hsl(222,100%,59%)" }}>
                  {step.num}
                </div>
                <h3 className="font-semibold text-base mb-2" style={{ color: "hsl(220,25%,10%)" }}>{step.title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: "hsl(220,10%,50%)" }}>{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── AUDIENCE ── */}
      <section className="py-16 sm:py-24" style={{ background: "hsl(220,30%,98%)" }}>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight" style={{ color: "hsl(220,25%,10%)" }}>
            {c.audience.title}
          </h2>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            {c.audience.chips.map((chip, i) => {
              const Icon = audienceIcons[i];
              return (
                <span key={i} className="inline-flex items-center gap-2 text-sm font-medium px-4 py-2.5 rounded-full border border-[hsl(220,13%,91%)] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03)]" style={{ color: "hsl(220,15%,25%)" }}>
                  <Icon className="h-4 w-4" style={{ color: "hsl(222,100%,59%)" }} /> {chip}
                </span>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── CAPABILITIES ── */}
      <section className="py-16 sm:py-24">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-center" style={{ color: "hsl(220,25%,10%)" }}>
            {c.capabilities.title}
          </h2>
          <div className="mt-10 grid sm:grid-cols-2 gap-x-8 gap-y-4 max-w-2xl mx-auto">
            {c.capabilities.items.map((item, i) => (
              <div key={i} className="flex items-center gap-3 py-2">
                <CheckCircle2 className="h-5 w-5 shrink-0" style={{ color: "hsl(163,68%,45%)" }} />
                <span className="text-sm font-medium" style={{ color: "hsl(220,15%,25%)" }}>{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRODUCT VISUAL ── */}
      <section className="py-16 sm:py-24" style={{ background: "hsl(220,30%,98%)" }}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="rounded-2xl overflow-hidden border border-[hsl(220,13%,91%)] shadow-[0_12px_40px_-10px_rgba(0,0,0,0.08)]">
            <img
              src={heroDashboard}
              alt="StaflyApps Dashboard"
              className="w-full h-auto block"
              loading="lazy"
            />
          </div>
        </div>
      </section>

      {/* ── INTERACTIVE DEMO ── */}
      <InteractiveDemo lang={lang} />

      {/* ── TRUST ── */}
      <section className="py-16 sm:py-24">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight" style={{ color: "hsl(220,25%,10%)" }}>
            {c.trust.title}
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed" style={{ color: "hsl(220,10%,45%)" }}>
            {c.trust.sub}
          </p>
          <div className="mt-6 flex items-center justify-center gap-6">
            <span className="text-sm font-semibold" style={{ color: "hsl(220,15%,25%)" }}>{c.trust.p1}</span>
            <span className="h-4 w-px bg-[hsl(220,13%,86%)]" />
            <span className="text-sm font-semibold" style={{ color: "hsl(220,15%,25%)" }}>{c.trust.p2}</span>
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section className="py-16 sm:py-24" id="precios">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="rounded-3xl px-6 py-14 sm:px-14 sm:py-20 text-center" style={{ background: "linear-gradient(135deg, hsl(222,100%,59%), hsl(226,76%,49%))" }}>
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white tracking-tight leading-tight">
              {c.finalCta.h2}
            </h2>
            <p className="mt-4 text-white/75 text-[15px] max-w-xl mx-auto">{c.finalCta.sub}</p>

            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link
                to="/auth?register=true"
                className="inline-flex items-center gap-2 rounded-full px-7 h-12 bg-white font-semibold text-[15px] shadow-[0_4px_12px_rgba(0,0,0,0.08)] transition-all hover:bg-white/90 active:scale-[0.97]"
                style={{ color: "hsl(222,100%,59%)" }}
              >
                {c.ctaPrimary} <ArrowRight className="h-4 w-4" />
              </Link>
              <Dialog>
                <DialogTrigger asChild>
                  <button className="inline-flex items-center gap-1.5 rounded-full h-12 px-7 border border-white/40 text-white hover:bg-white/10 font-semibold text-[15px] transition-all active:scale-[0.97]">
                    {c.ctaSecondary}
                  </button>
                </DialogTrigger>
                <DialogContent className="max-w-md rounded-2xl">
                  <DialogHeader><DialogTitle>{c.ctaSecondary}</DialogTitle></DialogHeader>
                  <DemoForm lang={lang} />
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="border-t border-[hsl(220,13%,93%)] py-12">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
            <StaflyLogo size={26} />
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px]" style={{ color: "hsl(220,10%,50%)" }}>
              <a href="#producto" className="hover:text-[hsl(220,20%,14%)] transition-colors">{c.footer.product}</a>
              <a href="#precios" className="hover:text-[hsl(220,20%,14%)] transition-colors">{c.footer.pricing}</a>
              <Link to="/portal" className="font-medium hover:text-[hsl(220,20%,14%)] transition-colors" style={{ color: "hsl(222,100%,59%)" }}>{c.footer.portal}</Link>
              <Link to="/help" className="hover:text-[hsl(220,20%,14%)] transition-colors">{c.footer.contact}</Link>
              <Link to="/privacy" className="hover:text-[hsl(220,20%,14%)] transition-colors">{c.footer.privacy}</Link>
              <Link to="/terms" className="hover:text-[hsl(220,20%,14%)] transition-colors">{c.footer.terms}</Link>
            </div>
          </div>
          <div className="mt-8 pt-6 border-t border-[hsl(220,13%,93%)] text-center">
            <p className="text-xs" style={{ color: "hsl(220,10%,58%)" }}>© {new Date().getFullYear()} StaflyApps. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
