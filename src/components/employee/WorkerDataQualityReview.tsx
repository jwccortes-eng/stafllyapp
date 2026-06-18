/**
 * WorkerDataQualityReview — Phase 2, actionable.
 *
 * Detailed Data Quality section shown inside the worker drawer/profile.
 * Renders payroll readiness, every detected risk with explanation,
 * the underlying detected data, and quick action buttons that:
 *   - Jump to the right tab inside EmployeeProfileTabs (Info, Profile, Access, Documents).
 *   - Open WhatsApp with a pre-filled reminder for the worker's missing items.
 *
 * No DB writes here. Edits happen in the destination tab. WhatsApp is
 * delivered manually by the admin via wa.me.
 */

import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import {
  buildWhatsappReminder,
  buildWaMeUrl,
  tabForRisk,
  type ProfileTabId,
} from "@/lib/data-quality-actions";
import { normalizePhone } from "@/lib/phone";
import type { WorkerDocumentSignals } from "@/lib/documents-signals";
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
  MessageCircle,
  ArrowRight,
  User,
  FileText,
} from "lucide-react";

interface Props {
  employee: any;
  companyEmployees: any[];
  /** Optional document signals — keeps parity with DataQualityRiskPanel. */
  documentSignals?: Map<string, WorkerDocumentSignals>;
  /** Phase 2 — switch the parent EmployeeProfileTabs to a specific tab. */
  onJumpToTab?: (tab: ProfileTabId) => void;
  /** Optional company name used in the WhatsApp reminder copy. */
  companyName?: string | null;
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

export default function WorkerDataQualityReview({
  employee,
  companyEmployees,
  documentSignals,
  onJumpToTab,
  companyName,
}: Props) {
  // All hooks declared before any early return — Rules of Hooks.
  const analysis = useMemo(
    () => analyzeEmployeeRisks(companyEmployees, documentSignals),
    [companyEmployees, documentSignals],
  );
  const risks = employee ? (analysis.byId.get(employee.id) ?? []) : [];
  const readiness = computePayrollReadiness(risks);
  const orderedRisks = RISK_ORDER.filter((k) => risks.includes(k));

  const targetTabs = useMemo(() => {
    const set = new Set<ProfileTabId>();
    for (const r of orderedRisks) set.add(tabForRisk(r));
    return set;
  }, [orderedRisks]);

  const waMessage = useMemo(
    () => buildWhatsappReminder({
      firstName: employee?.first_name,
      risks: orderedRisks,
      companyName: companyName ?? null,
    }),
    [employee?.first_name, orderedRisks, companyName],
  );
  const waUrl = useMemo(
    () => waMessage ? buildWaMeUrl(employee?.phone_number, waMessage) : null,
    [employee?.phone_number, waMessage],
  );

  if (!employee) return null;

  const tone = READINESS_TONE[readiness];
  const ReadinessIcon = tone.icon;
  const detected = collectDetectedSignals(employee);
  const recommendation = buildRecommendation(risks, readiness);


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
                Calidad de datos
              </h4>
              <p className="text-[10.5px] text-muted-foreground mt-0.5 max-w-md leading-tight">
                Solo señal de preparación. Los cálculos de payroll no se modifican.
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
            Detectado en este trabajador
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1">
            <DetectedRow icon={Phone} label="Teléfono"    value={detected.phone} hint={detected.phoneHint} />
            <DetectedRow icon={Mail}  label="Email"    value={detected.email} hint={detected.emailHint} />
            <DetectedRow icon={UserCog} label="Rol"   value={detected.role} hint={detected.roleHint} />
            <DetectedRow icon={MapPin} label="Ubicación" value={detected.location} hint={detected.locationHint} />
            <DetectedRow icon={KeyRound} label="Acceso al portal" value={detected.portal} hint={detected.portalHint} />
            <DetectedRow icon={Hash}  label="Estado"   value={detected.status} hint={detected.statusHint} />
          </div>
        </div>

        {/* Risk tags with explanations */}
        {orderedRisks.length > 0 ? (
          <div className="space-y-1.5">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Etiquetas de riesgo ({orderedRisks.length})
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
            No se detectaron etiquetas de riesgo en este trabajador.
          </div>
        )}

        {/* Action center — Phase 2. Buttons appear only when there is a target. */}
        {(onJumpToTab && targetTabs.size > 0) || waUrl ? (
          <div className="rounded-md border border-border/60 bg-background/70 p-2.5 space-y-2">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <Sparkles className="h-3 w-3" />
              Acciones rápidas
            </div>

            {onJumpToTab && targetTabs.size > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {targetTabs.has("info") && (
                  <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => onJumpToTab("info")}>
                    <User className="h-3 w-3 mr-1" />
                    Editar datos
                    <ArrowRight className="h-3 w-3 ml-1 opacity-60" />
                  </Button>
                )}
                {targetTabs.has("profile") && (
                  <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => onJumpToTab("profile")}>
                    <User className="h-3 w-3 mr-1" />
                    Agregar foto
                    <ArrowRight className="h-3 w-3 ml-1 opacity-60" />
                  </Button>
                )}
                {targetTabs.has("docs") && (
                  <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => onJumpToTab("docs")}>
                    <FileText className="h-3 w-3 mr-1" />
                    Abrir documentos
                    <ArrowRight className="h-3 w-3 ml-1 opacity-60" />
                  </Button>
                )}
                {targetTabs.has("access") && (
                  <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => onJumpToTab("access")}>
                    <KeyRound className="h-3 w-3 mr-1" />
                    Acceso al portal
                    <ArrowRight className="h-3 w-3 ml-1 opacity-60" />
                  </Button>
                )}
              </div>
            )}

            {waMessage && (
              <div className="flex flex-col sm:flex-row items-start gap-2">
                {waUrl ? (
                  <Button
                    asChild
                    size="sm"
                    className="h-7 text-[11px] bg-emerald-600 hover:bg-emerald-700 text-white shrink-0"
                  >
                    <a href={waUrl} target="_blank" rel="noopener noreferrer">
                      <MessageCircle className="h-3 w-3 mr-1" />
                      Recordatorio WhatsApp
                    </a>
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" className="h-7 text-[11px] shrink-0" disabled title="Agrega un teléfono de 10 dígitos primero">
                    <MessageCircle className="h-3 w-3 mr-1" />
                    WhatsApp (sin teléfono)
                  </Button>
                )}
                <p className="text-[10px] text-muted-foreground leading-snug">
                  Abre WhatsApp con un mensaje predefinido pidiendo al trabajador completar su perfil. Se envía manualmente.
                </p>
              </div>
            )}
          </div>
        ) : null}

        {/* Manual recommendation */}
        <div className="rounded-md border border-border/60 bg-background/60 p-2.5">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
            <Info className="h-3 w-3" />
            Recomendación
          </div>
          <p className="text-[11px] leading-snug text-foreground/85">{recommendation}</p>
          <p className="text-[10px] text-muted-foreground/80 mt-1.5 italic">
            Las ediciones abren la pestaña correspondiente en el perfil — no se aplican correcciones automáticas. Payroll, fichajes y turnos nunca se modifican desde este panel.
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
