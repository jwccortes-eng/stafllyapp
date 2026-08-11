# P0 — FASE 1 · CONSOLIDACIÓN SEGURA DE DUPLICADOS MUERTOS

Tenant: **Quality Staff by Keury**
Fecha de ejecución: 2026-08-11
Autorización: Fase 1 únicamente. Fase 2 (casos tipo Sophia) NO ejecutada.
Fuente: `docs/qa/P0_WORKER_IDENTITY_REMEDIATION_DUPLICATE_PREVENTION.md`

---

## 1. Resumen ejecutivo

Se archivaron **70 registros duplicados muertos** del tenant. Ninguno tenía horas, nómina, asignaciones, asistencia, documentos ni cuenta de portal. No se borró un solo registro, no se movió una sola clave foránea y ni un UUID histórico desapareció.

| Métrica | Valor |
|---|---|
| Grupos iniciales declarados como seguros | 73 |
| Grupos procesados (reverificados en vivo) | 86 (universo completo) |
| Grupos realmente consolidados | **70** |
| Grupos descartados / a revisión humana | **16** |
| Registros archivados | **70** |
| Claves foráneas modificadas | **0** |
| Registros borrados | **0** |
| Cuentas de portal tocadas | **0** |
| Filas de nómina u horas tocadas | **0** |

La diferencia entre los 73 declarados y los 70 ejecutados es intencional: la reverificación en tiempo real movió 3 grupos a revisión humana por señales que no existían al momento de la auditoría original.

## 2. Estrategia aplicada

No se usó DELETE ni MERGE. Se aplicó la estrategia canónica existente para registros legacy, ya soportada por el esquema y por el resolver de identidad:

```text
employees.is_active               -> false
employees.merged_into_employee_id -> <canonical_id>
employees.identity_status         -> 'merged'
```

Efecto en producto:

- **Staffing**: `classifyWorkerAssignability` los clasifica en el bucket `inactive`; no aparecen en el selector ni en sugerencias.
- **Búsqueda**: quedan fuera de las listas activas; solo visibles bajo el filtro explícito "Inactivos".
- **Escrituras nuevas**: el trigger `block_writes_on_merged_employee` impide que cualquier flujo vuelva a escribir sobre ellos y señala el id canónico.
- **Resolver de identidad**: `buildEmployeeIdentityIndex` descarta registros con `merged_into_employee_id`, así que nunca vuelven a competir en el matching.
- **Auditoría**: el registro sigue existiendo íntegro, con su UUID, su historial y su puntero al canónico.

## 3. Criterios de verificación en vivo (por registro)

Cada candidato fue reverificado contra las 73 tablas que referencian `employees`. Se archivó solo con cero en todas estas dimensiones:

| Verificación | Resultado exigido |
|---|---|
| `time_entries` | 0 |
| Nómina (`period_base_pay`, `payroll_*`, `historical_payroll_entries`, `tax_forms_1099`, ledger financiero, `contractor_w9`) | 0 |
| Reconciliación con dinero (`reconciliation_final_records`, `reconciliation_employee_rows`, `movements`) | 0 |
| `user_id` (auth) | NULL |
| Portal (`employee_portal_modules`, `employee_invitations`) | 0 |
| Asignaciones (`shift_assignments`, `scheduled_shifts`, `shift_requests`, `shift_rides`, overrides) | 0 |
| Asignaciones futuras (fecha ≥ ayer) | 0 |
| Asistencia (`clock_events`, `shift_attendance_confirmations`) | 0 |
| Documentos (`employee_documents`, onboarding, revisiones) | 0 |
| Canónico confirmado en el grupo | Sí |

Cualquier fallo desviaba el grupo a **HUMAN REVIEW REQUIRED** de forma automática.

## 4. Listado completo de consolidaciones (70)

Motivo, idéntico en los 70 casos: registro sin actividad alguna (0 horas, 0 nómina, 0 asignaciones, 0 asistencia, 0 documentos, sin portal) que competía con un canónico confirmado del mismo grupo de identidad.

