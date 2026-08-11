# P0 — Fase 2A · Remediación maestra de identidad: Sophia Contreras

Alcance autorizado: **una sola persona**. Ningún otro grupo fue tocado.
Empresa: Quality Staff by Keury (`00000000-0000-0000-0000-000000000001`).

---

## 1. Preflight (reverificación en vivo, 2026-08-11)

| Registro | UUID | Portal/auth | time_entries | payroll (`period_base_pay`) | assignments | documentos |
|---|---|---|---|---|---|---|
| **ST-01073 (canónico)** | `b21476e3-8048-416b-b552-bdfdc0308a07` | `user_id=27a62131…` | **23** | **10** | 36 | 0 exclusivos |
| ST-01204 | `ef96e166-7724-49f9-8eb9-7b5969af321f` | ninguno | 0 | 0 | 3 | 0 |
| ST-01225 | `f5a6230d-51e2-47a2-87c1-0563b230750e` | ninguno | 0 | 0 | 0 | 0 |

Barrido completo: se recorrieron las **73 claves foráneas** que apuntan a `employees`.
Referencias no críticas detectadas en los legacy: `compensation_profiles` (1 c/u, creadas por el
mismo lote de import), `compensation_change_log` (1 c/u), `employee_tickets` (1 en 1204),
`shift_reviews` (1 en 1204), `shift_attendance_confirmations` (1 en 1204),
`normalized_schedule_rows` (16 en 1225 — filas de staging de importación).
**Ninguna** referencia de nómina, fichaje, auth o portal en los duplicados → no procede abortar.

## 2. Canónico

ST-01073 confirmado como canonical employee. **No se modificó** su id, su vínculo de auth,
su portal, sus fichajes, su nómina, sus documentos ni sus referencias históricas.

## 3. Assignments de ST-01204 (las 3 auditadas)

| Assignment | Turno | Fecha | Estado | Clasificación | Acción |
|---|---|---|---|---|---|
| `4dae39de…` | `80aca639…` (`#0173 M`) | 2026-04-13 | accepted | Histórica cerrada | **No tocada** — se preserva para auditoría |
| `b5f4149a…` | `c5d80c5e…` (`34234`) | 2026-04-22 | accepted (+ asistencia `present` 2026-04-23) | Histórica cerrada con asistencia | **No tocada** |
| `7a0fb0de…` | `e89a2507…` (`359`) | 2026-08-10 | **removed** | Ya retirada, fecha pasada | **No tocada** |

**Cero assignments activas o futuras** ⇒ **cero relinks**. No se creó ninguna asignación nueva,
por lo que la regla anti-duplicado (§5) no llegó a aplicarse; aun así se verificó que ST-01073
no estuviera asignada a esos tres turnos (`canon_active=false` en los tres).

## 4. Writes exactos ejecutados

```sql
UPDATE public.employees
SET is_active = false,
    merged_into_employee_id = 'b21476e3-8048-416b-b552-bdfdc0308a07',
    identity_status = 'merged'
WHERE id IN ('ef96e166-7724-49f9-8eb9-7b5969af321f',
             'f5a6230d-51e2-47a2-87c1-0563b230750e')
  AND company_id = '00000000-0000-0000-0000-000000000001'
  AND merged_into_employee_id IS NULL
  AND user_id IS NULL;
```

2 filas. Sin DELETE, sin reescritura de FK, sin cambios en el canónico.

## 5. Before / After

| Campo | ST-01204 antes → después | ST-01225 antes → después |
|---|---|---|
| `is_active` | `true` → `false` | `false` → `false` |
| `identity_status` | `verified` → `merged` | `verified` → `merged` |
| `merged_into_employee_id` | `NULL` → `b21476e3…` | `NULL` → `b21476e3…` |
| `user_id` | `NULL` (sin cambios) | `NULL` (sin cambios) |

## 6. Integridad post-write

- **Payroll**: `period_base_pay` de ST-01073 = **10** (idéntico). 0 referencias en los legacy. Cero relinks.
- **Time clock**: `time_entries` de ST-01073 = **23** (idéntico); ni un timestamp, hora o referencia de servicio modificada. Los legacy siguen con 0.
- **Portal/auth**: ST-01073 conserva `user_id=27a62131…`. No se creó portal, auth ni invitación para los legacy.
- **Documentos**: 0 documentos en los legacy, nada movido ni duplicado.
- **Censo**: 1.420 empleados antes y después. 0 UUIDs perdidos. 0 FK modificadas.
- **Assignments**: 36 en el canónico y 3 en el legacy, sin cambios en ninguno.

## 7. Trigger / bloqueo de escritura

`block_writes_on_merged_employee` (sin modificar) rechaza con `EMPLOYEE_MERGED` cualquier
escritura operativa nueva cuyo `employee_id` apunte a un registro con
`merged_into_employee_id` no nulo, indicando el id maestro. Aplica ya a 1204 y 1225.

## 8. Staffing e historial

El contrato canónico `classifyWorkerAssignability` (`src/lib/shifts/assignable-workers.ts`)
descarta `is_active=false` en el primer nivel de precedencia, y el resolver de identidad
(`buildEmployeeIdentityIndex`) descarta registros con `merged_into_employee_id`. Resultado:
1204 y 1225 desaparecen de búsqueda, selector de staffing, sugerencias y reemplazos.
ST-01073 sigue siendo asignable (portal real ⇒ `added_via='Pending approval'` no bloquea).
Los dos legacy siguen existiendo y son consultables desde las vistas administrativas de
identidad, con su enlace explícito al canónico.

## 9. QA operativo

| Caso | Resultado |
|---|---|
| A · Equipo → Sophia | solo ST-01073 activa |
| B · Perfil | abre ST-01073 |
| C · Selector de staffing | solo ST-01073 (los otros dos filtrados por `is_active=false`) |
| D · Asignar a un servicio | usa `b21476e3…`; escribir sobre 1204/1225 aborta con `EMPLOYEE_MERGED` |
| E · Portal | misma cuenta `27a62131…`, sin cambios |
| F · Turnos | el canónico ve sus asignaciones |
| G · Clock flow | resuelve a ST-01073 (23 fichajes intactos) |

No se ejecutó ningún proceso real de nómina.

## 10. Rollback exacto

```sql
UPDATE public.employees SET is_active = true,  identity_status = 'verified', merged_into_employee_id = NULL
 WHERE id = 'ef96e166-7724-49f9-8eb9-7b5969af321f';
UPDATE public.employees SET is_active = false, identity_status = 'verified', merged_into_employee_id = NULL
 WHERE id = 'f5a6230d-51e2-47a2-87c1-0563b230750e';
```

Reproducible al 100%: solo tres columnas en dos filas cambiaron; nada más fue tocado.

## 11. Cierre

1. **Sí**, Sophia aparece una sola vez en staffing.
2. Canonical employee id: `b21476e3-8048-416b-b552-bdfdc0308a07` (ST-01073).
3. **No** se movió ninguna assignment (las 3 del legacy son históricas o ya retiradas).
4. **No** se tocó ningún time_entry (23 antes y después).
5. **No** se tocó payroll (10 referencias intactas, 0 relinks).
6. **Sí**, portal y auth siguen ligados exclusivamente a ST-01073.
7. **Sí**, 1204 y 1225 siguen existiendo y auditables, con enlace al canónico.
8. **No**: `block_writes_on_merged_employee` bloquea escrituras operativas nuevas sobre ellos.

Los otros 9 casos tipo Sophia permanecen intactos y bloqueados hasta la aprobación de este reporte.
