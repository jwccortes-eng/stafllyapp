import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { saveIntendedRoute } from "@/lib/auth-session";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader2, CheckCircle2, XCircle, ShieldCheck } from "lucide-react";

type AuthorizationDetails = {
  client?: { name?: string; client_uri?: string };
  scopes?: string[];
  redirect_url?: string;
  redirect_to?: string;
};

// Lightweight typed wrapper — supabase.auth.oauth is currently beta and not in
// the generated types. This narrows the three methods we need.
type OAuthApi = {
  getAuthorizationDetails: (id: string) => Promise<{ data: AuthorizationDetails | null; error: { message: string } | null }>;
  approveAuthorization: (id: string) => Promise<{ data: { redirect_url?: string; redirect_to?: string } | null; error: { message: string } | null }>;
  denyAuthorization: (id: string) => Promise<{ data: { redirect_url?: string; redirect_to?: string } | null; error: { message: string } | null }>;
};
const oauth = (supabase.auth as unknown as { oauth: OAuthApi }).oauth;

const CAN_DO = [
  "Ver tu identidad básica (correo, ID de usuario).",
  "Ver tus próximos turnos asignados (fecha, hora, punto de encuentro, compañía).",
];

const CANNOT_SEE = [
  "Payroll, pagos, tarifas ni horas trabajadas.",
  "Documentos privados (W-9, IDs, contratos).",
  "Información de tus compañeros de turno.",
  "Notas administrativas, GPS ni datos internos.",
];

const CANNOT_DO = [
  "Modificar turnos o asignaciones.",
  "Aprobar horas o mover payroll.",
  "Enviar mensajes o notificaciones.",
  "Actualizar tus documentos o perfil.",
];

export default function OAuthConsent() {
  const [params] = useSearchParams();
  const authorizationId = params.get("authorization_id") ?? "";
  const [details, setDetails] = useState<AuthorizationDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!authorizationId) {
        setError("Falta el parámetro authorization_id.");
        return;
      }
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        const returnTo = window.location.pathname + window.location.search;
        saveIntendedRoute(returnTo);
        window.location.href = "/auth";
        return;
      }
      try {
        const { data, error } = await oauth.getAuthorizationDetails(authorizationId);
        if (!active) return;
        if (error) {
          setError(error.message);
          return;
        }
        const immediate = data?.redirect_url ?? data?.redirect_to;
        if (immediate && !data?.client) {
          window.location.href = immediate;
          return;
        }
        setDetails(data);
      } catch (e: unknown) {
        if (!active) return;
        setError(e instanceof Error ? e.message : "No se pudo cargar la solicitud.");
      }
    })();
    return () => {
      active = false;
    };
  }, [authorizationId]);

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    try {
      const { data, error } = approve
        ? await oauth.approveAuthorization(authorizationId)
        : await oauth.denyAuthorization(authorizationId);
      if (error) {
        setBusy(false);
        setError(error.message);
        return;
      }
      const target = data?.redirect_url ?? data?.redirect_to;
      if (!target) {
        setBusy(false);
        setError("El servidor de autorización no devolvió una URL de redirección.");
        return;
      }
      window.location.href = target;
    } catch (e: unknown) {
      setBusy(false);
      setError(e instanceof Error ? e.message : "No se pudo completar la aprobación.");
    }
  }

  if (error) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <Card className="max-w-md w-full p-6 space-y-3">
          <h1 className="text-lg font-semibold">No se pudo cargar la solicitud</h1>
          <p className="text-sm text-muted-foreground">{error}</p>
        </Card>
      </main>
    );
  }

  if (!details) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando…
        </div>
      </main>
    );
  }

  const clientName = details.client?.name ?? "una aplicación externa";

  return (
    <main className="min-h-screen flex items-center justify-center p-4 sm:p-6 bg-background">
      <Card className="max-w-lg w-full p-6 space-y-5">
        <header className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wide">
            <ShieldCheck className="h-3.5 w-3.5" />
            Acceso de solo lectura
          </div>
          <h1 className="text-xl font-semibold leading-tight">
            Conectar {clientName} a tu cuenta de Stafly
          </h1>
          <p className="text-sm text-muted-foreground">
            {clientName} actuará como tú a través de las herramientas expuestas por Stafly.
            Solo puede consultar tus datos — no puede modificar nada.
          </p>
        </header>

        <section className="space-y-2">
          <h2 className="text-sm font-medium flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            Qué podrá ver
          </h2>
          <ul className="text-sm text-muted-foreground space-y-1 pl-6 list-disc">
            {CAN_DO.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-medium flex items-center gap-2">
            <XCircle className="h-4 w-4 text-muted-foreground" />
            Qué NO podrá ver
          </h2>
          <ul className="text-sm text-muted-foreground space-y-1 pl-6 list-disc">
            {CANNOT_SEE.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-medium flex items-center gap-2">
            <XCircle className="h-4 w-4 text-muted-foreground" />
            Qué NO podrá hacer
          </h2>
          <ul className="text-sm text-muted-foreground space-y-1 pl-6 list-disc">
            {CANNOT_DO.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <p className="text-xs text-muted-foreground border-t pt-3">
          Puedes revocar este acceso en cualquier momento desde{" "}
          <span className="font-medium">Portal → Integraciones</span> o pidiéndolo a soporte.
          Cada invocación queda registrada en el historial de auditoría de Stafly.
        </p>

        {details.scopes && details.scopes.length > 0 && (
          <div className="text-xs text-muted-foreground">
            Permisos técnicos solicitados: {details.scopes.join(", ")}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" disabled={busy} onClick={() => decide(false)}>
            Denegar
          </Button>
          <Button disabled={busy} onClick={() => decide(true)}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Aprobar acceso"}
          </Button>
        </div>
      </Card>
    </main>
  );
}