| # | Persona | Canónico conservado | Registro archivado | Origen del duplicado | Creado | Acción |
|---|---|---|---|---|---|---|
| 1 | ADRIANA MARIA SANCHEZ ORJUELA | `7496af53` (inactivo) | `59779574` | — | 2026-03-19 | archivado |
| 2 | Alejandro Solano | `8e3ed4ff` (activo, portal) | `1c4235be` | — | 2026-04-23 | archivado |
| 3 | Alejandro Tzorin | `56f4663d` (activo, portal) | `9a59a9c1` | — | 2026-04-23 | archivado |
| 4 | ALEXANDER RODRIGUEZ | `c7f3773b` (inactivo) | `b93ae5e1` | — | 2026-03-19 | archivado |
| 5 | Alison Vargas | `d8a4520d` (activo, portal) | `e804fc98` | — | 2026-04-23 | archivado |
| 6 | ALISSON RODRIGUEZ | `3143b645` (inactivo) | `be19fa08` | — | 2026-03-19 | archivado |
| 7 | Ammy Prieto | `f8e3ff3a` (activo, portal) | `5994c81a` | — | 2026-04-23 | archivado |
| 8 | ANA JIMENEZ | `ad1a11f8` (inactivo) | `5aae2366` | — | 2026-03-19 | archivado |
| 9 | Anderson Vargas | `54cbef12` (activo, portal) | `d3fac69a` | — | 2026-04-23 | archivado |
| 10 | ANDRES QUINTERO (ELIMINAR) | `1032ce47` (inactivo) | `97f0f606` | — | 2026-03-19 | archivado |
| 11 | Andres Vargas | `c4e899c8` (activo, portal) | `c9bbee02` | — | 2026-04-23 | archivado |
| 12 | BAYRON HERNANDEZ | `3ba714cc` (inactivo) | `d5a78a61` | — | 2026-03-19 | archivado |
| 13 | Bryan Caizahuano | `4ba0f937` (activo, portal) | `7563988e` | — | 2026-04-23 | archivado |
| 14 | CAMILO SAENZ | `09e40950` (inactivo) | `2736be49` | — | 2026-03-19 | archivado |
| 15 | Collin Twist | `d838fad0` (activo, portal) | `38cb3f93` | — | 2026-04-23 | archivado |
| 16 | Cristian Marulanda | `c5b49a12` (activo, portal) | `ed7f2814` | — | 2026-04-23 | archivado |
| 17 | Daniel Ochoa | `751d864f` (activo, portal) | `629d0b49` | — | 2026-04-23 | archivado |
| 18 | DANIEL VASQUEZ | `3fe991b7` (inactivo) | `3c333290` | — | 2026-03-19 | archivado |
| 19 | DANNY ORTEGA GABRIEL | `65599e36` (inactivo) | `13a201ad` | — | 2026-03-19 | archivado |
| 20 | David Leonardo Ceballos LondoñO | `e067f09a` (activo, portal) | `951b3bf3` | — | 2026-04-23 | archivado |
| 21 | Dilan Varela | `7d4610b9` (activo, portal) | `0fadb2ef` | — | 2026-04-23 | archivado |
| 22 | EDWIN GONZALES | `4c3bcf06` (activo, portal) | `d5f6fdf8` | — | 2026-04-23 | archivado |
| 23 | Eliberto Cuadros | `6b9532b6` (activo, portal) | `92ad665a` | — | 2026-04-23 | archivado |
| 24 | Emilio Quisquina | `f8cd079d` (activo, portal) | `74990700` | — | 2026-04-23 | archivado |
| 25 | Emily Vega | `6533f045` (activo, portal) | `b644829a` | — | 2026-04-23 | archivado |
| 26 | Felix Yacon | `56293a99` (activo, portal) | `b09b9345` | — | 2026-04-23 | archivado |
| 27 | FRANK HERNANDEZ | `7ee3487b` (inactivo) | `9cd4afc7` | — | 2026-03-19 | archivado |
| 28 | Franklin Navidad | `fa535611` (activo, portal) | `c266d4d7` | — | 2026-04-23 | archivado |
| 29 | GILBERT INACTIVAR MARTINEZ | `5b58c69d` (inactivo) | `162a1d94` | — | 2026-03-19 | archivado |
| 30 | HECTOR LUIS MARTE PAULINO | `24bfc40e` (inactivo) | `69c17444` | — | 2026-03-19 | archivado |
| 31 | Jair Tlapa Lopez | `fecf9d9a` (activo, portal) | `8390e690` | — | 2026-04-23 | archivado |
| 32 | JAIRO SOLIS | `577e022f` (inactivo) | `9f80932d` | — | 2026-03-19 | archivado |
| 33 | JAMES TORRES CAICEDO | `36f51ae5` (inactivo) | `1104657b` | — | 2026-03-19 | archivado |
| 34 | Jeanpoul Gutierrez | `194c8025` (activo, portal) | `4ae6ed34` | — | 2026-04-23 | archivado |
| 35 | Jesus Alpacaja | `2b53bf96` (activo, portal) | `78199e83` | — | 2026-04-23 | archivado |
| 36 | JOAO TOLEDO | `187d4b2c` (inactivo) | `46609ea1` | — | 2026-03-19 | archivado |
| 37 | JOSE BELTRE | `46578f77` (inactivo) | `638bff3b` | — | 2026-03-19 | archivado |
| 38 | JOSÉ FELIPE | `d5b88718` (inactivo) | `f8dd3540` | — | 2026-03-19 | archivado |
| 39 | JOSE GONZALEZ | `01e00930` (inactivo) | `4a87f04d` | — | 2026-03-19 | archivado |
| 40 | JOSE MARCELLO TORO VELASQUEZ | `9017ed68` (inactivo) | `ecf08811` | — | 2026-03-19 | archivado |
| 41 | jose mesa | `827374ff` (inactivo) | `d58bc32b` | — | 2026-03-19 | archivado |
| 42 | JOSUE CABANILLA | `f7faaa06` (inactivo) | `52d4d0bd` | — | 2026-03-19 | archivado |
| 43 | JUAN FERNANDO RUIZ BERRIO | `94edc673` (inactivo) | `b2db3bc5` | — | 2026-03-19 | archivado |
| 44 | Juan Henao | `5c34275e` (inactivo, portal) | `535bffa5` | — | 2026-04-23 | archivado |
| 45 | JUAN HERNANDEZ | `bf842c2c` (inactivo) | `3c9eb131` | — | 2026-03-19 | archivado |
| 46 | JUAN JOSE MARCANO OLIVO | `dae9609d` (inactivo) | `96aaa323` | — | 2026-03-19 | archivado |
| 47 | JUAN PATINO | `d3d17019` (inactivo) | `9a1c1df2` | — | 2026-03-19 | archivado |
| 48 | JUAN RODRIGUEZ | `99754d3a` (inactivo) | `df2e21c3` | — | 2026-03-19 | archivado |
| 49 | KENNNET GUTIERREZ JAVIER | `06cc24c0` (inactivo) | `b946474b` | — | 2026-03-19 | archivado |
| 50 | Keury Camilo | `e6c121cb` (activo, portal) | `5dd6fc51` | — | 2026-04-23 | archivado |
| 51 | Lizney Sandoval | `cfd2403d` (activo, portal) | `efd33e6d` | — | 2026-04-23 | archivado |
| 52 | Luis Duta | `983c4ecb` (activo, portal) | `b3fa634f` | — | 2026-04-23 | archivado |
| 53 | Maria Sanabria | `da9cbc9e` (activo, portal) | `14630068` | — | 2026-04-23 | archivado |
| 54 | MARIANA CRUZ | `9188b527` (inactivo) | `c3d530b2` | — | 2026-03-19 | archivado |
| 55 | MATIAS CASTELLANOS GALVEZ | `8eaaa5d3` (inactivo) | `ad9ac022` | — | 2026-03-19 | archivado |
| 56 | MICHAEL PONCE | `3d6361c9` (inactivo) | `974e0a14` | — | 2026-03-19 | archivado |
| 57 | MIGUEL GONZALEZ | `deaff01a` (inactivo) | `797a8a56` | — | 2026-03-19 | archivado |
| 58 | Oliver Martinez | `da565f2e` (activo, portal) | `8d6fb019` | — | 2026-04-23 | archivado |
| 59 | Omar Nicolas Jiménez Cardona | `40268aa4` (activo, portal) | `692a272c` | — | 2026-04-23 | archivado |
| 60 | Peter Sanisaca | `8e03668d` (activo, portal) | `8145508e` | — | 2026-04-23 | archivado |
| 61 | Ricardo Tzorin | `9c159c2b` (activo, portal) | `15bddca9` | — | 2026-04-23 | archivado |
| 62 | SANDRA PINEDA | `22dc42b0` (inactivo) | `9079b024` | — | 2026-03-19 | archivado |
| 63 | Santiago Morales | `e7325f28` (activo, portal) | `0ad35591` | — | 2026-04-23 | archivado |
| 64 | SEBASTIAN BARRETO | `6945bb1d` (inactivo) | `16e92d38` | — | 2026-03-19 | archivado |
| 65 | SEBASTIAN ESPINOSA | `88a0b434` (inactivo) | `87530451` | — | 2026-03-19 | archivado |
| 66 | SEBASTIAN ORTIZ | `20c2a82e` (inactivo) | `116a516a` | — | 2026-03-19 | archivado |
| 67 | William Guerrero | `439d1605` (activo, portal) | `3e2453af` | — | 2026-04-23 | archivado |
| 68 | William Hernandez | `d74b0cb7` (activo, portal) | `aab278b3` | — | 2026-04-23 | archivado |
| 69 | YESID GOMEZ | `af1da763` (inactivo) | `43fea37a` | — | 2026-03-19 | archivado |
| 70 | YULIANA MIRA | `4f45d9bd` (inactivo) | `a22db423` | — | 2026-03-19 | archivado |

