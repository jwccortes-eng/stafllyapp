DO $$
DECLARE a1 uuid := '8429d442-5406-498e-9484-acdfaaca3ad7';
        a2 uuid := (select id from public.announcements where company_id='7c1458db-109a-4042-a2b0-78e04427ec2d' and title='QA · Solo para A');
BEGIN
  PERFORM set_config('app.announcement_publish','1',true);
  ALTER TABLE public.announcement_acknowledgments DISABLE TRIGGER USER;
  ALTER TABLE public.announcement_versions DISABLE TRIGGER USER;
  ALTER TABLE public.announcements DISABLE TRIGGER USER;
  ALTER TABLE public.announcement_recipients DISABLE TRIGGER USER;

  DELETE FROM public.announcement_acknowledgments WHERE announcement_id IN (a1,a2);
  DELETE FROM public.announcement_recipients WHERE announcement_id IN (a1,a2);
  DELETE FROM public.announcement_reactions WHERE announcement_id IN (a1,a2);
  DELETE FROM public.announcement_versions WHERE announcement_id IN (a1,a2);
  DELETE FROM public.announcements WHERE id IN (a1,a2);

  ALTER TABLE public.announcement_acknowledgments ENABLE TRIGGER USER;
  ALTER TABLE public.announcement_versions ENABLE TRIGGER USER;
  ALTER TABLE public.announcements ENABLE TRIGGER USER;
  ALTER TABLE public.announcement_recipients ENABLE TRIGGER USER;
END $$;

DELETE FROM public.employee_portal_modules
WHERE company_id='7c1458db-109a-4042-a2b0-78e04427ec2d'
  AND module='my_announcements'
  AND employee_id IN ('f4224a42-bed1-408d-8966-14d537e421e1','33dfeb0c-fe33-4305-b08e-4a7bced314d3');