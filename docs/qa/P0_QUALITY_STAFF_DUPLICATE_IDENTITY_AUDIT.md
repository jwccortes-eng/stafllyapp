# P0 — Quality Staff · Auditoría de duplicados y colisiones de identidad

**Modo: READ ONLY.** No se modificó, fusionó, archivó ni borró ningún registro. Cero writes.
Fecha: 2026-08-11 · Tenant: Quality Staff by Keury (`00000000-0000-0000-0000-000000000001`)
Datos crudos: `quality_staff_duplicate_identity_audit.csv` (todos los grupos, un registro por fila).

---

## 1. Resumen ejecutivo

El caso Sophia Contreras **no es aislado, pero tampoco es masivo**: existen **10 grupos con el patrón exacto** (identidad real con portal + fichajes + payroll en un registro, y asignaciones de staffing colgadas en un registro fantasma sin portal ni horas).

- 1.420 registros `employees` en el tenant, 209 activos, 199 con portal.
- **86 grupos** de posible duplicidad, con **187 registros** implicados.
- **12 registros duplicados** tienen asignaciones reales de staffing (asignaciones que la persona nunca pudo fichar).
- **73 de 86 grupos** son duplicados muertos (sin portal, sin asignaciones, sin horas, sin payroll) — ruido de importación, riesgo bajo.
- El daño está concentrado: **ninguna** asignación futura (>= hoy) cuelga hoy de un duplicado, salvo el canónico de Mariany Ortiz que sí tiene 3 futuras en el registro correcto. El riesgo actual es histórico y de repetición, no de turnos futuros rotos.
- Origen dominante y trazable por marca temporal: **importaciones masivas de horario/Connecteam** del 2026-03-19 04:37 (1.112 registros creados en un minuto), 2026-04-20 19:07 y 2026-04-23 23:37.
- **El flujo que los creó sigue abierto**: `ImportWizard` crea empleados nuevos cuando el nombre exacto no está en su mapa en memoria, sin comprobar teléfono, email ni similitud.

---

## 2. Alcance

Universo: todos los `employees` de Quality Staff by Keury, incluidos activos, inactivos, `Pending approval`, importados e históricos (1.420 filas; `deleted_at` no filtrado en el inventario de duplicados). No se mezclaron otras compañías.

Fuentes cruzadas por registro: `shift_assignments`, `scheduled_shifts`, `time_entries`, `clock_events`, `period_base_pay`, `payroll_interpreted_entries`, `employee_financial_records`, `employee_documents`, `employees.user_id` (portal/auth).

## 3. Método de detección

Agrupación por componentes conexos (union-find) sobre cuatro claves de identidad:

| Clave | Uso |
|---|---|
| `employer_identification` exacto | HIGH |
| Teléfono normalizado (últimos 10 dígitos) | HIGH |
| Email normalizado | HIGH |
| Nombre completo normalizado (sin acentos, sin puntuación) | MEDIUM/LOW, nunca HIGH por sí solo |

Exclusión deliberada: `qualitystaff@gmail.com`, `qualitystaff1@gmail.com`, `qualitystaff2@gmail.com` se usan en >3 registros (buzón corporativo compartido, cuentas "System N"). Usarlas como clave fusionaba 20 cuentas de sistema distintas en un falso grupo; quedan documentadas como **colisión de email corporativo, no duplicado de persona**.

Confianza:
- **HIGH** — coincidencia por email, teléfono o employer_identification.
- **MEDIUM** — solo nombre, pero el canónico tiene portal y el duplicado tiene actividad (asignaciones u horas).
- **LOW** — solo nombre, sin actividad en ninguno de los lados.

Severidad: **P0** identidad fragmentada con payroll implicado · **P1** duplicado con asignaciones divididas · **P2** duplicado con evidencia fuerte sin actividad · **P3** coincidencia de baja confianza.

## 4. Métricas globales

| KPI | Valor |
|---|---|
| Total employees Quality Staff | 1.420 |
| Activos | 209 |
| Con portal/auth (`user_id`) | 199 |
| Grupos de posible duplicado | 86 |
| Registros implicados | 187 |
| Confianza HIGH | 27 |
| Confianza MEDIUM | 9 |
| Confianza LOW | 50 |
| **CRITICAL_IDENTITY_SPLIT (patrón Sophia)** | **10** |
| Duplicados con asignaciones (staffing fragmentado) | 11 grupos / 12 registros |
| Duplicados con time_entries | 0 |
| Duplicados con referencias de payroll | 2 grupos |
| Duplicados con documentos | 0 |
| Duplicados con asignaciones futuras (>= hoy) | 0 |
| Grupos con más de un `user_id` (portal múltiple) | 2 |
| Grupos totalmente muertos (duplicados sin actividad) | 73 |
| Duplicados cross-tenant | 0 (universo limitado a un solo tenant; no se detectó ninguna fila con `company_id` distinto en los grupos) |
| Registros ya fusionados (`merged_into_employee_id`) | 0 |
| Decisiones en `employee_identity_reviews` | 0 |

## 5. CRITICAL_IDENTITY_SPLIT — los 10 casos tipo Sophia

Patrón: **A** tiene portal + fichajes + payroll; **B** no tiene portal, no tiene horas, y sin embargo carga asignaciones.

