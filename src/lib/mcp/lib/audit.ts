// Shared audit + rate-limit helpers for Stafly MCP tools.
//
// Design notes:
// - Every tool logs metadata-only into public.mcp_invocations under the
//   user's own bearer token (RLS restricts writes to auth.uid()=user_id).
// - We NEVER log tool arguments, results, tokens, Authorization headers,
//   or shift/employee PII. Only: user_id, oauth_client_id, tool_name,
//   ok, latency_ms, error_code, invoked_at.
// - Rate limiting is enforced by counting rows in the same table in the
//   last N seconds for the (user_id, tool_name) pair. Fail-open on infra
//   errors so audit-table outages never break the tool for the user.
// - No service_role. Everything runs with the caller's OAuth bearer.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ToolContext } from "@lovable.dev/mcp-js";

export function mcpSupabase(ctx: ToolContext): SupabaseClient {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}

type RateLimitConfig = { windowSec: number; max: number };

// Conservative defaults. Global 60 rpm per user, tighter caps on DB-heavy
// tools. Tune these once we have real MCP traffic.
const RATE_LIMITS: Record<string, RateLimitConfig> = {
  __default: { windowSec: 60, max: 60 },
  echo: { windowSec: 60, max: 60 },
  whoami: { windowSec: 60, max: 30 },
  list_my_shifts: { windowSec: 60, max: 20 },
};

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSec: number };

export async function checkRateLimit(
  ctx: ToolContext,
  toolName: string,
): Promise<RateLimitResult> {
  const cfg = RATE_LIMITS[toolName] ?? RATE_LIMITS.__default;
  try {
    const supabase = mcpSupabase(ctx);
    const since = new Date(Date.now() - cfg.windowSec * 1000).toISOString();
    const { count, error } = await supabase
      .from("mcp_invocations")
      .select("id", { count: "exact", head: true })
      .eq("user_id", ctx.getUserId())
      .eq("tool_name", toolName)
      .gte("invoked_at", since);
    if (error) return { allowed: true }; // fail-open
    if ((count ?? 0) >= cfg.max) {
      return { allowed: false, retryAfterSec: cfg.windowSec };
    }
    return { allowed: true };
  } catch {
    return { allowed: true }; // fail-open
  }
}

export async function logInvocation(
  ctx: ToolContext,
  toolName: string,
  ok: boolean,
  latencyMs: number,
  errorCode?: string | null,
): Promise<void> {
  try {
    const supabase = mcpSupabase(ctx);
    await supabase.from("mcp_invocations").insert({
      user_id: ctx.getUserId(),
      oauth_client_id: ctx.getClientId() ?? null,
      tool_name: toolName,
      ok,
      latency_ms: Math.max(0, Math.round(latencyMs)),
      error_code: errorCode ?? null,
    });
  } catch {
    // Never fail a tool because audit logging failed.
  }
}

/**
 * Wraps a tool handler with rate-limit + audit logging.
 * The inner function should return the MCP result directly.
 * If the inner function throws, we log `handler_error` and return a
 * generic error message (never leak internal details).
 */
export async function withMcpAudit<T>(
  ctx: ToolContext,
  toolName: string,
  fn: () => Promise<T>,
): Promise<T | { content: [{ type: "text"; text: string }]; isError: true }> {
  const start = Date.now();

  if (!ctx.isAuthenticated()) {
    await logInvocation(ctx, toolName, false, Date.now() - start, "unauthenticated");
    return {
      content: [{ type: "text", text: "Not authenticated" }],
      isError: true,
    };
  }

  const rate = await checkRateLimit(ctx, toolName);
  if (!rate.allowed) {
    await logInvocation(ctx, toolName, false, Date.now() - start, "rate_limited");
    return {
      content: [
        {
          type: "text",
          text: `Rate limit exceeded for ${toolName}. Try again in ~${rate.retryAfterSec}s.`,
        },
      ],
      isError: true,
    };
  }

  try {
    const result = await fn();
    // Best-effort ok detection: MCP results with isError:true count as failures.
    const ok = !(result as { isError?: boolean })?.isError;
    await logInvocation(
      ctx,
      toolName,
      ok,
      Date.now() - start,
      ok ? null : "tool_error",
    );
    return result;
  } catch {
    await logInvocation(ctx, toolName, false, Date.now() - start, "handler_error");
    return {
      content: [{ type: "text", text: "Internal error" }],
      isError: true,
    };
  }
}
