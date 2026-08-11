# P0 — Quality Staff · Implementación canónica del Internal ID

Fecha: 2026-08-11 · Empresa: Quality Staff by Keury (`00000000-0000-0000-0000-000000000001`)
Fuente: `docs/qa/P0_QUALITY_INTERNAL_ID_POLICY_AUDIT.md`

Campo físico: `public.employees.employer_identification`.
No es el UUID del employee, no es el auth user id, no es un identificador técnico de Stafly:
es el **número interno de la empresa que procesa la nómina**, estable de por vida.

---

## Fase 1 — Secuencia segura

Se eliminó la dependencia de `MAX(...)+1` sin bloqueo.

Mecanismo canónico: **contador por empresa + advisory lock transaccional**.

- Tabla `public.company_internal_id_counters (company_id, last_number, updated_at)`.
- Función `public.next_internal_id(company_id)`:
  1. `pg_advisory_xact_lock(hashtext('internal_id:'||company_id))` → serializa por empresa.
  2. Lee `company_settings.employee_number_config` (`prefix`, `padding`, `start_number`).
  3. Siembra el contador con `GREATEST(MAX observado, start_number - 1)`.
  4. `UPDATE … last_number = GREATEST(last_number, max_observado, start-1) + 1 RETURNING`
     → el bloqueo de fila del contador resuelve también los INSERT multi-fila,
     donde `MAX()` no veía las filas de la misma sentencia.
  5. Bucle de seguridad: si el número calculado ya existiera, avanza. Nunca colisiona,
     nunca recicla, nunca rellena huecos.
- Unicidad intacta: el índice parcial `idx_employees_company_employer_id` sobre
  `(company_id, employer_identification)` no fue tocado.
- Alcance **por empresa**: no existe ni debe existir unicidad global.

## Fase 2 — Inmutabilidad

Trigger `trg_aa_internal_id_immutability` (`BEFORE UPDATE ON employees`):

| Transición | Resultado |
|---|---|
| `NULL → valor` fuera del camino canónico | **Rechazado** (`42501`) |
| `NULL → valor` vía `assign_internal_id` | Permitido |
| `valor → otro valor` por UPDATE normal | **Rechazado** (`42501`) |
| `valor → otro valor` vía `correct_internal_id` | Permitido y auditado |

La marca de camino canónico es un `set_config(..., is_local => true)` dentro de las RPC
`SECURITY DEFINER`: no es alcanzable desde el cliente ni sobrevive a la transacción.

Corrección excepcional: `correct_internal_id(p_employee_id, p_new_internal_id, p_reason)`.
Exige motivo no vacío, actor autenticado con rol `owner`/`admin` de la empresa, valida que el
número no esté ocupado, y registra valor anterior + valor nuevo + actor.

## Fase 3 — Único escritor

RPC canónica `assign_internal_id(p_employee_id, p_source, p_reason, p_notes)`:

- Bloquea la fila (`FOR UPDATE`), valida rol de empresa cuando hay actor.
- Idempotente: si ya hay número → `unchanged`, sin tocar nada.
- `merged` / `merged_into_employee_id` / `deleted_at` → `skipped`, nunca consume número.
- Preservación histórica: si un registro fusionado de la misma persona conserva un número
  y ese número está libre → se preserva literal. Si el fusionado **sigue** ostentándolo
  (política: los fusionados conservan su número), la persona recibe el siguiente de la
  secuencia y la bitácora anota el histórico detectado para decisión humana.
- Escribe la bitácora en el mismo paso.

Escritores paralelos cerrados:

| Escritor | Antes | Ahora |
|---|---|---|
| Trigger `auto_assign_employer_identification` | `MAX+1` propio | delega en `next_internal_id()`; no asigna a merged/borrados |
| `UnmatchedResolutionDialog` — vincular | `UPDATE employees SET employer_identification = …` | eliminado; llama `assignInternalId(source: import_reconciliation)` |
| `UnmatchedResolutionDialog` — crear | valor del Truth en el INSERT | se mantiene (preservación histórica legítima en alta) |
| Imports / edge functions / CSV | valor en el INSERT | se mantiene en alta; **ningún UPDATE posible** |
| Formularios de perfil / Equipo | — | el campo es de solo lectura |

Capa cliente única: `src/lib/identity/internal-id.ts`
(`assignInternalId`, `correctInternalId`, `INTERNAL_ID_LABEL`).

Guardián automatizado: `src/test/internal-id-policy.test.ts` falla si cualquier archivo de
`src/` escribe `employer_identification` dentro de un `.update()` o reintroduce la etiqueta
legacy "ID Stafly". **3/3 en verde.**

## Fase 4 — Reactivación

`assign_internal_id` es el punto de entrada para una persona que vuelve a operación:
conserva el número si lo tiene → coteja el histórico de sus registros fusionados →
si no hay, entrega el siguiente número Stafly. No crea otro employee, no cambia el UUID,
no toca auth, portal ni historia.

## Fase 5 — Perfil admin

- Etiqueta renombrada de "ID Stafly" a **Internal ID** en Equipo (lista, tabla, orden,
  búsqueda, tooltips), en preferencias de columnas y en la reconciliación.