| Persona | Canónico | Portal | Fichajes | Payroll refs | Duplicado con asignaciones | Asg en el fantasma |
|---|---|---|---|---|---|---|
| Justin Mora | ST-755 | sí | 238 | 57 | ST-1201, ST-1217 | 19 + 6 |
| William Rodriguez | ST-186 | sí | 207 | 57 | ST-1229 | 4 |
| Carlos Alvarez | ST-414 | sí | 193 | 54 | ST-1243 | 4 |
| Mariany Ortiz | ST-602 | sí | 164 | 51 | ST-1228 | 3 |
| Lizardy Castillo | ST-426 | sí | 104 | 49 | ST-1203 | 3 |
| Ivan Morales | ST-106 | sí | 97 | 40 | ST-1202 | 10 |
| Julio Velasquez | ST-286 | sí | 85 | 37 | ST-1200 | 11 |
| Jose Rodas | ST-1061 | sí | 27 | 11 | "josé rodas" (sin Staff ID) | 13 |
| **Sophia Contreras** | **ST-1073** | sí | 23 | 10 | ST-1204 (+ ST-1225 muerto) | 3 |
| Francisco Patino | (sin Staff ID, con portal) | sí | 17 | 8 | ST-1063 | 3 |

Detalle Sophia (confirmatorio): canónico `b21476e3…` ST-1073, portal activo, 36 asignaciones, 23 fichajes, 10 refs de payroll, `added_via='Pending approval'`; fantasmas `ef96e166…` ST-1204 (creado 2026-04-20 19:07, 3 asignaciones, sin portal) y `f5a6230d…` ST-1225 (creado 2026-04-23 23:37, sin actividad).

## 6. Top 20 casos más peligrosos

**1. Justin Mora** — sev `P0` · confianza `HIGH` · evidencia `email+name+phone` · **CRITICAL_IDENTITY_SPLIT**

| Rol | Staff ID | UUID | Portal | Activo | added_via | Creado | Asg | Fut | Fichajes | Payroll | Docs |
|---|---|---|---|---|---|---|---|---|---|---|---|
| canónico | 755 | `744b546b` | sí | sí | Pending approval | 2026-02-25 | 131 | 0 | 238 | 57 | 0 |
| duplicado | 1217 | `03f1b351` | no | no | — | 2026-04-23 | 6 | 0 | 0 | 0 | 0 |
| duplicado | 1201 | `e08b2240` | sí | no | — | 2026-04-20 | 19 | 0 | 0 | 0 | 0 |

**2. Jose Rodas** — sev `P0` · confianza `MEDIUM` · evidencia `name` · **CRITICAL_IDENTITY_SPLIT**

| Rol | Staff ID | UUID | Portal | Activo | added_via | Creado | Asg | Fut | Fichajes | Payroll | Docs |
|---|---|---|---|---|---|---|---|---|---|---|---|
| canónico | 1061 | `cdafb28d` | sí | sí | Invite link (Mobile) | 2026-02-25 | 21 | 0 | 27 | 11 | 0 |
| duplicado | 1237 | `5cd56266` | no | no | — | 2026-04-23 | 0 | 0 | 0 | 0 | 0 |
| duplicado | — | `5bbf4cf6` | no | sí | — | 2026-03-06 | 13 | 0 | 0 | 0 | 0 |

**3. Julio Velasquez** — sev `P0` · confianza `MEDIUM` · evidencia `name` · **CRITICAL_IDENTITY_SPLIT**

| Rol | Staff ID | UUID | Portal | Activo | added_via | Creado | Asg | Fut | Fichajes | Payroll | Docs |
|---|---|---|---|---|---|---|---|---|---|---|---|
| canónico | 286 | `92b63a70` | sí | sí | N/A | 2026-02-25 | 19 | 0 | 85 | 37 | 0 |
| duplicado | 1206 | `fc63fc06` | no | no | — | 2026-04-23 | 0 | 0 | 0 | 0 | 0 |
| duplicado | 1249 | `89579968` | no | no | — | 2026-04-23 | 0 | 0 | 0 | 0 | 0 |
| duplicado | 1253 | `dc78d005` | no | no | — | 2026-04-24 | 0 | 0 | 0 | 0 | 0 |
| duplicado | 1200 | `1b434231` | no | sí | — | 2026-04-20 | 11 | 0 | 0 | 0 | 0 |

**4. Ivan Morales** — sev `P0` · confianza `MEDIUM` · evidencia `name` · **CRITICAL_IDENTITY_SPLIT**

| Rol | Staff ID | UUID | Portal | Activo | added_via | Creado | Asg | Fut | Fichajes | Payroll | Docs |
|---|---|---|---|---|---|---|---|---|---|---|---|
| canónico | 106 | `16a20e91` | sí | sí | N/A | 2026-02-25 | 17 | 0 | 97 | 40 | 0 |
| duplicado | 1220 | `52b39ce1` | no | no | — | 2026-04-23 | 0 | 0 | 0 | 0 | 0 |
| duplicado | 1250 | `3f657af4` | no | no | — | 2026-04-23 | 0 | 0 | 0 | 0 | 0 |
| duplicado | 1254 | `92dcc599` | no | no | — | 2026-04-24 | 0 | 0 | 0 | 0 | 0 |
| duplicado | 1202 | `3991f387` | no | sí | — | 2026-04-20 | 10 | 0 | 0 | 0 | 0 |

