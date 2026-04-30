/**
 * WorkerDataQualityReview — Phase 1, read-only.
 *
 * Detailed Data Quality section shown inside the worker drawer/profile.
 * Renders payroll readiness, every detected risk with explanation,
 * the underlying detected data, and a manual operator recommendation.
 *
 * Strictly visual. No writes. No payroll math.
 */

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  analyzeEmployeeRisks,
  computePayrollReadiness,
  getRiskMeta,
  RISK_ORDER,
  READINESS_LABEL,
  type PayrollReadiness,
  type RiskKey,
} from "@/lib/data-quality-risks";
import { normalizePhone } from "@/lib/phone";
import {
  ShieldCheck,
  ShieldAlert,
  Sparkles,
  Phone,
  Mail,
  MapPin,
  UserCog,
  KeyRound,
  Hash,
  Info,
} from "lucide-react";

interface Props {
  employee: any;
  /**
   * Full company employee list — required for cross-row signals like duplicates
   * and shared-email detection. Caller passes the same array used in the list.
   */
  companyEmployees: any[];
}

const READINESS_TONE: Record<
  PayrollReadiness,
  { wrap: string; chip: string; icon: React.ComponentType<{ className?: string }>; description: string }
> = {
  ready: {
    wrap: "border-emerald-200/60 bg-emerald-50/30",
    chip: "border-emerald-200 bg-emerald-50 text-emerald-700",
    icon: ShieldCheck,
    description: "No data-quality risks detected on this worker. Readiness signal only — payroll calculations are unchanged.",
  },
  needs_review: {
    wrap: "border-amber-200/60 bg-amber-50/30",
    chip: "border-amber-200 bg-amber-50 text-amber-700",
    icon: Sparkles,
    description: "Soft warnings detected. Review before payroll, mass invites or critical assignments. Payroll calculations are unchanged.",
  },
  blocked_visual: {
    wrap: "border-rose-200/60 bg-rose-50/30",
    chip: "border-rose-200 bg-rose-50 text-rose-700",
    icon: ShieldAlert,
    description: "Looks like a test or system placeholder. Should not run payroll. This is a visual signal — payroll calculations are unchanged.",
  },
};

