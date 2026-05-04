
-- =========================================================
-- ISSUE 1 — Location tables: remove cross-tenant via has_role(admin)
-- =========================================================

-- location_presence
DROP POLICY IF EXISTS "location_presence read by company or self" ON public.location_presence;
CREATE POLICY "location_presence read by company or self"
ON public.location_presence
FOR SELECT
TO authenticated
USING (
  is_global_owner(auth.uid())
  OR (company_id IS NOT NULL AND company_id IN (SELECT user_company_ids(auth.uid())))
  OR (
    subject_type = 'employee'::location_subject_type_enum
    AND subject_id IN (SELECT id FROM employees WHERE user_id = auth.uid())
  )
);

DROP POLICY IF EXISTS "location_presence upsert by self or admin" ON public.location_presence;
CREATE POLICY "location_presence upsert by self or admin"
ON public.location_presence
FOR INSERT
TO authenticated
WITH CHECK (
  is_global_owner(auth.uid())
  OR (company_id IS NOT NULL AND user_is_company_admin(auth.uid(), company_id))
  OR (
    subject_type = 'employee'::location_subject_type_enum
    AND subject_id IN (SELECT id FROM employees WHERE user_id = auth.uid())
  )
);

DROP POLICY IF EXISTS "location_presence update by self or admin" ON public.location_presence;
CREATE POLICY "location_presence update by self or admin"
ON public.location_presence
FOR UPDATE
TO authenticated
USING (
  is_global_owner(auth.uid())
  OR (company_id IS NOT NULL AND user_is_company_admin(auth.uid(), company_id))
  OR (
    subject_type = 'employee'::location_subject_type_enum
    AND subject_id IN (SELECT id FROM employees WHERE user_id = auth.uid())
  )
)
WITH CHECK (
  is_global_owner(auth.uid())
  OR (company_id IS NOT NULL AND user_is_company_admin(auth.uid(), company_id))
  OR (
    subject_type = 'employee'::location_subject_type_enum
    AND subject_id IN (SELECT id FROM employees WHERE user_id = auth.uid())
  )
);

-- location_sessions
DROP POLICY IF EXISTS "location_sessions read by company" ON public.location_sessions;
CREATE POLICY "location_sessions read by company"
ON public.location_sessions
FOR SELECT
TO authenticated
USING (
  is_global_owner(auth.uid())
  OR (company_id IS NOT NULL AND company_id IN (SELECT user_company_ids(auth.uid())))
  OR (
    subject_type = 'employee'::location_subject_type_enum
    AND subject_id IN (SELECT id FROM employees WHERE user_id = auth.uid())
  )
);

DROP POLICY IF EXISTS "location_sessions insert by company members" ON public.location_sessions;
CREATE POLICY "location_sessions insert by company members"
ON public.location_sessions
FOR INSERT
TO authenticated
WITH CHECK (
  is_global_owner(auth.uid())
  OR (company_id IS NOT NULL AND company_id IN (SELECT user_company_ids(auth.uid())))
  OR (
    subject_type = 'employee'::location_subject_type_enum
    AND subject_id IN (SELECT id FROM employees WHERE user_id = auth.uid())
  )
);

DROP POLICY IF EXISTS "location_sessions update by company admins or self" ON public.location_sessions;
CREATE POLICY "location_sessions update by company admins or self"
ON public.location_sessions
FOR UPDATE
TO authenticated
USING (
  is_global_owner(auth.uid())
  OR (company_id IS NOT NULL AND user_is_company_admin(auth.uid(), company_id))
  OR (
    subject_type = 'employee'::location_subject_type_enum
    AND subject_id IN (SELECT id FROM employees WHERE user_id = auth.uid())
  )
)
WITH CHECK (
  is_global_owner(auth.uid())
  OR (company_id IS NOT NULL AND user_is_company_admin(auth.uid(), company_id))
  OR (
    subject_type = 'employee'::location_subject_type_enum
    AND subject_id IN (SELECT id FROM employees WHERE user_id = auth.uid())
  )
);

-- location_events
DROP POLICY IF EXISTS "location_events read by company or self" ON public.location_events;
CREATE POLICY "location_events read by company or self"
ON public.location_events
FOR SELECT
TO authenticated
USING (
  is_global_owner(auth.uid())
  OR (company_id IS NOT NULL AND company_id IN (SELECT user_company_ids(auth.uid())))
  OR (
    subject_type = 'employee'::location_subject_type_enum
    AND subject_id IN (SELECT id FROM employees WHERE user_id = auth.uid())
  )
);

DROP POLICY IF EXISTS "location_events insert by company member or self" ON public.location_events;
CREATE POLICY "location_events insert by company member or self"
ON public.location_events
FOR INSERT
TO authenticated
WITH CHECK (
  is_global_owner(auth.uid())
  OR (company_id IS NOT NULL AND company_id IN (SELECT user_company_ids(auth.uid())))
  OR (
    subject_type = 'employee'::location_subject_type_enum
    AND subject_id IN (SELECT id FROM employees WHERE user_id = auth.uid())
  )
);

-- =========================================================
-- ISSUE 3 — kiosk_devices: company-scoped manage
-- =========================================================

DROP POLICY IF EXISTS "Admins can manage kiosk devices" ON public.kiosk_devices;
CREATE POLICY "Company admins manage kiosk devices"
ON public.kiosk_devices
FOR ALL
TO authenticated
USING (
  is_global_owner(auth.uid())
  OR (
    company_id IN (SELECT user_company_ids(auth.uid()))
    AND user_is_company_admin(auth.uid(), company_id)
  )
)
WITH CHECK (
  is_global_owner(auth.uid())
  OR (
    company_id IN (SELECT user_company_ids(auth.uid()))
    AND user_is_company_admin(auth.uid(), company_id)
  )
);

-- =========================================================
-- ISSUE 2 — announcement_reactions: company-scoped read via join
-- =========================================================

DROP POLICY IF EXISTS "Authenticated can view reactions" ON public.announcement_reactions;
CREATE POLICY "Members view reactions of own company announcements"
ON public.announcement_reactions
FOR SELECT
TO authenticated
USING (
  is_global_owner(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.announcements a
    JOIN public.employees e ON e.company_id = a.company_id
    WHERE a.id = announcement_reactions.announcement_id
      AND e.user_id = auth.uid()
  )
);
