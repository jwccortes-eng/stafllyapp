/**
 * Portal & Onboarding — premium compact panel for Worker Detail.
 *
 * Surfaces the activation/portal state of an employee plus the most recent
 * "profile updated during activation" event (from activity_log). Read-only.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { format, parseISO, formatDistanceToNow, isValid } from "date-fns";
import { isOnboardingComplete } from "@/lib/onboarding";
import {
  ShieldCheck, ShieldOff, CheckCircle2, AlertCircle, FileText, Clock,
} from "lucide-react";

interface Props {
  employeeId: string;
  companyId: string;
  /** Optionally render a "Documents" jump button (calls back to parent). */
  onJumpToDocuments?: () => void;
}

interface PortalSnapshot {
  onboarding_status: string | null;
  onboarding_completed_at: string | null;
  portal_access_enabled: boolean | null;
  last_login: string | null;
}

interface LastActivation {
  created_at: string;
  changed_fields: string[];
}

function fmtDate(iso?: string | null) {
  if (!iso) return "—";
  try {
    const d = parseISO(iso);
    return isValid(d) ? format(d, "dd MMM yyyy, HH:mm") : "—";
  } catch { return "—"; }
}

function fmtAgo(iso?: string | null) {
  if (!iso) return null;
  try {
    const d = parseISO(iso);
    return isValid(d) ? formatDistanceToNow(d, { addSuffix: true }) : null;
  } catch { return null; }
}

export function PortalOnboardingPanel({ employeeId, companyId, onJumpToDocuments }: Props) {
  const [snap, setSnap] = useState<PortalSnapshot | null>(null);
  const [lastActivation, setLastActivation] = useState<LastActivation | null>(null);
  const [docsCount, setDocsCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [{ data: emp }, { data: act }, { count }] = await Promise.all([
        supabase
          .from("employees")
          .select("onboarding_status, onboarding_completed_at, portal_access_enabled, last_login")
          .eq("id", employeeId)
          .maybeSingle(),
        supabase
          .from("activity_log")
          .select("created_at, details")
          .eq("entity_type", "employee")
          .eq("entity_id", employeeId)
          .eq("action", "employee_profile_updated_during_activation")
          .order("created_at", { ascending: false })
          .limit(1),
        supabase
          .from("employee_onboarding_documents" as any)
          .select("id", { count: "exact", head: true })
          .eq("employee_id", employeeId)
          .eq("company_id", companyId),
      ]);

      if (cancelled) return;
      setSnap((emp as PortalSnapshot) ?? null);
      const row = (act ?? [])[0] as any;
      if (row) {
        const changed = Array.isArray(row?.details?.changed_fields)
          ? row.details.changed_fields
          : [];
        setLastActivation({ created_at: row.created_at, changed_fields: changed });
      } else {
        setLastActivation(null);
      }
      setDocsCount(count ?? 0);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [employeeId, companyId]);

  const complete = isOnboardingComplete(snap?.onboarding_status);
  const portalOn = snap?.portal_access_enabled === true;

  return (
    <div>
      <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50 mb-1.5 flex items-center gap-1">
        <ShieldCheck className="h-3 w-3" /> Portal & Onboarding
      </h3>
      <Card className="rounded-lg border-border/30">
        <CardContent className="p-3 space-y-2.5">
          {loading ? (
            <div className="text-[11px] text-muted-foreground py-1">Loading…</div>
          ) : (
            <>
              {/* Top row — status pills */}
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px] gap-1",
                    complete
                      ? "bg-earning/10 text-earning border-earning/20"
                      : "bg-warning/10 text-warning border-warning/20",
                  )}
                >
                  {complete ? <CheckCircle2 className="h-2.5 w-2.5" /> : <AlertCircle className="h-2.5 w-2.5" />}
                  Onboarding: {complete ? "Complete" : (snap?.onboarding_status || "Pending")}
                </Badge>
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px] gap-1",
                    portalOn
                      ? "bg-primary/10 text-primary border-primary/20"
                      : "bg-muted text-muted-foreground border-border/40",
                  )}
                >
                  {portalOn ? <ShieldCheck className="h-2.5 w-2.5" /> : <ShieldOff className="h-2.5 w-2.5" />}
                  Portal: {portalOn ? "Enabled" : "Disabled"}
                </Badge>
              </div>

              {/* Compact key/value rows */}
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <CheckCircle2 className="h-3 w-3 text-muted-foreground/40" />
                  Completed at
                </div>
                <div className="text-right font-medium tabular-nums">
                  {fmtDate(snap?.onboarding_completed_at)}
                </div>

                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Clock className="h-3 w-3 text-muted-foreground/40" />
                  Last sign-in
                </div>
                <div className="text-right font-medium tabular-nums">
                  {fmtAgo(snap?.last_login) ?? "—"}
                </div>

                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <FileText className="h-3 w-3 text-muted-foreground/40" />
                  Documents uploaded
                </div>
                <div className="text-right font-semibold">
                  {docsCount === 0 ? (
                    <span className="text-muted-foreground/60">0</span>
                  ) : onJumpToDocuments ? (
                    <button
                      type="button"
                      onClick={onJumpToDocuments}
                      className="text-primary hover:underline tabular-nums"
                    >
                      {docsCount}
                    </button>
                  ) : (
                    <span className="tabular-nums">{docsCount}</span>
                  )}
                </div>
              </div>

              {/* Last activation update */}
              {lastActivation && (
                <div className="border-t border-border/30 pt-2 space-y-1">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-semibold">
                    Last activation update
                  </p>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-muted-foreground">
                      {fmtAgo(lastActivation.created_at) ?? fmtDate(lastActivation.created_at)}
                    </span>
                    <span className="text-[10px] text-muted-foreground/60">
                      {fmtDate(lastActivation.created_at)}
                    </span>
                  </div>
                  {lastActivation.changed_fields.length > 0 ? (
                    <div className="flex flex-wrap gap-1 pt-0.5">
                      {lastActivation.changed_fields.map((f) => (
                        <Badge
                          key={f}
                          variant="outline"
                          className="text-[9px] bg-primary/[0.06] text-primary/80 border-primary/15"
                        >
                          {f}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[10px] text-muted-foreground/60">
                      No tracked field changes.
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
