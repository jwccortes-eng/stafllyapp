import { Link, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { StaflyMark } from "@/components/brand/StaflyBrand";
import { ArrowRight, LogIn, ShieldCheck, ClipboardCheck } from "lucide-react";
import { resolveRestoreTarget } from "@/lib/session/workspace-memory";

/**
 * MobileAppEntry — Spanish-first operational entry screen for the
 * installed app (Capacitor / TestFlight / installed PWA).
 *
 * Presentation-only. Reuses existing routes (/portal, /app, /auth).
 * No auth, RLS, payroll, shifts, time_entries, or backend logic changes.
 */
export default function MobileAppEntry() {
  const { user, canAccessAdmin, canAccessPortal, activeMode } = useAuth();
  const navigate = useNavigate();

  // Honor Supabase hash redirects if they land here.
  useEffect(() => {
    const hash = window.location.hash;
    if (
      hash &&
      (hash.includes("access_token") ||
        hash.includes("refresh_token") ||
        hash.includes("type=") ||
        hash.includes("error"))
    ) {
      navigate(`/auth/callback${hash}`, { replace: true });
    }
  }, [navigate]);

  // P0 — reopen exactly where the user left off on this device.
  const rememberedHref = resolveRestoreTarget({ userId: user?.id, canAccessAdmin, canAccessPortal });

  const portalHref =
    rememberedHref ??
    (canAccessPortal && canAccessAdmin
      ? activeMode === "employee"
        ? "/portal"
        : "/app"
      : canAccessPortal
        ? "/portal"
        : canAccessAdmin
          ? "/app"
          : "/portal");

  const adminHref = canAccessAdmin ? "/app" : null;

  return (
    <div
      className="min-h-screen bg-background text-foreground flex flex-col"
      style={{
        paddingTop: "env(safe-area-inset-top, 0px)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      {/* Compact header */}
      <header className="px-5 pt-4 pb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <StaflyMark size={26} />
          <span className="font-heading font-bold text-[15px] tracking-tight text-foreground">
            Stafly <span className="text-primary">Core</span>
          </span>
        </div>
        {!user && (
          <Link
            to="/auth"
            className="text-[12px] font-semibold text-muted-foreground hover:text-foreground transition-colors"
          >
            Iniciar sesión
          </Link>
        )}
      </header>

      {/* Main */}
      <main className="flex-1 flex flex-col justify-center px-6 py-5 max-w-md mx-auto w-full">
        <div className="h-14 w-14 rounded-2xl bg-primary/10 border border-primary/15 flex items-center justify-center mb-6">
          <ClipboardCheck className="h-7 w-7 text-primary" strokeWidth={2} />
        </div>

        <h1 className="text-3xl font-bold font-heading tracking-tight leading-tight mb-3">
          Bienvenido a <span className="text-primary">Stafly Core</span>
        </h1>

        <p className="text-[15px] text-muted-foreground leading-relaxed mb-8">
          Accede a tu portal para ver turnos, fichar, completar documentos y mantener tu perfil
          listo.
        </p>

        <div className="space-y-3">
          {user ? (
            <>
              <Button
                asChild
                size="lg"
                className="w-full rounded-2xl h-13 text-base font-semibold shadow-sm"
                style={{ height: 52 }}
              >
                <Link to={portalHref}>
                  Entrar al portal <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              {adminHref && portalHref !== adminHref && (
                <Button
                  asChild
                  variant="outline"
                  size="lg"
                  className="w-full rounded-2xl text-base font-semibold"
                  style={{ height: 52 }}
                >
                  <Link to={adminHref}>Ir al dashboard</Link>
                </Button>
              )}
            </>
          ) : (
            <>
              <Button
                asChild
                size="lg"
                className="w-full rounded-2xl text-base font-semibold shadow-sm"
                style={{ height: 52 }}
              >
                <Link to="/auth">
                  <LogIn className="mr-2 h-4 w-4" /> Iniciar sesión
                </Link>
              </Button>
              <p className="text-center text-[12px] text-muted-foreground/80 pt-1">
                ¿Recibiste una invitación? Inicia sesión con tu teléfono o correo.
              </p>
            </>
          )}
        </div>
      </main>

      {/* Footer trust line */}
      <footer className="px-6 pb-6 pt-4">
        <p className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground/70">
          <ShieldCheck className="h-3 w-3" />
          Portal seguro · Solo con invitación · Operación segura
        </p>
      </footer>
    </div>
  );
}
