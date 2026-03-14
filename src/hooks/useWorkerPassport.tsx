import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type PassportProfile = Database["public"]["Tables"]["passport_profiles"]["Row"];
type PassportWorkHistory = Database["public"]["Tables"]["passport_work_history"]["Row"];
type PassportMetric = Database["public"]["Tables"]["passport_metrics"]["Row"];
type PassportPublication = Database["public"]["Tables"]["passport_publications"]["Row"];

export interface PassportFull {
  passport: PassportProfile;
  workHistory: PassportWorkHistory[];
  metrics: PassportMetric[];
  publications: PassportPublication[];
}

interface UseWorkerPassportOptions {
  /** Load by worker_profile_id */
  workerProfileId?: string;
  /** Load by passport slug */
  slug?: string;
}

export function useWorkerPassport(options: UseWorkerPassportOptions = {}) {
  const [data, setData] = useState<PassportFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPassport = useCallback(async () => {
    if (!options.workerProfileId && !options.slug) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      let passportQuery = supabase.from("passport_profiles").select("*");

      if (options.slug) {
        passportQuery = passportQuery.eq("slug", options.slug);
      } else if (options.workerProfileId) {
        passportQuery = passportQuery.eq("worker_profile_id", options.workerProfileId);
      }

      const { data: passport, error: passportError } = await passportQuery.maybeSingle();

      if (passportError) {
        setError(passportError.message);
        setLoading(false);
        return;
      }

      if (!passport) {
        setData(null);
        setLoading(false);
        return;
      }

      const [historyRes, metricsRes, pubsRes] = await Promise.all([
        supabase
          .from("passport_work_history")
          .select("*")
          .eq("passport_id", passport.id)
          .order("start_date", { ascending: false }),
        supabase
          .from("passport_metrics")
          .select("*")
          .eq("passport_id", passport.id)
          .order("sort_order", { ascending: true }),
        supabase
          .from("passport_publications")
          .select("*")
          .eq("passport_id", passport.id),
      ]);

      setData({
        passport,
        workHistory: historyRes.data ?? [],
        metrics: metricsRes.data ?? [],
        publications: pubsRes.data ?? [],
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [options.workerProfileId, options.slug]);

  useEffect(() => {
    fetchPassport();
  }, [fetchPassport]);

  /** Create passport for a worker profile */
  const createPassport = async (workerProfileId: string, slug: string) => {
    const { data: passport, error } = await supabase
      .from("passport_profiles")
      .insert({ worker_profile_id: workerProfileId, slug } as any)
      .select()
      .single();
    if (!error) await fetchPassport();
    return { passport, error };
  };

  /** Toggle a publication section on/off */
  const togglePublication = async (passportId: string, sectionKey: string, isPublic: boolean) => {
    const { error } = await supabase
      .from("passport_publications")
      .upsert(
        { passport_id: passportId, section_key: sectionKey, is_public: isPublic } as any,
        { onConflict: "passport_id,section_key" }
      );
    if (!error) await fetchPassport();
    return error;
  };

  /** Add a work history entry */
  const addWorkHistory = async (passportId: string, entry: Partial<PassportWorkHistory>) => {
    const { error } = await supabase
      .from("passport_work_history")
      .insert({ ...entry, passport_id: passportId } as any);
    if (!error) await fetchPassport();
    return error;
  };

  /** Update a metric */
  const upsertMetric = async (passportId: string, label: string, value: string, sortOrder?: number) => {
    const { error } = await supabase
      .from("passport_metrics")
      .upsert(
        { passport_id: passportId, label, value, sort_order: sortOrder ?? 0 } as any,
        { onConflict: "passport_id,label" }
      );
    if (!error) await fetchPassport();
    return error;
  };

  return {
    data,
    passport: data?.passport ?? null,
    workHistory: data?.workHistory ?? [],
    metrics: data?.metrics ?? [],
    publications: data?.publications ?? [],
    loading,
    error,
    refetch: fetchPassport,
    createPassport,
    togglePublication,
    addWorkHistory,
    upsertMetric,
  };
}
