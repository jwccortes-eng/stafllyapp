import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { StaflyLogo } from "@/components/brand/StaflyBrand";

export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/40 bg-card/80 backdrop-blur-xl sticky top-0 z-30">
        <div className="container flex items-center justify-between h-14">
          <Link to="/" className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors text-sm">
            <ArrowLeft className="h-4 w-4" /> Volver
          </Link>
          <StaflyLogo size={28} />
        </div>
      </header>

      <main className="container max-w-3xl py-12 space-y-8 animate-fade-in">
        <div>
          <h1 className="text-3xl font-heading font-bold text-foreground">Términos de Servicio</h1>
          <p className="text-sm text-muted-foreground mt-2">Última actualización: 1 de marzo de 2026</p>
        </div>

        <div className="prose prose-sm dark:prose-invert max-w-none space-y-6 text-muted-foreground leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-foreground">1. Aceptación de los términos</h2>
            <p>Al acceder y utilizar StaflyApps ("la Plataforma"), usted acepta estar sujeto a estos Términos de Servicio. Si no está de acuerdo con alguna parte de estos términos, no podrá acceder al servicio.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">2. Descripción del servicio</h2>
            <p>StaflyApps es una plataforma SaaS de gestión de personal que ofrece:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Programación y gestión de turnos</li>
              <li>Control de asistencia con verificación GPS</li>
              <li>Procesamiento de nómina semanal</li>
              <li>Generación de reportes y exportaciones</li>
              <li>Portal de empleados</li>
              <li>Gestión de clientes y ubicaciones</li>
              <li>Sistema de comunicación interna</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">3. Cuentas de usuario</h2>
            <p>Usted es responsable de mantener la confidencialidad de su cuenta y contraseña. Acepta notificarnos inmediatamente sobre cualquier uso no autorizado de su cuenta. StaflyApps no será responsable por pérdidas causadas por el uso no autorizado de su cuenta.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">4. Uso aceptable</h2>
            <p>Usted se compromete a:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>No utilizar la plataforma para actividades ilegales</li>
              <li>No intentar acceder a datos de otras empresas</li>
              <li>No realizar ingeniería inversa del software</li>
              <li>No compartir credenciales de acceso</li>
              <li>Mantener actualizados los datos de su empresa y empleados</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">5. Planes y facturación</h2>
            <p>StaflyApps ofrece planes Free, Pro y Enterprise. Los planes de pago se facturan mensualmente. Usted puede cancelar su suscripción en cualquier momento, y el acceso continuará hasta el final del período facturado. No se realizan reembolsos por períodos parciales.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">6. Propiedad intelectual</h2>
            <p>Todo el contenido, código, diseño y marca de StaflyApps son propiedad exclusiva de la empresa. Los datos que usted ingrese en la plataforma siguen siendo de su propiedad.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">7. Disponibilidad del servicio</h2>
            <p>Nos esforzamos por mantener un tiempo de actividad del 99.9%. Sin embargo, no garantizamos disponibilidad ininterrumpida. Nos reservamos el derecho de realizar mantenimiento programado con notificación previa de al menos 24 horas.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">8. Limitación de responsabilidad</h2>
            <p>StaflyApps no será responsable por daños indirectos, incidentales o consecuentes. Nuestra responsabilidad máxima se limita al monto pagado por usted en los últimos 12 meses.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">9. Terminación</h2>
            <p>Podemos suspender o terminar su acceso si viola estos términos. Usted puede cerrar su cuenta en cualquier momento. Al cerrar su cuenta, sus datos se retendrán por 30 días antes de ser eliminados permanentemente.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">10. Modificaciones</h2>
            <p>Nos reservamos el derecho de modificar estos términos. Le notificaremos cambios significativos con al menos 15 días de anticipación. El uso continuado después de las modificaciones constituye aceptación de los nuevos términos.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">11. Contacto</h2>
            <p>Para consultas sobre estos términos, contáctenos en <span className="text-primary font-medium">legal@staflyapps.com</span>.</p>
          </section>
        </div>

        <div className="pt-8 border-t border-border/40 flex gap-4 text-sm text-muted-foreground">
          <Link to="/privacy" className="hover:text-primary transition-colors">Política de Privacidad</Link>
          <Link to="/cookies" className="hover:text-primary transition-colors">Política de Cookies</Link>
        </div>
      </main>
    </div>
  );
}
