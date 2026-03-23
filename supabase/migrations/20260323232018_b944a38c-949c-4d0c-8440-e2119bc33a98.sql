
-- Insert Yesid Mejia's confirmed $150 base pay for Period 112
INSERT INTO period_base_pay (company_id, period_id, employee_id, total_work_hours, total_regular, total_overtime, total_paid_hours, base_total_pay, import_id)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'e90d999a-9c15-4ccf-99d1-f58fb11f4eb5',
  '31c3991e-b7fc-48d5-9e35-a5454ac577f6',
  0, 0, 0, 0, 150.00, NULL
)
ON CONFLICT (period_id, employee_id) DO UPDATE SET
  base_total_pay = 150.00;
