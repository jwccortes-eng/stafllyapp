import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  CalendarDays, DollarSign, Users, Clock, BarChart3, Shield,
  ArrowRight, Megaphone, Smartphone, CheckCircle2, Zap, Star,
  MessageSquare, Globe, ChevronRight,
} from "lucide-react";
import logoQS from "@/assets/logo-quality-staff.png";
import stafflyHero from "@/assets/staffly-hero.png";

const features = [
  {
    icon: CalendarDays,
    title: "Programación de Turnos Simplificada",
    desc: "Gestiona la generación de turnos, la programación de personal y el control de asistencia de forma meticulosa.",
  },
  {
    icon: Clock,
    title: "Control de Horarios y Asistentes",
    desc: "Control de horarios y gestión eficiente, anticipación de eventos, programación, horarios y reportes automatizados.",
  },
  {
    icon: DollarSign,
    title: "Pagos y Nómina Automatizados",
    desc: "Calcula pagos, extras y deducciones automáticamente. Exporta reportes de nómina en un clic.",
  },
];

const stats = [
  { value: "99%", label: "Precisión en nómina" },
  { value: "70%", label: "Menos tiempo admin" },
  { value: "24/7", label: "Acceso total" },
  { value: "∞", label: "Empleados soportados" },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-background overflow-hidden">
      {/* Nav */}
      <header className="fixed top-0 inset-x-0 z-50 bg-background/90 backdrop-blur-xl border-b border-border/40">
        <div className="container flex items-center justify-between h-16">
          <div className="flex items-center gap-2.5">
            <img src={logoQS} alt="Staffly" className="h-9 object-contain" />
            <span className="font-heading font-bold text-xl tracking-tight text-foreground">
              Staff<span className="text-primary">ly</span>
            </span>
          </div>
          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-muted-foreground">
            <a href="#inicio" className="hover:text-foreground transition-colors">Inicio</a>
            <a href="#funciones" className="hover:text-foreground transition-colors">Funciones</a>
            <a href="#precios" className="hover:text-foreground transition-colors">Precios</a>
            <Link to="/install" className="hover:text-foreground transition-colors">Descargar App</Link>
            <a href="#contacto" className="hover:text-foreground transition-colors">Contacto</a>
          </nav>
          <div className="flex items-center gap-3">
            <Button asChild className="rounded-full px-6 shadow-md hover:shadow-lg transition-shadow">
              <Link to="/auth">Iniciar sesión</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section id="inicio" className="relative pt-28 pb-12 sm:pt-36 sm:pb-20">
        {/* Background glow */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[800px] h-[800px] rounded-full opacity-[0.06] bg-primary blur-[120px]" />
        </div>

        <div className="container relative">
          <div className="max-w-4xl mx-auto text-center">
            <h1 className="font-heading text-4xl sm:text-5xl lg:text-7xl font-extrabold tracking-tight leading-[1.05] text-foreground">
              Gestión de personal
              <br />
              <span className="text-primary">inteligente</span>
            </h1>

            <p className="mt-6 text-lg sm:text-xl text-muted-foreground max-w-xl mx-auto leading-relaxed">
              Turnos y pagos en un solo lugar
            </p>

            <div className="mt-10">
              <Button
                size="lg"
                asChild
                className="rounded-full px-10 h-13 text-base font-semibold shadow-lg hover:shadow-xl transition-all"
              >
                <Link to="/auth">
                  Comienza ahora <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>

          {/* Hero image — Staffly devices mockup */}
          <div className="mt-16 relative max-w-5xl mx-auto">
            <div className="absolute inset-x-10 -bottom-8 h-40 bg-primary opacity-[0.08] blur-3xl rounded-full" />
            <img
              src={stafflyHero}
              alt="Staffly — Plataforma de gestión de personal en todos los dispositivos"
              className="w-full h-auto relative z-10"
              loading="eager"
            />
          </div>
        </div>
      </section>

      {/* Stats bar */}
      <section className="py-14 sm:py-16 bg-card/50 border-y border-border/40">
        <div className="container">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 max-w-4xl mx-auto">
            {stats.map((s) => (
              <div key={s.label} className="text-center">
                <p className="text-3xl sm:text-4xl font-heading font-extrabold text-primary">{s.value}</p>
                <p className="text-sm text-muted-foreground mt-1 font-medium">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="funciones" className="py-16 sm:py-24">
        <div className="container">
          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {features.map((f) => (
              <div
                key={f.title}
                className="bg-card rounded-2xl border border-border/50 p-8 shadow-sm hover-lift transition-all duration-400 hover:border-primary/20"
              >
                <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mb-5">
                  <f.icon className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-heading font-semibold text-lg mb-3">{f.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonial */}
      <section className="py-16 sm:py-20 bg-card/40 border-y border-border/40">
        <div className="container">
          <div className="max-w-3xl mx-auto text-center">
            <div className="inline-flex items-center gap-1 mb-6">
              {[1, 2, 3, 4, 5].map(i => (
                <Star key={i} className="h-5 w-5 text-warning fill-warning" />
              ))}
            </div>
            <blockquote className="font-heading text-xl sm:text-2xl font-semibold leading-relaxed text-foreground">
              "Staffly nos ha permitido optimizar la programación de turnos y gestionar 
              horas de nómina de forma automatizada. Ahorramos tiempo y mejoramos 
              la productividad."
            </blockquote>
            <div className="mt-8 flex items-center justify-center gap-3">
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="text-sm font-bold text-primary">LT</span>
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold">Laura Torres</p>
                <p className="text-xs text-muted-foreground">Coordinadora de Equipos en Servicios</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 sm:py-24">
        <div className="container">
          <div className="relative rounded-3xl bg-primary p-10 sm:p-16 text-center overflow-hidden max-w-5xl mx-auto">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.12),transparent_50%)]" />
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-xl" />

            <div className="relative">
              <h2 className="font-heading text-3xl sm:text-4xl lg:text-5xl font-bold text-white tracking-tight leading-tight">
                Lleva tu operación
                <br />
                al siguiente nivel
              </h2>
              <p className="mt-5 text-white/80 text-lg max-w-lg mx-auto">
                Únete a las empresas que ya gestionan su personal de forma inteligente.
              </p>
              <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
                <Button
                  size="lg"
                  asChild
                  className="bg-white text-primary hover:bg-white/90 shadow-xl rounded-full h-13 px-10 text-base font-bold"
                >
                  <Link to="/auth">
                    Crear mi cuenta <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  asChild
                  className="border-white/30 text-white hover:bg-white/10 rounded-full h-13 px-8 text-base"
                >
                  <Link to="/auth">Iniciar sesión</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/40 py-10">
        <div className="container">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2.5">
              <img src={logoQS} alt="Staffly" className="h-7 object-contain" />
              <span className="font-heading font-bold text-lg text-foreground">
                Staff<span className="text-primary">ly</span>
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} Staffly. Todos los derechos reservados.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
