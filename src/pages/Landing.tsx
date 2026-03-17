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
  LayoutDashboard, FileText, Star,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { StaflyLogo, StaflyMark } from "@/components/brand/StaflyBrand";
import heroDashboard from "@/assets/stafly-hero-dashboard.png";
import demoDashboard from "@/assets/demo/demo-dashboard.jpg";
import demoShifts from "@/assets/demo/demo-shifts.jpg";
import demoEmployees from "@/assets/demo/demo-employees.jpg";
import demoReports from "@/assets/demo/demo-reports.jpg";
import demoMobile from "@/assets/demo/demo-mobile.jpg";

/* ───────── i18n ───────── */
const i18n = {
  es: {
    nav: { product: "Inicio", features: "Funciones", pricing: "Precios", contact: "Contacto" },
    login: "Iniciar sesión",
    portal: "Portal empleados",
    ctaPrimary: "Comienza ahora",
    ctaSecondary: "Agendar demo",
    ctaMicro: "Sin tarjeta · Setup en minutos · Cancela cuando quieras",
    hero: {
      badge: "Gestión de personal inteligente",
      h1: "Gestión de personal\ninteligente",
      sub: "Turnos y pagos en un solo lugar. Programa, registra asistencia con GPS, controla nómina semanal y genera reportes automáticamente.",
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
        { icon: "calendar", title: "Programación de turnos simplificada", desc: "Gestión a la medida de tu personal, programa turnos y controla la asistencia en tiempo real." },
        { icon: "clock", title: "Control de horarios y asistentes", desc: "Control de horarios y asistencia en tiempo real. Gestión eficiente con reportes automáticos." },
        { icon: "dollar", title: "Pagos y nómina automatizados", desc: "Controla horas trabajadas, calcula pagos y genera nóminas semanales automáticamente." },
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
    testimonial: {
      quote: "StaflyApps nos ha permitido optimizar la programación de turnos y gestionar horarios de manera eficiente. Ahorramos tiempo y mejoramos la productividad.",
      name: "Laura Torres",
      role: "Gerencia de Recursos Humanos",
    },
    finalCta: {
      h2: "Empieza a organizar tu equipo hoy.",
      sub: "Configura tu cuenta en minutos y comienza a controlar turnos, asistencia y reportes.",
    },
    form: { name: "Nombre", company: "Empresa", email: "Email", phone: "Teléfono", employees: "# Empleados", submit: "Agendar demo" },
    footer: { product: "Producto", pricing: "Precios", demo: "Demo", contact: "Contacto", portal: "Portal empleados", privacy: "Privacidad", terms: "Términos" },
  },
  en: {
    nav: { product: "Home", features: "Features", pricing: "Pricing", contact: "Contact" },
    login: "Sign in",
    portal: "Employee portal",
    ctaPrimary: "Get started",
    ctaSecondary: "Book a demo",
    ctaMicro: "No card required · Setup in minutes · Cancel anytime",
    hero: {
      badge: "Smart workforce management",
      h1: "Smart workforce\nmanagement",
      sub: "Shifts and payments in one place. Schedule, track attendance with GPS, manage weekly payroll and generate reports automatically.",
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
        { icon: "calendar", title: "Simplified shift scheduling", desc: "Custom workforce management. Schedule shifts and control attendance in real time." },
        { icon: "clock", title: "Time & attendance control", desc: "Real-time schedule and attendance tracking. Efficient management with automatic reports." },
        { icon: "dollar", title: "Automated payroll", desc: "Track hours, calculate payments and generate weekly payroll automatically." },
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
    testimonial: {
      quote: "StaflyApps has allowed us to optimize shift scheduling and manage schedules efficiently. We save time and improve productivity.",
      name: "Laura Torres",
      role: "HR Management",
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
  calendar: <CalendarDays className="h-6 w-6" />,
  clock: <Clock className="h-6 w-6" />,
  dollar: <DollarSign className="h-6 w-6" />,
  chart: <BarChart3 className="h-6 w-6" />,
  shield: <Shield className="h-6 w-6" />,
  mapPin: <MapPin className="h-6 w-6" />,
  smartphone: <Smartphone className="h-6 w-6" />,
  lock: <Lock className="h-6 w-6" />,
  eye: <Eye className="h-6 w-6" />,
  download: <Download className="h-6 w-6" />,
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
      <Input placeholder={c.name} required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="h-11 rounded-xl" />
      <Input placeholder={c.company} required value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} className="h-11 rounded-xl" />
      <div className="grid grid-cols-2 gap-3">
        <Input placeholder={c.email} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="h-11 rounded-xl" />
        <Input placeholder={c.phone} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="h-11 rounded-xl" />
      </div>
      <Input placeholder={c.employees} value={form.employee_count} onChange={(e) => setForm({ ...form, employee_count: e.target.value })} className="h-11 rounded-xl" />
      <Button type="submit" disabled={loading} className="w-full h-12 text-base" variant="pill">
        {loading ? "..." : c.submit} <Send className="h-4 w-4" />
      </Button>
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
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            {lang === "es" ? "Explora la plataforma" : "Explore the platform"}
          </h2>
          <p className="mt-3 text-[15px] text-muted-foreground">
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
                    ? "bg-primary text-primary-foreground shadow-primary-glow"
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
        <div className="relative rounded-2xl overflow-hidden border border-border shadow-xl">
          <div className="bg-muted/30 border-b border-border px-4 py-2.5 flex items-center gap-2">
            <div className="flex gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-destructive/60" />
              <span className="h-2.5 w-2.5 rounded-full bg-warning/60" />
              <span className="h-2.5 w-2.5 rounded-full bg-success/60" />
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
    <div className="min-h-screen w-full overflow-x-hidden bg-background text-foreground" style={{ fontFamily: "var(--font-heading), system-ui, sans-serif" }}>

      {/* ── HEADER ── */}
      <header className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${scrolled ? "bg-card/90 backdrop-blur-xl shadow-sm border-b border-border/40" : "bg-transparent"}`}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between h-16">
          <StaflyLogo size={28} />

          <nav className="hidden lg:flex items-center gap-8 text-[13px] font-medium text-muted-foreground">
            <a href="#producto" className="hover:text-foreground transition-colors">{c.nav.product}</a>
            <a href="#features" className="hover:text-foreground transition-colors">{c.nav.features}</a>
            <a href="#precios" className="hover:text-foreground transition-colors">{c.nav.pricing}</a>
            <a href="#contacto" className="hover:text-foreground transition-colors">{c.nav.contact}</a>
          </nav>

          <div className="flex items-center gap-2">
            <button onClick={() => setLang(lang === "es" ? "en" : "es")} className="hidden sm:flex items-center gap-1 text-[13px] px-2.5 py-1.5 rounded-lg hover:bg-accent transition-colors text-muted-foreground">
              <Globe className="h-3.5 w-3.5" />
              <span className="font-medium">{lang === "es" ? "EN" : "ES"}</span>
            </button>
            <Link to="/auth" className="hidden sm:inline-flex text-[13px] font-medium px-3 py-1.5 rounded-lg hover:bg-accent transition-colors text-muted-foreground">
              {c.login}
            </Link>
            <Link
              to="/auth?register=true"
              className="rounded-full px-5 h-9 text-[13px] font-semibold text-primary-foreground bg-primary hover:bg-primary-dark shadow-primary-glow transition-all active:scale-[0.97] inline-flex items-center"
            >
              {c.ctaPrimary}
            </Link>
            <button className="lg:hidden p-2 rounded-lg hover:bg-accent transition-colors" onClick={() => setMobileMenu(!mobileMenu)}>
              {mobileMenu ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {mobileMenu && (
          <div className="lg:hidden bg-card/95 backdrop-blur-xl border-t border-border/40">
            <div className="max-w-6xl mx-auto px-4 py-3 space-y-1">
              {[
                { href: "#producto", label: c.nav.product },
                { href: "#features", label: c.nav.features },
                { href: "#precios", label: c.nav.pricing },
                { href: "#contacto", label: c.nav.contact },
              ].map(item => (
                <a key={item.href} href={item.href} onClick={() => setMobileMenu(false)} className="block text-sm font-medium py-2.5 px-3 rounded-lg hover:bg-accent transition-colors">{item.label}</a>
              ))}
              <Link to="/portal" onClick={() => setMobileMenu(false)} className="block text-sm font-medium py-2.5 px-3 rounded-lg hover:bg-accent text-primary">{c.portal}</Link>
              <Link to="/auth" onClick={() => setMobileMenu(false)} className="block text-sm font-medium py-2.5 px-3 rounded-lg hover:bg-accent text-primary">{c.login}</Link>
              <button onClick={() => { setLang(lang === "es" ? "en" : "es"); setMobileMenu(false); }} className="flex items-center gap-2 text-sm py-2.5 px-3 w-full rounded-lg hover:bg-accent text-muted-foreground">
                <Globe className="h-4 w-4" /> {lang === "es" ? "English" : "Español"}
              </button>
            </div>
          </div>
        )}
      </header>

      {/* ── HERO ── */}
      <section className="relative pt-28 pb-12 sm:pt-36 sm:pb-20" id="producto">
        {/* Soft radial glow */}
        <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse 70% 50% at 50% 0%, hsl(210 100% 95%), transparent 70%)" }} />

        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 text-center">
          {/* Badge */}
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold tracking-wide mb-6 px-3.5 py-1.5 rounded-full bg-primary/[0.07] text-primary">
            <Zap className="h-3.5 w-3.5" />
            {c.hero.badge}
          </span>

          {/* Headline */}
          <h1 className="text-[32px] sm:text-5xl lg:text-[58px] font-extrabold tracking-tight leading-[1.1] whitespace-pre-line text-foreground">
            {c.hero.h1}
          </h1>

          {/* Subheadline */}
          <p className="mt-5 sm:mt-6 text-base sm:text-lg leading-relaxed max-w-2xl mx-auto text-muted-foreground">
            {c.hero.sub}
          </p>

          {/* CTAs */}
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              to="/auth?register=true"
              className="inline-flex items-center gap-2 rounded-full px-7 h-12 text-[15px] font-semibold text-primary-foreground bg-primary hover:bg-primary-dark shadow-primary-glow transition-all active:scale-[0.97]"
            >
              {c.ctaPrimary} <ArrowRight className="h-4 w-4" />
            </Link>
            <Dialog>
              <DialogTrigger asChild>
                <button className="inline-flex items-center gap-1.5 rounded-full h-12 px-7 text-[15px] font-semibold border border-border hover:bg-accent transition-all active:scale-[0.97] text-foreground">
                  {c.ctaSecondary} <ChevronRight className="h-4 w-4" />
                </button>
              </DialogTrigger>
              <DialogContent className="max-w-md rounded-2xl">
                <DialogHeader><DialogTitle>{c.ctaSecondary}</DialogTitle></DialogHeader>
                <DemoForm lang={lang} />
              </DialogContent>
            </Dialog>
          </div>

          <p className="mt-4 text-xs text-muted-foreground">{c.ctaMicro}</p>
        </div>

        {/* Dashboard mockup */}
        <div className="relative max-w-5xl mx-auto mt-14 px-4 sm:px-6">
          <div className="rounded-2xl overflow-hidden border border-border shadow-2xl">
            <img
              src={heroDashboard}
              alt="StaflyApps Dashboard"
              className="w-full h-auto block"
              loading="eager"
            />
          </div>
        </div>
      </section>

      {/* ── BENEFITS (3 feature cards like reference) ── */}
      <section className="py-16 sm:py-24 bg-accent/30" id="features">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-center text-foreground">
            {c.benefits.title}
          </h2>
          <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {c.benefits.cards.map((card, i) => (
              <div key={i} className="bg-card rounded-2xl border border-border p-7 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300">
                <div className="h-12 w-12 rounded-xl flex items-center justify-center mb-5 bg-primary/[0.08] text-primary">
                  {iconComponents[card.icon]}
                </div>
                <h3 className="font-semibold text-base mb-2 text-foreground">{card.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{card.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PROBLEM ── */}
      <section className="py-16 sm:py-24">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            {c.problem.title}
          </h2>
          <div className="mt-6 space-y-4 text-[15px] leading-relaxed text-muted-foreground">
            <p>{c.problem.p1}</p>
            <p>{c.problem.p2}</p>
            <p className="font-semibold text-primary">{c.problem.p3}</p>
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="py-16 sm:py-24 bg-accent/30">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-center text-foreground">
            {c.howItWorks.title}
          </h2>
          <div className="mt-12 grid md:grid-cols-3 gap-8">
            {c.howItWorks.steps.map((step, i) => (
              <div key={i} className="text-center">
                <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl text-xl font-bold mb-5 bg-primary/[0.08] text-primary">
                  {step.num}
                </div>
                <h3 className="font-semibold text-base mb-2 text-foreground">{step.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── AUDIENCE ── */}
      <section className="py-16 sm:py-24">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            {c.audience.title}
          </h2>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            {c.audience.chips.map((chip, i) => {
              const Icon = audienceIcons[i];
              return (
                <span key={i} className="inline-flex items-center gap-2 text-sm font-medium px-4 py-2.5 rounded-full border border-border bg-card shadow-2xs text-foreground">
                  <Icon className="h-4 w-4 text-primary" /> {chip}
                </span>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── INTERACTIVE DEMO ── */}
      <InteractiveDemo lang={lang} />

      {/* ── CAPABILITIES ── */}
      <section className="py-16 sm:py-24 bg-accent/30">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-center text-foreground">
            {c.capabilities.title}
          </h2>
          <div className="mt-10 grid sm:grid-cols-2 gap-x-8 gap-y-4 max-w-2xl mx-auto">
            {c.capabilities.items.map((item, i) => (
              <div key={i} className="flex items-center gap-3 py-2">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />
                <span className="text-sm font-medium text-foreground">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TESTIMONIAL ── */}
      <section className="py-16 sm:py-24">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <div className="flex justify-center gap-1 mb-4">
            {[...Array(5)].map((_, i) => (
              <Star key={i} className="h-5 w-5 text-warning fill-warning" />
            ))}
          </div>
          <blockquote className="text-lg sm:text-xl font-medium leading-relaxed text-foreground italic">
            "{c.testimonial.quote}"
          </blockquote>
          <div className="mt-6">
            <p className="font-semibold text-foreground">{c.testimonial.name}</p>
            <p className="text-sm text-muted-foreground">{c.testimonial.role}</p>
          </div>
        </div>
      </section>

      {/* ── TRUST ── */}
      <section className="py-16 sm:py-24 bg-accent/30">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            {c.trust.title}
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">
            {c.trust.sub}
          </p>
          <div className="mt-6 flex items-center justify-center gap-6">
            <span className="text-sm font-semibold text-foreground">{c.trust.p1}</span>
            <span className="h-4 w-px bg-border" />
            <span className="text-sm font-semibold text-foreground">{c.trust.p2}</span>
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section className="py-16 sm:py-24" id="precios">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="rounded-3xl px-6 py-14 sm:px-14 sm:py-20 text-center gradient-primary">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-primary-foreground tracking-tight leading-tight">
              {c.finalCta.h2}
            </h2>
            <p className="mt-4 text-primary-foreground/75 text-[15px] max-w-xl mx-auto">{c.finalCta.sub}</p>

            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link
                to="/auth?register=true"
                className="inline-flex items-center gap-2 rounded-full px-7 h-12 bg-card font-semibold text-[15px] shadow-lg transition-all hover:bg-card/90 active:scale-[0.97] text-primary"
              >
                {c.ctaPrimary} <ArrowRight className="h-4 w-4" />
              </Link>
              <Dialog>
                <DialogTrigger asChild>
                  <button className="inline-flex items-center gap-1.5 rounded-full h-12 px-7 border border-primary-foreground/40 text-primary-foreground hover:bg-primary-foreground/10 font-semibold text-[15px] transition-all active:scale-[0.97]">
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
      <footer className="border-t border-border py-12" id="contacto">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
            <StaflyLogo size={26} />
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px] text-muted-foreground">
              <a href="#producto" className="hover:text-foreground transition-colors">{c.footer.product}</a>
              <a href="#precios" className="hover:text-foreground transition-colors">{c.footer.pricing}</a>
              <Link to="/portal" className="font-medium hover:text-foreground transition-colors text-primary">{c.footer.portal}</Link>
              <Link to="/help" className="hover:text-foreground transition-colors">{c.footer.contact}</Link>
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
