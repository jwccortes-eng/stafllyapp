# P0 — Carlos Álvarez: Scheduling vs Perfil / Mis Turnos · Auditoría de causa raíz

**Fecha:** 2026-08-18 · **Modo:** AUDIT ONLY (cero escrituras, cero migraciones, cero cambios de RLS)
**Testigo:** Carlos Alvarez · Quality Staff (`00000000-…-0001`)

---

## 0. Resumen ejecutivo

La hipótesis "no tiene assignments" queda **descartada con datos**: Carlos tiene **147 asignaciones**
(79 `accepted`, 54 `confirmed`, 13 `pending`, 1 `removed` en la ficha canónica).

Se encontraron **dos fallos distintos e independientes**:

| # | Superficie | Naturaleza | Efecto |
|---|-----------|-----------|--------|
| **A** | **Portal del trabajador (Mis Turnos)** | **QUERY / RLS — timeout 8 s (`57014`)** | La API responde **HTTP 500**; la pantalla se queda en esqueleto de carga para siempre. Cero turnos visibles. |
| **B** | **Pasaporte / Experiencia del trabajador** | **FILTER — vocabulario de estado** | Sólo cuenta `status = 'confirmed'`; ignora `accepted` (3.845 filas del sistema). Historia y horas subrepresentadas. |

Ninguno es un problema de identidad, de datos o de membresía.

---

## A. SCHEDULING — registros que producen la fila visible

Los servicios visibles en la fila de Carlos (SHOIMY 09:00–00:00, EMMINENCE/Setup 15:00–23:59, etc.)
cuelgan de la ficha canónica y están publicados:

| shift_id | date | horario | título | pub. | assignment_id | employee_id | assign. status |
|---|---|---|---|---|---|---|---|
| `d9bb7560…` | 2026-08-12 | 09:00–00:00 | Informacion Pendiente (SHOIMY) | published | `d9c58c19…` | `ea1f9ae0…` | pending |
| `9c5c8f66…` | 2026-08-17 | 15:00–23:59 | Setup / Montaje | published | `08ee08d3…` | `ea1f9ae0…` | pending |
| `a8e03284…` | 2026-08-18 | 09:00–09:01 | Informacion Pendienre | published | `b30167ed…` | `ea1f9ae0…` | pending |

Todos con `company_id = …0001`, `deleted_at IS NULL`, `is_draft_reservation = false`.

---

## B. WORKER PROFILE (admin)

`src/components/employee/EmployeeProfileTabs.tsx` → `shift_assignments`
con `.in("employee_id", resolveIdentityEmployeeIds(employee.id))` + `.eq("company_id", companyId)`,
sin filtro de estado, `limit 20`. **Identificador: `employee_id` (identity set).** Pipeline correcto.

`src/pages/admin/WorkerPassport.tsx` (Experiencia / horas) → mismo identity set **pero
`.eq("status","confirmed")`**. Ese es el filtro que vacía la experiencia (fallo B).

---

## C. WORKER PORTAL / MY SHIFTS (Carlos autenticado)

`src/pages/portal/MyShifts.tsx` → identificador `employee_id` resuelto vía
`useEffectiveEmployee` → `employees.user_id = auth.uid()`.

**Ejecución real en el navegador con la sesión de Carlos:**

```
GET /rest/v1/shift_assignments?select=…scheduled_shifts!inner(…)&employee_id=in.(…)&…
→ HTTP 500
{"code":"57014","message":"canceling statement due to statement timeout"}
```

`authenticated` tiene `statement_timeout = 8s`. La consulta no lleva filtro de fecha, así que la
política RLS se evalúa fila a fila sobre las 6.625 asignaciones. `MyShifts` desestructura sólo
`{ data }` (no `error`), así que el 500 se traga en silencio y la pantalla queda en esqueleto.

