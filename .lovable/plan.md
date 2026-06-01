# Plan: Stafly Demo Environment (seguro, aislado, vendible)

## Objetivo
Tener un tenant demo (`Stafly Demo Company`) totalmente aislado para vender el flujo completo: shifts → worker portal → accept/reject → clock-in/out → closeout → review, sin tocar nada real.

## Decisiones de seguridad (no negociables)
- Tenant demo identificado con `is_demo = true` + `status = 'active'` + `source = 'demo'` (los flags ya existen, la sidebar ya los muestra como grupo "Test / Demo" y `shouldShowOnboarding` los oculta del checklist).
- Cero escritura sobre tenants reales (Quality Staff, MyStaff, Parceros, JKitchen, etc.). Todo el seed se filtra por `company_id = <demo>`.
- Admin demo y workers demo viven SOLO dentro del tenant demo vía `company_users` / `employees.company_id`. RLS existente ya scopea por `company_id`; no se modifica RLS.
- Ningún envío real: no se llama a `send-invite-email`, `bulk-portal-invite`, `shift-reminders`, ni Twilio/WhatsApp. Workers demo se crean con `portal_invited_at = now()` manualmente y un PIN conocido — sin email/SMS dispatch.
- Cero cambios en payroll: NO se tocan `pay_periods`, `period_base_pay`, `reconciliation_*`, `payroll_adjustments`, `historical_payroll_entries`. Los `time_entries` demo viven solo dentro del tenant demo y nunca entran a reconciliación real (la reconciliación se filtra por tenant también).
- Cero cambios en RLS, auth, bookings, payments, chat, documents, campañas, edge functions críticas.

## Entregables

### 1. Tenant demo
Reusar si ya existe una company con `is_demo = true` y nombre tipo "Demo". Si no, crear vía migración mínima de datos (insert):
- `companies`: `name = 'Stafly Demo Company'`, `slug = 'stafly-demo'`, `is_demo = true`, `source = 'demo'`, `status = 'active'`, `is_active = true` (sync trigger lo confirma), `brand_color` neutral.
- Sin `company_modules` extra → hereda defaults (`isModuleActive` devuelve true cuando set vacío, pero crearemos los esenciales: `shifts`, `time_clock`, `portal`, `workers`).

### 2. Usuarios demo
- **Admin demo**: nuevo `auth.users` `demo-admin@staflyapps.com` (password fija conocida) → `company_users(company_id=demo, role='admin')`. NO se le da rol global; solo admin del tenant demo (cumple `canAccessAdminForCompany`).
- **3 Workers demo**: 3 filas en `employees` con `company_id = demo`, nombres demo claros ("Demo Worker 1/2/3"), `phone_number` 555-prefijo no real, `access_pin` conocido, `is_active = true`, `payroll_safe = true`, `person_type_guess = 'worker'`. Sin `user_id` (acceso por PIN/phone vía portal estándar).

### 3. Datos operativos
- **2-3 `scheduled_shifts`** en el tenant demo:
  1. Hoy 14:00–22:00 con `shift_assignments` para Worker 1 (`status = 'accepted'`) y Worker 2 (`status = 'pending'`).
  2. Mañana 09:00–17:00 con Worker 3 (`status = 'pending'`).
  3. (Opcional) Pasado mañana con un `no_show` demo para mostrar reemplazo.
- **`time_entries` demo**: 1 cerrado de ayer (Worker 1, con clock_in/clock_out coherente) para alimentar el closeout/review demo. Marcado en `notes` como `[DEMO]`.

### 4. UI / verificación (sin código nuevo de feature)
La UI existente ya cubre todo el flujo. Solo verificamos:
- CompanySwitcher muestra "Stafly Demo Company" bajo grupo **Test / Demo** con badge Demo.
- `/app` dashboard demo: KPIs cuentan los shifts/asignaciones demo creados.
- `/app/shifts`: aparecen los 2-3 shifts; chips "Necesita personal" / "Borradores" se comportan.
- `/app/timeclock` y `/app/payroll-reconciliation`: muestran el time_entry demo en su buckets respectivos.
- `/portal` con login del Worker 1 (PIN): ve sus shifts, puede accept/reject, puede clock-in/out.

### 5. Marcador visible "DEMO"
Añadir un badge sutil "DEMO" en `TopBar` cuando `selectedCompany?.is_demo === true` (1 línea condicional, UI-only, sin cambios de lógica). Esto evita confusión durante demos en vivo.

## Tablas tocadas (solo INSERT, scoped a demo company)
- `companies` (1 row si no existe)
- `auth.users` (1 admin via Supabase admin API — vía edge function temporal o seed manual)
- `company_users` (1 row admin)
- `employees` (3 rows workers)
- `company_modules` (4 rows: shifts/time_clock/portal/workers)
- `scheduled_shifts` (2–3 rows)
- `shift_assignments` (3–4 rows)
- `time_entries` (1 row)

## Lo que NO se toca
auth schema, RLS policies, payroll math, `pay_periods`, `reconciliation_*`, `historical_payroll_entries`, `payroll_adjustments`, bookings, payments, chat, documents, campañas, edge functions de notificación, tenants reales, workers reales.

## Riesgos / preguntas para ti
1. **Admin demo user**: ¿creo `demo-admin@staflyapps.com` con password fija (te la entrego) o prefieres reusar tu user developer y solo `switchCompany` al tenant demo? Crear un user dedicado es más seguro para enseñárselo a un prospecto sin exponer tu acceso global.
2. **Worker demo login**: el portal de Stafly usa phone + PIN. ¿OK que los workers demo tengan `phone_number = 555-010-0001/0002/0003` con `access_pin = 123456`? (Números 555-01XX son reservados ficticios, no enrutan SMS reales.)
3. **Notificaciones**: confirmo que NO disparo ninguna invitación/SMS/email/WhatsApp. Los workers quedan listos para login con PIN pero sin notificación de bienvenida real.
4. **Tenant ya existente**: ¿hay alguna company actual que quieras reutilizar como demo (ej. "MyStaff" o un sandbox previo) o sí creo "Stafly Demo Company" nueva?

## Ejecución (tras tu aprobación)
1. Confirmar/crear tenant demo (migración data si nuevo).
2. Crear admin user demo (edge function admin temporal o `auth.admin.createUser` desde una función one-shot).
3. Insertar workers, shifts, assignments, time_entry demo.
4. Añadir badge "DEMO" en TopBar (UI-only).
5. QA manual: switch a tenant demo, abrir `/app`, `/app/shifts`, `/app/timeclock`, `/portal` (con PIN worker).
6. Reporte final con IDs creados, tablas tocadas, confirmación de no-impacto en producción.