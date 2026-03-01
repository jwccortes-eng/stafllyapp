import { useEffect, useRef, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";

// Debounce page views: 1 log per page per user per 5 minutes
const VIEW_DEBOUNCE_MS = 5 * 60 * 1000;
const viewCache = new Map<string, number>();

export type AuditAction =
  | "page_view"
  | "record_view"
  | "create"
  | "update"
  | "delete"
  | "approve"
  | "reject"
  | "close"
  | "reopen"
  | "publish"
  | "paid"
  | "export"
  | "print"
  | "email"
  | "import"
  | "consolidate_clock";

export interface AuditLogOptions {
  /** The action type */
  action: AuditAction;
  /** Entity category (employee, period, shift, etc.) */
  entityType: string;
  /** Specific record ID */
  entityId?: string;
  /** Additional metadata (filters, format, recipient count, etc.) */
  details?: Record<string, any>;
  /** Previous data for updates */
  oldData?: Record<string, any> | null;
  /** New data for updates */
  newData?: Record<string, any> | null;
}

/** Redact sensitive fields from audit data */
const SENSITIVE_FIELDS = [
  "access_pin", "password", "token", "secret", "ssn", "tin",
  "tin_encrypted", "tin_last4", "bank_account", "routing_number",
];

function redactSensitive(data: Record<string, any> | null | undefined): Record<string, any> | null {
  if (!data) return null;
  const clean: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    if (SENSITIVE_FIELDS.some(f => key.toLowerCase().includes(f))) {
      clean[key] = "***redacted***";
    } else {
      clean[key] = value;
    }
  }
  return clean;
}

export function useAuditLog() {
  const { user } = useAuth();
  const { selectedCompanyId } = useCompany();

  const logAudit = useCallback(
    async (opts: AuditLogOptions) => {
      if (!user?.id) return;

      try {
        await supabase.from("activity_log").insert({
          user_id: user.id,
          company_id: selectedCompanyId || null,
          action: opts.action,
          entity_type: opts.entityType,
          entity_id: opts.entityId || null,
          details: opts.details || {},
          old_data: redactSensitive(opts.oldData),
          new_data: redactSensitive(opts.newData),
        });
      } catch {
        // Best-effort — never block primary actions
      }
    },
    [user?.id, selectedCompanyId]
  );

  return { logAudit };
}

/**
 * Automatically logs a debounced page_view when the component mounts.
 * @param pageName - Human-readable page name for the audit log
 */
export function usePageView(pageName: string) {
  const { user } = useAuth();
  const { selectedCompanyId } = useCompany();
  const location = useLocation();
  const logged = useRef(false);

  useEffect(() => {
    if (!user?.id || logged.current) return;

    const cacheKey = `${user.id}:${location.pathname}`;
    const lastView = viewCache.get(cacheKey);
    const now = Date.now();

    if (lastView && now - lastView < VIEW_DEBOUNCE_MS) return;

    viewCache.set(cacheKey, now);
    logged.current = true;

    supabase
      .from("activity_log")
      .insert({
        user_id: user.id,
        company_id: selectedCompanyId || null,
        action: "page_view",
        entity_type: "page",
        entity_id: null,
        details: {
          page_name: pageName,
          route: location.pathname,
          search: location.search || undefined,
        },
      })
      .then(() => {});
  }, [user?.id, location.pathname, pageName, selectedCompanyId]);
}

/**
 * Logs when a specific record detail is viewed (debounced).
 */
export function useRecordView(entityType: string, entityId: string | null | undefined) {
  const { user } = useAuth();
  const { selectedCompanyId } = useCompany();
  const logged = useRef(false);

  useEffect(() => {
    if (!user?.id || !entityId || logged.current) return;

    const cacheKey = `${user.id}:${entityType}:${entityId}`;
    const lastView = viewCache.get(cacheKey);
    const now = Date.now();

    if (lastView && now - lastView < VIEW_DEBOUNCE_MS) return;

    viewCache.set(cacheKey, now);
    logged.current = true;

    supabase
      .from("activity_log")
      .insert({
        user_id: user.id,
        company_id: selectedCompanyId || null,
        action: "record_view",
        entity_type: entityType,
        entity_id: entityId,
        details: {},
      })
      .then(() => {});
  }, [user?.id, entityType, entityId, selectedCompanyId]);
}