- Nuevo bloque compacto `IdentifiersBlock` en el perfil administrativo
  (`src/components/employee/IdentifiersBlock.tsx`), solo lectura, con botón copiar:
  Internal ID · Employee UUID · Auth User ID · External ID / Connecteam ID.
- Visible únicamente bajo `isPrivileged`. **No** se renderiza en el portal del trabajador.

## Fase 6 — Backfill controlado

Universo: 8 activos sin Internal ID. Se excluyó `Open Shift` (registro de sistema, no es
una persona). **7 personas resueltas**, todas por secuencia Stafly:

| Persona | Internal ID | Motivo | Nota |
|---|---|---|---|
| Francisco Patino | 1305 | legacy_reactivation | — |
| reina gonzales | 1306 | legacy_reactivation | — |
| marcy lorena moreno | 1307 | legacy_reactivation | — |
| oscar palacio | 1308 | legacy_reactivation | — |
| reina gonzalez | 1309 | legacy_reactivation | — |
| **CLAUDIA GRISALES** | **1310** | legacy_reactivation | sin histórico, como se preveía |
| EDWIN GONZALES | 1311 | legacy_reactivation | histórico `1208` sigue en poder de un registro fusionado suyo; anotado para revisión humana |

Los **1.137 inactivos sin número no se tocaron**: se resuelven únicamente al reactivarse.
Ningún Internal ID histórico existente fue modificado. El rango muerto `1121–1199`
permanece vacío y no se rellenó.

> Claudia no recibió `1305` porque el número se calcula transaccionalmente en el momento del
> write, y el backfill corrió ordenado por antigüedad. El candidato `1305` del informe previo
> quedó para el registro más antiguo del lote, exactamente como pedía la política de no
> hardcodear.

## Auditoría / trazabilidad

Tabla `public.internal_id_assignments`: `employee_id`, `company_id`, `internal_id`,
`previous_internal_id`, `assignment_reason`, `source`, `assigned_by`, `notes`, `assigned_at`.
Lectura restringida a `owner`/`admin` de la empresa; escritura sólo desde las funciones
`SECURITY DEFINER`. Motivos en uso: `historical_preservation`, `new_employee`,
`legacy_reactivation`, `manual_admin_correction`, `import_reconciliation`.
Ningún origen histórico fue falseado: las 7 filas del backfill quedaron como
`legacy_reactivation`, no como preservación histórica.

## QA obligatorio

Ejecutado contra la base real dentro de una transacción **revertida al final**
(no se quemó ningún número):

| # | Caso | Resultado |
|---|---|---|
| 1 | Nuevo worker sin histórico | `1305` — siguiente único ✅ |
| 2 | INSERT multi-fila de 5 workers | `1306,1307,1308,1309,1310` — 5 distintos ✅ |
| 3 | Worker histórico con ID `777` | conservado literal ✅ |
| 4 | Claudia reactivada sin histórico | `assigned` nuevo ID Stafly ✅ |
| 5 | Worker `merged` | sin número (`NULL`), `assign` → `skipped` ✅ |
| 6 | Inactivo/fusionado con ID | conserva su número (0 cambios) ✅ |
| 7 | `UPDATE` directo sobre ID asignado | **bloqueado** (`42501`) ✅ |
| 7b | `UPDATE` directo rellenando un ID nulo | **bloqueado** (`42501`) ✅ |
| 8 | Corrección sin actor autorizado | rechazada ✅ |
| 9 | Asignación repetida (import repetido) | `unchanged`, mismo número ✅ |
| 10 | Cross-tenant | otra empresa devuelve `019` con su propio prefijo/padding ✅ |

El caso 2 es la prueba directa de que la carrera del modelo anterior quedó cerrada:
con `MAX+1` las cinco filas pedían el mismo número y la sentencia abortaba con `23505`.

## Protegido / no tocado

`auth`, RLS existentes, cálculos de payroll, `time_entries`, `shift_assignments`,
`scheduled_shifts`, documentos, portal e historia productiva.
No se modificó ninguna referencia de nómina ni se recalculó ningún pago.
Las únicas escrituras de datos fueron 7 `UPDATE` de `employer_identification` de `NULL`
a su número, más sus 7 filas de bitácora.

## Cierre

1. **Secuencia canónica:** contador por empresa `company_internal_id_counters` +
   `pg_advisory_xact_lock`, expuesto por `next_internal_id(company_id)`.
2. **Escritores paralelos eliminados:** el `UPDATE` de `UnmatchedResolutionDialog` y todo
   `UPDATE` directo del campo desde cualquier superficie; el trigger dejó de tener lógica
   propia de numeración.
3. **Claudia recibió Internal ID:** sí.
4. **Número:** `1310`.
5. **Activos resueltos:** 7 de 8 (el octavo es `Open Shift`, registro de sistema).
6. **Preservaron histórico:** 0 (ninguno figuraba en el listado histórico).
7. **Recibieron nuevo ID:** 7.
8. **¿Se tocó payroll o time_entries?** No.
9. **¿Puede cambiarse un Internal ID por un UPDATE normal?** No: la base de datos lo rechaza;
   sólo `correct_internal_id()` con motivo, actor y auditoría.
