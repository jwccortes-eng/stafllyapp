import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  CalendarDays, DollarSign, Users, Clock, BarChart3, Shield,
  ArrowRight, CheckCircle2, Globe, MapPin,
  Send, Menu, X, ChevronRight, Smartphone,
  Building2, Utensils, HardHat, Briefcase,
  LayoutDashboard, FileText, Star, Upload, UserCog,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { StaflyLogo, StaflyMark } from "@/components/brand/StaflyBrand";
import heroDashboard from "@/assets/hero-dashboard-premium.png";
import demoDashboard from "@/assets/demo/demo-dashboard.jpg";
import demoShifts from "@/assets/demo/demo-shifts.jpg";
import demoEmployees from "@/assets/demo/demo-employees.jpg";
import demoReports from "@/assets/demo/demo-reports.jpg";
import demoMobile from "@/assets/demo/demo-mobile.jpg";

/* ───────── i18n ───────── */
const i18n = {
  es: {
    nav: { features: "Funciones", pricing: "Precios", howItWorks: "Cómo funciona" },
    login: "Iniciar sesión",
    ctaPrimary: "Comienza gratis",
    ctaHero: "Comienza ahora",
    ctaPortal: "Acceso empleados",
    hero: {
      badge: "Plataforma de gestión de personal",
      h1_1: "Gestión de personal",
      h1_2: "inteligente",
      sub: "Turnos, horarios y pagos en un solo lugar. Simplifica la operación de tu equipo con herramientas diseñadas para empresas que crecen.",
      pills: ["Sin tarjeta de crédito", "Setup en 5 min"],
    },
    features: {
      title: "Todo lo que necesitas para gestionar tu equipo",
      sub: "Herramientas potentes y fáciles de usar que transforman la forma en que administras tu personal.",
      cards: [
        { icon: "calendar", title: "Programación de Turnos", desc: "Crea y asigna turnos en segundos con vista semanal. Notifica a tu equipo automáticamente." },
        { icon: "clock", title: "Control de Horarios", desc: "Registro de entrada/salida con geolocalización, PIN o código QR. Todo en tiempo real." },
        { icon: "dollar", title: "Pagos Automatizados", desc: "Calcula horas trabajadas, horas extra y genera reportes de nómina al instante." },
        { icon: "users", title: "Gestión de Personal", desc: "Perfiles completos, grupos, tags y búsqueda avanzada para organizar tu equipo." },
        { icon: "shield", title: "Roles y Permisos", desc: "Control granular de acceso por rol: owner, admin, supervisor y worker." },
        { icon: "upload", title: "Importación Masiva", desc: "Importa cientos de empleados desde Excel en minutos con mapeo automático de columnas." },
      ],
    },
    howItWorks: {
      title: "Cómo funciona",
      sub: "Empieza a gestionar tu equipo en tres pasos simples.",
      steps: [
        { title: "Crea tu cuenta", desc: "Regístrate gratis y configura tu empresa en menos de 5 minutos." },
        { title: "Agrega tu equipo", desc: "Importa empleados desde Excel o agrégalos manualmente con PIN de acceso." },
        { title: "¡Listo!", desc: "Programa turnos, controla asistencia y genera reportes automáticamente." },
      ],
    },
    pricing: {
      title: "Planes para cada etapa de tu negocio",
      sub: "Empieza gratis y escala cuando lo necesites. Sin contratos ni sorpresas.",
      popular: "Más popular",
      plans: [
        {
          name: "Free",
          desc: "Ideal para equipos pequeños que están empezando.",
          price: "$0",
          period: "para siempre",
          features: ["Hasta 10 empleados", "Turnos ilimitados", "Control de asistencia", "Reportes básicos", "Soporte por email"],
          cta: "Comienza gratis",
          highlighted: false,
        },
        {
          name: "Pro",
          desc: "Para empresas en crecimiento que necesitan más control.",
          price: "$29",
          period: "/mes",
          features: ["Hasta 100 empleados", "Todo de Free", "Importación masiva", "Roles y permisos", "Geolocalización", "Soporte prioritario"],
          cta: "Prueba 14 días gratis",
          highlighted: true,
        },
        {
          name: "Enterprise",
          desc: "Para operaciones grandes con necesidades específicas.",
          price: "Custom",
          period: "",
          features: ["Empleados ilimitados", "Todo de Pro", "API & Webhooks", "SSO / SAML", "SLA garantizado", "Account manager dedicado"],
          cta: "Contactar ventas",
          highlighted: false,
        },
      ],
    },
    testimonial: {
      quote: "Staflyapps nos ha permitido optimizar la programación de turnos y controlar horarios, ahorrando tiempo y mejorando la productividad.",
      name: "Laura Torres",
      role: "Coordinadora de Eventos pro Hostess",
    },
    finalCta: {
      title: "¿Listo para simplificar la gestión de tu equipo?",
      sub: "Únete a empresas que ya confían en Staflyapps para gestionar su personal de forma inteligente.",
      cta: "Comienza gratis ahora",
    },
    footer: { product: "Producto", pricing: "Precios", portal: "Portal empleados", contact: "Contacto", privacy: "Privacidad", terms: "Términos" },
  },
  en: {
    nav: { features: "Features", pricing: "Pricing", howItWorks: "How it works" },
    login: "Sign in",
    ctaPrimary: "Start free",
    ctaHero: "Get started",
    ctaPortal: "Employee access",
    hero: {
      badge: "Workforce management platform",
      h1_1: "Smart workforce",
      h1_2: "management",
      sub: "Shifts, schedules and payments in one place. Simplify your team operations with tools built for growing businesses.",
      pills: ["No credit card", "Setup in 5 min"],
    },
    features: {
      title: "Everything you need to manage your team",
      sub: "Powerful and easy-to-use tools that transform the way you manage your staff.",
      cards: [
        { icon: "calendar", title: "Shift Scheduling", desc: "Create and assign shifts in seconds with weekly view. Notify your team automatically." },
        { icon: "clock", title: "Time Tracking", desc: "Clock in/out with geolocation, PIN or QR code. Everything in real time." },
        { icon: "dollar", title: "Automated Payroll", desc: "Calculate hours worked, overtime and generate payroll reports instantly." },
        { icon: "users", title: "Staff Management", desc: "Complete profiles, groups, tags and advanced search to organize your team." },
        { icon: "shield", title: "Roles & Permissions", desc: "Granular access control by role: owner, admin, supervisor and worker." },
        { icon: "upload", title: "Bulk Import", desc: "Import hundreds of employees from Excel in minutes with automatic column mapping." },
      ],
    },
    howItWorks: {
      title: "How it works",
      sub: "Start managing your team in three simple steps.",
      steps: [
        { title: "Create your account", desc: "Sign up free and set up your company in less than 5 minutes." },
        { title: "Add your team", desc: "Import employees from Excel or add them manually with access PIN." },
        { title: "You're set!", desc: "Schedule shifts, track attendance and generate reports automatically." },
      ],
    },
    pricing: {
      title: "Plans for every stage of your business",
      sub: "Start free and scale when you need to. No contracts, no surprises.",
      popular: "Most popular",
      plans: [
        {
          name: "Free",
          desc: "Ideal for small teams just getting started.",
          price: "$0",
          period: "forever",
          features: ["Up to 10 employees", "Unlimited shifts", "Attendance tracking", "Basic reports", "Email support"],
          cta: "Start free",
          highlighted: false,
        },
        {
          name: "Pro",
          desc: "For growing companies that need more control.",
          price: "$29",
          period: "/mo",
          features: ["Up to 100 employees", "Everything in Free", "Bulk import", "Roles & permissions", "Geolocation", "Priority support"],
          cta: "Try 14 days free",
          highlighted: true,
        },
        {
          name: "Enterprise",
          desc: "For large operations with specific needs.",
          price: "Custom",
          period: "",
          features: ["Unlimited employees", "Everything in Pro", "API & Webhooks", "SSO / SAML", "Guaranteed SLA", "Dedicated account manager"],
          cta: "Contact sales",
          highlighted: false,
        },
      ],
    },
    testimonial: {
      quote: "Staflyapps has allowed us to optimize shift scheduling and control schedules, saving time and improving productivity.",
      name: "Laura Torres",
      role: "Events Coordinator at pro Hostess",
    },
    finalCta: {
      title: "Ready to simplify your team management?",
      sub: "Join companies that already trust Staflyapps to manage their staff intelligently.",
      cta: "Start free now",
    },
    footer: { product: "Product", pricing: "Pricing", portal: "Employee portal", contact: "Contact", privacy: "Privacy", terms: "Terms" },
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

/* ───────── Demo Form ───────── */
function DemoForm({ lang }: { lang: "es" | "en" }) {
  const labels = lang === "es"
    ? { name: "Nombre", company: "Empresa", email: "Email", phone: "Teléfono", employees: "# Empleados", submit: "Agendar demo" }
    : { name: "Name", company: "Company", email: "Email", phone: "Phone", employees: "# Employees", submit: "Book a demo" };
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
      <Input placeholder={labels.name} required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="h-11 rounded-xl" />
      <Input placeholder={labels.company} required value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} className="h-11 rounded-xl" />
      <div className="grid grid-cols-2 gap-3">
        <Input placeholder={labels.email} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="h-11 rounded-xl" />
        <Input placeholder={labels.phone} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="h-11 rounded-xl" />
      </div>
      <Input placeholder={labels.employees} value={form.employee_count} onChange={(e) => setForm({ ...form, employee_count: e.target.value })} className="h-11 rounded-xl" />
      <Button type="submit" disabled={loading} className="w-full h-12 text-base" variant="pill">
        {loading ? "..." : labels.submit} <Send className="h-4 w-4" />
      </Button>
    </form>
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
            <a href="#funciones" className="hover:text-foreground transition-colors">{c.nav.features}</a>
            <a href="#precios" className="hover:text-foreground transition-colors">{c.nav.pricing}</a>
            <a href="#como-funciona" className="hover:text-foreground transition-colors">{c.nav.howItWorks}</a>
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
              className="rounded-full px-5 h-9 text-[13px] font-semibold text-primary-foreground bg-primary hover:bg-primary/90 shadow-primary-glow transition-all active:scale-[0.97] inline-flex items-center"
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
              <a href="#funciones" onClick={() => setMobileMenu(false)} className="block text-sm font-medium py-2.5 px-3 rounded-lg hover:bg-accent transition-colors">{c.nav.features}</a>
              <a href="#precios" onClick={() => setMobileMenu(false)} className="block text-sm font-medium py-2.5 px-3 rounded-lg hover:bg-accent transition-colors">{c.nav.pricing}</a>
              <a href="#como-funciona" onClick={() => setMobileMenu(false)} className="block text-sm font-medium py-2.5 px-3 rounded-lg hover:bg-accent transition-colors">{c.nav.howItWorks}</a>
              <Link to="/auth" onClick={() => setMobileMenu(false)} className="block text-sm font-medium py-2.5 px-3 rounded-lg hover:bg-accent text-primary">{c.login}</Link>
              <button onClick={() => { setLang(lang === "es" ? "en" : "es"); setMobileMenu(false); }} className="flex items-center gap-2 text-sm py-2.5 px-3 w-full rounded-lg hover:bg-accent text-muted-foreground">
                <Globe className="h-4 w-4" /> {lang === "es" ? "English" : "Español"}
              </button>
            </div>
          </div>
        )}
      </header>

      {/* ── HERO (Split layout) ── */}
      <section className="relative pt-28 pb-12 sm:pt-36 sm:pb-20">
        <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse 70% 50% at 50% 0%, hsl(210 100% 95%), transparent 70%)" }} />

        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 grid lg:grid-cols-2 gap-12 items-center">
          {/* Left – Text */}
          <div>
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold tracking-wide mb-6 px-3.5 py-1.5 rounded-full bg-primary/[0.07] text-primary">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {c.hero.badge}
            </span>

            <h1 className="text-[32px] sm:text-5xl lg:text-[54px] font-extrabold tracking-tight leading-[1.1] text-foreground">
              {c.hero.h1_1}{" "}
              <span className="gradient-text">{c.hero.h1_2}</span>
            </h1>

            <p className="mt-5 text-base sm:text-lg leading-relaxed text-muted-foreground max-w-lg">
              {c.hero.sub}
            </p>

            <div className="mt-8 flex flex-col sm:flex-row items-start gap-3">
              <Link
                to="/auth?register=true"
                className="inline-flex items-center gap-2 rounded-full px-7 h-12 text-[15px] font-semibold text-primary-foreground bg-primary hover:bg-primary/90 shadow-primary-glow transition-all active:scale-[0.97]"
              >
                {c.ctaHero} <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/portal"
                className="inline-flex items-center gap-1.5 rounded-full h-12 px-7 text-[15px] font-semibold border border-border hover:bg-accent transition-all active:scale-[0.97] text-foreground"
              >
                {c.ctaPortal}
              </Link>
            </div>

            <div className="mt-5 flex items-center gap-4 text-sm text-muted-foreground">
              {c.hero.pills.map((pill, i) => (
                <span key={i} className="inline-flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                  {pill}
                </span>
              ))}
            </div>
          </div>

          {/* Right – Hero image */}
          <div className="relative">
            <div className="rounded-2xl overflow-hidden shadow-2xl border border-border">
              <img
                src={heroDashboard}
                alt="StaflyApps Dashboard"
                className="w-full h-auto block"
                loading="eager"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── FEATURES (6 cards, 3x2 grid) ── */}
      <section className="py-16 sm:py-24" id="funciones">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-foreground">
              {c.features.title}
            </h2>
            <p className="mt-4 text-[15px] text-muted-foreground leading-relaxed">
              {c.features.sub}
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {c.features.cards.map((card, i) => (
              <div key={i} className="bg-card rounded-2xl border border-border p-7 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300">
                <div className="h-12 w-12 rounded-xl flex items-center justify-center mb-5 bg-primary/[0.08] text-primary">
                  {featureIcons[card.icon]}
                </div>
                <h3 className="font-semibold text-base mb-2 text-foreground">{card.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{card.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS (3 numbered circles) ── */}
      <section className="py-16 sm:py-24 bg-accent/30" id="como-funciona">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-foreground">
              {c.howItWorks.title}
            </h2>
            <p className="mt-4 text-[15px] text-muted-foreground">
              {c.howItWorks.sub}
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-10">
            {c.howItWorks.steps.map((step, i) => (
              <div key={i} className="text-center">
                <div className="mx-auto h-16 w-16 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-2xl font-bold mb-5 shadow-primary-glow">
                  {i + 1}
                </div>
                <h3 className="font-bold text-lg mb-2 text-foreground">{step.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRICING (3 cards: Free, Pro, Enterprise) ── */}
      <section className="py-16 sm:py-24 bg-accent/20" id="precios">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-foreground">
              {c.pricing.title}
            </h2>
            <p className="mt-4 text-[15px] text-muted-foreground">
              {c.pricing.sub}
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {c.pricing.plans.map((plan, i) => (
              <div
                key={i}
                className={`relative rounded-2xl p-8 flex flex-col ${
                  plan.highlighted
                    ? "border-2 border-primary bg-card shadow-lg shadow-primary/10"
                    : "border border-border bg-card shadow-sm"
                }`}
              >
                {plan.highlighted && (
                  <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 inline-flex items-center px-4 py-1 rounded-full text-xs font-bold bg-primary text-primary-foreground shadow-primary-glow">
                    {c.pricing.popular}
                  </span>
                )}
                <h3 className="text-xl font-bold text-foreground">{plan.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{plan.desc}</p>
                <div className="mt-6 mb-6">
                  <span className="text-4xl font-extrabold text-foreground">{plan.price}</span>
                  <span className="text-sm text-muted-foreground ml-1">{plan.period}</span>
                </div>
                <ul className="space-y-3 flex-1">
                  {plan.features.map((feat, j) => (
                    <li key={j} className="flex items-start gap-2.5 text-sm text-foreground">
                      <CheckCircle2 className={`h-4 w-4 shrink-0 mt-0.5 ${plan.highlighted ? "text-primary" : "text-success"}`} />
                      {feat}
                    </li>
                  ))}
                </ul>
                <div className="mt-8">
                  {plan.highlighted ? (
                    <Link
                      to="/auth?register=true"
                      className="w-full inline-flex items-center justify-center rounded-xl h-12 text-[15px] font-semibold text-primary-foreground bg-primary hover:bg-primary/90 shadow-primary-glow transition-all active:scale-[0.97]"
                    >
                      {plan.cta}
                    </Link>
                  ) : i === 2 ? (
                    <Dialog>
                      <DialogTrigger asChild>
                        <button className="w-full inline-flex items-center justify-center rounded-xl h-12 text-[15px] font-semibold border border-border hover:bg-accent transition-all active:scale-[0.97] text-foreground">
                          {plan.cta}
                        </button>
                      </DialogTrigger>
                      <DialogContent className="max-w-md rounded-2xl">
                        <DialogHeader><DialogTitle>{plan.cta}</DialogTitle></DialogHeader>
                        <DemoForm lang={lang} />
                      </DialogContent>
                    </Dialog>
                  ) : (
                    <Link
                      to="/auth?register=true"
                      className="w-full inline-flex items-center justify-center rounded-xl h-12 text-[15px] font-semibold border border-border hover:bg-accent transition-all active:scale-[0.97] text-foreground"
                    >
                      {plan.cta}
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TESTIMONIAL ── */}
      <section className="py-16 sm:py-24">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <blockquote className="text-lg sm:text-xl font-medium leading-relaxed text-foreground italic">
            "{c.testimonial.quote}"
          </blockquote>
          <div className="mt-6 flex items-center justify-center gap-3">
            <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold">
              {c.testimonial.name.split(" ").map(n => n[0]).join("")}
            </div>
            <div className="text-left">
              <p className="font-semibold text-sm text-foreground">{c.testimonial.name}</p>
              <p className="text-xs text-muted-foreground">{c.testimonial.role}</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section className="py-16 sm:py-24 bg-accent/20">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-foreground leading-tight">
            {c.finalCta.title}
          </h2>
          <p className="mt-4 text-[15px] text-muted-foreground max-w-xl mx-auto">
            {c.finalCta.sub}
          </p>
          <div className="mt-8">
            <Link
              to="/auth?register=true"
              className="inline-flex items-center gap-2 rounded-full px-8 h-13 py-3 text-base font-semibold text-primary-foreground bg-primary hover:bg-primary/90 shadow-primary-glow transition-all active:scale-[0.97]"
            >
              {c.finalCta.cta} <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="border-t border-border py-12" id="contacto">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
            <StaflyLogo size={26} />
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px] text-muted-foreground">
              <a href="#funciones" className="hover:text-foreground transition-colors">{c.footer.product}</a>
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
