import { auth, defineMcp } from "@lovable.dev/mcp-js";
import echoTool from "./tools/echo";
import whoamiTool from "./tools/whoami";
import listMyShiftsTool from "./tools/list-my-shifts";

// OAuth issuer MUST be the direct Supabase host, built from the project ref
// (see app-mcp-server-authoring knowledge). VITE_SUPABASE_PROJECT_ID is inlined
// at build time so this stays import-safe. The fallback keeps the issuer
// well-formed during the throwaway manifest-extract eval.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "stafly-mcp",
  title: "Stafly",
  version: "0.2.0",
  instructions:
    "Stafly agent integration. Read-only tools scoped to the signed-in worker. `echo` verifies connectivity, `whoami` returns basic identity (user id, email, oauth client id), `list_my_shifts` returns the caller's own upcoming assignments with company context. Every call is rate-limited per user/tool and audit-logged (metadata only — no arguments, results, tokens, or coworker/payroll data). Writes to payroll, time entries, shifts, employees, documents, payments, bookings, and chat are intentionally NOT exposed.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [echoTool, whoamiTool, listMyShiftsTool],
});
