import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  CalendarDays, DollarSign, Users, Clock, BarChart3, Shield,
  ArrowRight, Smartphone, CheckCircle2, Zap, Star,
  MessageSquare, Globe, ChevronRight, MapPin, FileText,
  Upload, Lock, Send, Phone,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import staflyIsotipo from "@/assets/stafly-isotipo.png";
import staflyMockup from "@/assets/stafly-dashboard-mockup.png";
import staflyMascotWave from "@/assets/stafly-mascot-wave.png";

/* ───────── i18n ───────── */
const t = {
  es: {
    nav: { product: "Producto", industries: "Industrias", pricing: "Precios", contact: "Contacto" },
    cta: "Solicitar demo",
    ctaWa: "Hablar por WhatsApp",
    hero: {
      h1: "Controla tus equipos de limpieza por turnos y paga semanal sin errores.",
      sub: "Programa turnos por cliente y ubicación, registra clock-in/out con evidencia y convierte horas en nómina semanal en minutos.",
      trust: "Implementación rápida • Soporte • Datos seguros",
    },
    trust: "Diseñado para operaciones de limpieza con múltiples clientes y ubicaciones.",
    problems: [
      { title: "Cambios de último minuto", desc: "Reemplazos urgentes, ausencias y turnos sin cubrir que desestabilizan tu operación." },
      { title: "Disputas por horas", desc: "Empleados que reclaman horas no registradas. Sin evidencia, pierdes control y dinero." },
      { title: "Nómina semanal lenta", desc: "Calcular horas, extras y deducciones manualmente cada semana es un dolor de cabeza." },
    ],
    steps: [
      { title: "1. Programa turnos", desc: "Asigna empleados a turnos por cliente y ubicación." },
      { title: "2. Registra asistencia", desc: "Clock-in/out con GPS, notas y evidencia." },
      { title: "3. Paga semanal", desc: "Convierte horas en nómina automática con un clic." },
    ],
    features: [
      { icon: CalendarDays, title: "Turnos por cliente/ubicación", desc: "Programa turnos asociados a clientes y ubicaciones específicas." },
      { icon: MapPin, title: "Clock-in/out verificado", desc: "Registro de entrada/salida con ubicación GPS y notas del empleado." },
      { icon: DollarSign, title: "Nómina semanal (regular/OT)", desc: "Cálculo automático de horas regulares, overtime y pago total." },
      { icon: FileText, title: "Novedades (bonos/deducciones)", desc: "Gestiona bonificaciones y deducciones por empleado y periodo." },
      { icon: Upload, title: "Importación CSV/TXT", desc: "Importa datos de otros sistemas en segundos." },
      { icon: Lock, title: "Roles/permisos/auditoría", desc: "Control granular de acceso con registro de cada acción." },
    ],
    differentiator: {
      title: "Shield of Trust",
      sub: "Cierre semanal controlado",
      desc: "Cada periodo pasa por estados claros: Abierto → Cerrado → Pagado. Los periodos vencidos se marcan automáticamente con margen configurable.",
    },
    pricing: {
      title: "Planes",
      plans: [
        { name: "Starter", price: "$49", period: "/mes", desc: "Hasta 25 empleados", features: ["Turnos y asistencia", "Nómina semanal", "1 usuario admin", "Soporte por email"] },
        { name: "Pro", price: "$99", period: "/mes", desc: "Hasta 100 empleados", features: ["Todo en Starter", "Múltiples ubicaciones", "Roles y permisos", "Importación CSV", "Soporte prioritario"], recommended: true },
        { name: "Enterprise", price: "Custom", period: "", desc: "Empleados ilimitados", features: ["Todo en Pro", "API access", "SSO", "Onboarding dedicado", "SLA garantizado"] },
      ],
    },
    faq: [
      { q: "¿Cuánto toma la implementación?", a: "Puedes estar operando en menos de 24 horas. Nuestro equipo te acompaña en la configuración inicial." },
      { q: "¿Puedo importar datos de otro sistema?", a: "Sí, soportamos importación desde CSV, TXT y sistemas como Connecteam." },
      { q: "¿Cómo funciona el clock-in/out?", a: "Los empleados registran entrada/salida desde su celular con ubicación GPS y pueden agregar notas." },
      { q: "¿Cómo se calcula el overtime?", a: "Puedes configurar el umbral semanal (por defecto 40h). Las horas extra se calculan automáticamente a 1.5x." },
      { q: "¿Mis datos están seguros?", a: "Sí, usamos encriptación en tránsito y en reposo, con políticas de acceso por rol." },
      { q: "¿Puedo probar antes de comprar?", a: "Solicita una demo y te mostramos la plataforma con datos de ejemplo personalizados." },
    ],
    form: { name: "Nombre", company: "Empresa", email: "Email", phone: "Teléfono", employees: "# Empleados", submit: "Solicitar demo" },
    footer: { privacy: "Privacidad", terms: "Términos", contact: "Contacto" },
  },
  en: {
    nav: { product: "Product", industries: "Industries", pricing: "Pricing", contact: "Contact" },
    cta: "Request a demo",
    ctaWa: "Chat on WhatsApp",
    hero: {
      h1: "Manage cleaning crews by shifts and run weekly payroll—accurate and stress-free.",
      sub: "Schedule shifts by client and location, capture verified clock-in/out, and turn hours into weekly payroll in minutes.",
      trust: "Fast setup • Support • Secure data",
    },
    trust: "Built for multi-client cleaning operations.",
    problems: [
      { title: "Last-minute changes", desc: "Urgent replacements, no-shows, and uncovered shifts destabilize your operation." },
      { title: "Hour disputes", desc: "Employees claim unrecorded hours. Without evidence, you lose control and money." },
      { title: "Slow weekly payroll", desc: "Manually calculating hours, overtime, and deductions every week is a headache." },
    ],
    steps: [
      { title: "1. Schedule shifts", desc: "Assign employees to shifts by client and location." },
      { title: "2. Track attendance", desc: "Clock-in/out with GPS, notes, and evidence." },
      { title: "3. Pay weekly", desc: "Turn hours into automatic payroll with one click." },
    ],
    features: [
      { icon: CalendarDays, title: "Shifts by client/location", desc: "Schedule shifts tied to specific clients and locations." },
      { icon: MapPin, title: "Verified clock-in/out", desc: "GPS-verified check-in/out with employee notes." },
      { icon: DollarSign, title: "Weekly payroll (regular/OT)", desc: "Automatic calculation of regular hours, overtime, and total pay." },
      { icon: FileText, title: "Adjustments (bonuses/deductions)", desc: "Manage bonuses and deductions per employee and period." },
      { icon: Upload, title: "CSV/TXT import", desc: "Import data from other systems in seconds." },
      { icon: Lock, title: "Roles/permissions/audit", desc: "Granular access control with full action logging." },
    ],
    differentiator: {
      title: "Shield of Trust",
      sub: "Controlled weekly close",
      desc: "Each period goes through clear states: Open → Closed → Paid. Overdue periods are flagged automatically with configurable margin.",
    },
    pricing: {
      title: "Plans",
      plans: [
        { name: "Starter", price: "$49", period: "/mo", desc: "Up to 25 employees", features: ["Shifts & attendance", "Weekly payroll", "1 admin user", "Email support"] },
        { name: "Pro", price: "$99", period: "/mo", desc: "Up to 100 employees", features: ["Everything in Starter", "Multiple locations", "Roles & permissions", "CSV import", "Priority support"], recommended: true },
        { name: "Enterprise", price: "Custom", period: "", desc: "Unlimited employees", features: ["Everything in Pro", "API access", "SSO", "Dedicated onboarding", "SLA guaranteed"] },
      ],
    },
    faq: [
      { q: "How long does setup take?", a: "You can be up and running in less than 24 hours. Our team helps with initial configuration." },
      { q: "Can I import data from another system?", a: "Yes, we support imports from CSV, TXT, and systems like Connecteam." },
      { q: "How does clock-in/out work?", a: "Employees check in/out from their phone with GPS location and can add notes." },
      { q: "How is overtime calculated?", a: "You can configure the weekly threshold (default 40h). Overtime is automatically calculated at 1.5x." },
      { q: "Is my data secure?", a: "Yes, we use encryption in transit and at rest, with role-based access policies." },
      { q: "Can I try before buying?", a: "Request a demo and we'll show you the platform with customized sample data." },
    ],
    form: { name: "Name", company: "Company", email: "Email", phone: "Phone", employees: "# Employees", submit: "Request a demo" },
    footer: { privacy: "Privacy", terms: "Terms", contact: "Contact" },
  },
};

