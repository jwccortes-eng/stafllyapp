/**
 * ConsentCenterCard — Worker-facing consent management (E5.8, log_only).
 *
 * Canonical writer for `data_sharing` consent. Worker-scoped only; RLS limits
 * all reads/writes to the worker's own `worker_profile_id`. No admin
 * impersonation; no DELETE.
 *
 * E5.8 scope: surface 4 explicit states (granted / missing / revoked / denied)
 * with approved Spanish copy under the "Comunidad Parceros" section of
 * /portal/update-center. Writer paths unchanged: INSERT to grant, UPDATE
 * `revoked_at` to pause. Production stays in PARCEROS_CONSENT_MODE=log_only.
 */
import { useEffect, useMemo, useState } from "react";
import { Loader2, ShieldCheck, Share2, Users, Pause, Play, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const CONSENT_TYPE = "data_sharing";
const DOC_VERSION = "v1.2026-06-17";

type ConsentRow = {
  id: string;
  consent_type: string;
  granted: boolean;
  granted_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

type ConsentState = "granted" | "missing" | "revoked" | "denied";

const COPY: Record<ConsentState, { title: string; body: string; cta: string }> = {
  missing: {
    title: "Únete a la comunidad Parceros",
    body: "Comparte tu perfil de trabajo con clientes verificados de Stafly y recibe más oportunidades. Tú decides qué se muestra.",
    cta: "Revisar y activar",
  },
  revoked: {
    title: "Tu perfil Parceros está pausado",
    body: "Reactiva el consentimiento cuando quieras volver a aparecer en la comunidad.",
    cta: "Reactivar",
  },
  granted: {
    title: "Parceros activo",
    body: "Tu perfil es visible para clientes verificados. Puedes pausarlo en cualquier momento.",
    cta: "Pausar visibilidad",
  },
  denied: {
    title: "Has rechazado compartir tu perfil",
    body: "Si cambias de opinión, puedes activarlo aquí.",
    cta: "Activar",
  },
};

export function ConsentCenterCard() {
  const { user } = useAuth();
  const [workerProfileId, setWorkerProfileId] = useState<string | undefined>();
  const [resolving, setResolving] = useState(true);
  const [rows, setRows] = useState<ConsentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    let cancelled = false;
    async function resolve() {
      if (!user?.id) {
        setResolving(false);
        return;
      }
      const { data } = await supabase
        .from("worker_profiles")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!cancelled) {
        setWorkerProfileId(data?.id);
        setResolving(false);
      }
    }
    void resolve();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  async function refetch(pid: string) {
    setLoading(true);
    const { data } = await supabase
      .from("worker_consent_records")
      .select("id, consent_type, granted, granted_at, revoked_at, created_at")
      .eq("worker_profile_id", pid)
      .eq("consent_type", CONSENT_TYPE)
      .order("created_at", { ascending: false });
    setRows((data ?? []) as ConsentRow[]);
    setLoading(false);
  }

  useEffect(() => {
    if (workerProfileId) void refetch(workerProfileId);
  }, [workerProfileId]);

  const { state, activeGrantedRow } = useMemo(() => {
    const active = rows.find((r) => r.granted && !r.revoked_at);
    if (active) return { state: "granted" as ConsentState, activeGrantedRow: active };
    if (rows.length === 0) return { state: "missing" as ConsentState, activeGrantedRow: null };
    const latest = rows[0];
    if (latest.granted && latest.revoked_at) {
      return { state: "revoked" as ConsentState, activeGrantedRow: null };
    }
    if (!latest.granted) {
      return { state: "denied" as ConsentState, activeGrantedRow: null };
    }
    return { state: "missing" as ConsentState, activeGrantedRow: null };
  }, [rows]);

  async function handleGrant() {
    if (!workerProfileId || busy) return;
    setBusy(true);
    try {
      const { error } = await supabase.from("worker_consent_records").insert({
        worker_profile_id: workerProfileId,
        consent_type: CONSENT_TYPE,
        granted: true,
        granted_at: new Date().toISOString(),
        document_version: DOC_VERSION,
        user_agent: navigator.userAgent.slice(0, 200),
      } as never);
      if (error) throw error;
      toast({
        title: "Consentimiento otorgado",
        description: "Tu perfil podrá compartirse con la comunidad Parceros.",
      });
      await refetch(workerProfileId);
    } catch (err) {
      toast({
        title: "No se pudo actualizar",
        description: err instanceof Error ? err.message : "Intenta de nuevo.",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleRevoke() {
    if (!workerProfileId || !activeGrantedRow || busy) return;
    setBusy(true);
    try {
      const { error } = await supabase
        .from("worker_consent_records")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", activeGrantedRow.id);
      if (error) throw error;
      toast({
        title: "Visibilidad pausada",
        description: "Dejaremos de compartir tu perfil con la comunidad Parceros.",
      });
      await refetch(workerProfileId);
    } catch (err) {
      toast({
        title: "No se pudo actualizar",
        description: err instanceof Error ? err.message : "Intenta de nuevo.",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }

  if (resolving) return null;
  if (!workerProfileId) return null;

  const copy = COPY[state];
  const isGranted = state === "granted";
  const CtaIcon = isGranted ? Pause : Play;

  return (
    <section className="space-y-1.5">
      <h2 className="px-1 text-[10.5px] font-bold uppercase tracking-widest text-muted-foreground/55">
        Comunidad Parceros
      </h2>

      <div className="rounded-2xl border border-border/60 bg-card p-3 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="h-9 w-9 rounded-xl bg-primary/8 text-primary flex items-center justify-center shrink-0">
            <Users className="h-4.5 w-4.5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-[14px] font-bold text-foreground leading-tight">
              {copy.title}
            </h3>
            <p className="mt-1 text-[11.5px] text-muted-foreground/80 leading-snug">
              {copy.body}
            </p>
          </div>
        </div>

        {/* What we share / never share */}
        <div className="mt-3 rounded-xl bg-muted/40 px-3 py-2 flex flex-col gap-2">
          <div className="flex items-start gap-2">
            <Share2 className="h-3.5 w-3.5 text-muted-foreground/70 mt-0.5 shrink-0" />
            <p className="text-[10.5px] text-muted-foreground/75 leading-snug">
              <span className="font-semibold text-muted-foreground/90">Sí compartimos:</span>{" "}
              nombre visible, foto si está autorizada, experiencia pública, habilidades, idiomas,
              reputación autorizada y ciudad/zona general si aplica.
            </p>
          </div>
          <div className="flex items-start gap-2">
            <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground/70 mt-0.5 shrink-0" />
            <p className="text-[10.5px] text-muted-foreground/75 leading-snug">
              <span className="font-semibold text-muted-foreground/90">Nunca compartimos:</span>{" "}
              payroll, horas de pago, time_entries, SSN/EIN, dirección exacta, información
              bancaria, documentos privados, notas internas, datos médicos, chat privado ni datos
              privados de compañías/tenants.
            </p>
          </div>
        </div>

        {/* CTA */}
        <div className="mt-3 flex items-center justify-between gap-2">
          {isGranted && activeGrantedRow?.granted_at ? (
            <span className="flex items-center gap-1.5 text-[10.5px] text-muted-foreground/65">
              <Info className="h-3 w-3" />
              Activo desde{" "}
              {new Date(activeGrantedRow.granted_at).toLocaleDateString("es-MX", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })}
            </span>
          ) : (
            <span />
          )}
          <Button
            size="sm"
            variant={isGranted ? "outline" : "default"}
            disabled={loading || busy}
            onClick={isGranted ? handleRevoke : handleGrant}
            className="h-8 text-[11.5px] font-semibold"
          >
            {loading || busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <>
                <CtaIcon className="h-3.5 w-3.5 mr-1.5" />
                {copy.cta}
              </>
            )}
          </Button>
        </div>
      </div>
    </section>
  );
}
