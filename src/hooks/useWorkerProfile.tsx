import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Database } from "@/integrations/supabase/types";

type WorkerProfile = Database["public"]["Tables"]["worker_profiles"]["Row"];
type WorkerProfileInsert = Database["public"]["Tables"]["worker_profiles"]["Insert"];
type WorkerProfileUpdate = Database["public"]["Tables"]["worker_profiles"]["Update"];
type WorkerSkill = Database["public"]["Tables"]["worker_skills"]["Row"];
type WorkerProfileSkill = Database["public"]["Tables"]["worker_profile_skills"]["Row"];
type WorkerLanguage = Database["public"]["Tables"]["worker_languages"]["Row"];
type WorkerDocument = Database["public"]["Tables"]["worker_documents"]["Row"];
type WorkerExperience = Database["public"]["Tables"]["worker_experience_records"]["Row"];
type VisibilitySettings = Database["public"]["Tables"]["worker_visibility_settings"]["Row"];

export interface WorkerProfileFull {
  profile: WorkerProfile;
  skills: (WorkerProfileSkill & { skill?: WorkerSkill })[];
  languages: WorkerLanguage[];
  documents: WorkerDocument[];
  experience: WorkerExperience[];
  visibility: VisibilitySettings | null;
}

interface UseWorkerProfileOptions {
  /** Load by worker_profile id */
  profileId?: string;
  /** Load by user_id (current user default) */
  userId?: string;
  /** Load by employee_id */
  employeeId?: string;
}

export function useWorkerProfile(options: UseWorkerProfileOptions = {}) {
  const { user } = useAuth();
  const [data, setData] = useState<WorkerProfileFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const targetUserId = options.userId ?? user?.id;

  const fetchProfile = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Step 1: Find the worker_profile
      let profileQuery = supabase.from("worker_profiles").select("*");

      if (options.profileId) {
        profileQuery = profileQuery.eq("id", options.profileId);
      } else if (options.employeeId) {
        profileQuery = profileQuery.eq("employee_id", options.employeeId);
      } else if (targetUserId) {
        profileQuery = profileQuery.eq("user_id", targetUserId);
      } else {
        setLoading(false);
        return;
      }

      const { data: profileData, error: profileError } = await profileQuery.maybeSingle();

      if (profileError) {
        setError(profileError.message);
        setLoading(false);
        return;
      }

      if (!profileData) {
        setData(null);
        setLoading(false);
        return;
      }

      // Step 2: Fetch related data in parallel
      const [skillsRes, langsRes, docsRes, expRes, visRes] = await Promise.all([
        supabase
          .from("worker_profile_skills")
          .select("*, worker_skills(*)")
          .eq("worker_profile_id", profileData.id),
        supabase
          .from("worker_languages")
          .select("*")
          .eq("worker_profile_id", profileData.id),
        supabase
          .from("worker_documents")
          .select("*")
          .eq("worker_profile_id", profileData.id)
          .is("deleted_at", null),
        supabase
          .from("worker_experience_records")
          .select("*")
          .eq("worker_profile_id", profileData.id)
          .order("start_date", { ascending: false }),
        supabase
          .from("worker_visibility_settings")
          .select("*")
          .eq("worker_profile_id", profileData.id)
          .maybeSingle(),
      ]);

      setData({
        profile: profileData,
        skills: (skillsRes.data ?? []) as any,
        languages: langsRes.data ?? [],
        documents: docsRes.data ?? [],
        experience: expRes.data ?? [],
        visibility: visRes.data,
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [options.profileId, options.employeeId, targetUserId]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  /** Create a new worker profile for the current user */
  const createProfile = async (data: Partial<WorkerProfileInsert>) => {
    if (!targetUserId) return { error: "No user" };
    const { data: profile, error } = await supabase
      .from("worker_profiles")
      .insert({ ...data, user_id: targetUserId } as any)
      .select()
      .single();
    if (!error) await fetchProfile();
    return { profile, error };
  };

  /** Update the current worker profile */
  const updateProfile = async (updates: WorkerProfileUpdate) => {
    if (!data?.profile.id) return { error: "No profile" };
    const { error } = await supabase
      .from("worker_profiles")
      .update(updates)
      .eq("id", data.profile.id);
    if (!error) await fetchProfile();
    return { error };
  };

  /** Add a skill to the profile */
  const addSkill = async (skillId: string, level?: string, yearsExp?: number) => {
    if (!data?.profile.id) return;
    const { error } = await supabase
      .from("worker_profile_skills")
      .insert({
        worker_profile_id: data.profile.id,
        skill_id: skillId,
        proficiency_level: level || "intermediate",
        years_of_experience: yearsExp,
      } as any);
    if (!error) await fetchProfile();
    return error;
  };

  /** Remove a skill from the profile */
  const removeSkill = async (profileSkillId: string) => {
    const { error } = await supabase
      .from("worker_profile_skills")
      .delete()
      .eq("id", profileSkillId);
    if (!error) await fetchProfile();
    return error;
  };

  /** Add a language */
  const addLanguage = async (language: string, proficiency: string) => {
    if (!data?.profile.id) return;
    const { error } = await supabase
      .from("worker_languages")
      .insert({
        worker_profile_id: data.profile.id,
        language,
        proficiency,
      } as any);
    if (!error) await fetchProfile();
    return error;
  };

  /** Update visibility settings */
  const updateVisibility = async (settings: Partial<VisibilitySettings>) => {
    if (!data?.profile.id) return;
    const { error } = await supabase
      .from("worker_visibility_settings")
      .upsert({
        worker_profile_id: data.profile.id,
        ...settings,
      } as any, { onConflict: "worker_profile_id" });
    if (!error) await fetchProfile();
    return error;
  };

  return {
    data,
    profile: data?.profile ?? null,
    skills: data?.skills ?? [],
    languages: data?.languages ?? [],
    documents: data?.documents ?? [],
    experience: data?.experience ?? [],
    visibility: data?.visibility,
    loading,
    error,
    refetch: fetchProfile,
    createProfile,
    updateProfile,
    addSkill,
    removeSkill,
    addLanguage,
    updateVisibility,
  };
}
