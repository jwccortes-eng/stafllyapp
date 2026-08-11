# P0 — Fase 2B · Remediación controlada de los 9 casos CRITICAL_IDENTITY_SPLIT

Empresa: Quality Staff by Keury (`00000000-0000-0000-0000-000000000001`).
Fecha de ejecución: 2026-08-11. Patrón aplicado: idéntico al aprobado en
`docs/qa/P0_SOPHIA_PHASE2A_MASTER_REMEDIATION.md`.

---

## 1. Resumen ejecutivo

| Métrica | Valor |
|---|---|
| Casos autorizados | 9 |
| Casos consolidados | **7** |
| Casos detenidos (HUMAN_REVIEW_REQUIRED) | **2** |
| Registros duplicados archivados | **16** |
| Registros borrados | **0** |
| Payroll modificado | **0** |
| Fichajes (`time_entries`) modificados | **0** |
| Assignments movidas / relinkeadas | **0** |
| Cuentas de portal / auth tocadas | **0** |

Estrategia única aplicada a cada duplicado que pasó preflight:
`is_active=false`, `identity_status='merged'`, `merged_into_employee_id=<canónico>`.
Sin DELETE, sin merge físico, sin cambio de UUID, sin reescritura de FK.

## 2. Los 9 casos y su desenlace

| # | Persona | Canónico | Duplicados archivados | Resultado |
|---|---|---|---|---|
| 1 | Mariany Ortiz | `41a4ce5a` | `b768d985` | ✅ Consolidado |
| 2 | William Rodriguez | `28b436c6` | `e842b53c` | ✅ Consolidado |
| 3 | Francisco Patino | `82e58682` | — | ⛔ HUMAN_REVIEW |
| 4 | Justin Mora | `744b546b` | — | ⛔ HUMAN_REVIEW |
| 5 | Carlos Alvarez | `ea1f9ae0` | `ba56dbe8` | ✅ Consolidado |
| 6 | Lizardy Castillo | `8dcc5d21` | `2c2f369f`, `1289de2f`, `3967dea5`, `81b058d4` | ✅ Consolidado |
| 7 | Ivan Morales | `16a20e91` | `3991f387`, `52b39ce1`, `3f657af4`, `92dcc599` | ✅ Consolidado |
| 8 | Julio Velasquez | `92b63a70` | `1b434231`, `fc63fc06`, `89579968`, `dc78d005` | ✅ Consolidado |
| 9 | Jose Rodas | `cdafb28d` | `5bbf4cf6` ("josé rodas"), `5cd56266` | ✅ Consolidado |

## 3. Preflight (reverificación en vivo, por registro)

Dimensiones verificadas por cada registro: canónico, duplicados, portal (`user_id`),
auth, assignments, assignments futuras, turnos programados, asistencia,
`time_entries`, referencias de nómina (`period_base_pay`, `payroll_adjustments`,
`payroll_interpreted_entries`, `payroll_rate_snapshots`, `employee_financial_records`),
documentos, notificaciones, identity reviews y tenant.

