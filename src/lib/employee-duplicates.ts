import { supabase } from "@/integrations/supabase/client";
import { getPhoneLookupVariants } from "@/lib/phone";

export const EMPLOYEE_LOOKUP_FIELDS = "id, first_name, last_name, phone_number, email, access_pin, company_id, avatar_url, gender, user_id, is_active, employer_identification, employee_role, onboarding_status";

export type EmployeeDuplicateMatchType = "phone" | "email" | "phone_and_email";

export interface EmployeeDuplicateMatch {
  employee: Record<string, any>;
  matchedBy: EmployeeDuplicateMatchType;
}

export function normalizeEmployeeEmail(raw: string | null | undefined): string | null {
  const value = raw?.trim().toLowerCase();
  return value ? value : null;
}

function resolveMatchedBy(flags: Set<"phone" | "email">): EmployeeDuplicateMatchType {
  if (flags.has("phone") && flags.has("email")) return "phone_and_email";
  return flags.has("phone") ? "phone" : "email";
}

export function describeDuplicateMatch(employee: Record<string, any>, matchedBy: EmployeeDuplicateMatchType) {
  const hasPortal = !!employee.user_id;
  const isArchived = employee.is_active === false;

  const title = matchedBy === "phone_and_email"
    ? "Este empleado ya existe por teléfono y email"
    : matchedBy === "phone"
      ? "Este empleado ya existe por teléfono"
      : "Este empleado ya existe por email";

  const statusLabel = hasPortal
    ? "Ya tiene portal activo"
    : isArchived
      ? "Está archivado"
      : "Existe sin portal";

  return {
    title,
    statusLabel,
    canInvite: !hasPortal && !isArchived,
    canReactivate: isArchived,
  };
}

export async function findExistingEmployeeInCompany(
  companyId: string,
  params: { phone?: string | null; email?: string | null },
): Promise<EmployeeDuplicateMatch | null> {
  const phoneVariants = getPhoneLookupVariants(params.phone);
  const normalizedEmail = normalizeEmployeeEmail(params.email);
  const matchesById = new Map<string, { employee: Record<string, any>; flags: Set<"phone" | "email"> }>();

  if (phoneVariants.length > 0) {
    const { data: phoneMatches } = await supabase
      .from("employees")
      .select(EMPLOYEE_LOOKUP_FIELDS)
      .eq("company_id", companyId)
      .in("phone_number", phoneVariants);

    for (const employee of phoneMatches ?? []) {
      const existing = matchesById.get(employee.id) ?? { employee, flags: new Set<"phone" | "email">() };
      existing.flags.add("phone");
      matchesById.set(employee.id, existing);
    }
  }

  if (normalizedEmail) {
    const { data: emailMatches } = await supabase
      .from("employees")
      .select(EMPLOYEE_LOOKUP_FIELDS)
      .eq("company_id", companyId)
      .ilike("email", normalizedEmail);

    for (const employee of emailMatches ?? []) {
      const existing = matchesById.get(employee.id) ?? { employee, flags: new Set<"phone" | "email">() };
      existing.flags.add("email");
      matchesById.set(employee.id, existing);
    }
  }

  const ordered = Array.from(matchesById.values()).sort((a, b) => {
    const aScore = (a.flags.has("phone") ? 2 : 0) + (a.flags.has("email") ? 1 : 0);
    const bScore = (b.flags.has("phone") ? 2 : 0) + (b.flags.has("email") ? 1 : 0);
    return bScore - aScore;
  });

  if (!ordered.length) return null;

  return {
    employee: ordered[0].employee,
    matchedBy: resolveMatchedBy(ordered[0].flags),
  };
}
