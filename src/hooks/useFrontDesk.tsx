import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface FrontDeskEmployee {
  id: string;
  first_name: string;
  last_name: string;
  phone_number: string;
  email: string | null;
  address: string | null;
  avatar_url: string | null;
  user_id: string | null;
  company_id: string;
  company_name?: string | null;
  employee_role: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  is_active: boolean;
}

export interface SelfUpdatePayload {
  phone_number?: string;
  email?: string;
  address?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
}

export interface PendingItem {
  key: string;
  label: string;
  severity: "high" | "medium" | "low";
}

export interface FrontDeskSummary {
  portal_status: "active" | "pending" | "none";
  profile_completeness: number;
  profile_status: "complete" | "incomplete";
  documents_status: "complete" | "incomplete" | "rejected" | "pending_review";
  documents_count: { approved: number; pending: number; rejected: number; missing: number };
  pending_items: PendingItem[];
  pending_total: number;
  last_visit_at: string | null;
  last_visit_type: string | null;
}

export type VisitType =
  | "pickup_check"
  | "update_data"
  | "submit_documents"
  | "fix_documents"
  | "portal_help"
  | "payment_support"
  | "onboarding"
  | "general_inquiry"
  | "other";

export type VisitStatus =
  | "in_progress"
  | "resolved"
  | "pending_followup"
  | "requires_admin_review"
  | "cancelled";

export type RatingValue = "excellent" | "good" | "regular" | "bad";

export type IntakeReason =
  | "update_data"
  | "check_pending"
  | "payment_issue"
  | "documents_help"
  | "portal_help"
  | "leave_request"
  | "leave_comment"
  | "pickup_check"
  | "other";

export type FinalResolution = "resolved" | "pending_followup" | "escalated" | "cancelled";

export interface ActiveCase {
  id: string;
  case_number: number | null;
  case_code: string | null;
  intake_reason: IntakeReason | null;
  status: string | null;
  checked_in_at?: string | null;
}

export type InquiryCategory =
  | "payments"
  | "documents"
  | "profile"
  | "support"
  | "schedule"
  | "other";

export type PaymentRow = {
  work_date: string | null;
  total_pay: number | null;
  total_hours: number | null;
  pay_type: string | null;
};

