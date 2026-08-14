# P0 — REALITY CERTIFICATION: MARÍA / MYSTAFF

**AUDIT ONLY — no se modificaron permisos, overrides, RLS, payroll, horas ni datos de producción.**
Fecha: 2026-08-14 · Compañía auditada: My Staff Solution LLC (`37f92f75-…`)
Antecedentes: `P0_SEBASTIAN_MYSTAFF_REALITY_CERTIFICATION.md`, `P0_SEBASTIAN_DOMAIN_BOUNDARY_REMEDIATION.md`.

---

## 1. Identidad real

| Campo | Valor |
|---|---|
| Persona | María Sanabria |
| `user_id` | `96d4a770-87ce-484e-8cbc-97fb827bd561` |
| Membresía MyStaff | sí (`company_users`) |
| `company_users.role` | `admin` (membresía, no autoridad) |
| `operating_role_key` | **`payroll_admin`** |
| `user_roles` (global) | `manager` — no es staff de plataforma, no dispara `has_role('admin')` |
| Scope del rol | `COMPANY` |
| Permisos efectivos MyStaff | **14 / 41** |
| Permisos efectivos Quality | 26 / 41 (compañía distinta, `operating_role_key` NULL, todo por overrides propios de esa compañía) |

### Permisos efectivos en MyStaff (nominal, vía `has_permission`)

| Dominio | Concedidos |
|---|---|
| payroll | `payroll.view`, `payroll.manage`, `payroll.export`, `reports.view`, **`payroll.approve`** ⚠ |
| attendance | **`time_entries.review`**, **`time_entries.adjust`**, **`time_entries.approve`**, **`closeout.close_day`**, **`closeout.reopen_day`** ⚠ (y `time_entries.view` = ❌, `attendance.view` = ❌) |
| services | **`service.close`**, **`service.reopen`** ⚠ |
| people / clients | `workers.view`, `clients.view` |
| admin | ninguno (`users.manage`, `roles.manage`, `company.settings`, `payroll.settings` = ❌) |
| staffing | ninguno |
| documents / communication | ninguno |

### Origen de cada permiso

Default del rol `payroll_admin` (`src/lib/auth/role-model.ts`): `payroll.view`, `payroll.manage`,
`payroll.export`, `reports.view`, `workers.view` → **5 permisos**. Correcto y alineado con la
etapa esperada.

Los **9 restantes provienen de overrides legacy escritos contra MyStaff**, no del rol:

| Override (MyStaff) | Valor | Permisos que abre |
|---|---|---|
| `module periods` | view ✅ / edit ✅ | `payroll.view`, `payroll.manage`, **`payroll.approve`** |
| `module summary` | view ✅ | `payroll.view`, `payroll.export` |
| `module clients` | view ✅ | `clients.view` |
| `action editar_clock` | ✅ | `time_entries.review`, `time_entries.adjust` |
| `action aprobar_clock` | ✅ | `time_entries.approve` |
| `action cerrar_dia` / `reabrir_dia` | ✅ | `closeout.close_day`, `closeout.reopen_day` |
| `action cerrar_turno` / `reabrir_turno` | ✅ | `service.close`, `service.reopen` |
| `action aprobar_nomina` | **❌ (negativo explícito)** | *ignorado* — ver Bypass B1 |
| `action exportar_nomina` / `crear_nomina` / `editar_turno` / `configurar_*` | ❌ | ninguno |

Overrides con `company_id IS NULL` (legacy) existen pero **no** se evalúan (el resolver los
descarta correctamente).

---

## 2. Responsabilidad esperada vs real

Etapa esperada (Payroll Administrator, catálogo canónico): ver información lista para payroll,
revisar novedades, preparar periodos/lotes, exportar, consultar reportes y personas.
`payroll.view` + `payroll.manage` + `payroll.export` + `reports.view` + `workers.view` cubren
exactamente esa etapa. **El rol está bien diseñado; la realidad de María lo excede.**

---

## 3. Separación de dominios — resultado

| Dominio | Esperado | Real | Resultado |
|---|---|---|---|
| SERVICES crear/editar/publicar/duplicar | DENY | DENY (`service.create/edit/publish/cancel` = ❌) | PASS |
| SERVICES cerrar/reabrir | DENY | **ALLOW** (`service.close`, `service.reopen`) | **FAIL** |
| STAFFING asignar/reemplazar/remover | DENY | DENY | PASS |
| TIME modificar `time_entries` reales | DENY | **ALLOW** (`time_entries.adjust`) | **FAIL** |
| TIME aprobar horas | DENY | **ALLOW** (`time_entries.approve`) | **FAIL** |
| CLOSEOUT cerrar/reabrir día | DENY | **ALLOW** | **FAIL** |
| ADMIN users/roles/permissions/settings/integrations | DENY | DENY | PASS |
| BILLING | DENY | DENY (`/app/billing` e `invoicing` exigen `company.settings`; RLS de facturación = dueño/plataforma) | PASS |
| PAYROLL preparar | ALLOW | ALLOW | PASS |
| PAYROLL aprobar | DENY | **ALLOW** (`payroll.approve`) | **FAIL** |

