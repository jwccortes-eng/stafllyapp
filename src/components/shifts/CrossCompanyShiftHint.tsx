import { useEffect, useState } from "react";
import { Building2, ArrowRightLeft, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { Button } from "@/components/ui/button";
import { isExactShiftCodeQuery } from "@/lib/shifts/shift-ref";
import { notifyError } from "@/lib/feedback/notify";

/**
 * FASE 4 — Descubrimiento cross-company SEGURO.
 *
 * Reglas (fail-closed):
 *   - La lista normal NUNCA mezcla empresas: sigue filtrada por la activa.
 *   - Sólo se consulta cuando la búsqueda es un CÓDIGO EXACTO y la empresa
 *     activa no tiene resultados.
 *   - La consulta va por la función `find_shift_across_my_companies`, que
 *     limita el resultado a las empresas donde el usuario ya tiene acceso.
 *     Sin acceso ⇒ cero filas ⇒ el usuario ni siquiera descubre que existe.
 */
interface Props {
  /** Texto que escribió el usuario en el buscador. */
  query: string;
  /** true cuando la empresa activa no arrojó ningún resultado. */
  noLocalResults: boolean;
  /** Callback opcional al cambiar de empresa (para limpiar filtros locales). */
  onSwitch?: (shiftId: string) => void;
}

interface Hit {
  shift_id: string;
  company_id: string;
  company_name: string;
  shift_ref: string | null;
  title: string;
  date: string;
  start_time: string;
  end_time: string;
}

export function CrossCompanyShiftHint({ query, noLocalResults, onSwitch }: Props) {
  const { selectedCompanyId, setSelectedCompanyId } = useCompany();
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);

  const active = noLocalResults && isExactShiftCodeQuery(query);

  useEffect(() => {
    if (!active) { setHits([]); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true);
      const { data, error } = await supabase.rpc("find_shift_across_my_companies", {
        p_query: query.trim(),
      });
      if (cancelled) return;
      setLoading(false);
      if (error) {
        notifyError({
          title: "No pudimos buscar en tus otras empresas",
          fact: "La búsqueda dentro de esta empresa sigue funcionando.",
          consequence: "Es posible que el turno exista en otra empresa y no lo veas todavía.",
          cause: error,
          key: "cross-company-shift-search",
        });
        setHits([]);
        return;
      }
      setHits(((data as any[]) ?? []).filter(h => h.company_id !== selectedCompanyId) as Hit[]);
    }, 350);
    return () => { cancelled = true; clearTimeout(t); };
  }, [active, query, selectedCompanyId]);

  if (!active) return null;

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-border/60 bg-muted/30 px-4 py-3 text-[13px] text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Buscando este código en tus otras empresas…
      </div>
    );
  }

  if (hits.length === 0) return null;

  const typed = normalizeShiftQuery(query);

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4 space-y-3">
      <p className="text-[15px] font-semibold">Encontramos este turno en otra empresa</p>
      {hits.map(h => {
        const identity = getShiftDisplayIdentity(h, { companyName: h.company_name });
        // El usuario buscó por un número anterior: se lo decimos, pero la
        // identidad que mostramos es siempre la referencia canónica.
        const searchedByLegacy =
          identity.hasCanonicalRef && typed && identity.primaryRef.toUpperCase() !== typed;
        return (
        <div key={h.shift_id} className="flex flex-wrap items-center gap-3">
          <span className="h-9 w-9 rounded-full bg-muted inline-flex items-center justify-center shrink-0">
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] text-muted-foreground break-words">{h.company_name}</span>
            <span className="block text-[15px] font-semibold font-mono break-words">
              {identity.primaryRef}
            </span>
            <span className="block text-[13px] text-muted-foreground break-words">
              {h.title} · {h.date} · {h.start_time.slice(0, 5)}–{h.end_time.slice(0, 5)}
            </span>
            {searchedByLegacy && (
              <span className="block text-[12px] text-muted-foreground/80 break-words">
                Buscado mediante referencia anterior {typed}.
              </span>
            )}
          </span>

          <Button
            variant="outline"
            className="min-h-[44px]"
            onClick={() => {
              setSelectedCompanyId(h.company_id);
              onSwitch?.(h.shift_id);
            }}
          >
            <ArrowRightLeft className="h-4 w-4 mr-2" />
            Cambiar de empresa y abrir
          </Button>
        </div>
      ))}
      <p className="text-[12px] text-muted-foreground">
        Sólo se muestran empresas a las que ya tienes acceso.
      </p>
    </div>
  );
}
