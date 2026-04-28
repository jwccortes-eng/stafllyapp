UPDATE public.employees
SET onboarding_status = 'complete',
    onboarding_completed_at = COALESCE(onboarding_completed_at, now()),
    portal_access_enabled = true,
    updated_at = now()
WHERE id = '482e78ca-d42b-4e12-86f5-6963c3012e61'
  AND user_id IS NOT NULL;