| Registro | Rol | Portal | time_entries | payroll | assignments | docs | tenant |
|---|---|---|---|---|---|---|---|
| `ea1f9ae0` Carlos Alvarez | canónico | sí | 193 | 54 | 140 | 0 | QS |
| `ba56dbe8` | duplicado | no | 0 | 0 | 4 | 0 | QS |
| `82e58682` Francisco Patino | canónico | sí | 17 | 8 | 43 | 0 | QS |
| `1f61628f` "francisco patino" | duplicado | no | 0 | **2** | 3 | 0 | QS |
| `16a20e91` Ivan Morales | canónico | sí | 97 | 40 | 17 | 0 | QS |
| `3991f387` / `52b39ce1` / `3f657af4` / `92dcc599` | duplicados | no | 0 | 0 | 10 / 0 / 0 / 0 | 0 | QS |
| `cdafb28d` Jose Rodas | canónico | sí | 27 | 11 | 21 | 0 | QS |
| `5bbf4cf6` / `5cd56266` | duplicados | no | 0 | 0 | 13 / 0 | 0 | QS |
| `92b63a70` Julio Velasquez | canónico | sí | 85 | 37 | 19 | 0 | QS |
| `1b434231` / `fc63fc06` / `89579968` / `dc78d005` | duplicados | no | 0 | 0 | 11 / 0 / 0 / 0 | 0 | QS |
| `744b546b` Justin Mora | canónico | sí | 238 | 57 | 131 | 0 | QS |
| `e08b2240` | duplicado | **SÍ (segundo portal)** | 0 | 0 | 19 | 0 | QS |
| `03f1b351` | duplicado | no | 0 | 0 | 6 | 0 | QS |
| `8dcc5d21` Lizardy Castillo | canónico | sí | 104 | 49 | 27 | 0 | QS |
| `2c2f369f` / `1289de2f` / `3967dea5` / `81b058d4` | duplicados | no | 0 | 0 | 3 / 0 / 0 / 0 | 0 | QS |
| `41a4ce5a` Mariany Ortiz | canónico | sí | 164 | 51 | 110 | 0 | QS |
| `b768d985` | duplicado | no | 0 | 0 | 3 | 0 | QS |
| `28b436c6` William Rodriguez | canónico | sí | 207 | 57 | 131 | 4 | QS |
| `e842b53c` | duplicado | no | 0 | 0 | 4 | 0 | QS |

## 4. Casos ejecutados (writes exactos)

```sql
UPDATE public.employees
SET is_active=false, identity_status='merged', merged_into_employee_id='<canónico>'
WHERE id IN (<duplicados>)
  AND company_id='00000000-0000-0000-0000-000000000001'
  AND merged_into_employee_id IS NULL
  AND user_id IS NULL;
```

Siete sentencias, una por persona. Total: 16 filas afectadas.
Guardas incluidas en cada sentencia: mismo tenant, sin merge previo, sin portal.

## 5. Casos detenidos

| Persona | Motivo de detención |
|---|---|
| **Justin Mora** | El duplicado `e08b2240` tiene **cuenta de portal/auth propia** (`user_id` no nulo) → grupo con doble portal. Excluido por autorización explícita. Su segundo duplicado `03f1b351` tampoco se toca para no partir el grupo. |
| **Francisco Patino** | El duplicado `1f61628f` tiene **2 referencias de nómina** (`period_base_pay`) fuera del canónico → riesgo de payroll. Abortado solo este caso. |

## 6. Motivo de cada exclusión

- Doble portal (Justin Mora): mover o desactivar ese registro podría dejar una sesión
  activa apuntando a una identidad archivada. Requiere decisión humana sobre cuál auth vive.
- Payroll fuera del canónico (Francisco Patino): archivar el registro sin resolver antes
  esas 2 referencias rompería la trazabilidad de pago. Prohibido tocar nómina en esta fase.

## 7. Assignments preservados

Las 48 assignments que colgaban de los duplicados fueron auditadas una a una:
todas tienen fecha **pasada** (rango 2025-12-20 → 2026-08-01, hoy 2026-08-11),
mismo tenant, **0 `time_entries`** asociados y ningún estado activo/futuro.

| Duplicado | Assignments | Rango de fechas | Clasificación | Acción |
|---|---|---|---|---|
| `ba56dbe8` Carlos | 4 | 2026-05-01 → 2026-07-31 | Históricas | No tocadas |
| `3991f387` Ivan | 10 | 2026-04-01 → 2026-04-09 | Históricas | No tocadas |
| `5bbf4cf6` José Rodas | 13 | 2025-12-20 → 2026-02-03 | Históricas | No tocadas |
| `1b434231` Julio | 11 | 2026-04-01 → 2026-04-26 | Históricas | No tocadas |
| `2c2f369f` Lizardy | 3 | 2026-04-13 → 2026-05-05 | Históricas | No tocadas |
| `b768d985` Mariany | 3 | 2026-04-24 → 2026-05-13 | Históricas | No tocadas |
| `e842b53c` William | 4 | 2026-04-24 → 2026-08-01 | Históricas | No tocadas |

