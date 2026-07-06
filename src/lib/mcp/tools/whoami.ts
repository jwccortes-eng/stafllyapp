import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { withMcpAudit } from "../lib/audit";

export default defineTool({
  name: "whoami",
  title: "Who am I",
  description:
    "Return the identity of the signed-in Stafly user connected via MCP (user id, email, client id). Read-only.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx: ToolContext) =>
    withMcpAudit(ctx, "whoami", async () => {
      const payload = {
        user_id: ctx.getUserId(),
        email: ctx.getUserEmail(),
        client_id: ctx.getClientId(),
      };
      return {
        content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
        structuredContent: payload,
      };
    }),
});
