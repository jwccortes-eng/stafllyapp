import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function supabaseForUser(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "list_my_shifts",
  title: "List my upcoming shifts",
  description:
    "List the signed-in worker's upcoming shift assignments (next N days). Respects Stafly RLS — only shifts the caller is allowed to see are returned.",
  inputSchema: {
    days_ahead: z.number().int().min(1).max(30).default(7).describe("How many days ahead to look."),
    limit: z.number().int().min(1).max(50).default(20),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ days_ahead, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const from = new Date();
    const to = new Date(Date.now() + days_ahead * 24 * 60 * 60 * 1000);

    const { data, error } = await supabase
      .from("shift_assignments")
      .select(
        "id, status, scheduled_shifts!inner(id, start_at, end_at, title, meeting_point, publication_status)",
      )
      .gte("scheduled_shifts.start_at", from.toISOString())
      .lte("scheduled_shifts.start_at", to.toISOString())
      .order("scheduled_shifts(start_at)", { ascending: true })
      .limit(limit);

    if (error) {
      return { content: [{ type: "text", text: error.message }], isError: true };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { assignments: data ?? [] },
    };
  },
});
