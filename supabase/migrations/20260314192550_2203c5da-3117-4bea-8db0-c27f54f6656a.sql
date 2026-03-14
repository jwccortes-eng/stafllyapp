
-- 1. FIX PRIVILEGE ESCALATION: Restrict admin from assigning owner/developer roles
DROP POLICY IF EXISTS "Admins can manage roles" ON user_roles;
CREATE POLICY "Admins can manage roles" ON user_roles
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (
    role NOT IN ('owner', 'developer') 
    OR is_global_owner(auth.uid())
  );

-- 2. FIX UNAUTHENTICATED SHIFT REVIEWS: Drop anon policies
DROP POLICY IF EXISTS "Anon can insert employee reviews" ON shift_reviews;
DROP POLICY IF EXISTS "Anon can read shift reviews by company" ON shift_reviews;

-- 3. FIX EMPLOYEE BADGES: Drop anon read policy
DROP POLICY IF EXISTS "Anon can read badges" ON employee_badges;

-- 4. FIX CONCEPTS CROSS-COMPANY LEAK
DROP POLICY IF EXISTS "Employees can view active concepts" ON concepts;
CREATE POLICY "Employees can view active concepts" ON concepts
  FOR SELECT TO authenticated
  USING (
    is_active AND EXISTS (
      SELECT 1 FROM employees 
      WHERE employees.user_id = auth.uid() 
      AND employees.company_id = concepts.company_id
    )
  );

-- 5. FIX PAY_PERIODS CROSS-COMPANY LEAK
DROP POLICY IF EXISTS "Employees can view periods" ON pay_periods;
CREATE POLICY "Employees can view periods" ON pay_periods
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM employees 
      WHERE employees.user_id = auth.uid() 
      AND employees.company_id = pay_periods.company_id
    )
  );

-- 6. FIX MUTABLE SEARCH_PATH on email queue functions
CREATE OR REPLACE FUNCTION public.enqueue_email(queue_name text, payload jsonb)
 RETURNS bigint
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ SELECT pgmq.send(queue_name, payload); $function$;

CREATE OR REPLACE FUNCTION public.read_email_batch(queue_name text, batch_size integer, vt integer)
 RETURNS TABLE(msg_id bigint, read_ct integer, message jsonb)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ SELECT msg_id, read_ct, message FROM pgmq.read(queue_name, vt, batch_size); $function$;

CREATE OR REPLACE FUNCTION public.delete_email(queue_name text, message_id bigint)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ SELECT pgmq.delete(queue_name, message_id); $function$;

CREATE OR REPLACE FUNCTION public.move_to_dlq(source_queue text, dlq_name text, message_id bigint, payload jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE new_id BIGINT;
BEGIN
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  PERFORM pgmq.delete(source_queue, message_id);
  RETURN new_id;
END;
$function$;
