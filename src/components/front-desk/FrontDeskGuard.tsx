/**
 * FrontDeskGuard — Restricts /front-desk to internal staff only.
 *
 * The Front Desk kiosk is an INTERNAL TOOL used by office reception staff
 * on a tablet/TV in the office. It must NOT be reachable as a public flow.
 *
 * Access rules:
 *  - Must be authenticated.
 *  - Must hold one of: developer, owner, company_owner, admin, manager,
 *    supervisor.
 *  - Anyone else (employees, anonymous) is sent to /auth.
 */
import { ReactNode, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Shield, ArrowLeft, LogIn } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const ALLOWED_ROLES = new Set([
  "developer",
  "owner",
  "company_owner",
  "admin",
  "manager",
  "supervisor",
]);

interface Props {
  children: ReactNode;
}

export function FrontDeskGuard({ children }: Props) {
  const { user, role, loading } = useAuth() as any;
  // Avoid flicker: short delay so role finishes resolving on cold loads.
  const [ready, setReady] = useState(!loading);

  useEffect(() => {
    if (!loading) setReady(true);
  }, [loading]);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background px-6 py-10">
        <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-3xl items-center justify-center">
          <Card className="w-full rounded-[28px] border border-border/60 bg-card/95 p-8 text-center shadow-xl backdrop-blur-sm sm:p-12">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-3xl bg-primary/10 text-primary">
              <Shield className="h-8 w-8" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight">Front Desk interno</h1>
            <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground sm:text-base">
              Esta ruta no usa el login visual del kiosko. Es una herramienta interna y solo se habilita para cuentas administrativas desde el panel de Stafly.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Button asChild size="lg" className="rounded-2xl px-6">
                <Link to="/auth?redirect=%2Ffront-desk">
                  <LogIn className="mr-2 h-4 w-4" /> Acceso interno
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="rounded-2xl px-6">
                <Link to="/">
                  <ArrowLeft className="mr-2 h-4 w-4" /> Volver al inicio
                </Link>
              </Button>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  if (!role || !ALLOWED_ROLES.has(role)) {
    return (
      <div className="min-h-screen bg-background px-6 py-10">
        <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-3xl items-center justify-center">
          <Card className="w-full rounded-[28px] border border-border/60 bg-card/95 p-8 text-center shadow-xl backdrop-blur-sm sm:p-12">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-3xl bg-muted text-muted-foreground">
              <Shield className="h-8 w-8" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight">Acceso restringido</h1>
            <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground sm:text-base">
              Front Desk permanece oculto para usuarios normales y visitantes. Ábrelo solo desde menús internos con un perfil developer, owner, admin, manager o supervisor.
            </p>
            <div className="mt-8 flex justify-center">
              <Button asChild size="lg" variant="outline" className="rounded-2xl px-6">
                <Link to="/">
                  <ArrowLeft className="mr-2 h-4 w-4" /> Volver al inicio
                </Link>
              </Button>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

export default FrontDeskGuard;
