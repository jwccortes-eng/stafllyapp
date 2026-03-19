import { supabase } from "@/integrations/supabase/client";

export interface DeductionProposal {
  recordId: string;
  referenceCode: string;
  recordType: "advance" | "loan";
  employeeId: string;
  employeeName: string;
  balanceRemaining: number;
  proposedAmount: number;
  repaymentMode: string;
  fixedAmountPerCut: number | null;
  percentagePerCut: number | null;
  capped: boolean;
  cappedReason?: string;
  skipped: boolean;
  skipReason?: string;
}

interface DeductionOptions {
  companyId: string;
  periodId: string;
  /** Map of employee_id → net pay available for deductions */
  employeeNetPay: Map<string, number>;
}

/**
 * Calculates proposed advance/loan deductions for a payroll period.
 * Returns a list of DeductionProposal items for review before confirmation.
 */
export async function calculateDeductionProposals(opts: DeductionOptions): Promise<DeductionProposal[]> {
  const { companyId, periodId, employeeNetPay } = opts;

  // 1. Fetch company financial policy
  const { data: policy } = await supabase
    .from("company_financial_policies")
    .select("*")
    .eq("company_id", companyId)
    .maybeSingle();

  const maxDeductPctNet = policy?.max_deduction_percent_of_net ?? null;
  const minNetPayProtection = policy?.protect_minimum_net_pay_amount ?? null;
  const priorityMode = policy?.deduction_priority ?? "oldest_first";

  // 2. Fetch period info
  const { data: period } = await supabase
    .from("pay_periods")
    .select("start_date, end_date")
    .eq("id", periodId)
    .single();

  if (!period) return [];

  const today = new Date().toISOString().slice(0, 10);

  // 3. Fetch all active records for this company
  const { data: records } = await supabase
    .from("employee_financial_records")
    .select("*, employees(first_name, last_name)")
    .eq("company_id", companyId)
    .in("status", ["active", "approved"])
    .eq("auto_deduct_enabled", true)
    .is("deleted_at", null);

  if (!records || records.length === 0) return [];

  // 4. Filter eligible records
  const eligible = records.filter(r => {
    if (Number(r.balance_remaining) <= 0) return false;
    if (r.repayment_start_date && r.repayment_start_date > period.end_date) return false;
    return true;
  });

  // 5. Sort by priority
  eligible.sort((a, b) => {
    if (a.priority_order != null && b.priority_order != null) return a.priority_order - b.priority_order;
    if (a.priority_order != null) return -1;
    if (b.priority_order != null) return 1;

    switch (priorityMode) {
      case "newest_first": return new Date(b.issue_date).getTime() - new Date(a.issue_date).getTime();
      case "highest_balance_first": return Number(b.balance_remaining) - Number(a.balance_remaining);
      case "oldest_first":
      default: return new Date(a.issue_date).getTime() - new Date(b.issue_date).getTime();
    }
  });

  // 6. Calculate proposals per employee
  const employeeDeductionBudgets = new Map<string, number>();
  const proposals: DeductionProposal[] = [];

  for (const r of eligible) {
    const empId = r.employee_id;
    const netPay = employeeNetPay.get(empId) ?? 0;
    const emp = r.employees as any;
    const empName = `${emp?.first_name ?? ""} ${emp?.last_name ?? ""}`.trim();
    const balance = Number(r.balance_remaining);

    // Get or initialize remaining deduction budget for this employee
    if (!employeeDeductionBudgets.has(empId)) {
      let budget = netPay;
      if (minNetPayProtection != null && r.protect_minimum_net_pay) {
        budget = Math.max(0, netPay - minNetPayProtection);
      }
      if (maxDeductPctNet != null) {
        budget = Math.min(budget, netPay * (maxDeductPctNet / 100));
      }
      employeeDeductionBudgets.set(empId, budget);
    }

    const remainingBudget = employeeDeductionBudgets.get(empId)!;

    // Skip if no earnings
    if (netPay <= 0) {
      proposals.push({
        recordId: r.id,
        referenceCode: r.reference_code,
        recordType: r.record_type,
        employeeId: empId,
        employeeName: empName,
        balanceRemaining: balance,
        proposedAmount: 0,
        repaymentMode: r.repayment_mode,
        fixedAmountPerCut: r.fixed_amount_per_cut,
        percentagePerCut: r.percentage_per_cut,
        capped: false,
        skipped: true,
        skipReason: "Sin ingresos en este periodo",
      });
      continue;
    }

    // Calculate raw proposed amount
    let rawAmount = 0;
    switch (r.repayment_mode) {
      case "fixed_amount":
        rawAmount = Number(r.fixed_amount_per_cut ?? 0);
        break;
      case "percentage_net":
        rawAmount = netPay * (Number(r.percentage_per_cut ?? 0) / 100);
        break;
      case "percentage_gross":
        rawAmount = netPay * (Number(r.percentage_per_cut ?? 0) / 100);
        break;
      case "one_time_next":
        rawAmount = balance;
        break;
      case "manual":
        proposals.push({
          recordId: r.id,
          referenceCode: r.reference_code,
          recordType: r.record_type,
          employeeId: empId,
          employeeName: empName,
          balanceRemaining: balance,
          proposedAmount: 0,
          repaymentMode: r.repayment_mode,
          fixedAmountPerCut: r.fixed_amount_per_cut,
          percentagePerCut: r.percentage_per_cut,
          capped: false,
          skipped: true,
          skipReason: "Modo manual — requiere acción del admin",
        });
        continue;
      default:
        rawAmount = Number(r.fixed_amount_per_cut ?? 0);
    }

    // Apply caps
    let proposed = Math.min(rawAmount, balance); // never exceed balance
    let capped = false;
    let cappedReason = "";

    // Respect max payment per cut
    if (r.maximum_payment_per_cut && proposed > Number(r.maximum_payment_per_cut)) {
      proposed = Number(r.maximum_payment_per_cut);
      capped = true;
      cappedReason = "Limitado por máximo por corte";
    }

    // Respect minimum payment
    if (r.minimum_payment && proposed < Number(r.minimum_payment) && proposed < balance) {
      proposed = Math.min(Number(r.minimum_payment), balance);
    }

    // Respect remaining budget
    if (proposed > remainingBudget) {
      proposed = remainingBudget;
      capped = true;
      cappedReason = cappedReason
        ? cappedReason + " + presupuesto insuficiente"
        : "Insuficiente neto disponible";
    }

    // Protect negative payroll
    if (r.protect_negative_payroll && proposed > netPay) {
      proposed = Math.max(0, netPay);
      capped = true;
      cappedReason = "Protección contra nómina negativa";
    }

    proposed = Math.round(proposed * 100) / 100;

    // Update budget
    employeeDeductionBudgets.set(empId, remainingBudget - proposed);

    proposals.push({
      recordId: r.id,
      referenceCode: r.reference_code,
      recordType: r.record_type,
      employeeId: empId,
      employeeName: empName,
      balanceRemaining: balance,
      proposedAmount: proposed,
      repaymentMode: r.repayment_mode,
      fixedAmountPerCut: r.fixed_amount_per_cut,
      percentagePerCut: r.percentage_per_cut,
      capped,
      cappedReason: capped ? cappedReason : undefined,
      skipped: proposed === 0,
      skipReason: proposed === 0 ? "Monto resultante es $0" : undefined,
    });
  }

  return proposals;
}