Nota: en 38 de los 70 grupos el canónico también está inactivo. Son grupos íntegramente históricos: tras la fase ninguno de sus registros compite en staffing, y el archivado deja igualmente un único puntero de identidad correcto.

## 5. Casos descartados — HUMAN REVIEW REQUIRED (16 grupos)

### 5.1 CRITICAL_IDENTITY_SPLIT · tipo Sophia (10) — Fase 2, no ejecutada

| Persona | Clase | Señales que impiden archivar |
|---|---|---|
| Angel Colon | CRITICAL_IDENTITY_SPLIT | `24c83018`: portal_rows=2 |
| Edinson Leon | CRITICAL_IDENTITY_SPLIT | `ef4e5966`: assignments=2, other_hard=1 |
| Mariany Ortiz | CRITICAL_IDENTITY_SPLIT | `b768d985`: attendance=1, assignments=3 |
| Julio Velasquez | CRITICAL_IDENTITY_SPLIT | `1b434231`: assignments=11, other_hard=10 |
| Sophia Contreras | CRITICAL_IDENTITY_SPLIT | `ef96e166`: attendance=1, assignments=3, future=1, other_hard=1 |
| William Rodriguez | CRITICAL_IDENTITY_SPLIT | `e842b53c`: attendance=1, assignments=4 |
| Ivan Morales | CRITICAL_IDENTITY_SPLIT | `3991f387`: assignments=10, other_hard=10 |
| Jose Rodas | CRITICAL_IDENTITY_SPLIT | `5bbf4cf6`: assignments=13 |
| Carlos Alvarez | CRITICAL_IDENTITY_SPLIT | `ba56dbe8`: assignments=4 |
| Lizardy Castillo | CRITICAL_IDENTITY_SPLIT | `2c2f369f`: assignments=3, other_hard=1 |

