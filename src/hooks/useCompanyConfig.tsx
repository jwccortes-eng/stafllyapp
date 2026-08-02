import { useCallback, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { notifyError, notifyWarning } from "@/lib/feedback/notify";
import {
  isEditableSettingKey,
  versionedCompanySettingWrite,
} from "@/lib/data/company-config-write";
import type { VersionConflictInfo } from "@/components/data-integrity/VersionConflictDialog";

/**
 * Hook tipado para leer/escribir configuración de empresa.
 *
 * P0 — VWC Fase 3C: la escritura pasa por `versioned_update_company_setting`
 * (PATCH parcial + `expected_version` + merge server-side + auditoría).
 * Nunca se envía un snapshot completo del JSONB.
 *
 * EXCEPCIÓN TEMPORAL — claves financieras (`payroll_sequence`, `payroll_config`,
 * `pay_week`, `overtime`, `pay_types`): quedan fuera del contrato por la orden
 * "no tocar payroll". Owner: equipo Payroll. Objetivo de eliminación: Fase 3F.
 * Riesgo aceptado: lost update en configuración de nómina (sin cambio respecto
 * al comportamiento anterior).
 */
export function useCompanyConfig<T extends object>(
  configKey: string,
  defaults: T,
) {
  const { selectedCompanyId } = useCompany();
  const queryClient = useQueryClient();
  const queryKey = ["company_config", configKey, selectedCompanyId];
  const [conflict, setConflict] = useState<VersionConflictInfo | null>(null);

  const { data: rawData, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      if (!selectedCompanyId) return null;
      const { data, error } = await supabase
        .from("company_settings")
        .select("id, value, version")
        .eq("company_id", selectedCompanyId)
        .eq("key", configKey)
        .maybeSingle();
      if (error) throw error;
      return data as { id: string; value: any; version: number } | null;
    },
    enabled: !!selectedCompanyId,
    staleTime: 60_000,
  });

  const config: T = useMemo(() => {
    const stored = (rawData?.value as Partial<T>) ?? {};
    return { ...defaults, ...stored };
  }, [rawData, defaults]);

  const mutation = useMutation({
    mutationFn: async (partial: Partial<T>) => {
      if (!selectedCompanyId) throw new Error("No company selected");

      if (isEditableSettingKey(configKey)) {
        const result = await versionedCompanySettingWrite({
          companyId: selectedCompanyId,
          key: configKey,
          patch: partial as Record<string, any>,
          expectedVersion: rawData?.version ?? null,
          surface: `useCompanyConfig:${configKey}`,
        });

        if (result.status === "conflict") {
          setConflict({
            patch: partial as Record<string, any>,
            serverRow: result.row,
            actualVersion: result.actualVersion,
            expectedVersion: result.expectedVersion,
            updatedAt: result.updatedAt,
          });
          throw new Error("conflict");
        }
        if (result.status === "error") throw new Error(result.message);
        return partial;
      }

      // Excepción temporal documentada arriba: configuración financiera.
      const merged = { ...config, ...partial };
      if (rawData?.id) {
        const { error } = await supabase
          .from("company_settings")
          .update({ value: merged as any, updated_at: new Date().toISOString() } as any)
          .eq("id", rawData.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("company_settings")
          .insert({
            company_id: selectedCompanyId,
            key: configKey,
            value: merged as any,
          } as any);
        if (error) throw error;
      }
      return partial;
    },
    onError: (err: any) => {
      if (err?.message === "conflict") {
        notifyWarning({
          title: "Esta configuración cambió mientras la editabas",
          fact: "Otra persona guardó una versión más reciente.",
          consequence: "No sobrescribimos nada: recarga y vuelve a aplicar tu cambio.",
        });
      } else {
        notifyError({
          title: "No pudimos guardar la configuración",
          fact: err?.message ?? "El servidor rechazó el cambio.",
          consequence: "La configuración anterior sigue vigente.",
          cause: err,
        });
      }
      queryClient.invalidateQueries({ queryKey });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const updateConfig = useCallback(
    (partial: Partial<T>) => mutation.mutate(partial),
    [mutation],
  );

  return {
    config,
    updateConfig,
    loading: isLoading,
    saving: mutation.isPending,
    version: rawData?.version ?? null,
    conflict,
    clearConflict: useCallback(() => setConflict(null), []),
  };
}