**5. Francisco Patino** — sev `P0` · confianza `MEDIUM` · evidencia `name` · **CRITICAL_IDENTITY_SPLIT**

| Rol | Staff ID | UUID | Portal | Activo | added_via | Creado | Asg | Fut | Fichajes | Payroll | Docs |
|---|---|---|---|---|---|---|---|---|---|---|---|
| canónico | — | `82e58682` | sí | sí | Invite link (Mobile) | 2026-02-25 | 43 | 3 | 17 | 8 | 0 |
| duplicado | 1063 | `1f61628f` | no | sí | — | 2026-03-06 | 3 | 0 | 0 | 2 | 0 |

**6. William Rodriguez** — sev `P0` · confianza `MEDIUM` · evidencia `name` · **CRITICAL_IDENTITY_SPLIT**

| Rol | Staff ID | UUID | Portal | Activo | added_via | Creado | Asg | Fut | Fichajes | Payroll | Docs |
|---|---|---|---|---|---|---|---|---|---|---|---|
| canónico | 186 | `28b436c6` | sí | sí | N/A | 2026-02-25 | 131 | 3 | 207 | 57 | 4 |
| duplicado | 1229 | `e842b53c` | no | sí | — | 2026-04-23 | 4 | 0 | 0 | 0 | 0 |

**7. Carlos Alvarez** — sev `P0` · confianza `MEDIUM` · evidencia `name` · **CRITICAL_IDENTITY_SPLIT**

| Rol | Staff ID | UUID | Portal | Activo | added_via | Creado | Asg | Fut | Fichajes | Payroll | Docs |
|---|---|---|---|---|---|---|---|---|---|---|---|
| canónico | 414 | `ea1f9ae0` | sí | sí | N/A | 2026-02-25 | 140 | 0 | 193 | 54 | 0 |
| duplicado | 1243 | `ba56dbe8` | no | sí | — | 2026-04-23 | 4 | 0 | 0 | 0 | 0 |

**8. Mariany Ortiz** — sev `P0` · confianza `MEDIUM` · evidencia `name` · **CRITICAL_IDENTITY_SPLIT**

| Rol | Staff ID | UUID | Portal | Activo | added_via | Creado | Asg | Fut | Fichajes | Payroll | Docs |
|---|---|---|---|---|---|---|---|---|---|---|---|
| canónico | 602 | `41a4ce5a` | sí | sí | N/A | 2026-02-25 | 110 | 3 | 164 | 51 | 0 |
| duplicado | 1228 | `b768d985` | no | sí | — | 2026-04-23 | 3 | 0 | 0 | 0 | 0 |

**9. Sophia Contreras** — sev `P0` · confianza `MEDIUM` · evidencia `name` · **CRITICAL_IDENTITY_SPLIT**

| Rol | Staff ID | UUID | Portal | Activo | added_via | Creado | Asg | Fut | Fichajes | Payroll | Docs |
|---|---|---|---|---|---|---|---|---|---|---|---|
| canónico | 1073 | `b21476e3` | sí | sí | Pending approval | 2026-02-25 | 36 | 0 | 23 | 10 | 0 |
| duplicado | 1225 | `f5a6230d` | no | no | — | 2026-04-23 | 0 | 0 | 0 | 0 | 0 |
| duplicado | 1204 | `ef96e166` | no | sí | — | 2026-04-20 | 3 | 0 | 0 | 0 | 0 |

**10. Lizardy Castillo** — sev `P0` · confianza `MEDIUM` · evidencia `name` · **CRITICAL_IDENTITY_SPLIT**

| Rol | Staff ID | UUID | Portal | Activo | added_via | Creado | Asg | Fut | Fichajes | Payroll | Docs |
|---|---|---|---|---|---|---|---|---|---|---|---|
| canónico | 426 | `8dcc5d21` | sí | sí | N/A | 2026-02-25 | 27 | 0 | 104 | 49 | 0 |
| duplicado | 1224 | `1289de2f` | no | no | — | 2026-04-23 | 0 | 0 | 0 | 0 | 0 |
| duplicado | 1251 | `3967dea5` | no | no | — | 2026-04-23 | 0 | 0 | 0 | 0 | 0 |
| duplicado | 1255 | `81b058d4` | no | no | — | 2026-04-24 | 0 | 0 | 0 | 0 | 0 |
| duplicado | 1203 | `2c2f369f` | no | sí | — | 2026-04-20 | 3 | 0 | 0 | 0 | 0 |

**11. Edinson Leon** — sev `P1` · confianza `LOW` · evidencia `name`

| Rol | Staff ID | UUID | Portal | Activo | added_via | Creado | Asg | Fut | Fichajes | Payroll | Docs |
|---|---|---|---|---|---|---|---|---|---|---|---|
| canónico | 1104 | `d04a3506` | no | sí | — | 2026-03-06 | 11 | 0 | 3 | 2 | 0 |
| duplicado | 1259 | `ef4e5966` | no | sí | application | 2026-05-20 | 2 | 0 | 0 | 0 | 0 |

