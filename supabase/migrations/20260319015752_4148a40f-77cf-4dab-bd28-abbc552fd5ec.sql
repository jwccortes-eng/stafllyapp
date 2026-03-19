DELETE FROM employees 
WHERE company_id = '7c1458db-109a-4042-a2b0-78e04427ec2d' 
AND added_via = 'connecteam_import'
AND id IN (
  '3ceb856d-db8c-414f-a951-53cbbff495ee',
  '5331230b-a368-4f5b-9b6c-9e939569a171'
);