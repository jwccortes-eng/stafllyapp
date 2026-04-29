# Roster Slots Audit — Quality Staff #1200–#1256

Objetivo: clasificar los 57 slots `keep_active` (rango 1200–1256, company `00000000-0000-0000-0000-000000000001`) como `real_employee`, `placeholder_system`, `external_labor` o `unknown_needs_review`, con su flag `payroll_safe`. **100% read-only**. Ningún INSERT/UPDATE/DELETE; el output será un CSV en `/mnt/documents/` y un resumen tabular para tu revisión y aprobación posterior.

## Alcance estricto

- Solo `employees` company_id Quality Staff con `employer_identification::int BETWEEN 1200 AND 1256`.
- No tocar: payroll_*, time_entries, scheduled_shifts, shift_assignments, attendance, RLS, auth, schema, Parceros, Monica Tabares (#420), ni los 4 inactivos del ciclo anterior.
- No reactivar, no desactivar, no merge, no asignar PIN, no tocar `start_date/end_date`.

## Señales que se evaluarán por slot

Para cada uno de los 57 IDs leeremos:

1. Identidad básica: `first_name`, `last_name`, `email`, `phone_number`, `is_active`, `end_date`, `start_date`, `created_at`, `updated_at`.
2. Marcadores de placeholder: nombre matcheando `^System\s*\d+$`, faltante de email Y phone, nombres genéricos (Test, Demo, Temp, N/A, Unknown), email compartido o genérico.
3. Marcadores de external/agency: prefijos/sufijos en nombre o email tipo "agency", "temp", "external", "contractor", "vendor", "staffing".
4. Actividad real (read-only counts):
   - `time_entries` por `employee_id` (count + last_at)
   - `shift_assignments` por `employee_id` (count + last_shift_date)
   - `payroll_entries` o equivalente (count, sin abrir contenido sensible)
   - `attendance` o `clock_events` (count + last_at)
5. Duplicados potenciales: misma normalización de nombre + phone10 contra otros activos del tenant (sin tocarlos).

## Reglas de clasificación

- `placeholder_system` → nombre `System N` o genérico + 0 actividad + sin email/phone. `payroll_safe = no_placeholder_or_external`.
- `external_labor` → marcador external/agency en nombre/email O patrón conocido. `payroll_safe = no_placeholder_or_external`.
- `real_employee` → tiene email O phone normalizado válido Y al menos una señal de actividad (time_entry, shift_assignment, payroll, attendance). `payroll_safe = yes_real_employee`.
- `unknown_needs_review` → cualquier otro caso (ej. tiene phone pero 0 actividad, o nombre real sin contacto). `payroll_safe = pending_human_review`.

Justin Mora (#1201 y #1217 detectados como duplicados en muestra) queda flagged como `unknown_needs_review` con nota `duplicate_pair_pending_consolidation`, sin tocarlo (sigue regla del backlog).

## Entregables

1. CSV `/mnt/documents/roster-slots-1200-1256-audit-2026-04-29.csv` con columnas: `employer_identification, id, first_name, last_name, email, phone_number, is_active, end_date, time_entries_count, shift_assignments_count, payroll_entries_count, attendance_count, last_activity_at, person_type_guess, payroll_safe, duplicate_of, notes`.
2. Resumen markdown con totales por categoría y los IDs que requieren decisión humana.
3. Memoria `mem://backlog/roster-slots-1200-1256-audit-2026-04-29` con el estado del audit y siguientes pasos sugeridos (sin ejecutarlos).

## Lo que NO hace este plan

- No deactiva, no merge, no migra historia, no toca PIN, no asigna roles.
- No abre ningún flujo de payroll/portal/onboarding.
- No modifica los 4 IDs HIGH del ciclo anterior, ni Monica, ni Sandy, ni Justin (solo los flaggea).
- No corre nada hasta tu aprobación explícita; el siguiente paso de cualquier write requerirá su propio Safety Check + dry-run + variantes A/B como en el ciclo anterior.

## Detalles técnicos

- Queries SELECT-only vía `supabase--read_query` con cast `employer_identification::int` (la columna es `text`).
- Conteos de actividad con `LEFT JOIN ... GROUP BY employees.id` para no perder slots sin movimiento.
- Normalización de phone: `regexp_replace(phone_number, '\D', '', 'g')` y luego `right(...,10)` para detección de duplicados.
- Detección de `System N`: `first_name ~* '^system\s*\d+$' OR (first_name ILIKE 'system%' AND last_name ~ '^\d+$')`.
- Output CSV vía `psql COPY ... TO STDOUT` si `$PGHOST` está disponible; si no, vía `read_query` paginado y serialización en Node/Python.
- Cero migraciones, cero edge functions, cero cambios de UI.

Aprueba este plan para que pase a modo build y genere el CSV + resumen sin tocar datos.