**12. oscar palacio*** — sev `P3` · confianza `LOW` · evidencia `name`

| Rol | Staff ID | UUID | Portal | Activo | added_via | Creado | Asg | Fut | Fichajes | Payroll | Docs |
|---|---|---|---|---|---|---|---|---|---|---|---|
| canónico | 118 | `a8fc0693` | no | sí | — | 2026-02-25 | 10 | 0 | 16 | 8 | 0 |
| duplicado | — | `7a86f20a` | no | sí | — | 2026-03-06 | 0 | 0 | 0 | 1 | 0 |

**13. Angel Colon** — sev `P2` · confianza `HIGH` · evidencia `email+name+phone`

| Rol | Staff ID | UUID | Portal | Activo | added_via | Creado | Asg | Fut | Fichajes | Payroll | Docs |
|---|---|---|---|---|---|---|---|---|---|---|---|
| canónico | 954 | `50f5c5ac` | sí | sí | Pending approval | 2026-02-25 | 39 | 0 | 51 | 25 | 3 |
| duplicado | 1205 | `24c83018` | no | no | — | 2026-04-20 | 0 | 0 | 0 | 0 | 0 |
| duplicado | 1242 | `8cc898ae` | no | no | — | 2026-04-23 | 0 | 0 | 0 | 0 | 0 |
| duplicado | 1252 | `52f25b1e` | no | no | — | 2026-04-23 | 0 | 0 | 0 | 0 | 0 |
| duplicado | 1256 | `4eff2314` | no | no | — | 2026-04-24 | 0 | 0 | 0 | 0 | 0 |

**14. Danna S Prieto** — sev `P3` · confianza `LOW` · evidencia `name`

| Rol | Staff ID | UUID | Portal | Activo | added_via | Creado | Asg | Fut | Fichajes | Payroll | Docs |
|---|---|---|---|---|---|---|---|---|---|---|---|
| canónico | 1119 | `8474f498` | sí | sí | — | 2026-03-19 | 1 | 0 | 0 | 1 | 0 |
| duplicado | — | `b0959e21` | no | no | — | 2026-03-19 | 0 | 0 | 0 | 0 | 0 |

**15. Bryan Caizahuano** — sev `P3` · confianza `LOW` · evidencia `name`

| Rol | Staff ID | UUID | Portal | Activo | added_via | Creado | Asg | Fut | Fichajes | Payroll | Docs |
|---|---|---|---|---|---|---|---|---|---|---|---|
| canónico | 1019 | `4ba0f937` | sí | sí | Invite link (Mobile) | 2026-02-25 | 71 | 0 | 68 | 20 | 0 |
| duplicado | 1221 | `7563988e` | no | no | — | 2026-04-23 | 0 | 0 | 0 | 0 | 0 |

**16. cristian varela*** — sev `P3` · confianza `LOW` · evidencia `name`

| Rol | Staff ID | UUID | Portal | Activo | added_via | Creado | Asg | Fut | Fichajes | Payroll | Docs |
|---|---|---|---|---|---|---|---|---|---|---|---|
| canónico | — | `196c05fc` | no | no | — | 2026-03-19 | 0 | 0 | 0 | 0 | 0 |
| duplicado | 916 | `f91c4bb1` | no | no | — | 2026-03-19 | 0 | 0 | 0 | 0 | 0 |

**17. Jorge QA Tester** — sev `P2` · confianza `HIGH` · evidencia `email`

| Rol | Staff ID | UUID | Portal | Activo | added_via | Creado | Asg | Fut | Fichajes | Payroll | Docs |
|---|---|---|---|---|---|---|---|---|---|---|---|
| canónico | — | `a0a0a0a0` | sí | no | — | 2026-03-29 | 3 | 0 | 0 | 0 | 0 |
| duplicado | — | `e38ba377` | sí | no | N/A | 2026-02-25 | 0 | 0 | 0 | 0 | 0 |

**18. Alison Vargas** — sev `P3` · confianza `LOW` · evidencia `name`

| Rol | Staff ID | UUID | Portal | Activo | added_via | Creado | Asg | Fut | Fichajes | Payroll | Docs |
|---|---|---|---|---|---|---|---|---|---|---|---|
| canónico | 1069 | `d8a4520d` | sí | sí | Invite link (Mobile) | 2026-02-25 | 103 | 0 | 47 | 14 | 1 |
| duplicado | 1223 | `e804fc98` | no | no | — | 2026-04-23 | 0 | 0 | 0 | 0 | 0 |

**19. Keury Camilo** — sev `P3` · confianza `LOW` · evidencia `name`

| Rol | Staff ID | UUID | Portal | Activo | added_via | Creado | Asg | Fut | Fichajes | Payroll | Docs |
|---|---|---|---|---|---|---|---|---|---|---|---|
| canónico | 104 | `e6c121cb` | sí | sí | N/A | 2026-02-25 | 155 | 5 | 182 | 52 | 0 |
| duplicado | 1213 | `5dd6fc51` | no | no | — | 2026-04-23 | 0 | 0 | 0 | 0 | 0 |

**20. Alejandro Tzorin** — sev `P3` · confianza `LOW` · evidencia `name`

