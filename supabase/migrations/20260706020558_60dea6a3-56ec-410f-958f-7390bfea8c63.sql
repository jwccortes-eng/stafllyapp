CREATE TABLE public.mcp_invocations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  oauth_client_id TEXT,
  tool_name TEXT NOT NULL,
  invoked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ok BOOLEAN NOT NULL,
  latency_ms INTEGER,
  error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_mcp_invocations_user_time
  ON public.mcp_invocations(user_id, invoked_at DESC);

CREATE INDEX idx_mcp_invocations_user_tool_time
  ON public.mcp_invocations(user_id, tool_name, invoked_at DESC);

GRANT SELECT, INSERT ON public.mcp_invocations TO authenticated;
GRANT ALL ON public.mcp_invocations TO service_role;

ALTER TABLE public.mcp_invocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own MCP invocations"
  ON public.mcp_invocations
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own MCP invocations"
  ON public.mcp_invocations
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Global owners can view all MCP invocations"
  ON public.mcp_invocations
  FOR SELECT
  TO authenticated
  USING (is_global_owner(auth.uid()));
