import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  CalendarDays, DollarSign, Users, Clock, BarChart3, Shield,
  ArrowRight, CheckCircle2, Globe, MapPin,
  Lock, Send, Eye, Download,
  Menu, X, Star, Zap, ChevronRight,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { StaflyMark, StaflyLogo } from "@/components/brand/StaflyBrand";
import heroDashboard from "@/assets/stafly-hero-dashboard.png";

/* ───────── i18n ───────── */
const i18n = {
  es: {
    nav: { product: "Producto", modules: "Módulos", pricing: "Precios", security: "Seguridad" },
    login: "Iniciar sesión",
    portal: "Portal Empleados",
    ctaPrimary: "Empezar gratis",
    ctaSecondary: "Agendar demo",
    ctaMicro: "Sin tarjeta · Setup en minutos · Cancela cuando quieras",
    hero: {
      eyebrow: "Gestión de personal inteligente",
      h1: "Control total de tu equipo, sin el caos.",
      sub: "Turnos, clock-in/out con GPS, nómina semanal, reportes y permisos — todo en una plataforma que tu equipo realmente va a usar.",
      badges: ["Setup en minutos", "GPS verificado", "Exportación lista", "Permisos granulares"],
    },
    chaos: {
      title: "Adiós al caos operativo",
      subtitle: "De hojas de Excel y WhatsApp a una plataforma profesional",
      before: "Antes",
      after: "Ahora con StaflyApps",
      beforeItems: ["Hojas de Excel dispersas", "Grupos de WhatsApp", "Llamadas telefónicas", "Papeles y recibos"],
      afterItems: [
        { label: "Turnos", desc: "Programa y asigna en segundos" },
        { label: "Tiempo", desc: "Clock-in/out con GPS" },
        { label: "Nómina", desc: "Cálculo semanal automático" },
        { label: "Reportes", desc: "Exporta con un clic" },
      ],
    },
    modules: {
      title: "Todo lo que necesitas",
      subtitle: "Módulos diseñados para operaciones de staffing",
      tabs: [
        { label: "Turnos", icon: "calendar", title: "Programación de turnos", bullets: ["Vista semanal con drag & drop", "Asignación por cliente y ubicación", "Copiar semana y detección de conflictos"] },
        { label: "Clock-in/out", icon: "clock", title: "Control de tiempo", bullets: ["Clock-in/out desde el celular con GPS", "Verificación de ubicación y dispositivo", "Registro de descansos y notas"] },
        { label: "Nómina", icon: "dollar", title: "Nómina semanal", bullets: ["Cálculo automático regular/overtime", "Novedades: bonos, deducciones, ajustes", "Cierre semanal controlado"] },
        { label: "Reportes", icon: "chart", title: "Reportes y exportación", bullets: ["Nómina semanal, horas por ubicación", "Exportación a CSV y PDF", "Filtros avanzados y búsqueda"] },
        { label: "Admin", icon: "shield", title: "Permisos y admin", bullets: ["Roles: Owner, Admin, Manager, Employee", "Permisos granulares por módulo", "Registro de auditoría completo"] },
      ],
    },
    security: {
      title: "Control y trazabilidad",
      subtitle: "Tu información segura, siempre accesible",
      cards: [
        { icon: "lock", title: "Roles y permisos granulares", desc: "Define exactamente quién puede ver, editar o eliminar en cada módulo." },
        { icon: "map", title: "Verificación GPS", desc: "Confirma que los empleados están donde deben al registrar entrada." },
        { icon: "eye", title: "Registro de auditoría", desc: "Cada acción queda registrada: quién, qué, cuándo y desde dónde." },
        { icon: "download", title: "Exportaciones y respaldos", desc: "Exporta datos en cualquier momento. Tu información siempre accesible." },
      ],
    },
    testimonials: {
      title: "Lo que dicen nuestros clientes",
      items: [
        { name: "María González", role: "Directora de Operaciones", company: "CleanPro Services", quote: "StaflyApps transformó nuestra gestión de turnos. Lo que antes tomaba horas ahora se hace en minutos.", rating: 5 },
        { name: "Carlos Rodríguez", role: "Gerente General", company: "Spotless Group", quote: "La verificación GPS nos dio tranquilidad total. Sabemos exactamente dónde está cada empleado.", rating: 5 },
        { name: "Ana Martínez", role: "HR Manager", company: "BrightClean Co.", quote: "La nómina semanal automática nos ahorró errores y disputas. Nuestro equipo está más contento.", rating: 5 },
      ],
    },
    pricing: {
      title: "Planes simples, sin sorpresas",
      subtitle: "Elige el plan que se adapta a tu operación",
      plans: [
        { name: "Starter", price: "$—", period: "/mes", desc: "Hasta 25 empleados", features: ["Turnos y asistencia", "Nómina semanal", "1 usuario admin", "Soporte por email"], cta: "Empezar gratis" },
        { name: "Pro", price: "$—", period: "/mes", desc: "Hasta 100 empleados", features: ["Todo en Starter", "Múltiples ubicaciones", "Roles y permisos", "Importación CSV", "Soporte prioritario"], cta: "Empezar gratis", recommended: true },
        { name: "Enterprise", price: "Custom", period: "", desc: "Empleados ilimitados", features: ["Todo en Pro", "API access", "SSO", "Onboarding dedicado", "SLA garantizado"], cta: "Agendar demo" },
      ],
    },
    finalCta: {
      h2: "Lleva tu operación al siguiente nivel",
      sub: "Empieza gratis hoy. Sin tarjeta de crédito.",
    },
    form: { name: "Nombre", company: "Empresa", email: "Email", phone: "Teléfono", employees: "# Empleados", submit: "Agendar demo" },
    footer: { privacy: "Privacidad", terms: "Términos", contact: "Contacto", portal: "Portal Empleados" },
  },
  en: {
    nav: { product: "Product", modules: "Modules", pricing: "Pricing", security: "Security" },
    login: "Sign in",
    portal: "Employee Portal",
    ctaPrimary: "Start free",
    ctaSecondary: "Book a demo",
    ctaMicro: "No card required · Setup in minutes · Cancel anytime",
    hero: {
      eyebrow: "Smart workforce management",
      h1: "Total control of your team — without the chaos.",
      sub: "Scheduling, GPS clock-in/out, weekly payroll, reports and permissions — all in one platform your team will actually use.",
      badges: ["Setup in minutes", "GPS verified", "Export-ready", "Granular permissions"],
    },
    chaos: {
      title: "Goodbye to operational chaos",
      subtitle: "From spreadsheets and WhatsApp to a professional platform",
      before: "Before",
      after: "Now with StaflyApps",
      beforeItems: ["Scattered Excel sheets", "WhatsApp groups", "Phone calls", "Paper receipts"],
      afterItems: [
        { label: "Scheduling", desc: "Plan & assign in seconds" },
        { label: "Time", desc: "Clock-in/out with GPS" },
        { label: "Payroll", desc: "Automatic weekly calc" },
        { label: "Reports", desc: "Export with one click" },
      ],
    },
    modules: {
      title: "Everything you need",
      subtitle: "Modules designed for staffing operations",
      tabs: [
        { label: "Scheduling", icon: "calendar", title: "Shift scheduling", bullets: ["Weekly calendar with drag & drop", "Assign by client and location", "Copy week and conflict detection"] },
        { label: "Clock-in/out", icon: "clock", title: "Time tracking", bullets: ["Clock-in/out from mobile with GPS", "Location and device verification", "Break tracking and notes"] },
        { label: "Payroll", icon: "dollar", title: "Weekly payroll", bullets: ["Auto-calculate regular/overtime", "Adjustments: bonuses, deductions", "Controlled weekly close"] },
        { label: "Reports", icon: "chart", title: "Reports & export", bullets: ["Weekly payroll, hours by location", "Export to CSV and PDF", "Advanced filters and search"] },
        { label: "Admin", icon: "shield", title: "Permissions & admin", bullets: ["Roles: Owner, Admin, Manager, Employee", "Granular per-module permissions", "Complete audit log"] },
      ],
    },
    security: {
      title: "Control and traceability",
      subtitle: "Your data secure, always accessible",
      cards: [
        { icon: "lock", title: "Granular roles & permissions", desc: "Define exactly who can view, edit, or delete in each module." },
        { icon: "map", title: "GPS verification", desc: "Confirm employees are where they should be when clocking in." },
        { icon: "eye", title: "Audit log", desc: "Every action is logged: who, what, when, and from where." },
        { icon: "download", title: "Exports & backups", desc: "Export data anytime. Your information is always accessible." },
      ],
    },
    testimonials: {
      title: "What our clients say",
      items: [
        { name: "Maria González", role: "Director of Operations", company: "CleanPro Services", quote: "StaflyApps transformed our shift management. What used to take hours now happens in minutes.", rating: 5 },
        { name: "Carlos Rodríguez", role: "General Manager", company: "Spotless Group", quote: "GPS verification gave us total peace of mind. We know exactly where each employee is.", rating: 5 },
        { name: "Ana Martínez", role: "HR Manager", company: "BrightClean Co.", quote: "Automatic weekly payroll eliminated errors and disputes. Our team is happier.", rating: 5 },
      ],
    },
    pricing: {
      title: "Simple plans, no surprises",
      subtitle: "Choose the plan that fits your operation",
      plans: [
        { name: "Starter", price: "$—", period: "/mo", desc: "Up to 25 employees", features: ["Shifts & attendance", "Weekly payroll", "1 admin user", "Email support"], cta: "Start free" },
        { name: "Pro", price: "$—", period: "/mo", desc: "Up to 100 employees", features: ["Everything in Starter", "Multiple locations", "Roles & permissions", "CSV import", "Priority support"], cta: "Start free", recommended: true },
        { name: "Enterprise", price: "Custom", period: "", desc: "Unlimited employees", features: ["Everything in Pro", "API access", "SSO", "Dedicated onboarding", "SLA guaranteed"], cta: "Book a demo" },
      ],
    },
    finalCta: {
      h2: "Take your operation to the next level",
      sub: "Start free today. No credit card required.",
    },
    form: { name: "Name", company: "Company", email: "Email", phone: "Phone", employees: "# Employees", submit: "Book a demo" },
    footer: { privacy: "Privacy", terms: "Terms", contact: "Contact", portal: "Employee Portal" },
  },
};

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
      <Input placeholder={c.name} required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="h-11 !rounded-xl !border-[hsl(220,13%,87%)]" />
      <Input placeholder={c.company} required value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} className="h-11 !rounded-xl !border-[hsl(220,13%,87%)]" />
      <div className="grid grid-cols-2 gap-3">
        <Input placeholder={c.email} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="h-11 !rounded-xl !border-[hsl(220,13%,87%)]" />
        <Input placeholder={c.phone} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="h-11 !rounded-xl !border-[hsl(220,13%,87%)]" />
      </div>
      <Input placeholder={c.employees} value={form.employee_count} onChange={(e) => setForm({ ...form, employee_count: e.target.value })} className="h-11 !rounded-xl !border-[hsl(220,13%,87%)]" />
      <Button type="submit" className="w-full !rounded-xl h-12 text-base font-semibold !bg-[hsl(222,100%,59%)] !text-white hover:!bg-[hsl(222,100%,52%)] !shadow-[0_4px_14px_-3px_hsl(222,100%,59%/0.4)]" disabled={loading}>
        {loading ? "..." : c.submit} <Send className="ml-2 h-4 w-4" />
      </Button>
    </form>
  );
}

