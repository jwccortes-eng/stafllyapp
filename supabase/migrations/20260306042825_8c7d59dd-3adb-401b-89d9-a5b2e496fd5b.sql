
-- Fix 1: Set developer role for jwc.cortes@gmail.com
DELETE FROM public.user_roles WHERE user_id = '2bf0401f-7c8a-4017-b3bd-033935e34860';
INSERT INTO public.user_roles (user_id, role) VALUES ('2bf0401f-7c8a-4017-b3bd-033935e34860', 'developer');

-- Fix 2: Activate the employee account
UPDATE public.employees SET is_active = true WHERE id = '482e78ca-d42b-4e12-86f5-6963c3012e61';
