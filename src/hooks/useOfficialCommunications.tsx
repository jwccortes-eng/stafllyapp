import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveEmployee } from "@/hooks/useEffectiveEmployee";
import { useT } from "@/i18n";
import {
  isCritical,
  requiresAcknowledgment,
  resolveDisplayLanguage,
  versionContent,
  REVIEW_CTA,
  ACK_PENDING_LABEL,
  type AnnouncementVersion,
  type CommLanguage,
  type RecipientState,
} from "@/lib/announcements/official-communications";
import type { AttentionItem } from "@/lib/portal/attention-items";

export interface OfficialEntry {
  announcementId: string;
  version: AnnouncementVersion;
  state: RecipientState;
  acknowledgedAt: string | null;
}

/**
 * Fuente ÚNICA de comunicados oficiales del portal (feed + pendientes de Home).
 *
 * Trae la unidad completa en una sola lectura: versión + estado del
 * destinatario + requisito de acuse + adjuntos + idiomas. Nunca se expone una
 * versión parcialmente hidratada: mientras `loading` es true no hay datos.
 *
 * Frescura, en este orden (sin polling):
 *  1. realtime sobre `announcement_recipients` y `announcement_versions`;
 *  2. refetch al recuperar foco / volver a primer plano.
 *
 * Aislamiento multi-empresa: la lectura se hace por `employee_id` efectivo, que
 * es la ficha de la empresa activa. Al cambiar de empresa cambia el id y el
 * estado se descarta.
 */
export function useOfficialCommunications() {
  const { effectiveEmployeeId, stableEmployeeId } = useEffectiveEmployee();
  const employeeId = effectiveEmployeeId ?? stableEmployeeId;
  const { language } = useT();
  const preferredLanguage: CommLanguage = language === "en" ? "en" : "es";

  const [entries, setEntries] = useState<OfficialEntry[]>([]);
  const [companyNames, setCompanyNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const loadedForRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    if (!employeeId) {
      setEntries([]);
      setLoading(false);
      return;
    }
    if (loadedForRef.current !== employeeId) setLoading(true);

    const { data, error } = await supabase
      .from("announcement_recipients")
      .select("state, acknowledged_at, announcement_versions(*)")
      .eq("employee_id", employeeId);

    if (error) {
      setLoading(false);
      return;
    }

    const byAnnouncement = new Map<string, OfficialEntry>();
    for (const row of (data ?? []) as any[]) {
      const version = row.announcement_versions as AnnouncementVersion | null;
      if (!version || version.status === "draft") continue;
      const prev = byAnnouncement.get(version.announcement_id);
      if (!prev || prev.version.version_number < version.version_number) {
        byAnnouncement.set(version.announcement_id, {
          announcementId: version.announcement_id,
          version,
          state: row.state as RecipientState,
          acknowledgedAt: row.acknowledged_at ?? null,
        });
      }
    }
    const list = [...byAnnouncement.values()];
    setEntries(list);
    loadedForRef.current = employeeId;
    setLoading(false);

    const companyIds = [...new Set(list.map((e) => e.version.company_id))];
    if (companyIds.length > 0) {
      const { data: companies } = await supabase
        .from("companies")
        .select("id, name")
        .in("id", companyIds);
      const map: Record<string, string> = {};
      for (const c of (companies ?? []) as any[]) map[c.id] = c.name;
      setCompanyNames(map);
    }
  }, [employeeId]);

  useEffect(() => {
    load();
  }, [load]);

  // 1) Realtime: cualquier cambio en mi fila de destinatario o en las versiones
  //    vuelve a leer la unidad completa. Nunca se parchea el estado a mano.
  useEffect(() => {
    if (!employeeId) return;
    // Topic único por instancia: el hook se monta en Home, feed, guard y menú.
    // Reutilizar el mismo topic hace que solo una instancia reciba eventos.
    const channel = supabase
      .channel(`official-comms-${employeeId}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "announcement_recipients", filter: `employee_id=eq.${employeeId}` },
        () => load(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "announcement_versions" },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [employeeId, load]);

  // 2) Fallback: al volver al primer plano.
  useEffect(() => {
    const onFocus = () => {
      if (document.visibilityState === "visible") load();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [load]);

  const byAnnouncementId = useMemo(() => {
    const map: Record<string, OfficialEntry> = {};
    for (const e of entries) map[e.announcementId] = e;
    return map;
  }, [entries]);

  /** Pendientes reales: requieren acuse y aún no fueron confirmados. */
  const pendingItems = useMemo<AttentionItem[]>(() => {
    return entries
      .filter(
        (e) =>
          requiresAcknowledgment(e.version.communication_type) &&
          e.state !== "acknowledged",
      )
      .map((e) => {
        const lang = resolveDisplayLanguage(e.version, preferredLanguage);
        const { title } = versionContent(e.version, lang);
        const critical = isCritical(e.version.communication_type);
        return {
          id: `official:${e.announcementId}`,
          kind: "official_communication" as const,
          companyId: e.version.company_id,
          companyName: companyNames[e.version.company_id] ?? null,
          category: critical ? "Comunicado importante" : "Comunicado",
          title,
          requirement: ACK_PENDING_LABEL[lang],
          ctaLabel: REVIEW_CTA[lang],
          to: "/portal/announcements",
          critical,
        };
      });
  }, [entries, companyNames, preferredLanguage]);

  return {
    entries,
    byAnnouncementId,
    pendingItems,
    hasOfficialCommunications: entries.length > 0,
    loading,
    refetch: load,
  };
}
