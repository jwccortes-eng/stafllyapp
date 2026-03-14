-- Allow employees to read/write their own availability config
CREATE POLICY "employees_read_own_availability_config"
  ON employee_availability_config FOR SELECT
  TO authenticated
  USING (
    employee_id IN (
      SELECT id FROM employees WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "employees_upsert_own_availability_config"
  ON employee_availability_config FOR INSERT
  TO authenticated
  WITH CHECK (
    employee_id IN (
      SELECT id FROM employees WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "employees_update_own_availability_config"
  ON employee_availability_config FOR UPDATE
  TO authenticated
  USING (
    employee_id IN (
      SELECT id FROM employees WHERE user_id = auth.uid()
    )
  );

-- Allow employees to manage their own overrides
CREATE POLICY "employees_read_own_overrides"
  ON employee_availability_overrides FOR SELECT
  TO authenticated
  USING (
    employee_id IN (
      SELECT id FROM employees WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "employees_insert_own_overrides"
  ON employee_availability_overrides FOR INSERT
  TO authenticated
  WITH CHECK (
    employee_id IN (
      SELECT id FROM employees WHERE user_id = auth.uid()
    )
    AND source = 'employee'
  );

CREATE POLICY "employees_update_own_overrides"
  ON employee_availability_overrides FOR UPDATE
  TO authenticated
  USING (
    employee_id IN (
      SELECT id FROM employees WHERE user_id = auth.uid()
    )
    AND source = 'employee'
  );

CREATE POLICY "employees_delete_own_overrides"
  ON employee_availability_overrides FOR DELETE
  TO authenticated
  USING (
    employee_id IN (
      SELECT id FROM employees WHERE user_id = auth.uid()
    )
    AND source = 'employee'
  );