**Cero assignments activas o futuras ⇒ cero relinks.** No se reescribió historia.

## 8. Time entries preservados

Antes y después idénticos en los canónicos: Carlos 193, Ivan 97, Jose 27, Julio 85,
Lizardy 104, Mariany 164, William 207. Los duplicados tenían 0 y siguen con 0.
No se movió, recalculó ni reetiquetó ningún fichaje.

## 9. Payroll preservado

`period_base_pay` en los canónicos: 54 / 40 / 11 / 37 / 49 / 51 / 57 — sin cambios.
Cero referencias de nómina en los duplicados consolidados. Ninguna tabla de payroll fue escrita.

## 10. Portal preservado

Todos los portales viven donde vivían: sobre el employee canónico
(`user_id` intacto en los 7 canónicos). No se creó ninguna cuenta, no se movió auth,
no se reenviaron invitaciones. Los 16 duplicados archivados tenían `user_id IS NULL`
y la sentencia lo exigía como condición.

## 11. Antes / Después

| Persona | Antes (registros visibles) | Después |
|---|---|---|
| Carlos Alvarez | 2 | 1 (`ea1f9ae0`) |
| Ivan Morales | 2 activos (+3 inactivos) | 1 (`16a20e91`) |
| Jose Rodas | 2 activos | 1 (`cdafb28d`) |
| Julio Velasquez | 2 activos (+3 inactivos) | 1 (`92b63a70`) |
| Lizardy Castillo | 2 activos (+3 inactivos) | 1 (`8dcc5d21`) |
| Mariany Ortiz | 2 | 1 (`41a4ce5a`) |
| William Rodriguez | 2 | 1 (`28b436c6`) |
| Justin Mora | 3 | 3 (sin cambios, en revisión) |
| Francisco Patino | 2 | 2 (sin cambios, en revisión) |

## 12. Rollback individual por persona

```sql
-- Sustituir <duplicados> por los UUID de la persona a revertir
UPDATE public.employees
SET is_active = true, identity_status = 'verified', merged_into_employee_id = NULL
WHERE id IN (<duplicados>);
```

| Persona | UUIDs a revertir |
|---|---|
| Carlos Alvarez | `ba56dbe8-a10a-4c6a-b22c-9eff5658849f` |
| Ivan Morales | `3991f387-…`, `52b39ce1-…`, `3f657af4-…`, `92dcc599-…` (los 3 últimos vuelven a `is_active=false`) |
| Jose Rodas | `5bbf4cf6-…` (activo), `5cd56266-…` (vuelve a inactivo) |
| Julio Velasquez | `1b434231-…` (activo), `fc63fc06-…`, `89579968-…`, `dc78d005-…` (inactivos) |
| Lizardy Castillo | `2c2f369f-…` (activo), `1289de2f-…`, `3967dea5-…`, `81b058d4-…` (inactivos) |
| Mariany Ortiz | `b768d985-f9ad-4acc-a055-582d13261c15` |
| William Rodriguez | `e842b53c-d53c-417e-8732-608d91b00f4a` |

El rollback es puramente de estado: como no hubo relinks ni borrados, revertir estos
tres campos restaura la situación previa exacta.

## 13. QA final

| Superficie | Resultado |
|---|---|
| Equipo | Una sola fila por persona en las 7 consolidadas |
| Perfil | El canónico conserva portal, fichajes, nómina y documentos |
| Selector de Staffing | Solo el canónico es asignable; los archivados no compiten |
| Portal | 7/7 canónicos con `user_id` activo, sin cambios |
| Turnos | Historial intacto en los registros archivados, visible para auditoría |
| Clock | Conteos, timestamps y duraciones idénticos antes/después |
| Identity Passport | Resuelve al canónico vía `merged_into_employee_id` |

Protección post-write: el trigger `block_writes_on_merged_employee` impide nuevas
escrituras operativas sobre los registros archivados y fuerza el uso del canónico.

## 14. Pendiente

Casos tipo Sophia aún abiertos en Quality Staff: **2** (Justin Mora — doble portal;
Francisco Patino — payroll fuera del canónico). No avanzar sin aprobación específica.
