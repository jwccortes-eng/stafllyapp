UPDATE companies
SET plan_code = 'enterprise',
    plan_status = 'active',
    max_employees = 9999,
    max_admins = 99,
    paid_features_enabled = true,
    billing_status = 'paid'
WHERE id IN (
  '00000000-0000-0000-0000-000000000001',
  '37f92f75-7af4-4496-aa10-793e14b09ed9',
  '0b58f1d4-eefa-425e-a05a-cfe8d6484503'
);