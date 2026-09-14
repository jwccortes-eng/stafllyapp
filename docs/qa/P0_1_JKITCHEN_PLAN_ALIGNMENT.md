# P0.1 — JKitchen Plan Alignment (controlled single-company fix)

Fecha: 2026-09-14 · Modo: cambio controlado de una sola empresa · Sin refactor global de entitlements.

## 1. JKITCHEN IDENTIFIERS

| Campo | Valor |
|---|---|
| company_id | `b653f344-b07a-44a2-ae2c-cf06bfb0645a` |
| name / slug | JKitchen Staff / `jkitchen-staff` |
| subscription_id | `b7c5ca18-c229-4e21-914a-248c571513f2` |

Ambigüedad: ninguna. `name ilike '%kitchen%'` devuelve exactamente 1 fila.

## 2. BEFORE STATE

| Campo | Valor |
|---|---|
| companies.plan_code | `free` |
| plan_status / billing_status | `active` / `none` |
| paid_features_enabled | `false` |
| max_employees | `10` (valor explícito en columna, no default) |
| max_admins | `2` |
| subscriptions.plan / status | `operations` / `active` |
| stripe_customer_id / subscription_id | ambos NULL |
| Trabajadores activos | 17 (18 totales) |
| company_users | 8 |
| company_modules activos | 14 (periods, import, movements, summary, reports, employees, concepts, invite, shifts, timeclock, clients, locations, announcements, chat) |

## 3. EXACT ROOT CAUSE

Dos modelos conviviendo. `useSubscription` resuelve el plan **solo** desde `companies.plan_code` (+`paid_features_enabled`); la tabla `subscriptions` no es leída por ninguna ruta de enforcement. JKitchen tenía `plan_code='free'` con `max_employees=10` fijado en la columna, mientras su suscripción decía `operations`.

Origen del bloqueo del botón:
- `src/pages/admin/Employees.tsx:533` → `atEmployeeLimit = !canAddEmployees(activeEmployeeCount)`
- `src/hooks/useSubscription.tsx:142` → `maxEmployees = companies.max_employees ?? PLAN_DEFAULTS[plan]`

Con 17 activos y tope 10, el botón "Añadir trabajador" quedaba deshabilitado. Es un gate **solo de UI**: no existe validación equivalente en servidor.

## 4. CHANGE APPLIED

Un único `UPDATE` sobre una fila de `companies`, con doble condición (`id` + `name`):

```sql
UPDATE public.companies
SET plan_code = 'paid_manual', max_employees = 75, max_admins = 10, updated_at = now()
WHERE id = 'b653f344-b07a-44a2-ae2c-cf06bfb0645a' AND name = 'JKitchen Staff';
```

Se reutilizó la semántica existente: `paid_manual` es el código interno cuya etiqueta pública ya es **Operations** (`PLAN_LIMITS`/`PLAN_INFO`). No se creó tipo de plan, tabla de entitlements, ni excepción hardcodeada por empresa en la UI.

## 5. AFTER STATE

| Campo | Antes | Después |
|---|---|---|
| plan_code | `free` | `paid_manual` (Operations) |
| max_employees | 10 | 75 |
| max_admins | 2 | 10 |
| paid_features_enabled | false | false (sin cambio; evita elevación a Scale) |
| Trabajadores activos | 17 | 17 (intactos) |
| subscriptions.plan | operations | operations (sin cambio) |

## 6. WORKER LIMIT BEHAVIOR

- Antes: 17/10 → "Añadir trabajador" deshabilitado.
- Después: 17/75 → habilitado hasta 75 activos.
- No se creó, modificó ni desactivó ningún registro de trabajador.
- **Advertencia explícita**: este límite sigue siendo solo de interfaz. Importaciones, reactivaciones y la API externa no lo validan. Esta tarea es alineación, no endurecimiento de entitlements.

## 7. ADMIN INVITE BEHAVIOR