/**
 * Applies confirmed deduction proposals: creates ledger entries and updates balances.
 */
export async function applyDeductions(
  proposals: DeductionProposal[],
  periodId: string,
  companyId: string,
  userId: string,
): Promise<{ applied: number; errors: string[] }> {
  const toApply = proposals.filter(p => !p.skipped && p.proposedAmount > 0);
  let applied = 0;
  const errors: string[] = [];

  for (const p of toApply) {
    // Re-fetch current balance to avoid race conditions
    const { data: current } = await supabase
      .from("employee_financial_records")
      .select("balance_remaining, status")
      .eq("id", p.recordId)
      .single();

    if (!current || !["active", "approved"].includes(current.status)) {
      errors.push(`${p.referenceCode}: registro ya no está activo`);
      continue;
    }

    const balBefore = Number(current.balance_remaining);
    const deduction = Math.min(p.proposedAmount, balBefore);
    const balAfter = Math.round((balBefore - deduction) * 100) / 100;

    // Create ledger entry
    const { error: ledgerErr } = await supabase.from("employee_financial_ledger").insert({
      record_id: p.recordId,
      company_id: companyId,
      employee_id: p.employeeId,
      period_id: periodId,
      transaction_type: "payroll_deduction" as any,
      amount: deduction,
      balance_before: balBefore,
      balance_after: balAfter,
      note: `Deducción nómina — periodo ${periodId}`,
      created_by: userId,
    });

    if (ledgerErr) {
      errors.push(`${p.referenceCode}: error en ledger — ${ledgerErr.message}`);
      continue;
    }

    // Update balance
    const newStatus = balAfter === 0 ? "paid" : current.status;
    await supabase.from("employee_financial_records").update({
      balance_remaining: balAfter,
      status: newStatus as any,
      updated_by: userId,
    }).eq("id", p.recordId);

    applied++;
  }

  return { applied, errors };
}
