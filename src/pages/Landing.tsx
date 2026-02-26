import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  CalendarDays,
  DollarSign,
  Users,
  Clock,
  BarChart3,
  Shield,
  ArrowRight,
  Megaphone,
  Smartphone,
  CheckCircle2,
  Zap,
  Star,
} from "lucide-react";
import logoQS from "@/assets/logo-quality-staff.png";

const features = [
  {
    icon: DollarSign,
    title: "Nómina automatizada",
    desc: "Calcula pagos, extras y deducciones en segundos. Sin errores manuales.",
  },
  {
    icon: CalendarDays,
    title: "Turnos inteligentes",
    desc: "Crea, asigna y publica turnos. Los empleados reclaman los abiertos desde su portal.",
  },
  {
    icon: Clock,
    title: "Reloj de asistencia",
    desc: "Clock-in/out con geofencing, fotos y aprobaciones automáticas.",
  },
  {
    icon: Users,
    title: "Portal del empleado",
    desc: "Cada empleado ve sus pagos, turnos y anuncios desde su celular.",
  },
  {
    icon: BarChart3,
    title: "Reportes ejecutivos",
    desc: "Dashboards en tiempo real. Exporta a Excel con un clic.",
  },
  {
    icon: Megaphone,
    title: "Comunicación interna",
    desc: "Anuncios, chat interno y notificaciones para todo tu equipo.",
  },
];

