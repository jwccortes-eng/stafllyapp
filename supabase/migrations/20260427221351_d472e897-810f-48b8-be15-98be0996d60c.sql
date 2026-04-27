-- Public-safe RPCs for the /apply/:slug landing
CREATE OR REPLACE FUNCTION public.get_public_company_by_slug(_slug text)
RETURNS TABLE (
  id uuid,
  name text,
  slug text,
  logo_url text,
  brand_color text,
  application_enabled boolean,
  application_intro text,
  application_cover_url text,
  is_active boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.name, c.slug, c.logo_url, c.brand_color,
         c.application_enabled, c.application_intro, c.application_cover_url,
         c.is_active
    FROM public.companies c
   WHERE lower(c.slug) = lower(coalesce(_slug, ''))
     AND c.is_active = true
     AND c.application_enabled = true
   LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.find_public_company_fuzzy(_slug text)
RETURNS TABLE (
  id uuid,
  name text,
  slug text,
  logo_url text,
  brand_color text,
  application_enabled boolean,
  application_intro text,
  application_cover_url text,
  is_active boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.name, c.slug, c.logo_url, c.brand_color,
         c.application_enabled, c.application_intro, c.application_cover_url,
         c.is_active
    FROM public.companies c
   WHERE c.is_active = true
     AND c.application_enabled = true
     AND c.slug ILIKE '%' || replace(lower(coalesce(_slug, '')), '-', '%') || '%'
   ORDER BY length(c.slug) ASC
   LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_public_company_by_slug(text) FROM public;
REVOKE ALL ON FUNCTION public.find_public_company_fuzzy(text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_public_company_by_slug(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.find_public_company_fuzzy(text) TO anon, authenticated;

-- Also fix the legacy view grant so /apply keeps working even before the frontend rolls out
GRANT SELECT ON public.companies_public TO anon, authenticated;