---

## 4. Payroll Administrator vs Payroll Approver

El catálogo **ya distingue** ambas etapas y no hace falta inventar permisos:

- Preparación: `payroll.view`, `payroll.manage`, `payroll.export`, `reports.view`.
- Aprobación: `payroll.approve` (rol canónico `payroll_approver`; owners lo tienen por acceso total).
- No existe un dominio separado `payment_batch.*`; el lote se gobierna con `payroll.manage`
  (preparar) y `payroll.approve` (aprobar). Es equivalente y suficiente.

Separación **rota en la realidad de María**: tiene `payroll.approve` en MyStaff.
Owners MyStaff: 3 (`company_owner`), 41/41 — correcto.

### Bypass B1 — un DENY explícito no puede vencer a una fila de módulo legacy (CRÍTICO)

`has_permission` (SQL) y `evaluatePermission` (frontend) evalúan el override como **OR** entre la
fila de acción y la fila de módulo:

```
_saw = fila_accion OR fila_modulo
_any_true = (accion.granted) OR (modulo.can_edit)
```

`payroll.approve` mapea a `action = aprobar_nomina` **y** `module = periods/edit`.
María tiene `aprobar_nomina = false` (deny explícito) y `periods.can_edit = true` (necesario para
*preparar*). Resultado: `payroll.approve = TRUE`. **Preparar payroll concede aprobar payroll.**

Consecuencia: con el mapeo legacy actual, `payroll.manage` y `payroll.approve` son
indistinguibles vía override de módulo, y un deny explícito de aprobación es inefectivo.

### Bypass B2 — dominio de horas concedido por override legacy

`editar_clock`, `aprobar_clock`, `cerrar_dia`, `reabrir_dia` en MyStaff otorgan a una Payroll
Administrator autoridad de mutación sobre horas reales y cierre, exactamente la frontera cerrada
para Sebastián en la remediación anterior. La frontera se cerró en las **policies**, pero los
**overrides de datos** siguen concediéndola.

### Bypass B3 — mutación sin lectura (incoherencia de estado)

`time_entries.view = ❌` pero `time_entries.adjust/approve = ✅`. La RLS de `time_entries`
(post-remediación) niega el `SELECT` y permite el `UPDATE`: María puede escribir horas que no
puede leer. Estado imposible de operar y señal de que los overrides no fueron migrados al
modelo canónico.

---

## 5. Matriz Reality (MyStaff)

| Superficie | Menú | Ruta | Datos | Acción en UI | Mutación | Esperado | Resultado |
|---|---|---|---|---|---|---|---|
| Home / Command Center | sí | sí | payroll+personas | acciones filtradas por `can` | según permiso | ver | PASS |
| Services (listado/edición) | no | bloqueada (`service.view` ❌) | — | — | — | DENY | PASS |
| Services cerrar/reabrir | n/a (sin acceso al listado) | — | — | expuesto donde se muestre un servicio | **permitida** | DENY | **FAIL** (permiso concedido) |
| Staffing / asignación | no | bloqueada | — | — | no | DENY | PASS |
| Attendance / Live map / Kiosk | no (`attendance.view` ❌) | bloqueada | — | — | — | DENY | PASS |
| Time Clock (`/app/timeclock`) | no (`time_entries.view` ❌) | bloqueada | — | — | — | DENY | PASS (superficie) |
| Horas: ajustar / aprobar | oculto por falta de `view` | — | **SELECT denegado** | oculto | **UPDATE permitido por RLS** | DENY | **FAIL** (B2/B3) |
| Closeout día | oculto | — | — | oculto | **permitida** | DENY | **FAIL** (B2) |
| Validation Center | sí (`payroll.view`) | sí | payroll | sí | sí | preparar | PASS |
| Payroll: periodos, movimientos, resumen, import, conceptos, adelantos | sí | sí | sí | sí | sí | preparar | PASS |
| Payroll reconciliation / review queue / weekly / staged / report | sí | sí | sí | sí | sí | preparar/validar | PASS |
| Payroll lotes (pilot close) | **sí** (`payroll.approve`) | **accesible** | sí | **aprobar** | **sí** | DENY | **FAIL** (B1) |
| Movimientos: aprobar novedad (`Movements.tsx`) | sí | sí | sí | **CTA Aprobar visible** | sí | DENY | **FAIL** (B1) |
| Payroll settings | no (`payroll.settings` ❌) | bloqueada | — | — | — | DENY | PASS |
| Billing / Invoicing | no (`company.settings` ❌) | bloqueada | — | — | RLS dueño/plataforma | DENY | PASS |
| Workers / directorio | sí (`workers.view`) | sí | lectura | sin editar (`workers.edit` ❌) | no | read-only | PASS |
| Documents | no | bloqueada | — | — | — | DENY | PASS |
| Users / Roles / Permissions / Company Settings / Integrations | no | bloqueadas (owner-only) | — | — | — | DENY | PASS |
| Reports | sí (`reports.view`) | sí | lectura | export | export | ALLOW | PASS |
| Notifications | sí | n/a | filtradas por permiso (`lib/notifications/authorization.ts`) | — | — | filtrado | PASS |

