-- Allow public read access to passport data for public profiles
CREATE POLICY "public_read_visible_passports"
  ON passport_profiles FOR SELECT
  TO anon, authenticated
  USING (passport_visibility = 'public');

CREATE POLICY "public_read_passport_work_history"
  ON passport_work_history FOR SELECT
  TO anon, authenticated
  USING (
    passport_id IN (
      SELECT id FROM passport_profiles WHERE passport_visibility = 'public'
    )
  );

CREATE POLICY "public_read_passport_metrics"
  ON passport_metrics FOR SELECT
  TO anon, authenticated
  USING (
    passport_id IN (
      SELECT id FROM passport_profiles WHERE passport_visibility = 'public'
    )
  );

CREATE POLICY "public_read_passport_publications"
  ON passport_publications FOR SELECT
  TO anon, authenticated
  USING (
    passport_id IN (
      SELECT id FROM passport_profiles WHERE passport_visibility = 'public'
    )
  );