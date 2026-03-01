import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { StaflyLogo } from "@/components/brand/StaflyBrand";

export default function CookiePolicy() {
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
          <h1 className="text-3xl font-heading font-bold text-foreground">Política de Cookies</h1>
          <p className="text-sm text-muted-foreground mt-2">Última actualización: 1 de marzo de 2026</p>
        </div>

        <div className="prose prose-sm dark:prose-invert max-w-none space-y-6 text-muted-foreground leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-foreground">1. ¿Qué son las cookies?</h2>
            <p>Las cookies son pequeños archivos de texto que se almacenan en su dispositivo cuando visita un sitio web. Se utilizan para recordar sus preferencias y mejorar su experiencia.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">2. Cookies que utilizamos</h2>

            <h3 className="text-base font-medium text-foreground mt-4">Cookies esenciales (obligatorias)</h3>
            <div className="rounded-xl border border-border overflow-hidden mt-2">
              <table className="w-full text-sm">
                <thead><tr className="bg-muted/50"><th className="text-left p-3 font-medium">Cookie</th><th className="text-left p-3 font-medium">Propósito</th><th className="text-left p-3 font-medium">Duración</th></tr></thead>
                <tbody>
                  <tr className="border-t border-border/50"><td className="p-3 font-mono text-xs">sb-auth-token</td><td className="p-3">Autenticación de sesión</td><td className="p-3">7 días</td></tr>
                  <tr className="border-t border-border/50"><td className="p-3 font-mono text-xs">sb-refresh-token</td><td className="p-3">Renovación de sesión</td><td className="p-3">30 días</td></tr>
                  <tr className="border-t border-border/50"><td className="p-3 font-mono text-xs">theme</td><td className="p-3">Preferencia de tema (claro/oscuro)</td><td className="p-3">1 año</td></tr>
                  <tr className="border-t border-border/50"><td className="p-3 font-mono text-xs">nav-pins</td><td className="p-3">Preferencias de navegación</td><td className="p-3">Persistente</td></tr>
                </tbody>
              </table>
            </div>

            <h3 className="text-base font-medium text-foreground mt-4">Almacenamiento local (localStorage)</h3>
            <p>Utilizamos localStorage para almacenar preferencias de interfaz como filtros, orden de columnas y configuraciones de vista. Estos datos permanecen en su dispositivo y no se envían a nuestros servidores.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">3. Cookies de terceros</h2>
            <p>StaflyApps no utiliza cookies de seguimiento de terceros, publicidad ni analytics de terceros. Solo utilizamos cookies estrictamente necesarias para el funcionamiento del servicio.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">4. Gestión de cookies</h2>
            <p>Puede gestionar las cookies desde la configuración de su navegador. Tenga en cuenta que deshabilitar las cookies esenciales impedirá el uso de la plataforma, ya que son necesarias para la autenticación.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">5. Contacto</h2>
            <p>Para consultas sobre cookies: <span className="text-primary font-medium">privacy@staflyapps.com</span></p>
          </section>
        </div>

        <div className="pt-8 border-t border-border/40 flex gap-4 text-sm text-muted-foreground">
          <Link to="/terms" className="hover:text-primary transition-colors">Términos de Servicio</Link>
          <Link to="/privacy" className="hover:text-primary transition-colors">Política de Privacidad</Link>
        </div>
      </main>
    </div>
  );
}
