/**
 * Required documents for STAFly employee onboarding.
 *
 * Source of truth model:
 *   1. Hardcoded defaults below (W9 + ID, plus driver's license if can_drive=true).
 *   2. Per-company override via company_settings.onboarding_required_documents
 *      (jsonb array of category strings). Mirrors the DB function
 *      `public.get_required_documents_for_company`.
 *
 * Use the categories defined in DOCUMENT_CATEGORIES — they map 1:1 to
 * employee_documents.category and to the readiness check used by
 * compute_employee_profile_status() in Postgres.
 */

import { supabase } from "@/integrations/supabase/client";

export type DocumentCategory =
  | "w9"
  | "id"
  | "drivers_license"
  | "work_authorization"
  | "tax_form"
  | "contract"
  | "background_check"
  | "other";

export const DOCUMENT_CATEGORIES: Record<DocumentCategory, { label: string; hint: string }> = {
  w9:                  { label: "W-9",                hint: "Tax form (required for 1099 contractors)" },
  id:                  { label: "Government ID",      hint: "Driver license, passport or state ID" },
  drivers_license:     { label: "Driver's License",   hint: "Required if the worker drives for the company" },
  work_authorization:  { label: "Work Authorization", hint: "EAD card, visa or similar" },
  tax_form:            { label: "Tax Form",           hint: "W-4, state withholding, etc." },
  contract:            { label: "Contract",           hint: "Signed employment or contractor agreement" },
  background_check:    { label: "Background Check",   hint: "Authorization or report" },
  other:               { label: "Other",              hint: "Any additional document" },
};

/** Hardcoded default required categories. Driver's license is added at runtime when can_drive=true. */
export const DEFAULT_REQUIRED_DOCUMENTS: DocumentCategory[] = ["w9", "id"];

/**
 * Fetch the effective required-documents list for a company.
 * Falls back to DEFAULT_REQUIRED_DOCUMENTS if the company has not set an override.
 *
 * Always appends `drivers_license` when canDrive=true and it isn't already required.
 */
export async function getRequiredDocumentsForCompany(
  companyId: string,
  opts: { canDrive?: boolean } = {},
): Promise<DocumentCategory[]> {
  let base: DocumentCategory[] = [...DEFAULT_REQUIRED_DOCUMENTS];

  try {
    const { data } = await supabase
      .from("company_settings")
      .select("value")
      .eq("company_id", companyId)
      .eq("key", "onboarding_required_documents")
      .maybeSingle();

    if (data?.value && Array.isArray(data.value)) {
      base = (data.value as string[]).filter((v): v is DocumentCategory =>
        v in DOCUMENT_CATEGORIES,
      );
      if (base.length === 0) base = [...DEFAULT_REQUIRED_DOCUMENTS];
    }
  } catch {
    // ignore — fall back to defaults
  }

  if (opts.canDrive && !base.includes("drivers_license")) {
    base.push("drivers_license");
  }
  return base;
}
