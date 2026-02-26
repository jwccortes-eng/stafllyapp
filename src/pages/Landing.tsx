import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  CalendarDays, DollarSign, Users, Clock, BarChart3, Shield,
  ArrowRight, Megaphone, Smartphone, CheckCircle2, Zap, Star,
  MessageSquare, Settings, Globe, ChevronRight,
} from "lucide-react";
import logoQS from "@/assets/logo-quality-staff.png";
import heroMockup from "@/assets/hero-mockup.jpg";

const features = [
  {
    icon: CalendarDays,
    title: "Programación de Turnos",
    desc: "Crea, asigna y publica turnos en minutos. Tus empleados los ven y reclaman desde su celular.",
    color: "from-primary to-primary/80",
  },
  {
    icon: Clock,
    title: "Control de Horarios",
    desc: "Clock-in/out con geofencing y aprobaciones automáticas. Sabrás quién llegó y a qué hora.",
    color: "from-chart-2 to-chart-2/80",
  },
  {
    icon: DollarSign,
    title: "Pagos y Nómina",
    desc: "Calcula pagos, extras y deducciones automáticamente. Exporta reportes en un clic.",
    color: "from-earning to-earning/80",
  },
  {
    icon: Users,
    title: "Portal del Empleado",
    desc: "Cada empleado tiene acceso a sus turnos, pagos y anuncios desde cualquier dispositivo.",
    color: "from-chart-4 to-chart-4/80",
  },
  {
    icon: MessageSquare,
    title: "Chat Interno",
    desc: "Comunicación directa con tu equipo. Conversaciones individuales y grupales seguras.",
    color: "from-chart-5 to-chart-5/80",
  },
  {
    icon: BarChart3,
    title: "Reportes Ejecutivos",
    desc: "Dashboards en tiempo real con KPIs clave. Toma decisiones basadas en datos.",
    color: "from-primary to-primary/80",
  },
];

const stats = [
  { value: "99%", label: "Precisión en nómina" },
  { value: "70%", label: "Menos tiempo administrativo" },
  { value: "24/7", label: "Acceso desde cualquier lugar" },
  { value: "∞", label: "Empleados soportados" },
];

