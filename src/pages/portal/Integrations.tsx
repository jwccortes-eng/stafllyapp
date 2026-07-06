import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, ShieldCheck, PlugZap, Info } from "lucide-react";

type InvocationRow = {
  id: string;
  oauth_client_id: string | null;
  tool_name: string;
  invoked_at: string;
  ok: boolean;
  error_code: string | null;
};

type ClientSummary = {
  client_id: string;
  first_seen: string;
  last_seen: string;
  total: number;
  errors: number;
};

// In-app revocation via Supabase Auth is not yet exposed to end users.
// Until then this page shows every OAuth client the user has actually
// used (from mcp_invocations) and links to soporte for revocation.
export default function PortalIntegrations() {
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase
          .from("mcp_invocations")
          .select("id,oauth_client_id,tool_name,invoked_at,ok,error_code")
          .order("invoked_at", { ascending: false })
          .limit(500);
        if (error) throw error;
        const rows = (data ?? []) as InvocationRow[];
        const map = new Map<string, ClientSummary>();
        for (const r of rows) {
          const key = r.oauth_client_id ?? "unknown-client";
          const cur = map.get(key);
          if (!cur) {
            map.set(key, {
              client_id: key,
              first_seen: r.invoked_at,
              last_seen: r.invoked_at,
              total: 1,
              errors: r.ok ? 0 : 1,
            });
          } else {
            cur.total += 1;
            if (!r.ok) cur.errors += 1;
            if (r.invoked_at > cur.last_seen) cur.last_seen = r.invoked_at;
            if (r.invoked_at < cur.first_seen) cur.first_seen = r.invoked_at;
          }
        }
        setClients(
          Array.from(map.values()).sort((a, b) =>
            b.last_seen.localeCompare(a.last_seen),
          ),
        );
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "No se pudo cargar el historial.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-5">
      <header className="space-y-1">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5" /> Seguridad · Acceso de agentes
        </div>
        <h1 className="text-2xl font-semibold">Integraciones conectadas</h1>
        <p className="text-sm text-muted-foreground">
          Aquí ves cada aplicación externa (ChatGPT, Claude, Cursor, etc.) que ha
          usado el servidor MCP de Stafly con tu cuenta. Todas son de solo lectura.
        </p>
      </header>

      <Card className="p-4 flex gap-3 items-start bg-muted/40">
        <Info className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
        <div className="text-xs text-muted-foreground space-y-1">
          <p>
            <strong>Revocación in-app:</strong> disponible pronto. Por ahora, para
            revocar el acceso de una integración escríbenos a{" "}
            <a
              className="underline underline-offset-2"
              href="mailto:info@staflyapps.com?subject=Revocar%20acceso%20MCP"
            >
              info@staflyapps.com
            </a>{" "}
            con el <code>client_id</code> mostrado abajo. Cerrar sesión en Stafly
            no revoca los tokens OAuth ya emitidos.
          </p>
          <p>
            Cada invocación queda registrada en un log de auditoría (metadata
            mínima — sin argumentos, sin respuestas, sin tokens).
          </p>
        </div>
      </Card>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando historial…
        </div>
      )}

      {error && (
        <Card className="p-4 text-sm text-destructive">{error}</Card>
      )}

      {!loading && !error && clients.length === 0 && (
        <Card className="p-6 text-center space-y-2">
          <PlugZap className="h-8 w-8 mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Todavía no has conectado ninguna integración vía MCP.
          </p>
        </Card>
      )}

      {!loading && clients.length > 0 && (
        <div className="space-y-3">
          {clients.map((c) => (
            <Card key={c.client_id} className="p-4 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <PlugZap className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium text-sm truncate">
                      {c.client_id === "unknown-client"
                        ? "Cliente sin identificador"
                        : c.client_id}
                    </span>
                    <Badge variant="secondary" className="text-[10px]">
                      Solo lectura
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Última actividad: {new Date(c.last_seen).toLocaleString()}
                    {" · "}
                    Primera conexión: {new Date(c.first_seen).toLocaleDateString()}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {c.total} invocación{c.total === 1 ? "" : "es"}
                    {c.errors > 0 ? ` · ${c.errors} con error` : ""}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled
                  title="Disponible pronto — contacta a soporte para revocar."
                >
                  Revocar
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