const highlights = [
  "Multi-empresa y multi-rol",
  "Importación masiva desde Connecteam",
  "Conceptos de pago personalizables",
  "Invitaciones por QR y enlace",
  "Modo oscuro incluido",
  "100% responsive",
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <header className="fixed top-0 inset-x-0 z-50 glass">
        <div className="container flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <img src={logoQS} alt="Stafly" className="h-9 object-contain" />
            <span className="font-heading font-bold text-lg tracking-tight">
              Staf<span className="gradient-text">ly</span>
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" asChild>
              <Link to="/auth">Iniciar sesión</Link>
            </Button>
            <Button asChild className="gradient-primary border-0 text-white shadow-md hover:opacity-90 transition-opacity">
              <Link to="/auth">
                Empezar gratis <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative pt-32 pb-20 overflow-hidden">
        {/* Background decoration */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-[600px] h-[600px] rounded-full opacity-[0.08] gradient-primary blur-3xl" />
          <div className="absolute -bottom-20 -left-40 w-[500px] h-[500px] rounded-full opacity-[0.06] gradient-primary blur-3xl" />
        </div>

        <div className="container relative">
          <div className="max-w-3xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border bg-card/80 backdrop-blur text-sm font-medium text-muted-foreground mb-8">
              <Zap className="h-3.5 w-3.5 text-primary" />
              Plataforma de gestión de personal
            </div>

            <h1 className="font-heading text-5xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight leading-[1.08]">
              Tu equipo,
              <br />
              <span className="gradient-text">bajo control total</span>
            </h1>

            <p className="mt-6 text-lg sm:text-xl text-muted-foreground max-w-xl mx-auto leading-relaxed">
              Nómina, turnos, asistencia y comunicación en una sola plataforma.
              Diseñado para empresas de staffing que no aceptan menos.
            </p>

            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button
                size="lg"
                asChild
                className="gradient-primary border-0 text-white shadow-lg hover:opacity-90 transition-opacity h-12 px-8 text-base"
              >
                <Link to="/auth">
                  Comenzar ahora <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild className="h-12 px-8 text-base">
                <a href="#features">Ver funcionalidades</a>
              </Button>
            </div>

            {/* Social proof */}
            <div className="mt-14 flex items-center justify-center gap-6 text-sm text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <Shield className="h-4 w-4 text-primary" />
                <span>Datos encriptados</span>
              </div>
              <div className="h-4 w-px bg-border" />
              <div className="flex items-center gap-1.5">
                <Smartphone className="h-4 w-4 text-primary" />
                <span>App móvil incluida</span>
              </div>
              <div className="h-4 w-px bg-border hidden sm:block" />
              <div className="hidden sm:flex items-center gap-1.5">
                <Star className="h-4 w-4 text-primary" />
                <span>Quality Staff by Keury</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20 bg-card/50">
        <div className="container">
          <div className="text-center mb-14">
            <h2 className="font-heading text-3xl sm:text-4xl font-bold tracking-tight">
              Todo lo que necesitas
            </h2>
            <p className="mt-3 text-muted-foreground text-lg max-w-lg mx-auto">
              Herramientas poderosas para gestionar tu fuerza laboral de principio a fin.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {features.map((f) => (
              <div
                key={f.title}
                className="group bg-card rounded-xl border p-6 shadow-sm hover:shadow-lg hover:border-primary/30 transition-all duration-300"
              >
                <div className="h-11 w-11 rounded-lg gradient-primary flex items-center justify-center mb-4 shadow-sm group-hover:scale-110 transition-transform">
                  <f.icon className="h-5 w-5 text-white" />
                </div>
                <h3 className="font-heading font-semibold text-lg mb-1.5">{f.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Highlights */}
      <section className="py-20">
        <div className="container">
          <div className="max-w-4xl mx-auto flex flex-col lg:flex-row gap-12 items-center">
            <div className="flex-1">
              <h2 className="font-heading text-3xl sm:text-4xl font-bold tracking-tight">
                Diseñado para
                <br />
                <span className="gradient-text">empresas reales</span>
              </h2>
              <p className="mt-4 text-muted-foreground text-lg leading-relaxed">
                Stafly nació de la operación diaria de Quality Staff. Cada función fue creada
                para resolver un problema real del staffing moderno.
              </p>

              <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-3">
                {highlights.map((h) => (
                  <div key={h} className="flex items-center gap-2.5">
                    <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                    <span className="text-sm font-medium">{h}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Decorative card stack */}
            <div className="flex-1 flex justify-center">
              <div className="relative w-72 h-80">
                <div className="absolute inset-x-4 top-6 h-full rounded-2xl gradient-primary opacity-20 blur-md" />
                <div className="absolute inset-x-2 top-3 h-full rounded-2xl bg-card border shadow-md" />
                <div className="relative rounded-2xl bg-card border shadow-lg p-6 h-full flex flex-col justify-between">
                  <div>
                    <div className="h-3 w-20 rounded-full bg-primary/20 mb-3" />
                    <div className="h-3 w-32 rounded-full bg-muted mb-2" />
                    <div className="h-3 w-28 rounded-full bg-muted mb-6" />
                    <div className="grid grid-cols-3 gap-2">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="h-16 rounded-lg bg-accent flex items-center justify-center">
                          <div className="h-6 w-6 rounded-full gradient-primary opacity-60" />
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 pt-4 border-t">
                    <div className="h-8 w-8 rounded-full gradient-primary" />
                    <div>
                      <div className="h-2.5 w-20 rounded-full bg-foreground/20 mb-1" />
                      <div className="h-2 w-14 rounded-full bg-muted-foreground/20" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20">
        <div className="container">
          <div className="relative rounded-2xl gradient-primary p-10 sm:p-14 text-center overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.15),transparent_50%)]" />
            <div className="relative">
              <h2 className="font-heading text-3xl sm:text-4xl font-bold text-white tracking-tight">
                Lleva tu operación al siguiente nivel
              </h2>
              <p className="mt-4 text-white/80 text-lg max-w-lg mx-auto">
                Únete a las empresas que ya gestionan su personal de forma inteligente con Stafly.
              </p>
              <Button
                size="lg"
                asChild
                className="mt-8 bg-white text-primary hover:bg-white/90 shadow-lg h-12 px-8 text-base font-semibold"
              >
                <Link to="/auth">
                  Crear mi cuenta <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8">
        <div className="container flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <img src={logoQS} alt="Stafly" className="h-6 object-contain" />
            <span className="font-heading font-semibold text-foreground">Stafly</span>
            <span className="text-muted-foreground">by Quality Staff</span>
          </div>
          <p>&copy; {new Date().getFullYear()} Quality Staff by Keury. Todos los derechos reservados.</p>
        </div>
      </footer>
    </div>
  );
}
