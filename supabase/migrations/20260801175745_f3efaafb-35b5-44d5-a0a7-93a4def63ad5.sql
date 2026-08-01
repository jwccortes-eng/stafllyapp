REVOKE ALL ON FUNCTION public.next_company_shift_number(uuid) FROM public;
REVOKE ALL ON FUNCTION public.next_company_shift_number(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.next_company_shift_number(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.next_company_shift_number(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.find_shift_across_my_companies(text) FROM anon;