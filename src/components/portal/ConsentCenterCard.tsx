/**
 * ConsentCenterCard — Worker-facing consent management (Phase 2, log_only).
 *
 * Worker-scoped only. RLS limits all reads/writes to the worker's own
 * `worker_profile_id`. No admin impersonation; no DELETE (blocked at DB).
 *
 * Phase 2 scope: single consent — `data_sharing` with Stafly Parceros.
 * Grant via INSERT; revoke via UPDATE (`revoked_at`). Append-only friendly.
 */
import { useEffect, useState } from "react";
import { Loader2, ShieldCheck, Share2, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useWorkerConsent } from "@/hooks/useWorkerConsent";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";

const CONSENT_TYPE = "data_sharing";
const DOC_VERSION = "v1.2026-06-17";

export function ConsentCenterCard() {
  const { user } = useAuth();
  const [workerProfileId, setWorkerProfileId] = useState<string | undefined>();
  const [resolving, setResolving] = useState(true);
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

  const { consents, loading, refetch, hasConsent } = useWorkerConsent({ workerProfileId });
  const granted = hasConsent(CONSENT_TYPE);
  const activeRow = consents.find(
    (c) => (c as { consent_type?: string }).consent_type === CONSENT_TYPE && c.granted && !c.revoked_at,
  );

  async function handleToggle(next: boolean) {
    if (!workerProfileId || busy) return;
    setBusy(true);
    try {
      if (next) {
        const { error } = await supabase.from("worker_consent_records").insert({
          worker_profile_id: workerProfileId,
          consent_type: CONSENT_TYPE,
          granted: true,
          granted_at: new Date().toISOString(),
          document_version: DOC_VERSION,
          user_agent: navigator.userAgent.slice(0, 200),
        } as never);
        if (error) throw error;
        toast({ title: "Consentimiento otorgado", description: "Tu perfil podrá compartirse con Parceros." });
      } else if (activeRow) {
        const { error } = await supabase
          .from("worker_consent_records")
          .update({ revoked_at: new Date().toISOString() })
          .eq("id", activeRow.id);
        if (error) throw error;
        toast({ title: "Consentimiento revocado", description: "Dejaremos de compartir tu perfil con Parceros." });
      }
      await refetch();
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

  return (
    <section className="rounded-2xl border border-border/60 bg-card p-3 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 rounded-xl bg-primary/8 text-primary flex items-center justify-center shrink-0">
          <ShieldCheck className="h-4.5 w-4.5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10.5px] font-bold uppercase tracking-widest text-muted-foreground/55">
            Privacidad
          </p>
          <h2 className="mt-0.5 text-[14px] font-bold text-foreground leading-tight">
            Compartir mi perfil con Parceros
          </h2>
          <p className="mt-1 text-[11.5px] text-muted-foreground/80 leading-snug">
            Activa esta opción para que tu perfil verificado pueda ofrecerse a empresas en la red
            de Parceros. Puedes revocarlo cuando quieras.
          </p>
        </div>
        <div className="shrink-0 pt-0.5">
          {loading || busy ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            <Switch
              checked={granted}
              onCheckedChange={handleToggle}
              aria-label="Compartir perfil con Parceros"
            />
          )}
        </div>
      </div>

      <div className="mt-3 rounded-xl bg-muted/40 px-3 py-2 flex items-start gap-2">
        <Share2 className="h-3.5 w-3.5 text-muted-foreground/70 mt-0.5 shrink-0" />
        <p className="text-[10.5px] text-muted-foreground/75 leading-snug">
          Solo se comparte tu perfil profesional verificado (nombre, foto, experiencia, idiomas,
          habilidades). Nunca compartimos teléfono, correo, dirección, documentos ni datos fiscales.
        </p>
      </div>

      {granted && activeRow?.granted_at && (
        <div className="mt-2 flex items-center gap-1.5 text-[10.5px] text-muted-foreground/65">
          <Info className="h-3 w-3" />
          Otorgado el {new Date(activeRow.granted_at).toLocaleDateString("es-MX", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          })}
        </div>
      )}
    </section>
  );
}