Regla UX aplicada: donde el permiso está concedido (B1/B2), la UI **sí** expone la acción — por
eso esos casos son FAIL y no “403 del backend”.

---

## 6. Cross-tenant

Sin contaminación: cada override está scopeado por `company_id` y `has_permission` descarta filas
`company_id IS NULL`. Los 26/41 de María en Quality Staff (donde `operating_role_key` es NULL y
todo viene de overrides de esa compañía, incluidos `service.create/edit/publish` y `staffing.*`)
**no** conceden nada en MyStaff, y viceversa. Resolución verificada por
`user + company + operating_role_key + overrides`.

Nota (fuera del alcance de esta certificación, pero relevante): en Quality Staff María opera de
facto como administradora de servicios y horas sin rol operativo explícito.

---

## 7. Regresión de la cadena (MyStaff, misma consulta)

| Persona | `operating_role_key` | X/41 | Services | Horas / Closeout | Payroll prep | Payroll approve |
|---|---|---|---|---|---|---|
| Sebastián | `shift_admin` | 16 | ✅ | ❌ | ❌ | ❌ |
| Duván | `time_closeout_admin` | 11 | ❌ (solo `service.view`, `close`, `reopen`) | ✅ | ❌ | ❌ |
| María | `payroll_admin` | 14 | ❌ crear/editar/publicar · ⚠ close/reopen | ⚠ **✅ indebido** | ✅ | ⚠ **✅ indebido** |
| Owners (3) | `company_owner` | 41 | ✅ | ✅ | ✅ | ✅ |

Sebastián y Duván **siguen correctamente separados**; la regresión está aislada en María.

---

## 8. Protección de payroll

No se ejecutó ninguna sentencia de escritura. Cálculos, fórmulas, compensación, `time_entries`,
horas históricas, lotes, pagos, membresías, `operating_role_key` y overrides quedan **idénticos**.
Payroll sigue consumiendo exclusivamente horas reales de `time_entries`.

---

## Cierre obligatorio

1. **`operating_role_key`:** `payroll_admin` (MyStaff).
2. **Permisos efectivos:** **14/41** (el rol solo concede 5; 9 vienen de overrides legacy).
3. **¿Crear/editar/publicar servicios?** No. Pero **sí puede cerrar y reabrir servicios** (`service.close/reopen`) — indebido.
4. **¿Modificar `time_entries`?** **Sí** (`time_entries.adjust`) — indebido; además sin poder leerlos (`time_entries.view` ❌).
5. **¿Aprobar/corregir horas?** **Sí** (`time_entries.review/approve`, `closeout.close_day/reopen_day`) — indebido.
6. **¿Preparar payroll?** Sí — correcto y esperado.
7. **¿Modificar payroll?** Sí, en el ámbito de preparación (`payroll.manage`) — correcto.
8. **¿Aprobar payroll final?** **Sí** (`payroll.approve`) — indebido; el deny explícito `aprobar_nomina=false` es anulado por `periods.can_edit`.
9. **¿Billing?** No. Menú, rutas y RLS lo niegan.
10. **¿Users/Roles/Permissions?** No. Reservado a dueño/plataforma.
11. **¿Bypass legacy?** Sí, tres: **B1** deny-vs-módulo (OR-collapse que colapsa preparar≠aprobar), **B2** dominio de horas concedido por overrides `editar_clock`/`aprobar_clock`/`cerrar_dia`/`reabrir_dia`, **B3** mutación sin lectura en `time_entries`. Adicional de plataforma: 41 policies aún gatilladas por `has_role(auth.uid(),'admin')` global (María, Sebastián y Duván **no** tienen ese rol global, así que hoy no se explota) y 118 policies con `SELECT` solo por membresía en tablas secundarias.
12. **¿Contaminación cross-tenant?** No.
13. **¿Sebastián/Duván separados?** Sí (16/41 y 11/41, sin solapamiento de dominio).
14. **¿Payroll/`time_entries` intactos?** Sí; auditoría 100% de solo lectura.
15. **VEREDICTO:** 🔴 **NO GO**

### Detención (según instrucción)

Se detiene la auditoría sin corregir. La remediación mínima —**a ejecutar solo con autorización
explícita**— sería: (a) desacoplar `payroll.approve` del módulo `periods/edit` o hacer que un deny
explícito de acción prevalezca sobre la fila de módulo; (b) retirar los overrides de horas y
cierre de María en MyStaff; (c) reconciliar `time_entries.view` con `adjust/approve`.