### 5.2 PAYROLL_REVIEW_REQUIRED (4) — congelados

| Persona | Clase | Señales que impiden archivar |
|---|---|---|
| Danna S Prieto | PAYROLL_REVIEW_REQUIRED | `b0959e21`: payroll=3 |
| cristian varela* | PAYROLL_REVIEW_REQUIRED | `f91c4bb1`: payroll=1 |
| Francisco Patino | PAYROLL_REVIEW_REQUIRED | `1f61628f`: payroll=12, assignments=3, future=2 |
| oscar palacio* | PAYROLL_REVIEW_REQUIRED | `7a86f20a`: payroll=4 |

Tres de estos grupos provienen del set original de 73: la reverificación en vivo detectó referencias de nómina que la auditoría no había contabilizado. Se excluyeron por criterio conservador.

### 5.3 MULTI_PORTAL_REVIEW (2) — congelados

| Persona | Clase | Señales que impiden archivar |
|---|---|---|
| Jorge QA Tester | MULTI_PORTAL_REVIEW | `e38ba377`: portal_rows=4, auth=1, other_hard=4 |
| Justin Mora | MULTI_PORTAL_REVIEW | `03f1b351`: assignments=6; `e08b2240`: attendance=3, portal_rows=1, assignments=19, auth=1, other_hard=12 |

