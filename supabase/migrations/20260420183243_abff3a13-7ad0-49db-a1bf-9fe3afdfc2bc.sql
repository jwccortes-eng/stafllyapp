-- Restore SELECT grant on public.companies for authenticated.
-- Row-level security still enforces visibility:
--   * "Company members can view their companies" → user must be in company_users OR be a global owner (developer/owner)
--   * "Owners can manage all companies" → developer/owner have full access
-- Without this GRANT, RLS cannot return any rows and developers see an empty company switcher.
GRANT SELECT ON public.companies TO authenticated;

-- Anon must NOT have full table SELECT (PII like invite_code must stay private).
-- Public branding lookups continue via the get_company_by_invite_code RPC.
REVOKE SELECT ON public.companies FROM anon;