| Rol | Staff ID | UUID | Portal | Activo | added_via | Creado | Asg | Fut | Fichajes | Payroll | Docs |
|---|---|---|---|---|---|---|---|---|---|---|---|
| canónico | 385 | `56f4663d` | sí | sí | N/A | 2026-02-25 | 106 | 0 | 157 | 50 | 0 |
| duplicado | 1209 | `9a59a9c1` | no | no | — | 2026-04-23 | 0 | 0 | 0 | 0 | 0 |

## 7. Tabla completa de grupos (86)

| # | Sev | Conf | Evidencia | Persona | Canónico | Duplicados | Asg en duplicados | Fichajes en duplicados | Payroll en duplicados |
|---|---|---|---|---|---|---|---|---|---|
| 1 | P0 | HIGH | email+name+phone | Justin Mora | 755 | 1217, 1201 | 25 | 0 | 0 |
| 2 | P0 | MEDIUM | name | Jose Rodas | 1061 | 1237, 5bbf4cf6 | 13 | 0 | 0 |
| 3 | P0 | MEDIUM | name | Julio Velasquez | 286 | 1206, 1249, 1253, 1200 | 11 | 0 | 0 |
| 4 | P0 | MEDIUM | name | Ivan Morales | 106 | 1220, 1250, 1254, 1202 | 10 | 0 | 0 |
| 5 | P0 | MEDIUM | name | Francisco Patino | 82e58682 | 1063 | 3 | 0 | 2 |
| 6 | P0 | MEDIUM | name | William Rodriguez | 186 | 1229 | 4 | 0 | 0 |
| 7 | P0 | MEDIUM | name | Carlos Alvarez | 414 | 1243 | 4 | 0 | 0 |
| 8 | P0 | MEDIUM | name | Mariany Ortiz | 602 | 1228 | 3 | 0 | 0 |
| 9 | P0 | MEDIUM | name | Sophia Contreras | 1073 | 1225, 1204 | 3 | 0 | 0 |
| 10 | P0 | MEDIUM | name | Lizardy Castillo | 426 | 1224, 1251, 1255, 1203 | 3 | 0 | 0 |
| 11 | P1 | LOW | name | Edinson Leon | 1104 | 1259 | 2 | 0 | 0 |
| 12 | P3 | LOW | name | oscar palacio* | 118 | 7a86f20a | 0 | 0 | 1 |
| 13 | P2 | HIGH | email+name+phone | Angel Colon | 954 | 1205, 1242, 1252, 1256 | 0 | 0 | 0 |
| 14 | P3 | LOW | name | Danna S Prieto | 1119 | b0959e21 | 0 | 0 | 0 |
| 15 | P3 | LOW | name | Bryan Caizahuano | 1019 | 1221 | 0 | 0 | 0 |
| 16 | P3 | LOW | name | cristian varela* | 196c05fc | 916 | 0 | 0 | 0 |
| 17 | P2 | HIGH | email | Jorge QA Tester | a0a0a0a0 | e38ba377 | 0 | 0 | 0 |
| 18 | P3 | LOW | name | Alison Vargas | 1069 | 1223 | 0 | 0 | 0 |
| 19 | P3 | LOW | name | Keury Camilo | 104 | 1213 | 0 | 0 | 0 |
| 20 | P3 | LOW | name | Alejandro Tzorin | 385 | 1209 | 0 | 0 | 0 |
| 21 | P3 | LOW | name | Dilan Varela | 504 | 1236 | 0 | 0 | 0 |
| 22 | P3 | LOW | name | Peter Sanisaca | 940 | 1214 | 0 | 0 | 0 |
| 23 | P3 | LOW | name | Andres Vargas | 259 | 1207 | 0 | 0 | 0 |
| 24 | P3 | LOW | name | Cristian Marulanda | 1059 | 1231 | 0 | 0 | 0 |
| 25 | P3 | LOW | name | Santiago Morales | 1045 | 1218 | 0 | 0 | 0 |
| 26 | P3 | LOW | name | Maria Sanabria | 999 | 1227 | 0 | 0 | 0 |
| 27 | P3 | LOW | name | Felix Yacon | 147 | 1226 | 0 | 0 | 0 |
| 28 | P3 | LOW | name | Jesus Alpacaja | 146 | 1216 | 0 | 0 | 0 |
| 29 | P3 | LOW | name | William Guerrero | 265 | 1246 | 0 | 0 | 0 |
| 30 | P3 | LOW | name | EDWIN GONZALES | 4c3bcf06 | 1208 | 0 | 0 | 0 |
| 31 | P3 | LOW | name | Eliberto Cuadros | 1062 | 1248 | 0 | 0 | 0 |
| 32 | P3 | LOW | name | Emilio Quisquina | 571 | 1238 | 0 | 0 | 0 |
| 33 | P3 | LOW | name | Juan Henao | 696 | 1219 | 0 | 0 | 0 |
| 34 | P3 | LOW | name | Franklin Navidad | 1038 | 1239 | 0 | 0 | 0 |
| 35 | P3 | LOW | name | Oliver Martinez | 124 | 1210 | 0 | 0 | 0 |
| 36 | P3 | LOW | name | Ammy Prieto | 1097 | 1230 | 0 | 0 | 0 |
| 37 | P3 | LOW | name | Jeanpoul Gutierrez | 372 | 1240 | 0 | 0 | 0 |
| 38 | P3 | LOW | name | Luis Duta | 167 | 1211 | 0 | 0 | 0 |
| 39 | P3 | LOW | name | Collin Twist | 308 | 1241 | 0 | 0 | 0 |
| 40 | P3 | LOW | name | Alejandro Solano | 376 | 1212 | 0 | 0 | 0 |
| 41 | P3 | LOW | name | William Hernandez | 1040 | 1222 | 0 | 0 | 0 |
| 42 | P3 | LOW | name | Daniel Ochoa | 1116 | 1247 | 0 | 0 | 0 |
| 43 | P3 | LOW | name | Anderson Vargas | 263 | 1232 | 0 | 0 | 0 |
| 44 | P3 | LOW | name | Emily Vega | 1108 | 1233 | 0 | 0 | 0 |
| 45 | P3 | LOW | name | Omar Nicolas Jiménez Cardona | 922 | 1244 | 0 | 0 | 0 |
| 46 | P3 | LOW | name | Lizney Sandoval | 972 | 1234 | 0 | 0 | 0 |
| 47 | P3 | LOW | name | Ricardo Tzorin | 890 | 1215 | 0 | 0 | 0 |
| 48 | P3 | LOW | name | David Leonardo Ceballos LondoñO | 1087 | 1235 | 0 | 0 | 0 |
| 49 | P3 | LOW | name | Jair Tlapa Lopez | 1099 | 1245 | 0 | 0 | 0 |
| 50 | P2 | HIGH | email | SEBASTIAN BARRETO | 6945bb1d | 16e92d38 | 0 | 0 | 0 |
| 51 | P2 | HIGH | email | JUAN FERNANDO RUIZ BERRIO | 94edc673 | b2db3bc5 | 0 | 0 | 0 |
| 52 | P2 | HIGH | email | JOSE BELTRE | 46578f77 | 638bff3b | 0 | 0 | 0 |
| 53 | P2 | HIGH | email | KENNNET GUTIERREZ JAVIER | 06cc24c0 | b946474b | 0 | 0 | 0 |
| 54 | P2 | HIGH | email | YULIANA MIRA | 4f45d9bd | a22db423 | 0 | 0 | 0 |
| 55 | P2 | HIGH | email | JOSE MARCELLO TORO VELASQUEZ | 9017ed68 | ecf08811 | 0 | 0 | 0 |
| 56 | P2 | HIGH | email | ANDRES QUINTERO (ELIMINAR) | 1032ce47 | 97f0f606 | 0 | 0 | 0 |
| 57 | P3 | LOW | name | MIGUEL GONZALEZ | deaff01a | 797a8a56 | 0 | 0 | 0 |
| 58 | P3 | LOW | name | ANA JIMENEZ | ad1a11f8 | 5aae2366 | 0 | 0 | 0 |
| 59 | P2 | HIGH | email | JUAN RODRIGUEZ | 99754d3a | df2e21c3 | 0 | 0 | 0 |
| 60 | P2 | HIGH | email | CAMILO SAENZ | 09e40950 | 2736be49 | 0 | 0 | 0 |
| 61 | P2 | HIGH | email | ADRIANA MARIA SANCHEZ ORJUELA | 7496af53 | 59779574 | 0 | 0 | 0 |
| 62 | P2 | HIGH | email+name | DANNY ORTEGA GABRIEL | 65599e36 | 13a201ad | 0 | 0 | 0 |
| 63 | P2 | HIGH | email+name | JAMES TORRES CAICEDO | 36f51ae5 | 1104657b | 0 | 0 | 0 |
| 64 | P2 | HIGH | email | MATIAS CASTELLANOS GALVEZ | 8eaaa5d3 | ad9ac022 | 0 | 0 | 0 |
| 65 | P2 | HIGH | email+name | MARIANA CRUZ | 9188b527 | c3d530b2 | 0 | 0 | 0 |
| 66 | P3 | LOW | name | JUAN PATINO | d3d17019 | 9a1c1df2 | 0 | 0 | 0 |
| 67 | P2 | HIGH | email | JOAO TOLEDO | 187d4b2c | 46609ea1 | 0 | 0 | 0 |
| 68 | P3 | LOW | name | FRANK HERNANDEZ | 7ee3487b | 9cd4afc7 | 0 | 0 | 0 |
| 69 | P2 | HIGH | email+name | YESID GOMEZ | af1da763 | 43fea37a | 0 | 0 | 0 |
| 70 | P2 | HIGH | email | ALISSON RODRIGUEZ | 3143b645 | be19fa08 | 0 | 0 | 0 |
| 71 | P2 | HIGH | email+name | HECTOR LUIS MARTE PAULINO | 24bfc40e | 69c17444 | 0 | 0 | 0 |
| 72 | P3 | LOW | name | MICHAEL PONCE | 3d6361c9 | 974e0a14 | 0 | 0 | 0 |
| 73 | P3 | LOW | name | JUAN HERNANDEZ | bf842c2c | 3c9eb131 | 0 | 0 | 0 |
| 74 | P2 | HIGH | email | DANIEL VASQUEZ | 3fe991b7 | 3c333290 | 0 | 0 | 0 |
| 75 | P2 | HIGH | email+name | JAIRO SOLIS | 577e022f | 9f80932d | 0 | 0 | 0 |
| 76 | P2 | HIGH | email | JOSÉ FELIPE | d5b88718 | f8dd3540 | 0 | 0 | 0 |
| 77 | P3 | LOW | name | JUAN JOSE MARCANO OLIVO | dae9609d | 96aaa323 | 0 | 0 | 0 |
| 78 | P3 | LOW | name | ALEXANDER RODRIGUEZ | c7f3773b | b93ae5e1 | 0 | 0 | 0 |
| 79 | P3 | LOW | name | JOSUE CABANILLA | f7faaa06 | 52d4d0bd | 0 | 0 | 0 |
| 80 | P2 | HIGH | email | GILBERT INACTIVAR MARTINEZ | 5b58c69d | 162a1d94 | 0 | 0 | 0 |
| 81 | P3 | LOW | name | BAYRON HERNANDEZ | 3ba714cc | d5a78a61 | 0 | 0 | 0 |
| 82 | P3 | LOW | name | JOSE GONZALEZ | 4a87f04d | 01e00930 | 0 | 0 | 0 |
| 83 | P3 | LOW | name | SEBASTIAN ORTIZ | 20c2a82e | 116a516a | 0 | 0 | 0 |
| 84 | P2 | HIGH | email | SEBASTIAN ESPINOSA | 88a0b434 | 87530451 | 0 | 0 | 0 |
| 85 | P3 | LOW | name | JOSE MESA | d58bc32b | 1013 | 0 | 0 | 0 |
| 86 | P2 | HIGH | email+name | SANDRA PINEDA | 22dc42b0 | 9079b024 | 0 | 0 | 0 |

