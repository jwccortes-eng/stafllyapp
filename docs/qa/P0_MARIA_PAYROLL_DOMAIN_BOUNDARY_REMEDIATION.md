# P0 — María / Payroll Domain Boundary Remediation

Fuente: `docs/qa/P0_MARIA_MYSTAFF_REALITY_CERTIFICATION.md` (veredicto previo 🔴 NO GO).
Alcance: **solo autorización**. No se tocó payroll, horas, pagos ni datos de producción.
Tenant auditado: **My Staff Solution LLC**. Quality Staff se audita aparte (sin contaminación cruzada).

## Frontera canónica

| Dominio | Dueño |
|---|---|
| Servicios (crear/editar/publicar/asignar) | Sebastián — `shift_admin` |
| Horas y cierre operativo (incl. cerrar/reabrir servicio) | Duván — `time_closeout_admin` |
| Preparación de nómina | María — `payroll_admin` |
| Aprobación final de nómina | Dueño / `payroll_approver` |

## 1. Overrides legacy de María (MyStaff) — clasificación

| Override | Dominio | Consistente con `payroll_admin` | Acción |
|---|---|---|---|
| `editar_clock = true` | Time | No | Corregido → `false` |
| `aprobar_clock = true` | Time | No | Corregido → `false` |
| `cerrar_dia = true` | Closeout | No | Corregido → `false` |
| `reabrir_dia = true` | Closeout | No | Corregido → `false` |
| `cerrar_turno = true` | Services | No | Corregido → `false` |
| `reabrir_turno = true` | Services | No | Corregido → `false` |
| `editar_nomina = true`, módulo `periods.edit` | Payroll prep | Sí | Conservado |
| `ver_salarios = true`, módulo `summary.view` | Payroll read | Sí | Conservado |
| `aprobar_nomina = false` | Payroll approval | Sí (deny) | Conservado y ahora efectivo |
| `exportar_nomina = false` | Payroll | Ambiguo (el rol lo concede, el override lo niega) | **Revisión humana** — no se tocó |
| `crear_turno/editar_turno/eliminar_turno = false`, `configurar_* = false` | Services/Admin | Sí (deny) | Conservado |

Nada se borró: solo se pasaron a `false` los seis overrides inequívocamente fuera de dominio.

## 2. `periods / edit`

`periods.edit` es el módulo de **preparación** de nómina. Antes estaba mapeado a la vez a
`payroll.manage` y a `payroll.approve`, así que preparar implicaba aprobar.

Corrección en `permission_catalog()` (SQL) y `permission-catalog.ts` (espejo):

- `payroll.manage` → acción `editar_nomina` + módulo `periods.edit` (preparación).
- `payroll.approve` → **solo** acción `aprobar_nomina` (sin módulo).

Se aplicó el mismo desacople a las capacidades terminales del dominio de horas y servicios,
que colapsaban con módulos amplios: `time_entries.approve`, `closeout.close_day`,
`closeout.reopen_day`, `service.close`, `service.reopen` ya no se conceden por
`timeclock.edit` ni `shifts.edit`. No se creó ningún permiso nuevo.

## 3. Precedencia del deny explícito

`has_permission` (y su espejo en `permission-resolver.ts` / `permission-overrides.ts`) pasó de
un OR entre acción y módulo a **precedencia estricta**:

1. Si existe fila explícita de acción para el permiso → decide (allow o deny).
2. Solo si no existe → se consulta el módulo.
3. Solo si tampoco hay módulo → default del `operating_role_key` (allowlist).

Resultado: `aprobar_nomina = false` ya no puede ser reotorgado por alias ni módulo.

## 4–5. Time & Closeout / Service close-reopen

María no hereda ni por rol ni por override: editar horas, aprobar horas, reabrir horas,
cerrar día, reabrir día, cerrar o reabrir servicios. Conserva lectura contextual de payroll
(`payroll.view`, `reports.view`, `workers.view`, `clients.view`). Cierre operativo ≠ cierre financiero.

## 6. Frontend

- `useTodayHubPermissions.canApproveHours` ya no acepta `payroll.approve` como sustituto de
  `time_entries.approve`: aprobar horas es exclusivamente dominio de Time & Closeout.
- Los paneles de horas/closeout, close/reopen y aprobación ya se gatean con `can(...)`;
  con los permisos corregidos desaparecen menú, ruta, acción y mutación para María.

## 7. Protección de payroll

No se modificó ningún cálculo, fórmula, compensación, `time_entries`, hora histórica, lote de
pago ni pago. Payroll sigue leyendo horas reales de `time_entries`.

## 8. Cadena de regresión (medida con `has_permission` en producción)

| Persona | Tenant | Rol | Permisos | Servicios | Horas/Closeout | Payroll prep | Payroll approve |
|---|---|---|---|---|---|---|---|
| Sebastián | MyStaff | `shift_admin` | 16/41 | ✅ | ❌ | ❌ | ❌ |
| Duván | MyStaff | `time_closeout_admin` | 11/41 | ❌ (solo `service.view` + close/reopen operativo) | ✅ | ❌ | ❌ |
| María | MyStaff | `payroll_admin` | **5/41** | ❌ | ❌ | ✅ | ❌ |
| Duván | Quality | (sin rol) | 0/41 | ❌ | ❌ | ❌ | ❌ |
| Dueños (Jorge/Keury) | ambos | `company_owner` | total | ✅ | ✅ | ✅ | ✅ |

Permisos efectivos de María en MyStaff: `payroll.view`, `payroll.manage`, `reports.view`,
`workers.view`, `clients.view`.

## 9. Cross-tenant

Los overrides son por `(user_id, company_id)`; ninguna fila de Quality Staff participa en la
evaluación de MyStaff. Los 23 permisos de María en Quality Staff siguen intactos y **quedan
fuera de este alcance** (requieren su propia certificación).

## Cierre obligatorio

1. **Overrides corregidos:** `editar_clock`, `aprobar_clock`, `cerrar_dia`, `reabrir_dia`, `cerrar_turno`, `reabrir_turno` → `false` (MyStaff).
2. **¿`periods/edit` sigue otorgando aprobación?** No. `payroll.approve` ya no tiene módulo.
3. **¿`aprobar_nomina=false` se respeta?** Sí: la acción explícita tiene precedencia absoluta.
4. **¿María puede editar `time_entries`?** No.
5. **¿Aprobar horas?** No.
6. **¿Cerrar/reabrir servicios?** No.
7. **¿Preparar payroll?** Sí (`payroll.view` + `payroll.manage`).
8. **¿Aprobar payroll final?** No.
9. **¿Duván conserva Time & Closeout?** Sí, 11/41 sin cambios.
10. **¿Sebastián conserva Services?** Sí, 16/41 sin cambios.
11. **¿Owners conservan aprobación?** Sí.
12. **¿Payroll/`time_entries` intactos?** Sí, ningún dato operativo fue tocado.
13. **¿Queda algún bypass equivalente?** Ninguno para María en MyStaff. Pendientes de revisión
    humana, fuera de alcance: (a) `exportar_nomina = false` contra el rol; (b) un dueño de
    Quality Staff con overrides `false` que le niegan payroll en su propia empresa;
    (c) los 23 permisos de María en Quality Staff.

## VEREDICTO

🟡 **GO WITH CONDITIONS** — la frontera Payroll / Time & Closeout / Services queda cerrada en
MyStaff y verificada contra la base real. Las condiciones son los tres casos ambiguos listados
en el punto 13, que exigen decisión humana y no se modificaron.
