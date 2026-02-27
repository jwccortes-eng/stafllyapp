import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  CalendarDays, DollarSign, Users, Clock, BarChart3, Shield,
  ArrowRight, CheckCircle2, Globe, MapPin,
  Lock, Send, Eye, Download,
  Menu, X, Star,
} from "lucide-react";
import { SectionHeader } from "@/components/ui/section-header";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import heroMockup from "@/assets/stafly-hero.png";
import staflyLogo from "@/assets/stafly-logo.png";

/* ───────── i18n ───────── */
const i18n = {
  es: {
    nav: { product: "Producto", modules: "Módulos", pricing: "Precios", security: "Seguridad" },
    login: "Iniciar sesión",
    ctaPrimary: "Empezar gratis",
    ctaSecondary: "Agendar demo",
    ctaMicro: "Sin tarjeta • Setup en minutos • Cancela cuando quieras",
    hero: {
      h1: "Control semanal de tu equipo, sin estrés.",
      sub: "Turnos, clock-in/out con ubicación, nómina semanal, reportes y permisos. Todo en una app.",
      badges: ["Setup en minutos", "GPS & verificación", "Exportación lista", "Permisos granulares"],
    },
    chaos: {
      title: "Adiós al caos",
      before: "Antes",
      after: "Después",
      beforeItems: ["Hojas de Excel", "Grupos de WhatsApp", "Llamadas telefónicas", "Papeles y recibos"],
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
        { label: "Turnos", icon: "calendar", title: "Programación de turnos", bullets: ["Vista semanal tipo calendario con drag & drop", "Asignación por cliente, ubicación y rol", "Copiar semana y detección de conflictos"] },
        { label: "Clock-in/out", icon: "clock", title: "Control de tiempo con ubicación", bullets: ["Clock-in/out desde el celular con GPS", "Verificación de ubicación y dispositivo", "Registro de descansos y notas"] },
        { label: "Nómina", icon: "dollar", title: "Nómina semanal automatizada", bullets: ["Cálculo automático regular/overtime", "Novedades: bonos, deducciones, ajustes", "Cierre semanal controlado con estados"] },
        { label: "Reportes", icon: "chart", title: "Reportes & Exportación", bullets: ["Nómina semanal, horas por ubicación, overtime", "Exportación a CSV, PDF y plantillas", "Filtros avanzados y búsqueda"] },
        { label: "Admin", icon: "shield", title: "Permisos y administración", bullets: ["Roles: Owner, Admin, Manager, Supervisor, Employee", "Permisos granulares por módulo y acción", "Registro de auditoría completo"] },
      ],
    },
    security: {
      title: "Diseñado para control y trazabilidad",
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
        { name: "María González", role: "Directora de Operaciones", company: "CleanPro Services", quote: "Stafly transformó nuestra gestión de turnos. Lo que antes tomaba horas ahora se hace en minutos.", rating: 5 },
        { name: "Carlos Rodríguez", role: "Gerente General", company: "Spotless Group", quote: "La verificación GPS nos dio tranquilidad total. Sabemos exactamente dónde está cada empleado.", rating: 5 },
        { name: "Ana Martínez", role: "HR Manager", company: "BrightClean Co.", quote: "La nómina semanal automática nos ahorró errores y disputas. Nuestro equipo está más contento.", rating: 5 },
      ],
    },
    pricing: {
      title: "Planes simples, sin sorpresas",
      subtitle: "Elige el plan que se adapta a tu operación",
      monthly: "Mensual",
      annual: "Anual",
      save: "Ahorra 20%",
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
    footer: { privacy: "Privacidad", terms: "Términos", contact: "Contacto" },
  },
  en: {
    nav: { product: "Product", modules: "Modules", pricing: "Pricing", security: "Security" },
    login: "Sign in",
    ctaPrimary: "Start free",
    ctaSecondary: "Book a demo",
    ctaMicro: "No card required • Setup in minutes • Cancel anytime",
    hero: {
      h1: "Weekly control of your workforce—without the stress.",
      sub: "Scheduling, location-based clock-in/out, weekly payroll, reports and permissions. All in one app.",
      badges: ["Setup in minutes", "GPS & verification", "Export-ready", "Granular permissions"],
    },
    chaos: {
      title: "Goodbye to chaos",
      before: "Before",
      after: "After",
      beforeItems: ["Excel spreadsheets", "WhatsApp groups", "Phone calls", "Paper receipts"],
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
        { label: "Scheduling", icon: "calendar", title: "Shift scheduling", bullets: ["Weekly calendar view with drag & drop", "Assign by client, location, and role", "Copy week and conflict detection"] },
        { label: "Clock-in/out", icon: "clock", title: "Time tracking with location", bullets: ["Clock-in/out from mobile with GPS", "Location and device verification", "Break tracking and notes"] },
        { label: "Payroll", icon: "dollar", title: "Automated weekly payroll", bullets: ["Auto-calculate regular/overtime", "Adjustments: bonuses, deductions", "Controlled weekly close with states"] },
        { label: "Reports", icon: "chart", title: "Reports & Export", bullets: ["Weekly payroll, hours by location, overtime", "Export to CSV, PDF, and templates", "Advanced filters and search"] },
        { label: "Admin", icon: "shield", title: "Permissions & administration", bullets: ["Roles: Owner, Admin, Manager, Supervisor, Employee", "Granular per-module permissions", "Complete audit log"] },
      ],
    },
    security: {
      title: "Designed for control and traceability",
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
        { name: "Maria González", role: "Director of Operations", company: "CleanPro Services", quote: "Stafly transformed our shift management. What used to take hours now happens in minutes.", rating: 5 },
        { name: "Carlos Rodríguez", role: "General Manager", company: "Spotless Group", quote: "GPS verification gave us total peace of mind. We know exactly where each employee is.", rating: 5 },
        { name: "Ana Martínez", role: "HR Manager", company: "BrightClean Co.", quote: "Automatic weekly payroll eliminated errors and disputes. Our team is happier.", rating: 5 },
      ],
    },
    pricing: {
      title: "Simple plans, no surprises",
      subtitle: "Choose the plan that fits your operation",
      monthly: "Monthly",
      annual: "Annual",
      save: "Save 20%",
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
    footer: { privacy: "Privacy", terms: "Terms", contact: "Contact" },
  },
};