## 6. Validación final (post-ejecución)

| Comprobación | Antes | Después |
|---|---|---|
| Registros de personal del tenant | 1.420 | **1.420** (ningún UUID desaparece) |
| Duplicados objetivo archivados | 0 | **70** |
| Duplicados objetivo con portal | 0 | **0** |
| `time_entries` de los duplicados | 0 | **0** |
| Nómina de los duplicados | 0 | **0** |
| Asignaciones de los duplicados | 0 | **0** |
| Asistencia de los duplicados | 0 | **0** |
| Documentos de los duplicados | 0 | **0** |
| Canónicos modificados | — | **0** |
| Horas registradas del tenant | 7.246 | **7.246** |

Muestra de verificación antes/después:

```text
Alejandro Tzorin  56f4663d  activo   verified  portal ✓   <- canónico intacto
Alejandro Tzorin  9a59a9c1  inactivo merged    -> 56f4663d <- archivado
Alison Vargas     d8a4520d  activo   verified  portal ✓
Alison Vargas     e804fc98  inactivo merged    -> d8a4520d
Bryan Caizahuano  4ba0f937  activo   verified  portal ✓
Bryan Caizahuano  7563988e  inactivo merged    -> 4ba0f937
Keury Camilo      e6c121cb  activo   verified  portal ✓
Keury Camilo      5dd6fc51  inactivo merged    -> e6c121cb
```

QA por superficie:

| Superficie | Resultado |
|---|---|
| Búsqueda de personal | Solo el canónico en las listas activas; el archivado bajo filtro "Inactivos" |
| Selector de staffing | Solo el canónico (`bucket = inactive` para el archivado) |
| Perfil | Ambos perfiles abren; el archivado muestra su puntero al canónico |
| Nómina | Idéntica, sin una sola fila tocada |
| Portal / PIN / invitaciones | Idénticos, sin una sola fila tocada |
| Documentos | Idénticos |
| Historial y auditoría | Íntegros, con UUID original preservado |

## 7. Rollback

Reversión total, por registro o en bloque, sin pérdida de información:

```sql
UPDATE public.employees
SET is_active = true,
    merged_into_employee_id = NULL,
    identity_status = 'verified'
WHERE id IN (<los 70 ids archivados>);
```

Los 70 ids están listados en la sección 4. Como nunca se borró ni se reasignó nada, revertir devuelve el sistema exactamente al estado previo.

## 8. Criterio de éxito

| Criterio | Estado |
|---|---|
| Staffing muestra solo el registro correcto | ✔ |
| No quedan duplicados muertos visibles | ✔ |
| Nómina idéntica | ✔ |
| Horas registradas idénticas | ✔ |
| Portal idéntico | ✔ |
| Historial íntegro | ✔ |
| Ningún UUID histórico desaparece | ✔ |
| Cero claves foráneas modificadas | ✔ |

**Fase 2 (casos tipo Sophia) queda bloqueada hasta la aprobación de este reporte.**
