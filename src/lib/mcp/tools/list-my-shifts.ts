import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { mcpSupabase, withMcpAudit } from "../lib/audit";

// Deliberately narrow projection. We NEVER expose:
//   - other workers on the shift, hourly rates, notes admin, GPS,
//     closeouts, time_entries, payroll, documents, chat, tax data.
// company_name is included so multi-tenant workers can tell which company
// a shift belongs to. company_id is intentionally NOT accepted as input —
// we always scope by the authenticated user via RLS.
type ShiftRow = {
  id: string;
  status: string | null;
  employees: { is_active: boolean | null } | null;
  scheduled_shifts: {
    id: string;
    start_at: string;
    end_at: string | null;
    title: string | null;
    meeting_point: string | null;
    publication_status: string | null;
    company_id: string | null;
    companies: { name: string | null } | null;
  } | null;
};

export default defineTool({
  name: "list_my_shifts",
  title: "List my upcoming shifts",
  description:
    "List the signed-in worker's upcoming shift assignments (next N days). Only shifts assigned to the caller are returned; RLS + active-employee filter prevent cross-worker or cross-tenant leakage. Payroll, time entries, coworkers, GPS, and admin notes are NOT exposed. Read-only.",
  inputSchema: {
    days_ahead: z
      .number()
      .int()
      .min(1)
      .max(30)
      .default(7)
      .describe("How many days ahead to look."),
    limit: z.number().int().min(1).max(50).default(20),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ days_ahead, limit }, ctx) =>
    withMcpAudit(ctx, "list_my_shifts", async () => {
      const supabase = mcpSupabase(ctx);
      const from = new Date();
      const to = new Date(Date.now() + days_ahead * 24 * 60 * 60 * 1000);

      // Identidad canónica del llamante + sus fichas fusionadas (mismo tenant).
      // Mismo contrato que src/lib/identity/identity-set.ts, resuelto con el
      // cliente MCP para no saltarse RLS.
      const { data: mine } = await supabase
        .from("employees")
        .select("id,company_id")
        .eq("user_id", ctx.getUserId())
        .eq("is_active", true);
      const canonicalIds = (mine ?? []).map((e: { id: string }) => e.id);
      if (canonicalIds.length === 0) {
        return {
          content: [
            { type: "text" as const, text: "No upcoming shifts found in the requested window." },
          ],
        };
      }
      const { data: shadows } = await supabase
        .from("employees")
        .select("id,company_id,merged_into_employee_id")
        .in("merged_into_employee_id", canonicalIds);
      const companyById = new Map(
        (mine ?? []).map((e: { id: string; company_id: string | null }) => [e.id, e.company_id]),
      );
      const shadowIds = (shadows ?? [])
        .filter(
          (s: { company_id: string | null; merged_into_employee_id: string | null }) =>
            s.merged_into_employee_id != null &&
            s.company_id != null &&
            companyById.get(s.merged_into_employee_id) === s.company_id,
        )
        .map((s: { id: string }) => s.id);
      const identityIds = [...canonicalIds, ...shadowIds];

      const { data, error } = await supabase
        .from("shift_assignments")
        .select(
          `id,
           status,
           scheduled_shifts!inner(
             id,start_at,end_at,title,meeting_point,publication_status,company_id,
             companies(name)
           )`,
        )
        .in("employee_id", identityIds)
        .gte("scheduled_shifts.start_at", from.toISOString())
        .lte("scheduled_shifts.start_at", to.toISOString())
        .order("scheduled_shifts(start_at)", { ascending: true })
        .limit(limit);

      if (error) {
        return {
          content: [{ type: "text" as const, text: "Could not load shifts." }],
          isError: true,
        };
      }

      const rows = (data ?? []) as unknown as ShiftRow[];
      const assignments = rows
        .filter((r) => r.scheduled_shifts)
        .map((r) => ({
          assignment_id: r.id,
          assignment_status: r.status,
          shift_id: r.scheduled_shifts!.id,
          start_at: r.scheduled_shifts!.start_at,
          end_at: r.scheduled_shifts!.end_at,
          title: r.scheduled_shifts!.title,
          meeting_point: r.scheduled_shifts!.meeting_point,
          publication_status: r.scheduled_shifts!.publication_status,
          company_id: r.scheduled_shifts!.company_id,
          company_name: r.scheduled_shifts!.companies?.name ?? null,
        }));

      if (assignments.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: "No upcoming shifts found in the requested window.",
            },
          ],
          structuredContent: { assignments: [] },
        };
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(assignments, null, 2),
          },
        ],
        structuredContent: { assignments },
      };
    }),
});