/* ───────── Demo Form ───────── */
function DemoForm({ lang, onSuccess }: { lang: "es" | "en"; onSuccess?: () => void }) {
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
      onSuccess?.();
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
      <Button type="submit" className="w-full rounded-xl h-12 text-base font-semibold gradient-primary text-white shadow-md hover:shadow-lg transition-all" disabled={loading}>
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

/* ───────── LANDING ───────── */
export default function Landing() {
  const [lang, setLang] = useState<"es" | "en">(() => {
    const nav = navigator.language?.slice(0, 2);
    return nav === "en" ? "en" : "es";
  });
  const c = i18n[lang];
  const [activeModule, setActiveModule] = useState(0);
  const [isAnnual, setIsAnnual] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="min-h-screen bg-background overflow-hidden">
      {/* ── HEADER ── */}
      <header className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${scrolled ? "bg-card/90 backdrop-blur-xl shadow-xs border-b border-border/30" : "bg-transparent"}`}>
        <div className="container flex items-center justify-between h-16">
          <div className="flex items-center gap-2.5">
            <img src={staflyLogo} alt="stafly" className="h-10 w-auto" style={{ imageRendering: "auto" }} />
          </div>

          <nav className="hidden lg:flex items-center gap-8 text-sm font-medium text-muted-foreground">
            <a href="#producto" className="hover:text-foreground transition-colors">{c.nav.product}</a>
            <a href="#modulos" className="hover:text-foreground transition-colors">{c.nav.modules}</a>
            <a href="#precios" className="hover:text-foreground transition-colors">{c.nav.pricing}</a>
            <a href="#seguridad" className="hover:text-foreground transition-colors">{c.nav.security}</a>
          </nav>

          <div className="flex items-center gap-2 sm:gap-3">
            <button onClick={() => setLang(lang === "es" ? "en" : "es")} className="hidden sm:flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors px-2.5 py-1.5 rounded-xl hover:bg-muted">
              <Globe className="h-4 w-4" />
              <span className="font-medium">{lang === "es" ? "EN" : "ES"}</span>
            </button>
            <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex text-sm">
              <Link to="/auth">{c.login}</Link>
            </Button>
            <Dialog>
              <DialogTrigger asChild>
                <Button className="rounded-full px-4 sm:px-6 h-8 sm:h-9 text-xs sm:text-sm font-semibold gradient-primary text-white shadow-sm hover:shadow-md transition-all">
                  {c.ctaPrimary}
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md rounded-2xl">
                <DialogHeader><DialogTitle>{c.ctaSecondary}</DialogTitle></DialogHeader>
                <DemoForm lang={lang} />
              </DialogContent>
            </Dialog>
            <button className="lg:hidden p-2 rounded-xl hover:bg-muted transition-colors shrink-0" onClick={() => setMobileMenu(!mobileMenu)}>
              {mobileMenu ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {mobileMenu && (
          <div className="lg:hidden bg-card/95 backdrop-blur-xl border-t border-border/30 animate-fade-in">
            <div className="container py-4 space-y-1">
              {[
                { href: "#producto", label: c.nav.product },
                { href: "#modulos", label: c.nav.modules },
                { href: "#precios", label: c.nav.pricing },
                { href: "#seguridad", label: c.nav.security },
              ].map(item => (
                <a key={item.href} href={item.href} onClick={() => setMobileMenu(false)} className="block text-sm font-medium py-2.5 px-3 rounded-xl hover:bg-muted transition-colors">{item.label}</a>
              ))}
              <Link to="/auth" onClick={() => setMobileMenu(false)} className="block text-sm font-medium py-2.5 px-3 rounded-xl hover:bg-muted transition-colors text-primary">
                {c.login}
              </Link>
              <button onClick={() => { setLang(lang === "es" ? "en" : "es"); setMobileMenu(false); }} className="flex items-center gap-2 text-sm py-2.5 px-3 text-muted-foreground w-full rounded-xl hover:bg-muted transition-colors">
                <Globe className="h-4 w-4" /> {lang === "es" ? "English" : "Español"}
              </button>
            </div>
          </div>
        )}
      </header>

      {/* ── HERO ── */}
      <section className="relative pt-28 pb-20 sm:pt-36 sm:pb-28" id="producto">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 left-1/4 w-[800px] h-[800px] rounded-full opacity-[0.04] bg-primary blur-[150px]" />
          <div className="absolute top-40 right-1/4 w-[400px] h-[400px] rounded-full opacity-[0.03] bg-success blur-[100px]" />
        </div>

        <div className="container relative">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div className="max-w-xl">
              <h1 className="font-heading text-4xl sm:text-5xl lg:text-[3.25rem] font-extrabold tracking-tight leading-[1.1] text-foreground">
                {c.hero.h1}
              </h1>
              <p className="mt-6 text-lg text-muted-foreground leading-relaxed">
                {c.hero.sub}
              </p>
              <div className="mt-8 flex flex-col sm:flex-row items-start gap-3">
                <Dialog>
                  <DialogTrigger asChild>
                    <Button size="lg" className="rounded-full px-10 h-13 text-base font-semibold gradient-primary text-white shadow-lg hover:shadow-xl transition-all press-scale">
                      {c.ctaPrimary} <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-md rounded-2xl">
                    <DialogHeader><DialogTitle>{c.ctaSecondary}</DialogTitle></DialogHeader>
                    <DemoForm lang={lang} />
                  </DialogContent>
                </Dialog>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button size="lg" variant="outline" className="rounded-full h-13 px-10 text-base">
                      {c.ctaSecondary}
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-md rounded-2xl">
                    <DialogHeader><DialogTitle>{c.ctaSecondary}</DialogTitle></DialogHeader>
                    <DemoForm lang={lang} />
                  </DialogContent>
                </Dialog>
              </div>
              <p className="mt-4 text-sm text-muted-foreground">{c.ctaMicro}</p>

              <div className="mt-8 flex flex-wrap gap-2">
                {c.hero.badges.map((b, i) => (
                  <span key={i} className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground bg-card border border-border/50 rounded-full px-3 py-1.5 shadow-2xs">
                    <CheckCircle2 className="h-3.5 w-3.5 text-success" /> {b}
                  </span>
                ))}
              </div>
            </div>

            <div className="relative">
              <div className="absolute -inset-6 bg-primary/[0.03] rounded-3xl blur-3xl" />
              <div className="relative">
                <img src={heroMockup} alt="stafly Dashboard" className="w-full h-auto rounded-2xl shadow-xl border border-border/20" loading="eager" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── GOODBYE TO CHAOS ── */}
      <section className="py-20 bg-card border-y border-border/20">
        <div className="container">
          <SectionHeader eyebrow={lang === "es" ? "PRODUCTO" : "PRODUCT"} title={c.chaos.title} />
          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            <div className="rounded-2xl border border-destructive/15 bg-destructive/[0.02] p-7">
              <span className="text-[11px] font-bold uppercase tracking-widest text-destructive">{c.chaos.before}</span>
              <div className="mt-5 space-y-3.5">
                {c.chaos.beforeItems.map((item, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm text-muted-foreground">
                    <div className="h-6 w-6 rounded-lg bg-destructive/10 flex items-center justify-center shrink-0">
                      <X className="h-3.5 w-3.5 text-destructive" />
                    </div>
                    {item}
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-success/15 bg-success/[0.02] p-7">
              <span className="text-[11px] font-bold uppercase tracking-widest text-success">{c.chaos.after} — stafly</span>
              <div className="mt-5 grid grid-cols-2 gap-3">
                {c.chaos.afterItems.map((item, i) => {
                  const Icon = chaosIcons[i];
                  return (
                    <div key={i} className="bg-card rounded-xl border border-border/30 p-3.5 shadow-2xs">
                      <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center mb-2">
                        <Icon className="h-4 w-4 text-primary" />
                      </div>
                      <p className="text-sm font-semibold text-foreground">{item.label}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{item.desc}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── MODULES ── */}
      <section className="py-20 sm:py-28" id="modulos">
        <div className="container">
          <SectionHeader eyebrow={lang === "es" ? "MÓDULOS" : "MODULES"} title={c.modules.title} subtitle={c.modules.subtitle} />
          <div className="grid lg:grid-cols-[280px_1fr] gap-8 max-w-5xl mx-auto">
            <div className="flex lg:flex-col gap-2 overflow-x-auto lg:overflow-visible pb-2 lg:pb-0">
              {c.modules.tabs.map((tab, i) => (
                <button
                  key={i}
                  onClick={() => setActiveModule(i)}
                  className={`flex items-center gap-3 text-left px-4 py-3.5 rounded-xl text-sm font-medium transition-all whitespace-nowrap ${
                    activeModule === i
                      ? "bg-primary text-primary-foreground shadow-md"
                      : "bg-card border border-border/30 text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                  }`}
                >
                  <span className={activeModule === i ? "text-primary-foreground" : "text-primary"}>
                    {iconMap[tab.icon]}
                  </span>
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="bg-card rounded-2xl border border-border/30 p-8 shadow-xs animate-fade-in" key={activeModule}>
              <h3 className="font-heading text-xl font-bold mb-5">{c.modules.tabs[activeModule].title}</h3>
              <ul className="space-y-3.5">
                {c.modules.tabs[activeModule].bullets.map((b, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm text-muted-foreground">
                    <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" /> {b}
                  </li>
                ))}
              </ul>
              <div className="mt-8 rounded-xl bg-muted/30 border border-border/20 h-52 flex items-center justify-center overflow-hidden">
                <div className="text-center">
                  <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
                    <span className="text-primary">{iconMap[c.modules.tabs[activeModule].icon]}</span>
                  </div>
                  <span className="text-sm text-muted-foreground/50 font-heading">{lang === "es" ? "Vista previa del módulo" : "Module preview"}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── SECURITY ── */}
      <section className="py-20 bg-card border-y border-border/20" id="seguridad">
        <div className="container">
          <SectionHeader eyebrow={lang === "es" ? "SEGURIDAD" : "SECURITY"} title={c.security.title} subtitle={c.security.subtitle} />
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 max-w-5xl mx-auto">
            {c.security.cards.map((card, i) => (
              <div key={i} className="group bg-background rounded-2xl border border-border/30 p-6 hover-lift">
                <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4 text-primary group-hover:bg-primary/15 transition-colors">
                  {iconMap[card.icon]}
                </div>
                <h3 className="font-heading font-semibold text-sm mb-2">{card.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{card.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS ── */}
      <section className="py-20">
        <div className="container">
          <SectionHeader eyebrow={lang === "es" ? "TESTIMONIOS" : "TESTIMONIALS"} title={c.testimonials.title} />
          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {c.testimonials.items.map((t, i) => (
              <div key={i} className="bg-card rounded-2xl border border-border/30 p-6 shadow-xs hover-lift">
                <div className="flex gap-0.5 mb-4">
                  {Array.from({ length: t.rating }).map((_, j) => (
                    <Star key={j} className="h-4 w-4 fill-warning text-warning" />
                  ))}
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed mb-6">"{t.quote}"</p>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full gradient-primary flex items-center justify-center text-white text-sm font-bold shrink-0">
                    {t.name.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{t.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{t.role}, {t.company}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRICING ── */}
      <section id="precios" className="py-20 bg-card border-y border-border/20">
        <div className="container">
          <div className="text-center mb-12">
            <SectionHeader eyebrow={lang === "es" ? "PRECIOS" : "PRICING"} title={c.pricing.title} subtitle={c.pricing.subtitle} className="mb-0" />
            <div className="mt-5 inline-flex items-center bg-muted/50 rounded-xl p-1 border border-border/30">
              <button onClick={() => setIsAnnual(false)} className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${!isAnnual ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"}`}>
                {c.pricing.monthly}
              </button>
              <button onClick={() => setIsAnnual(true)} className={`px-5 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${isAnnual ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"}`}>
                {c.pricing.annual}
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-success/15 text-success border-0">{c.pricing.save}</Badge>
              </button>
            </div>
          </div>
          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto items-start">
            {c.pricing.plans.map((plan, i) => (
              <div key={i} className={`bg-background rounded-2xl border p-7 relative transition-all ${(plan as any).recommended ? "border-primary ring-2 ring-primary/10 shadow-lg scale-[1.02]" : "border-border/30 shadow-xs"}`}>
                {(plan as any).recommended && (
                  <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 gradient-primary text-white border-0 px-3 text-[11px]">
                    {lang === "es" ? "Recomendado" : "Recommended"}
                  </Badge>
                )}
                <h3 className="font-heading font-bold text-xl mb-1">{plan.name}</h3>
                <p className="text-sm text-muted-foreground mb-5">{plan.desc}</p>
                <div className="flex items-baseline gap-1 mb-6">
                  <span className="text-3xl font-heading font-extrabold">{plan.price}</span>
                  <span className="text-muted-foreground text-sm">{plan.period}</span>
                </div>
                <ul className="space-y-2.5 mb-7">
                  {plan.features.map((f, j) => (
                    <li key={j} className="flex items-center gap-2.5 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-success shrink-0" /> {f}
                    </li>
                  ))}
                </ul>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button className={`w-full rounded-xl h-11 font-semibold ${(plan as any).recommended ? "gradient-primary text-white shadow-sm" : ""}`} variant={(plan as any).recommended ? "default" : "outline"}>
                      {plan.cta}
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-md rounded-2xl">
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
      <section className="py-20 sm:py-28">
        <div className="container">
          <div className="relative rounded-3xl gradient-primary p-10 sm:p-16 overflow-hidden max-w-5xl mx-auto">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.12),transparent_50%)]" />
            <div className="absolute bottom-0 right-0 w-60 h-60 bg-white/5 rounded-full blur-3xl" />
            <div className="relative flex flex-col md:flex-row items-center gap-10">
              <div className="flex-1 text-center md:text-left">
                <h2 className="font-heading text-2xl sm:text-3xl lg:text-4xl font-bold text-white tracking-tight leading-tight">
                  {c.finalCta.h2}
                </h2>
                <p className="mt-3 text-white/75 text-base">{c.finalCta.sub}</p>
                <div className="mt-7 flex flex-col sm:flex-row items-center md:items-start gap-3">
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button size="lg" className="rounded-xl px-8 h-12 bg-white text-primary hover:bg-white/90 font-semibold shadow-lg press-scale">
                        {c.ctaPrimary} <ArrowRight className="ml-2 h-4 w-4" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-md rounded-2xl">
                      <DialogHeader><DialogTitle>{c.ctaSecondary}</DialogTitle></DialogHeader>
                      <DemoForm lang={lang} />
                    </DialogContent>
                  </Dialog>
                   <Dialog>
                    <DialogTrigger asChild>
                      <Button size="lg" variant="outline" className="rounded-xl h-12 px-8 border-2 border-white/60 text-white hover:bg-white/20 font-semibold backdrop-blur-sm">
                        {c.ctaSecondary}
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-md rounded-2xl">
                      <DialogHeader><DialogTitle>{c.ctaSecondary}</DialogTitle></DialogHeader>
                      <DemoForm lang={lang} />
                    </DialogContent>
                  </Dialog>
                </div>
              </div>
              {/* Mascot removed - background clashes with gradient */}
            </div>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="border-t border-border/20 py-10">
        <div className="container">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2.5">
              <img src={staflyLogo} alt="stafly" className="h-7 w-auto" style={{ imageRendering: "auto" }} />
            </div>
            <div className="flex items-center gap-6 text-sm text-muted-foreground">
              <a href="#" className="hover:text-foreground transition-colors">{c.footer.privacy}</a>
              <a href="#" className="hover:text-foreground transition-colors">{c.footer.terms}</a>
              <a href="#contacto" className="hover:text-foreground transition-colors">{c.footer.contact}</a>
            </div>
            <p className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} stafly · staflyapps.com
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