/* ───────── Demo Form Component ───────── */
function DemoForm({ lang, onSuccess }: { lang: "es" | "en"; onSuccess?: () => void }) {
  const c = t[lang].form;
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
      <Input placeholder={c.name} required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      <Input placeholder={c.company} required value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
      <div className="grid grid-cols-2 gap-3">
        <Input placeholder={c.email} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <Input placeholder={c.phone} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
      </div>
      <Input placeholder={c.employees} value={form.employee_count} onChange={(e) => setForm({ ...form, employee_count: e.target.value })} />
      <Button type="submit" className="w-full rounded-full h-12 text-base font-bold bg-accent-warm hover:bg-accent-warm/90 text-accent-warm-foreground" disabled={loading}>
        {loading ? "..." : c.submit} <Send className="ml-2 h-4 w-4" />
      </Button>
    </form>
  );
}

/* ───────── LANDING ───────── */
export default function Landing() {
  const [lang, setLang] = useState<"es" | "en">("es");
  const c = t[lang];
  const [faqOpen, setFaqOpen] = useState<number | null>(null);

  const whatsappUrl = "https://wa.me/"; // placeholder — user will provide number

  return (
    <div className="min-h-screen bg-background overflow-hidden">
      {/* ── HEADER ── */}
      <header className="fixed top-0 inset-x-0 z-50 bg-background/90 backdrop-blur-xl border-b border-border/40">
        <div className="container flex items-center justify-between h-16">
          <div className="flex items-center gap-2.5">
            <img src={staflyIsotipo} alt="STAFLY" className="h-9 w-9" />
            <span className="font-heading font-bold text-xl tracking-tight text-foreground">STAFLY</span>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-muted-foreground">
            <a href="#producto" className="hover:text-foreground transition-colors">{c.nav.product}</a>
            <a href="#precios" className="hover:text-foreground transition-colors">{c.nav.pricing}</a>
            <a href="#contacto" className="hover:text-foreground transition-colors">{c.nav.contact}</a>
            <button onClick={() => setLang(lang === "es" ? "en" : "es")} className="flex items-center gap-1 hover:text-foreground transition-colors">
              <Globe className="h-4 w-4" /> {lang === "es" ? "EN" : "ES"}
            </button>
          </nav>
          <div className="flex items-center gap-3">
            <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
              <Link to="/auth">{lang === "es" ? "Iniciar sesión" : "Sign in"}</Link>
            </Button>
            <Dialog>
              <DialogTrigger asChild>
                <Button className="rounded-full px-6 bg-accent-warm hover:bg-accent-warm/90 text-accent-warm-foreground shadow-md">
                  {c.cta}
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader><DialogTitle>{c.cta}</DialogTitle></DialogHeader>
                <DemoForm lang={lang} />
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </header>

      {/* ── HERO ── */}
      <section id="inicio" className="relative pt-28 pb-12 sm:pt-36 sm:pb-20">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[800px] h-[800px] rounded-full opacity-[0.06] bg-primary blur-[120px]" />
        </div>
        <div className="container relative">
          <div className="max-w-4xl mx-auto text-center">
            <Badge variant="info" className="mb-4 text-sm px-4 py-1">
              {lang === "es" ? "Plataforma para empresas de limpieza" : "Platform for cleaning companies"}
            </Badge>
            <h1 className="font-heading text-3xl sm:text-4xl lg:text-6xl font-extrabold tracking-tight leading-[1.08] text-foreground">
              {c.hero.h1}
            </h1>
            <p className="mt-6 text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              {c.hero.sub}
            </p>
            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Dialog>
                <DialogTrigger asChild>
                  <Button size="lg" className="rounded-full px-10 h-13 text-base font-bold bg-accent-warm hover:bg-accent-warm/90 text-accent-warm-foreground shadow-lg hover:shadow-xl transition-all">
                    {c.cta} <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader><DialogTitle>{c.cta}</DialogTitle></DialogHeader>
                  <DemoForm lang={lang} />
                </DialogContent>
              </Dialog>
              <Button size="lg" variant="outline" className="rounded-full h-13 px-8 text-base" asChild>
                <a href={whatsappUrl} target="_blank" rel="noopener noreferrer">
                  <Phone className="mr-2 h-4 w-4" /> {c.ctaWa}
                </a>
              </Button>
            </div>
            <p className="mt-4 text-sm text-muted-foreground flex items-center justify-center gap-2">
              <Shield className="h-4 w-4 text-primary" /> {c.hero.trust}
            </p>
          </div>

          {/* Hero mockup */}
          <div className="mt-16 relative max-w-5xl mx-auto">
            <div className="absolute inset-x-10 -bottom-8 h-40 bg-primary opacity-[0.08] blur-3xl rounded-full" />
            <img src={staflyMockup} alt="STAFLY Dashboard" className="w-full h-auto relative z-10 rounded-2xl shadow-2xl border border-border/30" loading="eager" />
          </div>
        </div>
      </section>

      {/* ── TRUST ── */}
      <section className="py-14 bg-card/50 border-y border-border/40">
        <div className="container">
          <div className="flex items-center justify-center gap-4 text-center">
            <img src={staflyMascotWave} alt="STAFLY mascot" className="h-16 w-16 hidden sm:block" />
            <p className="text-lg sm:text-xl font-heading font-semibold text-foreground">{c.trust}</p>
          </div>
        </div>
      </section>

      {/* ── PROBLEMS ── */}
      <section className="py-16 sm:py-24" id="producto">
        <div className="container">
          <div className="text-center mb-12">
            <h2 className="font-heading text-2xl sm:text-3xl font-bold">
              {lang === "es" ? "¿Te suena familiar?" : "Sound familiar?"}
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {c.problems.map((p, i) => (
              <div key={i} className="bg-card rounded-2xl border border-destructive/20 p-6 shadow-sm">
                <div className="h-10 w-10 rounded-xl bg-destructive/10 flex items-center justify-center mb-4">
                  <span className="text-destructive font-bold text-lg">!</span>
                </div>
                <h3 className="font-heading font-semibold text-lg mb-2">{p.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{p.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="py-16 sm:py-20 bg-card/40 border-y border-border/40">
        <div className="container">
          <div className="text-center mb-12">
            <h2 className="font-heading text-2xl sm:text-3xl font-bold">
              {lang === "es" ? "Cómo funciona" : "How it works"}
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            {c.steps.map((s, i) => (
              <div key={i} className="text-center">
                <div className="h-14 w-14 rounded-2xl gradient-primary flex items-center justify-center mx-auto mb-4 text-white font-bold text-xl">
                  {i + 1}
                </div>
                <h3 className="font-heading font-semibold text-lg mb-2">{s.title}</h3>
                <p className="text-sm text-muted-foreground">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section className="py-16 sm:py-24">
        <div className="container">
          <div className="text-center mb-12">
            <h2 className="font-heading text-2xl sm:text-3xl font-bold">
              {lang === "es" ? "Todo lo que necesitas" : "Everything you need"}
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {c.features.map((f, i) => (
              <div key={i} className="bg-card rounded-2xl border border-border/50 p-7 shadow-sm hover-lift transition-all hover:border-primary/20">
                <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                  <f.icon className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-heading font-semibold text-base mb-2">{f.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── DIFFERENTIATOR ── */}
      <section className="py-16 sm:py-20 bg-card/40 border-y border-border/40">
        <div className="container">
          <div className="max-w-3xl mx-auto text-center">
            <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-6">
              <Shield className="h-8 w-8 text-primary" />
            </div>
            <h2 className="font-heading text-2xl sm:text-3xl font-bold mb-2">{c.differentiator.title}</h2>
            <p className="text-lg font-semibold text-primary mb-4">{c.differentiator.sub}</p>
            <p className="text-muted-foreground leading-relaxed">{c.differentiator.desc}</p>
            <div className="flex items-center justify-center gap-3 mt-8 flex-wrap">
              <Badge className="bg-primary/15 text-primary border-0">Open</Badge>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
              <Badge className="bg-muted text-muted-foreground border-0">Closed</Badge>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
              <Badge className="bg-earning/15 text-earning border-0">Paid</Badge>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
              <Badge className="bg-accent-warm/15 text-accent-warm border-0">Overdue</Badge>
            </div>
          </div>
        </div>
      </section>

      {/* ── PRICING ── */}
      <section id="precios" className="py-16 sm:py-24">
        <div className="container">
          <div className="text-center mb-12">
            <h2 className="font-heading text-2xl sm:text-3xl font-bold">{c.pricing.title}</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto items-start">
            {c.pricing.plans.map((plan, i) => (
              <div key={i} className={`bg-card rounded-2xl border p-7 shadow-sm relative ${plan.recommended ? "border-primary ring-2 ring-primary/20" : "border-border/50"}`}>
                {plan.recommended && (
                  <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground">
                    {lang === "es" ? "Recomendado" : "Recommended"}
                  </Badge>
                )}
                <h3 className="font-heading font-bold text-xl mb-1">{plan.name}</h3>
                <p className="text-sm text-muted-foreground mb-4">{plan.desc}</p>
                <div className="flex items-baseline gap-1 mb-6">
                  <span className="text-3xl font-heading font-extrabold">{plan.price}</span>
                  <span className="text-muted-foreground text-sm">{plan.period}</span>
                </div>
                <ul className="space-y-2 mb-6">
                  {plan.features.map((f, j) => (
                    <li key={j} className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-earning shrink-0" /> {f}
                    </li>
                  ))}
                </ul>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button className={`w-full rounded-full ${plan.recommended ? "bg-accent-warm hover:bg-accent-warm/90 text-accent-warm-foreground" : ""}`} variant={plan.recommended ? "default" : "outline"}>
                      {c.cta}
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-md">
                    <DialogHeader><DialogTitle>{c.cta}</DialogTitle></DialogHeader>
                    <DemoForm lang={lang} />
                  </DialogContent>
                </Dialog>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="py-16 sm:py-20 bg-card/40 border-y border-border/40">
        <div className="container">
          <div className="text-center mb-12">
            <h2 className="font-heading text-2xl sm:text-3xl font-bold">FAQ</h2>
          </div>
          <div className="max-w-2xl mx-auto space-y-3">
            {c.faq.map((item, i) => (
              <div key={i} className="bg-card rounded-xl border border-border/50 overflow-hidden">
                <button
                  onClick={() => setFaqOpen(faqOpen === i ? null : i)}
                  className="w-full text-left px-5 py-4 flex items-center justify-between font-medium text-sm hover:bg-accent/30 transition-colors"
                >
                  {item.q}
                  <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${faqOpen === i ? "rotate-90" : ""}`} />
                </button>
                {faqOpen === i && (
                  <div className="px-5 pb-4 text-sm text-muted-foreground leading-relaxed animate-fade-in">
                    {item.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section id="contacto" className="py-16 sm:py-24">
        <div className="container">
          <div className="relative rounded-3xl bg-primary p-8 sm:p-14 overflow-hidden max-w-5xl mx-auto">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.12),transparent_50%)]" />
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-xl" />
            <div className="relative grid md:grid-cols-2 gap-10 items-center">
              <div>
                <h2 className="font-heading text-2xl sm:text-3xl lg:text-4xl font-bold text-white tracking-tight leading-tight">
                  {lang === "es" ? "Lleva tu operación al siguiente nivel" : "Take your operation to the next level"}
                </h2>
                <p className="mt-4 text-white/80 text-base">
                  {lang === "es"
                    ? "Completa el formulario y un especialista te contactará en menos de 24 horas."
                    : "Complete the form and a specialist will contact you within 24 hours."}
                </p>
              </div>
              <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
                <DemoForm lang={lang} />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="border-t border-border/40 py-10">
        <div className="container">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2.5">
              <img src={staflyIsotipo} alt="STAFLY" className="h-7 w-7" />
              <span className="font-heading font-bold text-lg text-foreground">STAFLY</span>
            </div>
            <div className="flex items-center gap-6 text-sm text-muted-foreground">
              <a href="#" className="hover:text-foreground transition-colors">{c.footer.privacy}</a>
              <a href="#" className="hover:text-foreground transition-colors">{c.footer.terms}</a>
              <a href="#contacto" className="hover:text-foreground transition-colors">{c.footer.contact}</a>
            </div>
            <p className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} STAFLY · staflyapps.com
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
