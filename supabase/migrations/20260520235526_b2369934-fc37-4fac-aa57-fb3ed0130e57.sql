
-- Phase 3: kiosk-photos bucket UPDATE/DELETE policies (Finding #9)
-- Path layout (from kiosk-clock/index.ts): {company_id}/{employee_id}/{ts}.{ext}

CREATE POLICY "kiosk_photos_update_scoped" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'kiosk-photos'
    AND try_path_uuid(name, 1) IS NOT NULL
    AND (
      is_global_owner(auth.uid())
      OR user_is_company_admin(auth.uid(), try_path_uuid(name, 1))
    )
  )
  WITH CHECK (
    bucket_id = 'kiosk-photos'
    AND try_path_uuid(name, 1) IS NOT NULL
    AND (
      is_global_owner(auth.uid())
      OR user_is_company_admin(auth.uid(), try_path_uuid(name, 1))
    )
  );

CREATE POLICY "kiosk_photos_delete_scoped" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'kiosk-photos'
    AND try_path_uuid(name, 1) IS NOT NULL
    AND (
      is_global_owner(auth.uid())
      OR user_is_company_admin(auth.uid(), try_path_uuid(name, 1))
    )
  );
