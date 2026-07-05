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
  version: "0.1.0",
  instructions:
    "Stafly agent integration. Read-only tools for identity and worker shifts. Use `echo` to verify connectivity, `whoami` to confirm the signed-in Stafly user, and `list_my_shifts` to view upcoming assignments. Payroll, time entries, employees, and shifts writes are intentionally not exposed.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [echoTool, whoamiTool, listMyShiftsTool],
});