const highlights = [
  "Multi-empresa y multi-rol",
  "Importación masiva de datos",
  "Conceptos de pago personalizables",
  "Invitaciones por QR y enlace",
  "Geofencing inteligente",
  "Automatizaciones configurables",
  "Auditoría completa",
  "100% responsive",
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-background overflow-hidden">
      {/* Nav */}
      <header className="fixed top-0 inset-x-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <div className="container flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <img src={logoQS} alt="Stafly" className="h-9 object-contain" />
            <span className="font-heading font-bold text-xl tracking-tight">
              Staf<span className="gradient-text">ly</span>
            </span>
          </div>
          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-muted-foreground">
            <a href="#features" className="hover:text-foreground transition-colors">Funciones</a>
            <a href="#benefits" className="hover:text-foreground transition-colors">Beneficios</a>
            <a href="#stats" className="hover:text-foreground transition-colors">Resultados</a>
          </nav>
          <div className="flex items-center gap-3">
            <Button variant="ghost" asChild className="hidden sm:inline-flex">
              <Link to="/auth">Iniciar sesión</Link>
            </Button>
            <Button asChild className="gradient-primary border-0 text-white shadow-md hover:opacity-90 transition-opacity">
              <Link to="/auth">
                Comienza ahora <ArrowRight className="ml-1.5 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative pt-28 pb-8 sm:pt-36 sm:pb-16">
        {/* BG blurs */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-60 left-1/2 -translate-x-1/2 w-[900px] h-[900px] rounded-full opacity-[0.07] bg-primary blur-[120px]" />
          <div className="absolute bottom-0 -left-40 w-[500px] h-[500px] rounded-full opacity-[0.05] bg-chart-2 blur-[100px]" />
        </div>

        <div className="container relative">
          <div className="max-w-4xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border bg-card/80 backdrop-blur text-sm font-medium text-muted-foreground mb-8 shadow-sm">
              <Zap className="h-3.5 w-3.5 text-primary" />
              Gestión de personal inteligente
            </div>

            <h1 className="font-heading text-4xl sm:text-5xl lg:text-7xl font-extrabold tracking-tight leading-[1.05]">
              Turnos y pagos
              <br />
              <span className="gradient-text">en un solo lugar</span>
            </h1>

            <p className="mt-6 text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              La plataforma todo-en-uno para empresas de staffing. Automatiza nómina, 
              programa turnos y conecta con tu equipo — desde cualquier dispositivo.
            </p>

            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button
                size="lg"
                asChild
                className="gradient-primary border-0 text-white shadow-lg hover:opacity-90 transition-all h-13 px-10 text-base font-semibold"
              >
                <Link to="/auth">
                  Comienza ahora <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild className="h-13 px-8 text-base">
                <a href="#features">
                  Ver funcionalidades
                </a>
              </Button>
            </div>

            {/* Trust bar */}
            <div className="mt-12 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <Shield className="h-4 w-4 text-primary" />
                <span>Datos encriptados</span>
              </div>
              <div className="h-4 w-px bg-border" />
              <div className="flex items-center gap-1.5">
                <Smartphone className="h-4 w-4 text-primary" />
                <span>App móvil incluida</span>
              </div>
              <div className="h-4 w-px bg-border" />
              <div className="flex items-center gap-1.5">
                <Globe className="h-4 w-4 text-primary" />
                <span>Multi-empresa</span>
              </div>
            </div>
          </div>

          {/* Hero mockup image */}
          <div className="mt-16 relative max-w-5xl mx-auto">
            <div className="absolute inset-x-10 -bottom-8 h-40 gradient-primary opacity-10 blur-3xl rounded-full" />
            <div className="relative rounded-2xl overflow-hidden shadow-2xl border border-border/50">
              <img
                src={heroMockup}
                alt="Stafly plataforma de gestión de personal"
                className="w-full h-auto"
                loading="eager"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section id="stats" className="py-16 sm:py-20">
        <div className="container">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 max-w-4xl mx-auto">
            {stats.map((s) => (
              <div key={s.label} className="text-center p-6 rounded-2xl bg-card border shadow-sm">
                <p className="text-3xl sm:text-4xl font-heading font-extrabold gradient-text">{s.value}</p>
                <p className="text-sm text-muted-foreground mt-2 font-medium">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-16 sm:py-24 bg-card/40">
        <div className="container">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border bg-card/80 text-sm font-medium text-muted-foreground mb-6">
              <Settings className="h-3.5 w-3.5 text-primary" />
              Funcionalidades
            </div>
            <h2 className="font-heading text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight">
              Todo lo que necesitas para
              <br />
              <span className="gradient-text">gestionar tu equipo</span>
            </h2>
            <p className="mt-4 text-muted-foreground text-lg max-w-xl mx-auto">
              Herramientas diseñadas para la operación real del staffing moderno.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
            {features.map((f) => (
              <div
                key={f.title}
                className="group bg-card rounded-2xl border p-7 shadow-sm hover:shadow-xl hover:border-primary/20 transition-all duration-500 hover:-translate-y-1"
              >
                <div className={`h-12 w-12 rounded-xl bg-gradient-to-br ${f.color} flex items-center justify-center mb-5 shadow-sm group-hover:scale-110 transition-transform duration-300`}>
                  <f.icon className="h-6 w-6 text-white" />
                </div>
                <h3 className="font-heading font-semibold text-lg mb-2">{f.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits / Highlights */}
      <section id="benefits" className="py-16 sm:py-24">
        <div className="container">
          <div className="max-w-6xl mx-auto flex flex-col lg:flex-row gap-16 items-center">
            <div className="flex-1">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border bg-card/80 text-sm font-medium text-muted-foreground mb-6">
                <Star className="h-3.5 w-3.5 text-primary" />
                ¿Por qué Stafly?
              </div>
              <h2 className="font-heading text-3xl sm:text-4xl font-bold tracking-tight leading-tight">
                Diseñado para
                <br />
                <span className="gradient-text">empresas reales</span>
              </h2>
              <p className="mt-4 text-muted-foreground text-lg leading-relaxed max-w-lg">
                Stafly nació de la operación diaria de Quality Staff. Cada función fue creada
                para resolver un problema real del staffing moderno.
              </p>

              <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-4">
                {highlights.map((h) => (
                  <div key={h} className="flex items-center gap-3 p-3 rounded-xl bg-card border hover:border-primary/20 transition-colors">
                    <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
                    <span className="text-sm font-medium">{h}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Decorative cards */}
            <div className="flex-1 flex justify-center">
              <div className="relative w-80 sm:w-96">
                {/* Background glow */}
                <div className="absolute inset-x-8 top-8 h-full rounded-3xl gradient-primary opacity-10 blur-2xl" />
                
                {/* Card stack */}
                <div className="absolute inset-x-4 top-6 h-full rounded-2xl bg-card/50 border shadow-md" />
                <div className="absolute inset-x-2 top-3 h-full rounded-2xl bg-card/80 border shadow-md" />
                <div className="relative rounded-2xl bg-card border shadow-xl p-7 space-y-6">
                  {/* Mock dashboard header */}
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl gradient-primary flex items-center justify-center">
                      <DollarSign className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">Resumen de Nómina</p>
                      <p className="text-xs text-muted-foreground">Periodo actual</p>
                    </div>
                  </div>
                  
                  {/* Mock KPIs */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl bg-accent p-3.5">
                      <p className="text-[10px] text-muted-foreground font-medium uppercase">Empleados</p>
                      <p className="text-xl font-bold font-heading mt-1">24</p>
                    </div>
                    <div className="rounded-xl bg-earning/10 p-3.5">
                      <p className="text-[10px] text-earning font-medium uppercase">Total pagos</p>
                      <p className="text-xl font-bold font-heading mt-1">$18.5k</p>
                    </div>
                  </div>

                  {/* Mock employee list */}
                  <div className="space-y-2.5">
                    {["Ana Martínez", "Carlos López", "María García"].map((name, i) => (
                      <div key={name} className="flex items-center justify-between p-2.5 rounded-xl bg-muted/50">
                        <div className="flex items-center gap-2.5">
                          <div className="h-7 w-7 rounded-full gradient-primary flex items-center justify-center text-[10px] font-bold text-white">
                            {name[0]}
                          </div>
                          <span className="text-xs font-medium">{name}</span>
                        </div>
                        <span className="text-xs font-bold text-earning">
                          ${(750 + i * 120).toFixed(0)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonial / Quote */}
      <section className="py-16 sm:py-20 bg-card/40">
        <div className="container">
          <div className="max-w-3xl mx-auto text-center">
            <div className="inline-flex items-center gap-1 mb-6">
              {[1, 2, 3, 4, 5].map(i => (
                <Star key={i} className="h-5 w-5 text-chart-4 fill-chart-4" />
              ))}
            </div>
            <blockquote className="font-heading text-xl sm:text-2xl font-semibold leading-relaxed text-foreground">
              "Stafly nos ha permitido optimizar la programación de turnos y gestionar la nómina 
              de forma automatizada. Ahorramos tiempo y reducimos errores significativamente."
            </blockquote>
            <div className="mt-8 flex items-center justify-center gap-3">
              <div className="h-11 w-11 rounded-full gradient-primary flex items-center justify-center text-sm font-bold text-white">
                QS
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold">Quality Staff</p>
                <p className="text-xs text-muted-foreground">Empresa de Staffing</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 sm:py-24">
        <div className="container">
          <div className="relative rounded-3xl gradient-primary p-10 sm:p-16 text-center overflow-hidden max-w-5xl mx-auto">
            {/* Decorative elements */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.15),transparent_50%)]" />
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
                  className="bg-white text-primary hover:bg-white/90 shadow-xl h-13 px-10 text-base font-bold"
                >
                  <Link to="/auth">
                    Crear mi cuenta <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  asChild
                  className="border-white/30 text-white hover:bg-white/10 h-13 px-8 text-base"
                >
                  <Link to="/auth">Iniciar sesión</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-10">
        <div className="container">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <img src={logoQS} alt="Stafly" className="h-7 object-contain" />
              <span className="font-heading font-bold text-lg text-foreground">
                Staf<span className="gradient-text">ly</span>
              </span>
              <span className="text-sm text-muted-foreground ml-1">by Quality Staff</span>
            </div>
            <p className="text-sm text-muted-foreground">
              &copy; {new Date().getFullYear()} Quality Staff by Keury. Todos los derechos reservados.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
