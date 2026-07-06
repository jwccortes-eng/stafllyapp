import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { withMcpAudit } from "../lib/audit";

export default defineTool({
  name: "echo",
  title: "Echo",
  description:
    "Echo the input text back to the caller. Useful to verify connectivity to the Stafly MCP server. Read-only, no data access.",
  inputSchema: { text: z.string().min(1).max(500).describe("Text to echo back.") },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ text }, ctx) =>
    withMcpAudit(ctx, "echo", async () => ({
      content: [{ type: "text" as const, text }],
    })),
});
