import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Download, Smartphone, CheckCircle2, Apple, ArrowRight } from "lucide-react";
import { Clock } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function Install() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent.toLowerCase();
    setIsIOS(/iphone|ipad|ipod/.test(ua));
    setIsAndroid(/android/.test(ua));
    setIsStandalone(
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as any).standalone === true
    );

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", () => setInstalled(true));

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") setInstalled(true);
    setDeferredPrompt(null);
  };

  if (isStandalone) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <div className="text-center space-y-4 max-w-sm">
          <CheckCircle2 className="h-16 w-16 text-primary mx-auto" />
          <h1 className="text-2xl font-bold font-heading">¡Ya estás usando STAFLY!</h1>
          <p className="text-muted-foreground">La app está instalada y funcionando correctamente.</p>
          <Button asChild className="rounded-full px-8">
            <Link to="/auth">Iniciar sesión <ArrowRight className="ml-2 h-4 w-4" /></Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      <div className="max-w-sm w-full space-y-8 text-center">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2.5">
          <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
            <Clock className="h-6 w-6 text-primary" />
          </div>
          <span className="font-heading font-bold text-2xl tracking-tight text-foreground">
            STAFLY
          </span>
        </div>

        <div className="space-y-3">
          <h1 className="text-3xl font-bold font-heading tracking-tight">Descarga la app</h1>
          <p className="text-muted-foreground">
            Instala STAFLY en tu teléfono para acceder rápidamente a turnos, pagos y más.
          </p>
        </div>

        {/* Mockup icon */}
        <div className="flex justify-center">
          <div className="h-24 w-24 rounded-3xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shadow-2xl shadow-primary/20">
            <Smartphone className="h-10 w-10 text-white" />
          </div>
        </div>

        {/* Install actions */}
        <div className="space-y-3">
          {installed ? (
            <div className="space-y-3">
              <div className="flex items-center justify-center gap-2 text-primary">
                <CheckCircle2 className="h-5 w-5" />
                <span className="font-semibold">¡Instalada correctamente!</span>
              </div>
              <Button asChild className="w-full rounded-full h-12">
                <Link to="/auth">Abrir STAFLY <ArrowRight className="ml-2 h-4 w-4" /></Link>
              </Button>
            </div>
          ) : deferredPrompt ? (
            <Button onClick={handleInstall} className="w-full rounded-full h-12 text-base gap-2 shadow-lg">
              <Download className="h-5 w-5" /> Instalar STAFLY
            </Button>
          ) : isIOS ? (
            <div className="space-y-4">
              <div className="rounded-2xl border bg-card p-5 text-left space-y-3">
                <p className="text-sm font-semibold flex items-center gap-2">
                  <Apple className="h-4 w-4" /> Instalar en iPhone/iPad
                </p>
                <ol className="text-sm text-muted-foreground space-y-2">
                  <li className="flex items-start gap-2">
                    <span className="bg-primary text-primary-foreground rounded-full h-5 w-5 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">1</span>
                    Toca el botón <strong>Compartir</strong> (ícono de cuadro con flecha) en Safari
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="bg-primary text-primary-foreground rounded-full h-5 w-5 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">2</span>
                    Selecciona <strong>"Agregar a pantalla de inicio"</strong>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="bg-primary text-primary-foreground rounded-full h-5 w-5 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">3</span>
                    Confirma tocando <strong>"Agregar"</strong>
                  </li>
                </ol>
              </div>
            </div>
          ) : isAndroid ? (
            <div className="space-y-4">
              <div className="rounded-2xl border bg-card p-5 text-left space-y-3">
                <p className="text-sm font-semibold flex items-center gap-2">
                  <Smartphone className="h-4 w-4" /> Instalar en Android
                </p>
                <ol className="text-sm text-muted-foreground space-y-2">
                  <li className="flex items-start gap-2">
                    <span className="bg-primary text-primary-foreground rounded-full h-5 w-5 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">1</span>
                    Toca el menú <strong>⋮</strong> de tu navegador
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="bg-primary text-primary-foreground rounded-full h-5 w-5 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">2</span>
                    Selecciona <strong>"Instalar app"</strong> o <strong>"Agregar a pantalla de inicio"</strong>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="bg-primary text-primary-foreground rounded-full h-5 w-5 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">3</span>
                    Confirma la instalación
                  </li>
                </ol>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Abre esta página en tu teléfono para instalar la app.
            </p>
          )}
        </div>

        {/* Features */}
        <div className="space-y-2 pt-4 border-t border-border/40">
          {["Acceso rápido desde tu pantalla", "Funciona sin conexión", "Notificaciones de turnos"].map(f => (
            <div key={f} className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
              {f}
            </div>
          ))}
        </div>

        <Button variant="ghost" asChild className="text-xs text-muted-foreground">
          <Link to="/">← Volver al inicio</Link>
        </Button>
      </div>
    </div>
  );
}
