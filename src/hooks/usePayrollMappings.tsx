import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export interface PayrollMapping {
  id: string;
  company_id: string;
  pattern: string;
  match_field: string;
  target_type: string;
  priority: number;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

const DEFAULT_MAPPINGS: Omit<PayrollMapping, "id" | "company_id" | "created_at" | "updated_at" | "created_by">[] = [
  // Shift/location-based mappings (high priority)
  { pattern: "weekend job", match_field: "shift_title", target_type: "full_day", priority: 5, is_active: true, notes: "Weekend Job shift → full day" },
  { pattern: "weekend", match_field: "shift_title", target_type: "full_day", priority: 6, is_active: true, notes: "Weekend shift → full day" },
  { pattern: "weekend", match_field: "any", target_type: "full_day", priority: 10, is_active: true, notes: "Weekend keyword → full day" },
  { pattern: "daily", match_field: "any", target_type: "full_day", priority: 20, is_active: true, notes: "Daily pay → full day" },
  { pattern: "diario", match_field: "any", target_type: "full_day", priority: 20, is_active: true, notes: "Diario → full day" },
  { pattern: "half", match_field: "any", target_type: "half_day", priority: 15, is_active: true, notes: "Half day" },
  { pattern: "hour", match_field: "any", target_type: "hourly", priority: 30, is_active: true, notes: "Hourly pay" },
  { pattern: "regular", match_field: "any", target_type: "hourly", priority: 30, is_active: true, notes: "Regular pay → hourly" },
  { pattern: "base", match_field: "any", target_type: "hourly", priority: 30, is_active: true, notes: "Base pay → hourly" },
  { pattern: "hora", match_field: "any", target_type: "hourly", priority: 30, is_active: true, notes: "Hora → hourly" },
  { pattern: "payride", match_field: "any", target_type: "ride", priority: 25, is_active: true, notes: "Pay ride → ride" },
  { pattern: "pay ride", match_field: "any", target_type: "ride", priority: 25, is_active: true, notes: "Pay ride → ride" },
  { pattern: "transport", match_field: "any", target_type: "ride", priority: 25, is_active: true, notes: "Transport → ride" },
  { pattern: "ryde", match_field: "any", target_type: "ride", priority: 25, is_active: true, notes: "Ryde → ride" },
  { pattern: "ride", match_field: "any", target_type: "ride", priority: 25, is_active: true, notes: "Ride → ride" },
  { pattern: "bonus", match_field: "any", target_type: "bonus", priority: 40, is_active: true, notes: "Bonus" },
  { pattern: "tip", match_field: "any", target_type: "bonus", priority: 40, is_active: true, notes: "Tip → bonus" },
  { pattern: "propina", match_field: "any", target_type: "bonus", priority: 40, is_active: true, notes: "Propina → bonus" },
  { pattern: "reintegro", match_field: "any", target_type: "bonus", priority: 40, is_active: true, notes: "Reintegro → bonus" },
  { pattern: "doble", match_field: "any", target_type: "full_day", priority: 12, is_active: true, notes: "Paga doble → full day" },
  { pattern: "double", match_field: "any", target_type: "full_day", priority: 12, is_active: true, notes: "Double pay → full day" },
  { pattern: "manual", match_field: "any", target_type: "bonus", priority: 50, is_active: true, notes: "Manual adjustment → bonus" },
  { pattern: "adjustment", match_field: "any", target_type: "bonus", priority: 50, is_active: true, notes: "Adjustment → bonus" },
  { pattern: "correction", match_field: "any", target_type: "bonus", priority: 50, is_active: true, notes: "Correction → bonus" },
];

export const TARGET_TYPES = [
  { value: "hourly", label: "Hourly" },
  { value: "full_day", label: "Full Day" },
  { value: "half_day", label: "Half Day" },
  { value: "ride", label: "Ride" },
  { value: "bonus", label: "Bonus / Manual" },
  { value: "other", label: "Other (excluido)" },
];

export const MATCH_FIELDS = [
  { value: "any", label: "Cualquier campo" },
  { value: "shift_title", label: "Nombre del turno" },
  { value: "location_name", label: "Ubicación" },
  { value: "client_name", label: "Cliente" },
];

export function usePayrollMappings() {
  const { selectedCompanyId: companyId } = useCompany();
  const { user } = useAuth();
  const [mappings, setMappings] = useState<PayrollMapping[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMappings = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("payroll_concept_mappings" as any)
      .select("*")
      .eq("company_id", companyId)
      .order("priority", { ascending: true });
    if (error) {
      console.error("Error fetching mappings:", error);
    } else {
      setMappings((data || []) as any as PayrollMapping[]);
    }
    setLoading(false);
  }, [companyId]);

  useEffect(() => { fetchMappings(); }, [fetchMappings]);

  const seedDefaults = useCallback(async () => {
    if (!companyId || !user?.id) return;
    const rows = DEFAULT_MAPPINGS.map(m => ({
      ...m,
      company_id: companyId,
      created_by: user.id,
    }));
    const { error } = await supabase.from("payroll_concept_mappings" as any).insert(rows as any);
    if (error) {
      toast.error("Error al sembrar mappings: " + error.message);
    } else {
      toast.success(`${rows.length} mappings creados`);
      await fetchMappings();
    }
  }, [companyId, user, fetchMappings]);

  const addMapping = useCallback(async (pattern: string, targetType: string, matchField = "any", notes = "") => {
    if (!companyId || !user?.id) return;
    const { error } = await supabase.from("payroll_concept_mappings" as any).insert({
      company_id: companyId,
      pattern,
      match_field: matchField,
      target_type: targetType,
      priority: 100,
      is_active: true,
      notes,
      created_by: user.id,
    } as any);
    if (error) toast.error(error.message);
    else { toast.success("Mapping agregado"); await fetchMappings(); }
  }, [companyId, user, fetchMappings]);

  const updateMapping = useCallback(async (id: string, updates: Partial<Pick<PayrollMapping, "pattern" | "target_type" | "match_field" | "priority" | "is_active" | "notes">>) => {
    const { error } = await supabase.from("payroll_concept_mappings" as any).update({ ...updates, updated_at: new Date().toISOString() } as any).eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Mapping actualizado"); await fetchMappings(); }
  }, [fetchMappings]);

  const deleteMapping = useCallback(async (id: string) => {
    const { error } = await supabase.from("payroll_concept_mappings" as any).delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Mapping eliminado"); await fetchMappings(); }
  }, [fetchMappings]);

  /** Classify a payroll row using loaded mappings. Returns target_type or "unmapped". */
  const classifyWithMappings = useCallback((row: { pay_type?: string; notes?: string; concept_name?: string; original_concept_name?: string; title?: string }): string => {
    const activeMappings = mappings.filter(m => m.is_active).sort((a, b) => a.priority - b.priority);
    
    const fieldsToCheck: string[] = [];
    if (row.pay_type) fieldsToCheck.push(row.pay_type.toLowerCase().trim());
    if (row.concept_name) fieldsToCheck.push(row.concept_name.toLowerCase().trim());
    if (row.original_concept_name) fieldsToCheck.push((row.original_concept_name as string).toLowerCase().trim());
    if (row.notes) fieldsToCheck.push(row.notes.toLowerCase().trim());
    if (row.title) fieldsToCheck.push(row.title.toLowerCase().trim());

    for (const mapping of activeMappings) {
      const pat = mapping.pattern.toLowerCase().trim();
      for (const field of fieldsToCheck) {
        if (field.includes(pat)) return mapping.target_type;
      }
    }
    return "unmapped";
  }, [mappings]);

  return { mappings, loading, fetchMappings, seedDefaults, addMapping, updateMapping, deleteMapping, classifyWithMappings };
}
