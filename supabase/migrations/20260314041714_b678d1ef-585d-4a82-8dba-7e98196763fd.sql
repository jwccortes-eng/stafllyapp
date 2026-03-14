
-- Clean up old duplicate policies

-- payroll_adjustments: remove old granular policies (kept from before), keep new consolidated ones
DROP POLICY IF EXISTS "Admins managers delete payroll_adjustments" ON public.payroll_adjustments;
DROP POLICY IF EXISTS "Admins managers insert payroll_adjustments" ON public.payroll_adjustments;
DROP POLICY IF EXISTS "Admins managers select payroll_adjustments" ON public.payroll_adjustments;
DROP POLICY IF EXISTS "Admins managers update payroll_adjustments" ON public.payroll_adjustments;

-- employee_documents: remove old duplicate
DROP POLICY IF EXISTS "Admins manage employee documents" ON public.employee_documents;

-- notifications: remove old broad/duplicate policies
DROP POLICY IF EXISTS "Admins can insert notifications" ON public.notifications;
DROP POLICY IF EXISTS "Managers can insert notifications" ON public.notifications;
