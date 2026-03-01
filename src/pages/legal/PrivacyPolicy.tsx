import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { StaflyLogo } from "@/components/brand/StaflyBrand";

export default function PrivacyPolicy() {
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
          <h1 className="text-3xl font-heading font-bold text-foreground">Política de Privacidad</h1>
          <p className="text-sm text-muted-foreground mt-2">Última actualización: 1 de marzo de 2026</p>
        </div>

        <div className="prose prose-sm dark:prose-invert max-w-none space-y-6 text-muted-foreground leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-foreground">1. Información que recopilamos</h2>
            <p>Recopilamos la siguiente información:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Datos de cuenta:</strong> nombre, email, teléfono, nombre de empresa</li>
              <li><strong>Datos de empleados:</strong> nombre, teléfono, email, rol, fecha de inicio, foto de perfil</li>
              <li><strong>Datos operativos:</strong> turnos, fichajes, ubicaciones GPS, horas trabajadas</li>
              <li><strong>Datos financieros:</strong> tasas de pago, deducciones, bonos, historial de nómina</li>
              <li><strong>Datos de uso:</strong> páginas visitadas, acciones realizadas, dispositivo y navegador</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">2. Cómo usamos la información</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>Proporcionar y mantener el servicio</li>
              <li>Procesar nómina y generar reportes</li>
              <li>Verificar ubicación de fichajes (GPS)</li>
              <li>Enviar notificaciones y comunicaciones del servicio</li>
              <li>Mejorar la experiencia del usuario</li>
              <li>Cumplir obligaciones legales y fiscales</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">3. Datos de ubicación (GPS)</h2>
            <p>Recopilamos datos de ubicación únicamente durante el proceso de fichaje (clock-in/out). La ubicación se registra una sola vez al momento del fichaje y no realizamos seguimiento continuo. Los empleados son informados cuando se registra su ubicación.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">4. Compartir información</h2>
            <p>No vendemos datos personales. Compartimos información únicamente con:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Proveedores de infraestructura:</strong> hosting y bases de datos seguras</li>
              <li><strong>Procesadores de pago:</strong> Stripe para facturación de suscripciones</li>
              <li><strong>Autoridades legales:</strong> cuando sea requerido por ley</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">5. Seguridad de datos</h2>
            <p>Implementamos medidas de seguridad que incluyen:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Cifrado en tránsito (TLS/SSL) y en reposo</li>
              <li>Aislamiento de datos por empresa (Row Level Security)</li>
              <li>Autenticación segura con tokens JWT</li>
              <li>Registro de auditoría de todas las acciones</li>
              <li>Acceso basado en roles y permisos granulares</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">6. Retención de datos</h2>
            <p>Retenemos los datos mientras su cuenta esté activa. Al cancelar:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Datos de cuenta: eliminados a los 30 días</li>
              <li>Datos financieros/fiscales: retenidos por 7 años (obligación legal)</li>
              <li>Logs de auditoría: retenidos por 2 años</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">7. Derechos del usuario</h2>
            <p>Usted tiene derecho a:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Acceder a sus datos personales</li>
              <li>Rectificar datos incorrectos</li>
              <li>Solicitar eliminación de datos</li>
              <li>Exportar sus datos en formato estándar</li>
              <li>Revocar el consentimiento de ubicación</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">8. Cookies</h2>
            <p>Utilizamos cookies esenciales para el funcionamiento de la plataforma. Consulte nuestra <Link to="/cookies" className="text-primary hover:underline">Política de Cookies</Link> para más detalles.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">9. Contacto</h2>
            <p>Para ejercer sus derechos o consultas de privacidad: <span className="text-primary font-medium">privacy@staflyapps.com</span></p>
          </section>
        </div>

        <div className="pt-8 border-t border-border/40 flex gap-4 text-sm text-muted-foreground">
          <Link to="/terms" className="hover:text-primary transition-colors">Términos de Servicio</Link>
          <Link to="/cookies" className="hover:text-primary transition-colors">Política de Cookies</Link>
        </div>
      </main>
    </div>
  );
}
