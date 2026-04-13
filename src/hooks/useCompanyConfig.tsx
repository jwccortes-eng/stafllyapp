import { useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { toast } from "sonner";

/**
 * Generic typed hook for reading/writing company-scoped configuration.
 * 
 * Stores config as JSON in company_settings table under a namespaced key.
 * Returns config merged with defaults so missing keys always have safe values.
 * 
 * Usage:
 *   const { config, updateConfig, loading } = useCompanyConfig<ShiftsConfig>("shifts_config", SHIFTS_DEFAULTS);
 */
export function useCompanyConfig<T extends Record<string, unknown>>(
  configKey: string,
  defaults: T,
) {
  const { selectedCompanyId } = useCompany();
  const queryClient = useQueryClient();
  const queryKey = ["company_config", configKey, selectedCompanyId];

  const { data: rawData, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      if (!selectedCompanyId) return null;
      const { data, error } = await supabase
        .from("company_settings")
        .select("id, value")
        .eq("company_id", selectedCompanyId)
        .eq("key", configKey)
        .maybeSingle();
      if (error) throw error;
      return data;
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
      return merged;
    },
    onMutate: async (partial) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData(queryKey);
      queryClient.setQueryData(queryKey, (old: any) => ({
        ...old,
        value: { ...config, ...partial },
      }));
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
      toast.error("Failed to save setting");
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
  };
}