**Hipótesis de coste (alta confianza, no medida con EXPLAIN por permisos de rol):** las políticas
permisivas se evalúan en OR; desde que Carlos tiene fila en `company_users` (restaurada hoy 15:33),
`company_id IN user_company_ids(auth.uid())` es **verdadero**, por lo que Postgres entra en
`has_module_permission(…, 'shifts','view')`, que invoca `permission_catalog()` (VALUES de 41 filas)
y `has_permission` **por cada fila candidata**. Antes de la membresía, esa rama cortaba de inmediato.

---

## D. RECONCILIACIÓN END-TO-END (assignment `d9c58c19…`, turno SHOIMY 2026-08-12)

```
scheduled_shift d9bb7560 (published, co …0001)      ✅
 → shift_assignment d9c58c19 (pending, no draft)     ✅
 → employee ea1f9ae0 (activo, canónico)              ✅
 → auth user b88a09ef                                ✅
 → company_users …0001 / employee / worker           ✅
 → Worker Profile (pestaña Turnos)                   ✅ aparece
 → Worker Passport / Experiencia                     ❌ filtrado por status='confirmed'
 → My Shifts (portal)                                ❌ HTTP 500 timeout 57014
```

**Primer punto de ruptura: la respuesta HTTP del portal, no la cadena de identidad.**

Hallazgo secundario: como Carlos, la consulta de sombras
(`employees?merged_into_employee_id=eq.<canónico>`) devuelve `[]` porque la política
"Employees can view own record" sólo expone `user_id = auth.uid()`. Su ficha sombra `ba56dbe8…`
(4 asignaciones, 1 turno de 2026-07-31) es **invisible desde el portal**. No afecta al caso actual
(el 99 % de la historia está en la canónica), pero es una fuga de historia real.

---

## Respuestas

1. **¿Scheduling y Worker Profile usan la misma fuente canónica?** Sí: `shift_assignments` +
   identity set. Passport/Experiencia usa la misma fuente con un filtro de estado distinto.
2. **¿Scheduling y My Shifts usan la misma fuente canónica?** Sí. My Shifts añade filtros de
   publicación correctos; el problema es que la petición **nunca devuelve 200**.
3. **¿El `employee_id` de los assignments coincide con el que resuelve Carlos autenticado?** Sí:
   `ea1f9ae0-f442-42cb-98e8-9bbbd5f872d5`, verificado en la petición real del navegador.
4. **¿Hay más de una identidad para Carlos?** Tres fichas: canónica `ea1f9ae0…` (Quality),
   sombra fusionada `ba56dbe8…` (Quality) y una ficha independiente en otra empresa
   `d3390642…` (`0b58f1d4…`, sin `user_id`, 0 asignaciones). Ninguna causa el fallo.
5. **¿La membresía restaurada apunta a la misma cadena?** Sí (mismo `user_id`, misma empresa,
   `operating_role_key = worker`). Es correcta y, paradójicamente, es la que activa la rama
   costosa de RLS descrita en C.
6. **¿DATA, IDENTITY, QUERY, FILTER, RLS, COMPANY CONTEXT o UI?**
   - Mis Turnos → **RLS + QUERY** (coste de política sin filtro de fecha) **+ UI** (error 500
     ignorado, esqueleto infinito).
   - Experiencia/Pasaporte → **FILTER** (`confirmed` vs `accepted`).
   - **No es DATA, ni IDENTITY LINKAGE, ni COMPANY CONTEXT.**
7. **Blast radius.**
   - **66 trabajadores** tienen ficha + membresía `company_users` → todos entran en la misma rama
     de RLS en el portal; el timeout es sistémico, no exclusivo de Carlos.
   - **70 de 249** trabajadores con asignaciones visibles en Scheduling tienen **cero**
     asignaciones `confirmed` → experiencia/pasaporte vacío o subestimado.
   - **3.845** asignaciones con `status = 'accepted'` quedan fuera de toda métrica que exija
     `confirmed`.

---

## Confirmación de solo lectura

Cero `INSERT`/`UPDATE`/`DELETE`, cero migraciones, cero cambios de RLS, cero reasignaciones,
cero toques a `time_entries` ni a payroll. Toda la evidencia proviene de `SELECT` y de una sesión
de navegador de solo lectura.