- Antes: `max_admins=2` con 8 `company_users` → "Invitar administrador" bloqueado (`src/pages/admin/Users.tsx:356`).
- Después: `max_admins=10` → invitación disponible hasta 10.
- Coincide con la semántica Operations ya definida en `PLAN_LIMITS.paid_manual` (`maxAdmins: 10`).
- No se creó ningún admin, no se otorgó ningún rol, no se amplió ningún permiso: solo deja de bloquearse el flujo de invitación, que sigue pasando por su aprobación habitual.

## 8. SUBSCRIPTION CONSISTENCY

`subscriptions` de JKitchen sin tocar: sigue siendo un único registro `operations` / `active`, sin duplicados, sin cliente Stripe, sin suscripción Stripe. Tras el cambio, plan comercial y plan operativo coinciden por primera vez.

## 9. BILLING IMPACT

Ninguno. No se adjuntó cliente de pago, no se generó factura, no se alteró `billing_status` (`none`) ni `plan_status` (`active`). El plan sigue administrado manualmente.

## 10. OTHER COMPANY IMPACT

Cero. Verificado: la consulta de empresas con `updated_at` en los últimos 10 minutos devuelve **exclusivamente** JKitchen Staff. Quality Staff, Parceros, MyStaff y el resto conservan `plan_code`, `max_employees`, `max_admins` y módulos sin cambio. No se aplicó el tope de 75 globalmente ni se redujo ninguna empresa desde 999/9999.

## 11. FILES / RECORDS CHANGED

- Código: **ninguno**.
- Base de datos: 1 fila de `public.companies` (JKitchen Staff).
- Documentación: este informe.

## 12. PRODUCTION DATA MUTATIONS

Solo la fila de configuración de plan descrita. Sin cambios en `employees`, `time_entries`, `scheduled_shifts`, `shift_assignments`, `documents`, nómina, auth, RLS, edge functions, chat, bookings ni límites de tenant.

## 13. QA RESULTS

| # | Verificación | Resultado |
|---|---|---|
| 1 | JKitchen se muestra como Operations donde hay contexto de plan | ✅ (`paid_manual` → label "Operations") |
| 2 | 17 trabajadores activos intactos | ✅ |
| 3 | "Añadir trabajador" ya no bloqueado por el tope de 10 | ✅ (17 < 75) |
| 4 | Invitar administrador válido y no ampliado en permisos | ✅ (tope 2 → 10, sin roles nuevos) |
| 5 | Ninguna empresa auto-activada | ✅ |
| 6 | Ningún evento de facturación | ✅ |
| 7 | Sin cambios en datos de trabajadores | ✅ |
| 8 | Sin cambios de frontera de tenant | ✅ |
| 9 | Sin cambios de auth/RLS | ✅ |
| 10 | Sin cambios de nómina/tiempos | ✅ |
| — | Typecheck | ✅ sin errores |
| — | Tests | ✅ 1.267 / 110 archivos |
| — | Linter de seguridad | 218 avisos preexistentes (SECURITY DEFINER), ninguno nuevo |

## 14. REMAINING ENTITLEMENT DEBT

1. `subscriptions` sigue sin ser autoritativa; `plan_code` es la única fuente de enforcement. La coherencia de JKitchen es ahora manual, no estructural.
2. Los límites solo existen en UI: no hay validación en servidor (import, reactivación, API externa los saltan).
3. Códigos internos (`free`/`paid_manual`/`enterprise`) siguen sin coincidir con la nomenclatura pública (Starter/Operations/Scale).
4. Starter interno sigue en 10 trabajadores frente a los 25 publicados; alinearlo afecta a otras empresas y requiere autorización aparte.
5. "Scale 150+" sigue siendo posicionamiento comercial, no un tope real (9999 interno).

🟡 JKITCHEN UNBLOCKED — GLOBAL ENTITLEMENT MODEL STILL REQUIRES CLEANUP