## 8. Riesgo staffing

- El resolver canónico `src/lib/shifts/assignable-workers.ts` descarta como no asignables, en este orden: `is_active=false` → placeholder/system → `employee_role='historical'` → `added_via='Pending approval'`.
- **47 registros canónicos** (activos y con portal) están hoy ocultos del selector solo por la etiqueta heredada `Pending approval`. En **1 grupo** (Sophia) ese ocultamiento coincide con un duplicado visible: el selector no "eligió" ST-1204, simplemente era el único visible.
- En los otros 9 splits el canónico sí es visible; el duplicado también lo es, y el operador eligió el equivocado por ambigüedad de nombre (dos "Julio Velasquez" idénticos en la lista, sin discriminador de portal, horas ni Staff ID).
- Consecuencia: el selector permite hoy elegir un registro sin portal ni identidad verificada como si fuera la persona real.

## 9. Riesgo portal / auth

- 2 grupos tienen más de un `user_id`: Justin Mora (ST-755 y ST-1201 comparten email `jurupingui16@gmail.com` y ambos tienen portal) y el bloque de cuentas "System". Cualquier consolidación futura de Justin Mora exige decidir qué `user_id` sobrevive — **no se tocó nada**.
- En los 8 casos restantes hay exactamente un portal, siempre en el canónico. Los fantasmas nunca tuvieron acceso: por eso las asignaciones colgadas de ellos no podían fichar (mismo mecanismo del caso Carlos Ortiz).

