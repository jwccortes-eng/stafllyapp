
-- Step 1: Remove orphan attendance confirmation referencing duplicate employee
DELETE FROM shift_attendance_confirmations 
WHERE employee_id IN (
  '0db6f44d-0336-403c-828f-607ab24246a5',
  'de67c28d-d334-4d20-99d4-3dcb413d6214',
  '374820dd-b26a-48a0-9eae-a5a1e1664ec4',
  '18015c05-a988-45a7-8179-88b4ea68a6c2',
  '3ea5099f-b451-4364-8831-0f66b1ae7ae2',
  '8ba90a66-e560-413f-81c2-6987cdb00f9e',
  '465f642d-edd1-4339-968b-5adc64d5c002',
  '14446ae3-2922-49c0-825e-8f843b5cebde',
  'a5639df1-44f8-4f1d-8461-740d66d652e7',
  '5a6f2bce-9a00-47ef-9120-6eaecade6dba'
);

-- Step 2: Delete 10 empty duplicate employees
DELETE FROM employees 
WHERE company_id = '00000000-0000-0000-0000-000000000001'
AND id IN (
  '0db6f44d-0336-403c-828f-607ab24246a5',
  'de67c28d-d334-4d20-99d4-3dcb413d6214',
  '374820dd-b26a-48a0-9eae-a5a1e1664ec4',
  '18015c05-a988-45a7-8179-88b4ea68a6c2',
  '3ea5099f-b451-4364-8831-0f66b1ae7ae2',
  '8ba90a66-e560-413f-81c2-6987cdb00f9e',
  '465f642d-edd1-4339-968b-5adc64d5c002',
  '14446ae3-2922-49c0-825e-8f843b5cebde',
  'a5639df1-44f8-4f1d-8461-740d66d652e7',
  '5a6f2bce-9a00-47ef-9120-6eaecade6dba'
);
