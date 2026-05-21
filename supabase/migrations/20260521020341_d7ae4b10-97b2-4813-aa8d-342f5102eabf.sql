
-- Drop blanket table SELECT so column-level grants take effect.
REVOKE SELECT ON public.employees FROM authenticated;
REVOKE SELECT ON public.employees FROM anon;

-- Re-grant SELECT on every column EXCEPT verification_ssn_ein.
GRANT SELECT (
  id, user_id, first_name, last_name, phone_number, email,
  connecteam_employee_id, is_active, created_at, updated_at,
  country_code, start_date, english_level, employee_role, qualify,
  recommended_by, direct_manager, has_car, driver_licence, end_date,
  date_added, last_login, added_via, added_by, groups, tags, access_pin,
  company_id, avatar_url, gender, birthday, address, county, skills,
  service_category_ids, professional_summary, years_experience,
  certifications, passport_public, available_for_work,
  approx_latitude, approx_longitude, must_change_pin,
  portal_access_enabled, employer_identification,
  created_from_reconciliation, ssn_last4, date_of_birth,
  emergency_contact_name, emergency_contact_phone, can_drive,
  has_vehicle, onboarding_status, onboarding_completed_at,
  address_line, address_city, address_state, address_zip, languages,
  profile_status, deleted_at, merged_into_employee_id, address_structured
) ON public.employees TO authenticated;

GRANT SELECT (
  id, user_id, first_name, last_name, phone_number, email,
  connecteam_employee_id, is_active, created_at, updated_at,
  country_code, start_date, english_level, employee_role, qualify,
  recommended_by, direct_manager, has_car, driver_licence, end_date,
  date_added, last_login, added_via, added_by, groups, tags, access_pin,
  company_id, avatar_url, gender, birthday, address, county, skills,
  service_category_ids, professional_summary, years_experience,
  certifications, passport_public, available_for_work,
  approx_latitude, approx_longitude, must_change_pin,
  portal_access_enabled, employer_identification,
  created_from_reconciliation, ssn_last4, date_of_birth,
  emergency_contact_name, emergency_contact_phone, can_drive,
  has_vehicle, onboarding_status, onboarding_completed_at,
  address_line, address_city, address_state, address_zip, languages,
  profile_status, deleted_at, merged_into_employee_id, address_structured
) ON public.employees TO anon;