## 10. Riesgo time clock

- **Ningún duplicado tiene time_entries.** Todos los fichajes están en el canónico. Esa es la buena noticia: el reloj nunca se fragmentó.
- El daño es de ausencia: un turno asignado al fantasma es un turno que la persona no ve en su portal y por tanto **no puede fichar**, generando el falso "no marcó entrada".

## 11. Riesgo payroll

- Payroll sigue calculándose sobre `time_entries` reales, que viven íntegramente en el canónico. **No hay horas ni dinero en los duplicados con asignaciones.**
- 2 grupos tienen alguna referencia de payroll en un registro no canónico (herencia de importaciones históricas); requieren revisión humana antes de cualquier consolidación y no deben tocarse mientras existan periodos cerrados.
- No se movió, recalculó ni aprobó nada.

## 12. Origen de los duplicados

Trazabilidad por marca temporal de creación de los 101 registros duplicados:

| Fecha/hora de creación | Duplicados | Lectura |
|---|---|---|
| 2026-03-19 04:37 (1.112 filas en un minuto en total) | 39 | Carga masiva inicial (importación de padrón) |
| 2026-04-23 23:37 / 23:43 | 47 + 4 | Importación de horario nocturna |
| 2026-04-20 19:07 | 6 | Importación de horario (lote de Sophia ST-1204 y Justin ST-1201) |
| 2026-03-06, 2026-05-20, 2026-02-25 | 5 | Casos sueltos |

Campos de trazabilidad: `added_via` es **NULL en 99 de 101** duplicados, `added_by` NULL en 100, `identity_source` NULL en 101, y no existe `import_batches` asociado a esas marcas temporales.

**ORIGIN_NOT_AUDITABLE a nivel de fila**: la fuente se infiere únicamente por el patrón de creación en lotes de un minuto y por el hecho de que el único código que inserta empleados con `first_name`/`last_name`/`is_active` y sin `added_via` es el importador de horarios. No se afirma nada más allá de eso.

## 13. Flujos que todavía pueden crear otro "Sophia 1204"

