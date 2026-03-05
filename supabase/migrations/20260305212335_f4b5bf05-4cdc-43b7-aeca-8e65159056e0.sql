-- Truncate all 6-digit PINs to their last 4 digits
UPDATE employees
SET access_pin = RIGHT(access_pin, 4),
    updated_at = now()
WHERE access_pin IS NOT NULL AND length(access_pin) > 4;