/* ───────── Icon Map ───────── */
const iconMap: Record<string, React.ReactNode> = {
  calendar: <CalendarDays className="h-5 w-5" />,
  clock: <Clock className="h-5 w-5" />,
  dollar: <DollarSign className="h-5 w-5" />,
  chart: <BarChart3 className="h-5 w-5" />,
  shield: <Shield className="h-5 w-5" />,
  lock: <Lock className="h-6 w-6" />,
  map: <MapPin className="h-6 w-6" />,
  eye: <Eye className="h-6 w-6" />,
  download: <Download className="h-6 w-6" />,
};

const chaosIcons = [CalendarDays, Clock, DollarSign, BarChart3];

/* ───────── Stats ───────── */
const stats = {
  es: [
    { value: "500+", label: "Empleados gestionados" },
    { value: "10k+", label: "Turnos asignados" },
    { value: "99.9%", label: "Uptime garantizado" },
  ],
  en: [
    { value: "500+", label: "Employees managed" },
    { value: "10k+", label: "Shifts assigned" },
    { value: "99.9%", label: "Guaranteed uptime" },
  ],
};

/* ─── Landing-scoped style overrides (avoids mutating global brutalist tokens) ─── */
const BLUE = "hsl(222, 100%, 59%)";
const BLUE_DARK = "hsl(226, 76%, 49%)";
const BLUE_LIGHT = "hsl(222, 100%, 96%)";
const BLUE_GLOW = "hsl(212, 100%, 73%)";