| Flujo | ¿Puede crear duplicado hoy? | Evidencia |
|---|---|---|
| `src/pages/admin/ImportWizard.tsx` (importación de horario/Connecteam) | **Sí, con alta probabilidad** | Crea un `employees` nuevo cuando el nombre exacto en minúsculas no está en `empMap`. Sin teléfono, sin email, sin fuzzy, sin `added_via`, sin vínculo a `import_batches`. Es el patrón exacto del 2026-04-20/23. |
| `src/pages/admin/Employees.tsx` — alta manual y CSV | **Sí** | `insert` directo sin comprobación de identidad previa contra el padrón. |
| `supabase/functions/import-inactive-employees` | Sí | Inserción masiva de inactivos. |
| `supabase/functions/bulk-import-shifts` | No | Solo hace matching contra `employees` existentes; no inserta personas. |
| Smart Intake (`src/lib/intake/*`) | No | Crea servicios/turnos y usa ELDM para vincular; no inserta empleados. |
| Invitación de portal / signup | Riesgo medio | Vincula `user_id`, pero si la persona ya existe con otro registro puede quedar un segundo canónico (caso Justin Mora, 2 portales). |
| `resolve-applicant-identity` | Mitigante existente | Es el único punto con resolución de identidad real; no cubre importaciones. |

## 14. Plan de remediación recomendado (NO ejecutado)

| Categoría | Casos | Estrategia |
|---|---|---|
| **A. Canónico + duplicado muerto** (sin portal, sin asignaciones, sin horas, sin payroll) | 73 grupos | Consolidación automatizable: marcar `merged_into_employee_id` + desactivar. Sin efectos en payroll. Requiere solo lote reversible y registro en `employee_identity_reviews`. |
| **B. Canónico + duplicado con asignaciones** | 11 grupos / 12 registros | Semiautomático: repuntar `shift_assignments` al canónico solo si el turno es pasado y sin fichaje, o futuro y sin conflicto de doble asignación al mismo servicio. Revisión humana por grupo. |
| **C. Canónico + duplicado con time_entries** | 0 casos hoy | No aplica. Si aparece: bloqueo total, requiere reconciliación de periodo. |
| **D. Múltiples auth users** | 2 grupos (Justin Mora + bloque System) | Solo humano. Decidir portal superviviente, notificar al trabajador, nunca borrar auth. |
| **E. Cross-tenant** | 0 | No aplica en este alcance. Repetir la auditoría por tenant antes de cualquier consolidación global. |
| **F. Identidad ambigua** (solo nombre, sin actividad) | 50 grupos LOW | No consolidar. Enviar a cola de revisión con evidencia; muchos son homónimos reales (ej. dos "SEBASTIAN ORTIZ" con teléfonos y emails distintos). |

Prerrequisitos antes de cualquier fix:
1. Cerrar el flujo de importación (bloqueo de creación sin resolución de identidad) — si no, se vuelven a generar.
2. Corregir la visibilidad del selector: un canónico con portal y horas no puede quedar oculto por `Pending approval` mientras un fantasma sin portal sí aparece.
3. Registrar cada decisión en `employee_identity_reviews` (hoy: 0 filas, sin historial de decisiones).

## 15. Qué NO se tocó

auth · RLS · límites de tenant · payroll · `time_entries` · `shift_assignments` · `scheduled_shifts` · documentos · vínculos de portal · datos de producción · registros reales de trabajadores · servicios activos.
Cero DELETE, cero MERGE, cero ARCHIVE, cero UPDATE, cero limpieza de datos. Únicamente `SELECT`.

---

## Cierre obligatorio

- **¿Cuántos casos tipo Sophia existen?** **10** grupos CRITICAL_IDENTITY_SPLIT.
- **¿Cuántos registros duplicados usa hoy Staffing?** **12** registros duplicados con asignaciones, en 11 grupos.
- **¿Cuántos tienen portal en un employee y assignments en otro?** Los mismos **10** grupos (los 12 registros anteriores menos 2 duplicados sin split confirmado).
- **¿Cuántos afectan time_entries?** **0**: todos los fichajes están en el canónico. El impacto es imposibilidad de fichar, no horas partidas.
- **¿Cuántos afectan payroll?** **2** grupos con referencias de payroll fuera del canónico. Ningún cálculo actual está mal: payroll sigue las horas reales.
- **¿Fuente principal de duplicados?** Las importaciones masivas de horario/Connecteam (lotes de 2026-03-19, 2026-04-20 y 2026-04-23), que crean empleados por coincidencia exacta de nombre y sin trazabilidad (`added_via`, `added_by`, `identity_source` en NULL).
- **¿Existe hoy un flujo capaz de seguir creando duplicados?** **Sí**: `ImportWizard` (crítico), alta manual y CSV en Employees, e `import-inactive-employees`. Ninguno consulta identidad existente por teléfono/email/similitud.
- **¿Caso por caso o estrategia masiva?** **Ambas, por categoría.** Los 73 duplicados muertos admiten un lote automatizado y reversible. Los 10 splits y los 2 casos de payroll/portal múltiple exigen revisión humana individual. Y nada debe consolidarse antes de cerrar el flujo de importación: limpiar sin cerrar la puerta reproduce el problema en la próxima importación.
