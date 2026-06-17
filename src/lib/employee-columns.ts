/**
 * Column list for `public.employees` excluding the fiscal-sensitive
 * `verification_ssn_ein` field. The broad authenticated role lost
 * SELECT on that column in Security Phase 1.5, so any `select("*")`
 * would fail with permission denied. Use this constant in admin
 * profile / onboarding queries that don't need SSN/EIN. The SSN/EIN
 * value is only obtainable through the admin-gated RPC
 * `admin_get_employees_with_fiscal`.
 */
export const EMPLOYEE_COLUMNS_NO_FISCAL =
  "id, user_id, first_name, last_name, phone_number, email, " +
  "connecteam_employee_id, is_active, created_at, updated_at, " +
  "country_code, start_date, english_level, employee_role, qualify, " +
  "recommended_by, direct_manager, has_car, driver_licence, end_date, " +
  "date_added, last_login, added_via, added_by, groups, tags, access_pin, " +
  "company_id, avatar_url, gender, birthday, address, county, skills, " +
  "service_category_ids, professional_summary, years_experience, " +
  "certifications, passport_public, available_for_work, " +
  "approx_latitude, approx_longitude, must_change_pin, " +
  "portal_access_enabled, employer_identification, " +
  "created_from_reconciliation, ssn_last4, date_of_birth, " +
  "emergency_contact_name, emergency_contact_phone, can_drive, " +
  "has_vehicle, onboarding_status, onboarding_completed_at, " +
  "address_line, address_city, address_state, address_zip, languages, " +
  "profile_status, deleted_at, merged_into_employee_id, address_structured, " +
  "preferred_name";