export function useFrontDesk() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lookupByPhone = useCallback(async (phone: string) => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke("front-desk-checkin", {
        body: { action: "lookup_phone", phone },
      });
      if (fnErr) throw new Error(fnErr.message);
      if (data?.error) throw new Error(data.error);
      return data as {
        employee?: FrontDeskEmployee;
        summary?: FrontDeskSummary;
        matches: FrontDeskEmployee[];
        multiple?: boolean;
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const selectEmployee = useCallback(async (employee_id: string) => {
    setLoading(true);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke("front-desk-checkin", {
        body: { action: "select_employee", employee_id },
      });
      if (fnErr) throw new Error(fnErr.message);
      if (data?.error) throw new Error(data.error);
      return data as { employee: FrontDeskEmployee; summary: FrontDeskSummary };
    } finally {
      setLoading(false);
    }
  }, []);

  const updateSelf = useCallback(async (params: {
    employee_id: string;
    updates: SelfUpdatePayload;
    language?: string;
    visit_id?: string;
  }) => {
    setLoading(true);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke("front-desk-checkin", {
        body: { action: "update_self", ...params },
      });
      if (fnErr) throw new Error(fnErr.message);
      if (data?.error) throw new Error(data.error);
      return data as {
        employee: FrontDeskEmployee;
        summary: FrontDeskSummary;
        changed: Array<{ field: string; old: string | null; new: string | null }>;
      };
    } finally {
      setLoading(false);
    }
  }, []);

  const createInquiry = useCallback(async (params: {
    phone?: string;
    employee_id?: string;
    category: InquiryCategory;
    message: string;
    inquiry_kind: "request" | "comment";
    language?: string;
  }) => {
    setLoading(true);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke("front-desk-checkin", {
        body: { action: "create_inquiry", ...params },
      });
      if (fnErr) throw new Error(fnErr.message);
      if (data?.error) throw new Error(data.error);
      return data.visit_id as string;
    } finally {
      setLoading(false);
    }
  }, []);

  const listPayments = useCallback(async (params: { phone?: string; employee_id?: string }) => {
    setLoading(true);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke("front-desk-checkin", {
        body: { action: "list_payments", ...params },
      });
      if (fnErr) throw new Error(fnErr.message);
      return (data?.payments ?? []) as PaymentRow[];
    } finally {
      setLoading(false);
    }
  }, []);

  // Legacy methods kept for backward compatibility (KioskClock, reports)
  const lookupEmployee = useCallback(async (phone: string, _pin?: string) => {
    return lookupByPhone(phone);
  }, [lookupByPhone]);

  const createVisit = useCallback(async (params: {
    employee_id: string;
    visit_type: VisitType;
    visit_detail?: string;
    pending_items?: PendingItem[];
    language?: string;
    device_id?: string;
    attended_by?: string;
    attendant_name?: string;
  }) => {
    setLoading(true);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke("front-desk-checkin", {
        body: { action: "create_visit", ...params },
      });
      if (fnErr) throw new Error(fnErr.message);
      if (data?.error) throw new Error(data.error);
      return data.visit_id as string;
    } finally {
      setLoading(false);
    }
  }, []);

  const updateVisit = useCallback(async (visit_id: string, updates: {
    status?: VisitStatus;
    updates_made?: any[];
    visit_detail?: string;
  }) => {
    setLoading(true);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke("front-desk-checkin", {
        body: { action: "update_visit", visit_id, ...updates },
      });
      if (fnErr) throw new Error(fnErr.message);
      if (data?.error) throw new Error(data.error);
      return true;
    } finally {
      setLoading(false);
    }
  }, []);

  const submitRating = useCallback(async (params: {
    visit_id: string;
    rating?: RatingValue;
    rating_comment?: string;
    status?: VisitStatus;
  }) => {
    setLoading(true);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke("front-desk-checkin", {
        body: { action: "submit_rating", ...params },
      });
      if (fnErr) throw new Error(fnErr.message);
      if (data?.error) throw new Error(data.error);
      return data;
    } finally {
      setLoading(false);
    }
  }, []);

  // ===== Phase 2: CRM evolution =====
  const startVisit = useCallback(async (params: {
    employee_id: string;
    intake_reason: IntakeReason;
    language?: string;
    device_id?: string;
  }) => {
    setLoading(true);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke("front-desk-checkin", {
        body: { action: "start_visit", ...params },
      });
      if (fnErr) throw new Error(fnErr.message);
      if (data?.error) throw new Error(data.error);
      return data.visit as ActiveCase;
    } finally {
      setLoading(false);
    }
  }, []);

  const closeVisit = useCallback(async (params: {
    visit_id: string;
    final_resolution: FinalResolution;
    resolution_note?: string;
    rating?: RatingValue;
    rating_comment?: string;
  }) => {
    setLoading(true);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke("front-desk-checkin", {
        body: { action: "close_visit", ...params },
      });
      if (fnErr) throw new Error(fnErr.message);
      if (data?.error) throw new Error(data.error);
      return data.visit as ActiveCase & { rating?: RatingValue; duration_seconds?: number };
    } finally {
      setLoading(false);
    }
  }, []);

  const captureKioskPhoto = useCallback(async (params: {
    employee_id: string;
    photo_base64: string;
    visit_id?: string;
  }) => {
    setLoading(true);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke("front-desk-checkin", {
        body: { action: "capture_kiosk_photo", ...params },
      });
      if (fnErr) throw new Error(fnErr.message);
      if (data?.error) throw new Error(data.error);
      return data as { photo_url: string; employee: FrontDeskEmployee };
    } finally {
      setLoading(false);
    }
  }, []);

  const getVisit = useCallback(async (visit_id: string) => {
    const { data, error: fnErr } = await supabase.functions.invoke("front-desk-checkin", {
      body: { action: "get_visit", visit_id },
    });
    if (fnErr) throw new Error(fnErr.message);
    if (data?.error) throw new Error(data.error);
    return data.visit as ActiveCase;
  }, []);

  return {
    loading,
    error,
    lookupByPhone,
    selectEmployee,
    updateSelf,
    lookupEmployee,
    createInquiry,
    listPayments,
    createVisit,
    updateVisit,
    submitRating,
    // Phase 2
    startVisit,
    closeVisit,
    captureKioskPhoto,
    getVisit,
  };
}

// Visit type metadata (kept for legacy reports)
export const VISIT_TYPES: Array<{ key: VisitType; labelEs: string; labelEn: string; icon: string; color: string }> = [
  { key: "pickup_check", labelEs: "Recoger cheque", labelEn: "Pickup check", icon: "💵", color: "bg-emerald-50 border-emerald-200 text-emerald-900" },
  { key: "update_data", labelEs: "Actualizar datos", labelEn: "Update info", icon: "✏️", color: "bg-blue-50 border-blue-200 text-blue-900" },
  { key: "submit_documents", labelEs: "Entregar documentos", labelEn: "Submit documents", icon: "📄", color: "bg-violet-50 border-violet-200 text-violet-900" },
  { key: "fix_documents", labelEs: "Corregir documentos", labelEn: "Fix documents", icon: "🔧", color: "bg-amber-50 border-amber-200 text-amber-900" },
  { key: "portal_help", labelEs: "Ayuda con portal", labelEn: "Portal help", icon: "🔐", color: "bg-indigo-50 border-indigo-200 text-indigo-900" },
  { key: "payment_support", labelEs: "Soporte de pago", labelEn: "Payment support", icon: "💳", color: "bg-rose-50 border-rose-200 text-rose-900" },
  { key: "onboarding", labelEs: "Onboarding", labelEn: "Onboarding", icon: "🎯", color: "bg-cyan-50 border-cyan-200 text-cyan-900" },
  { key: "general_inquiry", labelEs: "Consulta general", labelEn: "General inquiry", icon: "💬", color: "bg-slate-50 border-slate-200 text-slate-900" },
  { key: "other", labelEs: "Otro", labelEn: "Other", icon: "📌", color: "bg-neutral-50 border-neutral-200 text-neutral-900" },
];

export function getVisitTypeMeta(key: VisitType) {
  return VISIT_TYPES.find((v) => v.key === key) ?? VISIT_TYPES[VISIT_TYPES.length - 1];
}