export default function WorkerDataQualityReview({ employee, companyEmployees }: Props) {
  if (!employee) return null;

  // Reuse the same analyzer used by the panel + list to guarantee parity.
  const analysis = analyzeEmployeeRisks(companyEmployees);
  const risks = analysis.byId.get(employee.id) ?? [];
  const readiness = computePayrollReadiness(risks);
  const tone = READINESS_TONE[readiness];
  const ReadinessIcon = tone.icon;

  const detected = collectDetectedSignals(employee);
  const recommendation = buildRecommendation(risks, readiness);

  const orderedRisks = RISK_ORDER.filter((k) => risks.includes(k));

  return (
    <Card className={cn("border shadow-none", tone.wrap)}>
      <div className="p-3 space-y-3">
        {/* Header / readiness */}
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <div className={cn("rounded-md p-1.5 border", tone.chip)}>
              <ReadinessIcon className="h-3.5 w-3.5" />
            </div>
            <div className="min-w-0">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-foreground/80">
                Data Quality Review
              </h4>
              <p className="text-[10.5px] text-muted-foreground mt-0.5 max-w-md leading-tight">
                Readiness signal only. Payroll calculations are not changed.
              </p>
            </div>
          </div>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10.5px] font-semibold",
              tone.chip,
            )}
          >
            <ReadinessIcon className="h-3 w-3" />
            {READINESS_LABEL[readiness]}
          </span>
        </div>

        <p className="text-[11px] text-foreground/75 leading-snug">{tone.description}</p>

        {/* Detected signals (always shown — operators can verify the source data) */}
        <div className="rounded-md border border-border/60 bg-card/60 p-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
            Detected on this worker
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1">
            <DetectedRow icon={Phone} label="Phone"    value={detected.phone} hint={detected.phoneHint} />
            <DetectedRow icon={Mail}  label="Email"    value={detected.email} hint={detected.emailHint} />
            <DetectedRow icon={UserCog} label="Role"   value={detected.role} hint={detected.roleHint} />
            <DetectedRow icon={MapPin} label="Location" value={detected.location} hint={detected.locationHint} />
            <DetectedRow icon={KeyRound} label="Portal access" value={detected.portal} hint={detected.portalHint} />
            <DetectedRow icon={Hash}  label="Status"   value={detected.status} hint={detected.statusHint} />
          </div>
        </div>

        {/* Risk tags with explanations */}
        {orderedRisks.length > 0 ? (
          <div className="space-y-1.5">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Risk tags ({orderedRisks.length})
            </div>
            <ul className="space-y-1.5">
              {orderedRisks.map((k) => {
                const meta = getRiskMeta(k);
                const cls =
                  meta.tone === "destructive"
                    ? "border-rose-200 bg-rose-50/70 text-rose-700"
                    : meta.tone === "warning"
                    ? "border-amber-200 bg-amber-50/70 text-amber-700"
                    : "border-border/60 bg-muted/40 text-muted-foreground";
                return (
                  <li
                    key={k}
                    className={cn(
                      "flex items-start gap-2 rounded-md border p-2",
                      cls,
                    )}
                  >
                    <Badge
                      variant="outline"
                      className={cn(
                        "shrink-0 text-[9.5px] font-semibold border-current bg-background/60 leading-none py-0.5",
                      )}
                    >
                      {meta.label}
                    </Badge>
                    <span className="text-[11px] leading-snug text-foreground/80">{meta.description}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : (
          <div className="rounded-md border border-emerald-200/60 bg-emerald-50/40 p-2 text-[11px] text-emerald-800 flex items-center gap-2">
            <ShieldCheck className="h-3.5 w-3.5" />
            No risk tags detected on this worker.
          </div>
        )}

        {/* Manual recommendation */}
        <div className="rounded-md border border-border/60 bg-background/60 p-2.5">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
            <Info className="h-3 w-3" />
            Recommendation
          </div>
          <p className="text-[11px] leading-snug text-foreground/85">{recommendation}</p>
          <p className="text-[10px] text-muted-foreground/80 mt-1.5 italic">
            Phase 1 is read-only. Quick actions (mark reviewed, normalize phone, deactivate
            portal access) will arrive in a later phase.
          </p>
        </div>
      </div>
    </Card>
  );
}

function DetectedRow({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex items-start gap-1.5 py-0.5 min-w-0">
      <Icon className="h-3 w-3 mt-0.5 text-muted-foreground shrink-0" />
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground leading-none">{label}</div>
        <div className="text-[11px] text-foreground/85 truncate">{value || "—"}</div>
        {hint && <div className="text-[10px] text-amber-700 leading-tight">{hint}</div>}
      </div>
    </div>
  );
}

interface DetectedSignals {
  phone: string;       phoneHint?: string;
  email: string;       emailHint?: string;
  role: string;        roleHint?: string;
  location: string;    locationHint?: string;
  portal: string;      portalHint?: string;
  status: string;      statusHint?: string;
}

function collectDetectedSignals(e: any): DetectedSignals {
  const phoneRaw = e?.phone_number ?? "";
  const phoneNorm = normalizePhone(phoneRaw);
  const phoneOk = !!phoneNorm && phoneNorm.length === 10;

  const email = (e?.email ?? "").toString().trim();
  const role = (e?.employee_role ?? "").toString().trim();
  const city = (e?.address_city ?? "").toString().trim();
  const state = (e?.address_state ?? "").toString().trim();
  const location = [city, state].filter(Boolean).join(", ");

  const portalActive = !!e?.user_id;
  const isActive = e?.is_active !== false;

  return {
    phone: phoneRaw || "—",
    phoneHint: !phoneOk ? "Not a normalized 10-digit number." : undefined,

    email: email || "—",
    emailHint: undefined, // explanation lives in the risk tag if present

    role: role || "—",
    roleHint: !role ? "No role assigned." : undefined,

    location: location || "—",
    locationHint: !location ? "City and state are blank." : undefined,

    portal: portalActive ? "Active (linked user)" : "Not linked",
    portalHint: !isActive && portalActive ? "Portal still linked on inactive worker." : undefined,

    status: isActive ? "Active worker" : "Inactive",
    statusHint: undefined,
  };
}

function buildRecommendation(risks: RiskKey[], readiness: PayrollReadiness): string {
  if (risks.includes("system_placeholder")) {
    return "This record looks like an auto-generated System placeholder. Do not use for payroll, portal or assignments. Keep for audit only.";
  }
  if (risks.includes("test_account")) {
    return "Looks like a test/demo/QA account. Exclude from payroll and avoid sending invitations until confirmed.";
  }
  if (risks.includes("duplicate_review")) {
    return "Shares phone, email or worker code with another record. Open the duplicate detector and consolidate before payroll or assignments.";
  }
  if (risks.includes("historical_active")) {
    return "Marked historical/legacy but portal access is still active. Decide whether to keep portal access or archive the worker.";
  }
  if (risks.includes("suspicious_email") || risks.includes("phone_invalid") || risks.includes("missing_role")) {
    return "Profile is incomplete or contains shared/invalid contact data. Fix the missing fields before sending invites or running payroll.";
  }
  if (risks.includes("missing_location")) {
    return "City and state are blank. Add a location to improve scheduling, geofencing and reports.";
  }
  if (risks.includes("inactive_with_payroll")) {
    return "Inactive worker with prior payroll history. Keep for audit; do not include in active operations.";
  }
  if (readiness === "ready") {
    return "No risks detected. This worker is ready for payroll, invitations and assignments.";
  }
  return "Review the flagged signals above before running payroll or sending invitations.";
}