/* ───────── LANDING ───────── */
export default function Landing() {
  const [lang, setLang] = useState<"es" | "en">(() => {
    const nav = navigator.language?.slice(0, 2);
    return nav === "en" ? "en" : "es";
  });
  const c = i18n[lang];
  const [activeModule, setActiveModule] = useState(0);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="min-h-screen w-full bg-white text-[hsl(220,15%,15%)] overflow-x-clip" style={{ fontFamily: "var(--font-heading), system-ui, sans-serif" }}>
      {/* ── HEADER ── */}
      <header className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${scrolled ? "bg-white/90 backdrop-blur-xl shadow-[0_1px_3px_rgba(0,0,0,0.06)]" : "bg-transparent"}`}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between h-16">
          <StaflyMark size={36} />

          <nav className="hidden lg:flex items-center gap-8 text-sm font-medium text-[hsl(220,10%,50%)]">
            <a href="#producto" className="hover:text-[hsl(220,15%,15%)] transition-colors">{c.nav.product}</a>
            <a href="#modulos" className="hover:text-[hsl(220,15%,15%)] transition-colors">{c.nav.modules}</a>
            <a href="#precios" className="hover:text-[hsl(220,15%,15%)] transition-colors">{c.nav.pricing}</a>
            <a href="#seguridad" className="hover:text-[hsl(220,15%,15%)] transition-colors">{c.nav.security}</a>
          </nav>

          <div className="flex items-center gap-2">
            <button onClick={() => setLang(lang === "es" ? "en" : "es")} className="hidden sm:flex items-center gap-1 text-sm text-[hsl(220,10%,50%)] hover:text-[hsl(220,15%,15%)] px-2 py-1.5 rounded-lg hover:bg-[hsl(220,20%,96%)] transition-colors">
              <Globe className="h-4 w-4" />
              <span className="font-medium">{lang === "es" ? "EN" : "ES"}</span>
            </button>
            <Link to="/portal" className="hidden sm:inline-flex text-sm font-medium text-[hsl(220,10%,50%)] hover:text-[hsl(220,15%,15%)] px-3 py-1.5 rounded-lg hover:bg-[hsl(220,20%,96%)] transition-colors">
              {c.portal}
            </Link>
            <Link to="/auth" className="hidden sm:inline-flex text-sm font-medium text-[hsl(220,10%,50%)] hover:text-[hsl(220,15%,15%)] px-3 py-1.5 rounded-lg hover:bg-[hsl(220,20%,96%)] transition-colors">
              {c.login}
            </Link>
            <Dialog>
              <DialogTrigger asChild>
                <button className="rounded-full px-5 h-9 text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-[0.97]" style={{ background: `linear-gradient(135deg, ${BLUE}, ${BLUE_DARK})`, boxShadow: `0 4px 14px -3px hsl(222 100% 59% / 0.35)` }}>
                  {c.ctaPrimary}
                </button>
              </DialogTrigger>
              <DialogContent className="max-w-md !rounded-2xl">
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
            <div className="max-w-6xl mx-auto px-4 py-4 space-y-1">
              {[
                { href: "#producto", label: c.nav.product },
                { href: "#modulos", label: c.nav.modules },
                { href: "#precios", label: c.nav.pricing },
                { href: "#seguridad", label: c.nav.security },
              ].map(item => (
                <a key={item.href} href={item.href} onClick={() => setMobileMenu(false)} className="block text-sm font-medium py-2.5 px-3 rounded-lg hover:bg-[hsl(220,20%,96%)] transition-colors">{item.label}</a>
              ))}
              <Link to="/portal" onClick={() => setMobileMenu(false)} className="block text-sm font-medium py-2.5 px-3 rounded-lg hover:bg-[hsl(220,20%,96%)] transition-colors" style={{ color: BLUE }}>
                {c.portal}
              </Link>
              <Link to="/auth" onClick={() => setMobileMenu(false)} className="block text-sm font-medium py-2.5 px-3 rounded-lg hover:bg-[hsl(220,20%,96%)] transition-colors" style={{ color: BLUE }}>
                {c.login}
              </Link>
              <button onClick={() => { setLang(lang === "es" ? "en" : "es"); setMobileMenu(false); }} className="flex items-center gap-2 text-sm py-2.5 px-3 text-[hsl(220,10%,50%)] w-full rounded-lg hover:bg-[hsl(220,20%,96%)] transition-colors">
                <Globe className="h-4 w-4" /> {lang === "es" ? "English" : "Español"}
              </button>
            </div>
          </div>
        )}
      </header>

      {/* ── HERO ── */}
      <section className="relative pt-28 pb-10 sm:pt-36 sm:pb-16 overflow-hidden" id="producto">
        {/* Soft gradient background */}
        <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(ellipse 80% 60% at 50% 0%, ${BLUE_LIGHT}, transparent 70%)` }} />

        <div className="max-w-6xl mx-auto px-4 sm:px-6 relative">
          <div className="max-w-3xl mx-auto text-center">
            <span className="inline-flex items-center gap-2 text-xs font-semibold tracking-wide mb-5 px-3 py-1 rounded-full" style={{ color: BLUE, background: `hsl(222 100% 59% / 0.08)` }}>
              <Zap className="h-3.5 w-3.5" />
              {c.hero.eyebrow}
            </span>

            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-[1.1] text-[hsl(220,25%,10%)]">
              {c.hero.h1}
            </h1>
            <p className="mt-6 text-base sm:text-lg text-[hsl(220,10%,45%)] leading-relaxed max-w-2xl mx-auto">
              {c.hero.sub}
            </p>

            {/* CTAs */}
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Dialog>
                <DialogTrigger asChild>
                  <button className="inline-flex items-center rounded-full px-8 h-12 text-base font-semibold text-white transition-all hover:opacity-90 active:scale-[0.97]" style={{ background: `linear-gradient(135deg, ${BLUE}, ${BLUE_DARK})`, boxShadow: `0 6px 20px -4px hsl(222 100% 59% / 0.4)` }}>
                    {c.ctaPrimary} <ArrowRight className="ml-2 h-4 w-4" />
                  </button>
                </DialogTrigger>
                <DialogContent className="max-w-md !rounded-2xl">
                  <DialogHeader><DialogTitle>{c.ctaSecondary}</DialogTitle></DialogHeader>
                  <DemoForm lang={lang} />
                </DialogContent>
              </Dialog>
              <Dialog>
                <DialogTrigger asChild>
                  <button className="inline-flex items-center rounded-full h-12 px-8 text-base font-semibold border-2 transition-all hover:bg-[hsl(220,20%,96%)] active:scale-[0.97]" style={{ borderColor: "hsl(220,13%,86%)", color: "hsl(220,15%,25%)" }}>
                    {c.ctaSecondary} <ChevronRight className="ml-1 h-4 w-4" />
                  </button>
                </DialogTrigger>
                <DialogContent className="max-w-md !rounded-2xl">
                  <DialogHeader><DialogTitle>{c.ctaSecondary}</DialogTitle></DialogHeader>
                  <DemoForm lang={lang} />
                </DialogContent>
              </Dialog>
            </div>
            <p className="mt-4 text-sm text-[hsl(220,10%,55%)]">{c.ctaMicro}</p>

            {/* Badges */}
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {c.hero.badges.map((b, i) => (
                <span key={i} className="inline-flex items-center gap-1.5 text-xs font-medium text-[hsl(220,10%,45%)] bg-white border border-[hsl(220,13%,90%)] rounded-full px-3 py-1.5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                  <CheckCircle2 className="h-3.5 w-3.5 text-[hsl(163,68%,50%)]" /> {b}
                </span>
              ))}
            </div>
          </div>

          {/* Hero Dashboard Mockup */}
          <div className="mt-12 relative max-w-5xl mx-auto">
            <div className="absolute -inset-4 rounded-3xl blur-[40px] opacity-30" style={{ background: `linear-gradient(135deg, ${BLUE_GLOW}, transparent)` }} />
            <img
              src={heroDashboard}
              alt="StaflyApps Dashboard"
              className="relative w-full h-auto rounded-2xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.15)] border border-[hsl(220,13%,90%)]"
              loading="eager"
            />
          </div>
        </div>
      </section>

      {/* ── STATS BAR ── */}
      <section className="py-12 border-y border-[hsl(220,13%,93%)] bg-[hsl(220,30%,98%)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-3 gap-8 max-w-3xl mx-auto text-center">
            {stats[lang].map((s, i) => (
              <div key={i}>
                <div className="text-2xl sm:text-3xl font-extrabold" style={{ color: BLUE }}>{s.value}</div>
                <div className="text-xs sm:text-sm text-[hsl(220,10%,50%)] mt-1">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── GOODBYE TO CHAOS ── */}
      <section className="py-16 sm:py-24" id="caos">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-[hsl(220,25%,10%)]">{c.chaos.title}</h2>
            <p className="text-[hsl(220,10%,50%)] mt-2 text-sm">{c.chaos.subtitle}</p>
          </div>
          <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            {/* Before */}
            <div className="rounded-2xl border border-[hsl(0,60%,90%)] bg-[hsl(0,80%,98%)] p-6">
              <span className="text-xs font-bold tracking-wide text-[hsl(0,70%,55%)]">{c.chaos.before}</span>
              <div className="mt-5 space-y-3">
                {c.chaos.beforeItems.map((item, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm text-[hsl(220,10%,45%)]">
                    <div className="h-6 w-6 rounded-lg bg-[hsl(0,70%,93%)] flex items-center justify-center shrink-0">
                      <X className="h-3.5 w-3.5 text-[hsl(0,70%,55%)]" />
                    </div>
                    {item}
                  </div>
                ))}
              </div>
            </div>
            {/* After */}
            <div className="rounded-2xl border border-[hsl(163,50%,85%)] bg-[hsl(163,50%,97%)] p-6">
              <span className="text-xs font-bold tracking-wide text-[hsl(163,68%,40%)]">{c.chaos.after}</span>
              <div className="mt-5 grid grid-cols-2 gap-3">
                {c.chaos.afterItems.map((item, i) => {
                  const Icon = chaosIcons[i];
                  return (
                    <div key={i} className="bg-white rounded-xl border border-[hsl(220,13%,90%)] p-3.5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:-translate-y-0.5 transition-all">
                      <div className="h-8 w-8 rounded-lg flex items-center justify-center mb-2" style={{ background: `hsl(222 100% 59% / 0.1)` }}>
                        <Icon className="h-4 w-4" style={{ color: BLUE }} />
                      </div>
                      <p className="text-sm font-semibold text-[hsl(220,25%,10%)]">{item.label}</p>
                      <p className="text-[11px] text-[hsl(220,10%,50%)] mt-0.5">{item.desc}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── MODULES ── */}
      <section className="py-16 sm:py-24 bg-[hsl(220,30%,98%)] border-y border-[hsl(220,13%,93%)]" id="modulos">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-[hsl(220,25%,10%)]">{c.modules.title}</h2>
            <p className="text-[hsl(220,10%,50%)] mt-2 text-sm">{c.modules.subtitle}</p>
          </div>
          <div className="grid lg:grid-cols-[260px_1fr] gap-6 max-w-5xl mx-auto">
            <div className="flex lg:flex-col gap-2 overflow-x-auto lg:overflow-visible pb-2 lg:pb-0">
              {c.modules.tabs.map((tab, i) => (
                <button
                  key={i}
                  onClick={() => setActiveModule(i)}
                  className="flex items-center gap-3 text-left px-4 py-3 rounded-xl text-sm font-medium transition-all whitespace-nowrap"
                  style={activeModule === i
                    ? { background: BLUE, color: "white", boxShadow: `0 4px 14px -3px hsl(222 100% 59% / 0.3)` }
                    : { background: "white", border: "1px solid hsl(220,13%,90%)", color: "hsl(220,10%,45%)" }
                  }
                >
                  <span style={{ color: activeModule === i ? "white" : BLUE }}>
                    {iconMap[tab.icon]}
                  </span>
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="bg-white rounded-2xl border border-[hsl(220,13%,90%)] p-8 shadow-[0_1px_3px_rgba(0,0,0,0.04)]" key={activeModule}>
              <h3 className="text-xl font-bold mb-5 text-[hsl(220,25%,10%)]">{c.modules.tabs[activeModule].title}</h3>
              <ul className="space-y-3.5">
                {c.modules.tabs[activeModule].bullets.map((b, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm text-[hsl(220,10%,45%)]">
                    <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" style={{ color: BLUE }} /> {b}
                  </li>
                ))}
              </ul>
              <div className="mt-8 rounded-xl bg-[hsl(220,30%,98%)] border border-[hsl(220,13%,93%)] h-44 flex items-center justify-center">
                <div className="text-center">
                  <div className="h-12 w-12 rounded-xl flex items-center justify-center mx-auto mb-3" style={{ background: `hsl(222 100% 59% / 0.1)` }}>
                    <span style={{ color: BLUE }}>{iconMap[c.modules.tabs[activeModule].icon]}</span>
                  </div>
                  <span className="text-sm text-[hsl(220,10%,65%)]">{lang === "es" ? "Vista previa del módulo" : "Module preview"}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── SECURITY ── */}
      <section className="py-16 sm:py-24" id="seguridad">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-[hsl(220,25%,10%)]">{c.security.title}</h2>
            <p className="text-[hsl(220,10%,50%)] mt-2 text-sm">{c.security.subtitle}</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 max-w-5xl mx-auto">
            {c.security.cards.map((card, i) => (
              <div key={i} className="group bg-white rounded-2xl border border-[hsl(220,13%,90%)] p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:-translate-y-1 transition-all duration-300">
                <div className="h-12 w-12 rounded-xl flex items-center justify-center mb-4 transition-all duration-300" style={{ background: `hsl(222 100% 59% / 0.1)`, color: BLUE }}>
                  {iconMap[card.icon]}
                </div>
                <h3 className="font-semibold text-sm mb-2 text-[hsl(220,25%,10%)]">{card.title}</h3>
                <p className="text-xs text-[hsl(220,10%,50%)] leading-relaxed">{card.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS ── */}
      <section className="py-16 sm:py-24 bg-[hsl(220,30%,98%)] border-y border-[hsl(220,13%,93%)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-[hsl(220,25%,10%)]">{c.testimonials.title}</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {c.testimonials.items.map((t, i) => (
              <div key={i} className="bg-white rounded-2xl border border-[hsl(220,13%,90%)] p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:-translate-y-0.5 transition-all">
                <div className="flex gap-0.5 mb-4">
                  {Array.from({ length: t.rating }).map((_, j) => (
                    <Star key={j} className="h-4 w-4 fill-[hsl(36,100%,56%)] text-[hsl(36,100%,56%)]" />
                  ))}
                </div>
                <p className="text-sm text-[hsl(220,10%,45%)] leading-relaxed mb-6">"{t.quote}"</p>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0" style={{ background: `linear-gradient(135deg, ${BLUE}, ${BLUE_DARK})` }}>
                    {t.name.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[hsl(220,25%,10%)] truncate">{t.name}</p>
                    <p className="text-xs text-[hsl(220,10%,50%)] truncate">{t.role}, {t.company}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRICING ── */}
      <section id="precios" className="py-16 sm:py-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-[hsl(220,25%,10%)]">{c.pricing.title}</h2>
            <p className="text-[hsl(220,10%,50%)] mt-2 text-sm">{c.pricing.subtitle}</p>
          </div>
          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto items-start">
            {c.pricing.plans.map((plan, i) => (
              <div key={i} className={`bg-white rounded-2xl border p-7 relative transition-all ${(plan as any).recommended ? "border-[hsl(222,100%,59%)] ring-2 ring-[hsl(222,100%,59%/0.1)] shadow-[0_8px_30px_-6px_hsl(222,100%,59%/0.15)] scale-[1.02]" : "border-[hsl(220,13%,90%)] shadow-[0_1px_3px_rgba(0,0,0,0.04)]"}`}>
                {(plan as any).recommended && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-white text-[11px] font-semibold px-3 py-0.5 rounded-full" style={{ background: `linear-gradient(135deg, ${BLUE}, ${BLUE_DARK})` }}>
                    {lang === "es" ? "Recomendado" : "Recommended"}
                  </span>
                )}
                <h3 className="font-bold text-xl mb-1 text-[hsl(220,25%,10%)]">{plan.name}</h3>
                <p className="text-sm text-[hsl(220,10%,50%)] mb-5">{plan.desc}</p>
                <div className="flex items-baseline gap-1 mb-6">
                  <span className="text-3xl font-extrabold text-[hsl(220,25%,10%)]">{plan.price}</span>
                  <span className="text-[hsl(220,10%,50%)] text-sm">{plan.period}</span>
                </div>
                <ul className="space-y-2.5 mb-7">
                  {plan.features.map((f, j) => (
                    <li key={j} className="flex items-center gap-2.5 text-sm text-[hsl(220,10%,45%)]">
                      <CheckCircle2 className="h-4 w-4 text-[hsl(163,68%,50%)] shrink-0" /> {f}
                    </li>
                  ))}
                </ul>
                <Dialog>
                  <DialogTrigger asChild>
                    <button
                      className={`w-full rounded-xl h-11 font-semibold text-sm transition-all active:scale-[0.97] ${(plan as any).recommended ? "text-white" : "border-2 border-[hsl(220,13%,86%)] text-[hsl(220,15%,25%)] hover:bg-[hsl(220,20%,96%)]"}`}
                      style={(plan as any).recommended ? { background: `linear-gradient(135deg, ${BLUE}, ${BLUE_DARK})`, boxShadow: `0 4px 14px -3px hsl(222 100% 59% / 0.3)` } : undefined}
                    >
                      {plan.cta}
                    </button>
                  </DialogTrigger>
                  <DialogContent className="max-w-md !rounded-2xl">
                    <DialogHeader><DialogTitle>{c.ctaSecondary}</DialogTitle></DialogHeader>
                    <DemoForm lang={lang} />
                  </DialogContent>
                </Dialog>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section className="py-16 sm:py-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="relative rounded-3xl p-10 sm:p-16 overflow-hidden max-w-5xl mx-auto" style={{ background: `linear-gradient(135deg, ${BLUE}, ${BLUE_DARK})` }}>
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.12),transparent_50%)]" />
            <div className="absolute bottom-0 right-0 w-60 h-60 bg-white/5 rounded-full blur-3xl" />
            <div className="relative flex flex-col md:flex-row items-center gap-10">
              <div className="flex-1 text-center md:text-left">
                <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white tracking-tight leading-tight">
                  {c.finalCta.h2}
                </h2>
                <p className="mt-3 text-white/75 text-base">{c.finalCta.sub}</p>
                <div className="mt-7 flex flex-col sm:flex-row items-center md:items-start gap-3">
                  <Dialog>
                    <DialogTrigger asChild>
                      <button className="inline-flex items-center rounded-xl px-8 h-12 bg-white font-semibold shadow-lg transition-all hover:bg-white/90 active:scale-[0.97]" style={{ color: BLUE }}>
                        {c.ctaPrimary} <ArrowRight className="ml-2 h-4 w-4" />
                      </button>
                    </DialogTrigger>
                    <DialogContent className="max-w-md !rounded-2xl">
                      <DialogHeader><DialogTitle>{c.ctaSecondary}</DialogTitle></DialogHeader>
                      <DemoForm lang={lang} />
                    </DialogContent>
                  </Dialog>
                  <Dialog>
                    <DialogTrigger asChild>
                      <button className="inline-flex items-center rounded-xl h-12 px-8 border-2 border-white/50 text-white hover:bg-white/15 font-semibold backdrop-blur-sm transition-all active:scale-[0.97]">
                        {c.ctaSecondary}
                      </button>
                    </DialogTrigger>
                    <DialogContent className="max-w-md !rounded-2xl">
                      <DialogHeader><DialogTitle>{c.ctaSecondary}</DialogTitle></DialogHeader>
                      <DemoForm lang={lang} />
                    </DialogContent>
                  </Dialog>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="border-t border-[hsl(220,13%,93%)] py-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
            <StaflyLogo size={28} />
            <div className="flex items-center gap-6 text-sm text-[hsl(220,10%,50%)]">
              <Link to="/portal" className="hover:text-[hsl(220,15%,15%)] transition-colors font-medium" style={{ color: BLUE }}>{c.footer.portal}</Link>
              <Link to="/privacy" className="hover:text-[hsl(220,15%,15%)] transition-colors">{c.footer.privacy}</Link>
              <Link to="/terms" className="hover:text-[hsl(220,15%,15%)] transition-colors">{c.footer.terms}</Link>
              <Link to="/help" className="hover:text-[hsl(220,15%,15%)] transition-colors">{c.footer.contact}</Link>
            </div>
            <p className="text-sm text-[hsl(220,10%,55%)]">
              © {new Date().getFullYear()} StaflyApps
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
