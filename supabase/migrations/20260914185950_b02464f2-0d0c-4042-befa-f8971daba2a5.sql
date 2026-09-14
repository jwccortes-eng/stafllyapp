UPDATE public.companies
SET plan_code = 'paid_manual',
    max_employees = 75,
    max_admins = 10,
    updated_at = now()
WHERE id = 'b653f344-b07a-44a2-ae2c-cf06bfb0645a'
  AND name = 'JKitchen Staff';