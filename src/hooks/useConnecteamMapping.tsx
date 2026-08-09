import { useCallback, useMemo } from "react";
import { useCompanyConfig } from "@/hooks/useCompanyConfig";
import {
  CONNECTEAM_MAPPING_SETTING_KEY,
  EMPTY_CONNECTEAM_MAPPING,
  upsertEntry,
  removeEntry,
  knownJobs,
  knownSubItems,
  type ConnecteamMappingConfig,
  type MappingSubject,
} from "@/lib/integrations/connecteam-mapping";

const DEFAULTS: ConnecteamMappingConfig = EMPTY_CONNECTEAM_MAPPING;

/**
 * Mapping Connecteam de la compañía activa.
 *
 * Lectura + escritura por el carril VWC (`useCompanyConfig` → PATCH parcial con
 * `expected_version`). Tenant-scoped por construcción: la clave vive en
 * `company_settings` de la empresa seleccionada, nunca se comparte.
 */
export function useConnecteamMapping() {
  const { config, updateConfig, loading, saving, conflict, clearConflict } =
    useCompanyConfig<ConnecteamMappingConfig>(CONNECTEAM_MAPPING_SETTING_KEY, DEFAULTS);

  const mapping = useMemo<ConnecteamMappingConfig>(
    () => ({ entries: config?.entries ?? {} }),
    [config],
  );

  const saveMapping = useCallback(
    (subject: MappingSubject, value: { job: string; subItem: string }) => {
      updateConfig({ entries: upsertEntry(mapping, subject, value) });
    },
    [mapping, updateConfig],
  );

  const deleteMapping = useCallback(
    (key: string) => {
      updateConfig({ entries: removeEntry(mapping, key) });
    },
    [mapping, updateConfig],
  );

  return {
    mapping,
    jobs: useMemo(() => knownJobs(mapping), [mapping]),
    subItemsFor: useCallback((job?: string | null) => knownSubItems(mapping, job), [mapping]),
    saveMapping,
    deleteMapping,
    loading,
    saving,
    conflict,
    clearConflict,
  };
}
