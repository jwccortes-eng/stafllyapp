import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type ConsentRecord = Database["public"]["Tables"]["worker_consent_records"]["Row"];

interface UseWorkerConsentOptions {
  workerProfileId?: string;
}

export function useWorkerConsent(options: UseWorkerConsentOptions = {}) {
  const [consents, setConsents] = useState<ConsentRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchConsents = useCallback(async () => {
    if (!options.workerProfileId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const { data } = await supabase
      .from("worker_consent_records")
      .select("*")
      .eq("worker_profile_id", options.workerProfileId)
      .is("revoked_at", null)
      .order("created_at", { ascending: false });

    setConsents(data ?? []);
    setLoading(false);
  }, [options.workerProfileId]);

  useEffect(() => {
    fetchConsents();
  }, [fetchConsents]);

  /** Grant a consent */
  const grantConsent = async (consentType: string, documentVersion?: string) => {
    if (!options.workerProfileId) return;
    const { error } = await supabase
      .from("worker_consent_records")
      .upsert({
        worker_profile_id: options.workerProfileId,
        consent_type: consentType,
        granted: true,
        granted_at: new Date().toISOString(),
        document_version: documentVersion,
        user_agent: navigator.userAgent.slice(0, 200),
      } as any, { onConflict: "worker_profile_id,consent_type" });
    if (!error) await fetchConsents();
    return error;
  };

  /** Revoke a consent */
  const revokeConsent = async (consentId: string) => {
    const { error } = await supabase
      .from("worker_consent_records")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", consentId);
    if (!error) await fetchConsents();
    return error;
  };

  /** Check if a specific consent is active */
  const hasConsent = (consentType: string): boolean => {
    return consents.some(
      (c) => (c as any).consent_type === consentType && c.granted && !c.revoked_at
    );
  };

  return {
    consents,
    loading,
    refetch: fetchConsents,
    grantConsent,
    revokeConsent,
    hasConsent,
  };
}
