(globalThis as any).localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
import { reconcileCompany, summarizeFleetReadiness } from "@/lib/ecc/reconciliation";
import { getCommercialContractReadModel } from "@/lib/ecc/commercial-read-model";
import type { EccReadModelInput } from "@/lib/ecc/commercial-read-model";
import raw from "./tmp-ecc-companies.json";

const AT = new Date().toISOString();

const inputs: EccReadModelInput[] = (raw as any[]).map(c => ({
  company: {
    id: c.id, name: c.name, slug: c.slug, is_active: c.is_active, status: c.status,
    approval_state: c.approval_state, access_state: c.access_state, commercial_state: c.commercial_state,
    plan_code: c.plan_code, plan_status: c.plan_status, billing_status: c.billing_status,
    paid_features_enabled: c.paid_features_enabled, max_employees: c.max_employees,
    max_admins: c.max_admins, version: c.version,
  },
  modules: c.modules ?? [],
  subscription: c.subscription ?? null,
  userCount: c.user_count,
  employeeCount: c.employee_count,
  generatedAt: AT,
}));

const recs = inputs.map(i => reconcileCompany(i, AT));
const meta = new Map((raw as any[]).map(c => [c.id, c]));

for (const r of recs) {
  const m = meta.get(r.companyId)!;
  const model = getCommercialContractReadModel(inputs.find(i => i.company.id === r.companyId)!);
  const crit = r.criticalMatrix;
  console.log(JSON.stringify({
    name: m.name,
    id: r.companyId,
    isDemo: r.isDemo,
    readiness: r.readiness,
    reasons: r.readinessReasons,
    blockers: r.blockers,
    contradictions: r.contradictions,
    legacyPlan: m.plan_code,
    eccPlan: model.effectivePlan + " (" + model.planSource + ")",
    planVersion: (model as any).planVersion?.versionKey ?? null,
    critTotal: crit.length,
    critMatch: crit.filter(c => c.status === "match").length,
    critMismatch: crit.filter(c => c.status !== "match").map(c => `${c.label}:${c.status}`),
    limits: r.limits.map(l => `${l.limitKey} legacy=${l.legacy} ecc=${l.ecc} uso=${l.usage} ${l.overLimitRisk ? "EXCEDIDO" : l.status}`),
    overrides: r.overrides.map(o => `${o.key}:${o.classification}${o.blocksReadiness ? "(bloquea)" : ""}`),
    unknownOverrides: r.overrides.filter(o => o.classification === "desconocido").length,
    findingsHigh: r.findings.filter(f => f.risk === "alto").length,
    cutoverCandidate: r.cutoverCandidate,
    candidateReason: r.candidateReason,
    payroll: { payPeriods: m.pay_periods, basePayRows: m.base_pay_rows, shifts: m.shifts, employees: m.employee_count },
  }, null, 1));
}

console.log("FLEET", JSON.stringify(summarizeFleetReadiness(recs, AT), null, 1));
