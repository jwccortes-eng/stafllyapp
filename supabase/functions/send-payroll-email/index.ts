import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "npm:resend@4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface PayrollEmailPayload {
  period_id: string;
  company_id: string;
  employee_ids?: string[]; // if empty → all employees in period
  fallback_email?: string; // receives failures report
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await supabase.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claimsData.claims.sub as string;

    // Parse body
    const body: PayrollEmailPayload = await req.json();
    const { period_id, company_id, fallback_email } = body;

    if (!period_id || !company_id) {
      return new Response(JSON.stringify({ error: "period_id and company_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Service role client for querying all data
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify user has access (owner/admin of company)
    const { data: companyUser } = await adminClient
      .from("company_users")
      .select("role")
      .eq("user_id", userId)
      .eq("company_id", company_id)
      .single();

    const { data: globalOwner } = await adminClient.rpc("is_global_owner", { _user_id: userId });

    if (!globalOwner && (!companyUser || !["owner", "admin"].includes(companyUser.role))) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get period info
    const { data: period } = await adminClient
      .from("pay_periods")
      .select("start_date, end_date, status")
      .eq("id", period_id)
      .eq("company_id", company_id)
      .single();

    if (!period) {
      return new Response(JSON.stringify({ error: "Period not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get company name
    const { data: company } = await adminClient
      .from("companies")
      .select("name")
      .eq("id", company_id)
      .single();

    // Get base pay for employees in this period
    let basePayQuery = adminClient
      .from("period_base_pay")
      .select("employee_id, total_work_hours, total_regular, total_overtime, total_paid_hours, base_total_pay")
      .eq("period_id", period_id)
      .eq("company_id", company_id);

    if (body.employee_ids?.length) {
      basePayQuery = basePayQuery.in("employee_id", body.employee_ids);
    }

    const { data: basePays } = await basePayQuery;

    if (!basePays?.length) {
      return new Response(JSON.stringify({ error: "No payroll data found for this period" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const employeeIds = basePays.map((bp) => bp.employee_id);

    // Get employee info
    const { data: employees } = await adminClient
      .from("employees")
      .select("id, first_name, last_name, email")
      .in("id", employeeIds);

    const employeeMap = new Map(employees?.map((e) => [e.id, e]) ?? []);

    // Get movements (extras/deductions) for these employees in this period
    const { data: movements } = await adminClient
      .from("movements")
      .select("employee_id, total_value, note, concept_id, quantity, rate")
      .eq("period_id", period_id)
      .eq("company_id", company_id)
      .in("employee_id", employeeIds);

    // Get concept names
    const conceptIds = [...new Set(movements?.map((m) => m.concept_id) ?? [])];
    const { data: concepts } = conceptIds.length
      ? await adminClient.from("concepts").select("id, name, category").in("id", conceptIds)
      : { data: [] };
    const conceptMap = new Map(concepts?.map((c) => [c.id, c]) ?? []);

    // Group movements by employee
    const movementsByEmployee = new Map<string, typeof movements>();
    for (const m of movements ?? []) {
      const arr = movementsByEmployee.get(m.employee_id) ?? [];
      arr.push(m);
      movementsByEmployee.set(m.employee_id, arr);
    }

    // Init Resend
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) {
      return new Response(JSON.stringify({ error: "RESEND_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const resend = new Resend(resendKey);

    const results: { employee_id: string; name: string; status: string; error?: string }[] = [];
    const failures: string[] = [];

    for (const bp of basePays) {
      const emp = employeeMap.get(bp.employee_id);
      if (!emp) continue;

      const fullName = `${emp.first_name} ${emp.last_name}`;
      const recipientEmail = emp.email;

      if (!recipientEmail) {
        results.push({ employee_id: emp.id, name: fullName, status: "skipped", error: "No email" });
        failures.push(`${fullName}: sin correo electrónico`);
        continue;
      }

      // Build movements breakdown
      const empMovements = movementsByEmployee.get(emp.id) ?? [];
      const earnings = empMovements.filter((m) => {
        const c = conceptMap.get(m.concept_id);
        return c?.category === "earning";
      });
      const deductions = empMovements.filter((m) => {
        const c = conceptMap.get(m.concept_id);
        return c?.category === "deduction";
      });

      const totalEarnings = earnings.reduce((s, m) => s + (m.total_value ?? 0), 0);
      const totalDeductions = deductions.reduce((s, m) => s + (m.total_value ?? 0), 0);
      const grandTotal = bp.base_total_pay + totalEarnings - totalDeductions;

      // Build HTML email
      const html = buildPayrollEmailHtml({
        employeeName: fullName,
        companyName: company?.name ?? "Empresa",
        periodStart: period.start_date,
        periodEnd: period.end_date,
        totalWorkHours: bp.total_work_hours,
        totalRegular: bp.total_regular,
        totalOvertime: bp.total_overtime,
        baseTotalPay: bp.base_total_pay,
        earnings,
        deductions,
        conceptMap,
        totalEarnings,
        totalDeductions,
        grandTotal,
      });

      try {
        await resend.emails.send({
          from: "StaflyApps <noreply@notify.staflyapps.com>",
          to: [recipientEmail],
          subject: `Detalle de pago — ${period.start_date} al ${period.end_date}`,
          html,
        });
        results.push({ employee_id: emp.id, name: fullName, status: "sent" });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        results.push({ employee_id: emp.id, name: fullName, status: "failed", error: msg });
        failures.push(`${fullName} (${recipientEmail}): ${msg}`);
      }
    }

    // Send failure report to fallback email if there are failures
    if (failures.length > 0 && fallback_email) {
      try {
        await resend.emails.send({
          from: "StaflyApps <noreply@notify.staflyapps.com>",
          to: [fallback_email],
          subject: `⚠️ Fallos de envío — Periodo ${period.start_date} al ${period.end_date}`,
          html: `<h2>Reporte de fallos de envío de nómina</h2>
<p>Periodo: ${period.start_date} al ${period.end_date}</p>
<ul>${failures.map((f) => `<li>${f}</li>`).join("")}</ul>
<p>Total enviados: ${results.filter((r) => r.status === "sent").length} / ${results.length}</p>`,
        });
      } catch (_) {
        // silently ignore fallback errors
      }
    }

    // Log activity
    await adminClient.from("activity_log").insert({
      user_id: userId,
      company_id,
      action: "send_payroll_emails",
      entity_type: "pay_period",
      entity_id: period_id,
      details: {
        total: results.length,
        sent: results.filter((r) => r.status === "sent").length,
        failed: results.filter((r) => r.status === "failed").length,
        skipped: results.filter((r) => r.status === "skipped").length,
      },
    });

    return new Response(JSON.stringify({ success: true, results }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    console.error("send-payroll-email error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ── HTML builder ──────────────────────────────────────────────────────

function fmt(n: number | null | undefined): string {
  return (n ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function buildPayrollEmailHtml(data: {
  employeeName: string;
  companyName: string;
  periodStart: string;
  periodEnd: string;
  totalWorkHours: number | null;
  totalRegular: number | null;
  totalOvertime: number | null;
  baseTotalPay: number;
  earnings: any[];
  deductions: any[];
  conceptMap: Map<string, any>;
  totalEarnings: number;
  totalDeductions: number;
  grandTotal: number;
}): string {
  const earningRows = data.earnings
    .map((m) => {
      const c = data.conceptMap.get(m.concept_id);
      return `<tr><td style="padding:6px 12px;border-bottom:1px solid #eee">${c?.name ?? "Extra"}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #eee;text-align:right">$${fmt(m.total_value)}</td></tr>`;
    })
    .join("");

  const deductionRows = data.deductions
    .map((m) => {
      const c = data.conceptMap.get(m.concept_id);
      return `<tr><td style="padding:6px 12px;border-bottom:1px solid #eee">${c?.name ?? "Deducción"}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #eee;text-align:right;color:#dc2626">-$${fmt(m.total_value)}</td></tr>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 0">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06)">

<!-- Header -->
<tr><td style="background:#1a1a2e;padding:24px 32px">
  <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700">StaflyApps</h1>
  <p style="margin:4px 0 0;color:#a0a0b8;font-size:13px">Detalle de pago</p>
</td></tr>

<!-- Body -->
<tr><td style="padding:28px 32px">

<p style="margin:0 0 4px;font-size:15px;color:#333">Hola <strong>${data.employeeName}</strong>,</p>
<p style="margin:0 0 20px;font-size:14px;color:#666">
  Aquí tienes el desglose de tu pago correspondiente al periodo <strong>${data.periodStart}</strong> al <strong>${data.periodEnd}</strong>.
</p>

<!-- Hours -->
<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;background:#f9fafb;border-radius:8px;padding:16px">
<tr>
  <td style="padding:8px 16px;font-size:13px;color:#666">Horas trabajadas</td>
  <td style="padding:8px 16px;font-size:13px;text-align:right;font-weight:600">${fmt(data.totalWorkHours)}</td>
</tr>
<tr>
  <td style="padding:8px 16px;font-size:13px;color:#666">Horas regulares</td>
  <td style="padding:8px 16px;font-size:13px;text-align:right">${fmt(data.totalRegular)}</td>
</tr>
<tr>
  <td style="padding:8px 16px;font-size:13px;color:#666">Overtime</td>
  <td style="padding:8px 16px;font-size:13px;text-align:right">${fmt(data.totalOvertime)}</td>
</tr>
<tr>
  <td style="padding:8px 16px;font-size:13px;color:#333;font-weight:600">Pago base</td>
  <td style="padding:8px 16px;font-size:14px;text-align:right;font-weight:700;color:#1a1a2e">$${fmt(data.baseTotalPay)}</td>
</tr>
</table>

${
  earningRows
    ? `<h3 style="margin:0 0 8px;font-size:14px;color:#333">Devengados</h3>
<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:12px">${earningRows}
<tr><td style="padding:8px 12px;font-weight:600">Subtotal extras</td>
<td style="padding:8px 12px;text-align:right;font-weight:600;color:#16a34a">+$${fmt(data.totalEarnings)}</td></tr>
</table>`
    : ""
}

${
  deductionRows
    ? `<h3 style="margin:0 0 8px;font-size:14px;color:#333">Deducciones</h3>
<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:12px">${deductionRows}
<tr><td style="padding:8px 12px;font-weight:600">Subtotal deducciones</td>
<td style="padding:8px 12px;text-align:right;font-weight:600;color:#dc2626">-$${fmt(data.totalDeductions)}</td></tr>
</table>`
    : ""
}

<!-- Grand total -->
<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;background:#1a1a2e;border-radius:8px">
<tr>
  <td style="padding:16px 20px;color:#fff;font-size:16px;font-weight:700">Total a pagar</td>
  <td style="padding:16px 20px;color:#fff;font-size:18px;font-weight:700;text-align:right">$${fmt(data.grandTotal)}</td>
</tr>
</table>

<p style="margin:24px 0 0;font-size:12px;color:#999;text-align:center">
  Este correo fue generado automáticamente por ${data.companyName} vía StaflyApps.
</p>

</td></tr>
</table>
</td></tr></table>
</body></html>`;
}
