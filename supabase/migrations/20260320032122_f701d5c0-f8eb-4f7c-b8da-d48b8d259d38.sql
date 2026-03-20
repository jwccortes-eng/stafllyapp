UPDATE normalized_schedule_rows n
SET availability_status = r.raw_data->>'Availability status'
FROM raw_schedule_import_rows r
WHERE n.raw_row_id = r.id
AND n.availability_status IS NULL
AND r.raw_data->>'Availability status' IS NOT NULL
AND r.raw_data->>'Availability status' != '';