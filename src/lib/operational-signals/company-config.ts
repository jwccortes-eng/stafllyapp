/**
 * F1.1 — Evidence Run. Per-company shadow persistence control.
 *
 * Persistence is NEVER enabled by a global hardcode: it is resolved from
 * `operational_signal_shadow_config` (RLS: owner/admin of that company only)
 * and cached in memory per company. The kill switch always wins.
 */
import { supabase } from "@/integrations/supabase/client";
import { isKillSwitchEngaged, isLocalPersistencePaused } from "./flags";

export interface ShadowCompanyConfig {
  companyId: string;
  persistenceEnabled: boolean;
  sampleRate: number;
  notes: string | null;
  updatedAt: string | null;
}

const CACHE_TTL_MS = 60_000;

interface CacheEntry {
  config: ShadowCompanyConfig;
  fetchedAt: number;
}

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<ShadowCompanyConfig>>();

export function defaultShadowCompanyConfig(companyId: string): ShadowCompanyConfig {
  return {
    companyId,
    persistenceEnabled: false,
    sampleRate: 1,
    notes: null,
    updatedAt: null,
  };
}

/** Synchronous gate used by the sink. Unknown company => never persists. */
export function isPersistenceEnabledForCompany(companyId: string | null | undefined): boolean {
  if (!companyId || isKillSwitchEngaged()) return false;
  const entry = cache.get(companyId);
  if (!entry) return false;
  if (!entry.config.persistenceEnabled) return false;
  if (entry.config.sampleRate >= 1) return true;
  if (entry.config.sampleRate <= 0) return false;
  return Math.random() < entry.config.sampleRate;
}

export function getCachedShadowCompanyConfig(companyId: string): ShadowCompanyConfig | null {
  return cache.get(companyId)?.config ?? null;
}

export function primeShadowCompanyConfig(config: ShadowCompanyConfig): void {
  cache.set(config.companyId, { config, fetchedAt: Date.now() });
}

export function clearShadowCompanyConfigCache(companyId?: string): void {
  if (companyId) cache.delete(companyId);
  else cache.clear();
}

/** Loads (and caches) the per-company config. Read-only, failure-safe. */
export async function loadShadowCompanyConfig(
  companyId: string,
  options?: { force?: boolean },
): Promise<ShadowCompanyConfig> {
  const cached = cache.get(companyId);
  if (!options?.force && cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.config;
  }
  const existing = inflight.get(companyId);
  if (existing && !options?.force) return existing;

  const promise = (async () => {
    try {
      const { data, error } = await supabase
        .from("operational_signal_shadow_config")
        .select("company_id, persistence_enabled, sample_rate, notes, updated_at")
        .eq("company_id", companyId)
        .maybeSingle();

      if (error || !data) {
        const fallback = defaultShadowCompanyConfig(companyId);
        primeShadowCompanyConfig(fallback);
        return fallback;
      }

      const config: ShadowCompanyConfig = {
        companyId: data.company_id as string,
        persistenceEnabled: Boolean(data.persistence_enabled),
        sampleRate: Number(data.sample_rate ?? 1),
        notes: (data.notes as string | null) ?? null,
        updatedAt: (data.updated_at as string | null) ?? null,
      };
      primeShadowCompanyConfig(config);
      return config;
    } catch {
      const fallback = defaultShadowCompanyConfig(companyId);
      primeShadowCompanyConfig(fallback);
      return fallback;
    } finally {
      inflight.delete(companyId);
    }
  })();

  inflight.set(companyId, promise);
  return promise;
}

/** Owner/admin only (enforced by RLS). Never touches sending behaviour. */
export async function setShadowPersistenceForCompany(
  companyId: string,
  enabled: boolean,
  opts?: { sampleRate?: number; notes?: string | null; updatedBy?: string | null },
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from("operational_signal_shadow_config")
    .upsert(
      {
        company_id: companyId,
        persistence_enabled: enabled,
        sample_rate: opts?.sampleRate ?? 1,
        notes: opts?.notes ?? null,
        updated_by: opts?.updatedBy ?? null,
      },
      { onConflict: "company_id" },
    );

  if (error) return { ok: false, error: error.message };
  await loadShadowCompanyConfig(companyId, { force: true });
  return { ok: true };
}
