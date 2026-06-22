/**
 * useSecurityFlags — Sprint S7-A scaffolding (read-only).
 *
 * Reads `security.pin_auth_mode` from public.company_settings.
 * Fallback: "legacy" (current PIN-derived password behavior).
 *
 * IMPORTANT: This hook is NOT wired into any operational call site
 * (employee-auth, kiosk-clock, front-desk-checkin, portal login, payroll).
 * It exists only so S7-B can adopt it without further plumbing.
 *
 * Future values: "legacy" | "dual" | "hash_reader" | "hash_only".
 * Today every tenant resolves to "legacy".
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type PinAuthMode = "legacy" | "dual" | "hash_reader" | "hash_only";

const SECURITY_NAMESPACE = "security.pin_auth_mode";
const DEFAULT_MODE: PinAuthMode = "legacy";

function coerceMode(raw: unknown): PinAuthMode {
  if (raw && typeof raw === "object" && "mode" in (raw as any)) {
    const m = (raw as any).mode;
    if (m === "legacy" || m === "dual" || m === "hash_reader" || m === "hash_only") return m;
  }
  if (typeof raw === "string" && (raw === "legacy" || raw === "dual" || raw === "hash_reader" || raw === "hash_only")) {
    return raw;
  }
  return DEFAULT_MODE;
}

export interface SecurityFlags {
  pinAuthMode: PinAuthMode;
  loading: boolean;
}

export function useSecurityFlags(companyId: string | null | undefined): SecurityFlags {
  const [pinAuthMode, setPinAuthMode] = useState<PinAuthMode>(DEFAULT_MODE);
  const [loading, setLoading] = useState<boolean>(!!companyId);

  useEffect(() => {
    let cancelled = false;
    if (!companyId) {
      setPinAuthMode(DEFAULT_MODE);
      setLoading(false);
      return;
    }
    setLoading(true);
    (async () => {
      try {
        const { data, error } = await supabase
          .from("company_settings")
          .select("value")
          .eq("company_id", companyId)
          .eq("key", SECURITY_NAMESPACE)
          .maybeSingle();
        if (cancelled) return;
        if (error) {
          // Silent fallback — never break UI on flag read failure.
          setPinAuthMode(DEFAULT_MODE);
        } else {
          setPinAuthMode(coerceMode(data?.value));
        }
      } catch {
        if (!cancelled) setPinAuthMode(DEFAULT_MODE);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  return { pinAuthMode, loading };
}

export const SECURITY_FLAG_KEYS = {
  PIN_AUTH_MODE: SECURITY_NAMESPACE,
} as const;

export const PIN_AUTH_MODE_DEFAULT: PinAuthMode = DEFAULT_MODE;
