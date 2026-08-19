# P0 — Connecteam vs Stafly · Reconciliación de programación Agosto 2026

**Tenant:** Quality Staff by Keury (`00000000-0000-0000-0000-000000000001`)
**Modo:** AUDIT ONLY · CERO ESCRITURAS · CERO DESARROLLO
**Fecha de auditoría:** 19 Ago 2026
**Fuentes:**
- A. `Schedule-Export_2026-07-29_to_2026-09-01_1.xlsx` (Connecteam, 3.291 filas)
- B. `stafly-connecteam-shifts-2026-08-19.csv` (export Stafly, 69 filas · usado sólo como contraste)
- C. Base de datos real Stafly (SELECT únicamente: `scheduled_shifts`, `shift_assignments`, `employees`, `clients`)

> Convención del reporte: **[H]** = hecho observado · **[I]** = inferencia · **[R]** = recomendación.

---

## 1. Executive summary

**[H]** Reconstruidas las unidades operacionales reales:

| | Connecteam | Stafly |
|---|---|---|
| Servicios operacionales (agosto) | **108** | **27** registros (23 raíz + 4 segmentos) |
| Worker-rows / asignaciones activas | **429** | **109** |
| Fechas con operación | **26** (1–31 Ago) | **14** |
| Personas distintas programadas | 54 (incluye `OPEN SHIFT` y `SYSTEM n`) | — |

**[H]** Resultado de la reconciliación 1:1 sobre las **108 unidades de Connecteam**:

| Clasificación | # | % |
|---|---|---|
| MATCHED | **11** | 10,2 % |
| TIME_MISMATCH | **6** | 5,6 % |
| STAFFING_MISMATCH | **5** | 4,6 % |
| LOCATION_MISMATCH | 0 (no evaluable de forma aislada, ver §7) | — |
| STATUS_MISMATCH | 0 aislado (absorbido en STAFFING_MISMATCH, ver §7) | — |
| NEEDS_HUMAN_REVIEW | **12** | 11,1 % |
| MISSING_IN_STAFLY | **74** | 68,5 % |

**[H]** Cobertura operacional = 22/108 = **20,4 %** de servicios de Connecteam tienen contraparte identificable en Stafly; sólo **11 (10,2 %)** están representados sin discrepancia.
**[H]** Cobertura de dotación = 109/429 = **25,4 %** de las asignaciones persona-servicio.

**VEREDICTO: 🔴 NOT PARITY.** Falta programación operacional material: dos tercios de los servicios reales de agosto no existen en Stafly, y el componente **PAY RIDE (17 servicios de transporte)** no está representado en absoluto.

---

## 2. Metodología de matching

**[H]** Pasos aplicados, en orden:

1. **Filtrado de ruido Connecteam.** De 2.913 filas de agosto sólo **429** tienen `Job` o `Shift title`. Las 2.484 restantes son filas de *disponibilidad* (`All Day`, sin job) — no son turnos. **[I]** Contarlas como turnos habría inflado artificialmente el denominador.
2. **Reconstrucción de la unidad operacional.** Connecteam repite una fila por worker. Se agrupó por `(fecha, start, end, shift title, job)` → **108 servicios**. `Users` se colapsó en la lista de personas y `n` en el headcount real.
3. **Normalización de horas** a 24 h y de nombres de cliente (quitando prefijos numéricos tipo `12 - `, acentos y puntuación).
4. **Emparejamiento por evidencia progresiva y puntuada**, con asignación **1:1 codiciosa** (un servicio Stafly no puede absorber dos de Connecteam):
   - QK/`shift_ref` coincidente en título o job → +20
   - Δ inicio ≤ 15 min → +5 · Δ ≤ 120 min → +2
   - Cliente coincidente (token o inclusión) → +4
   - Umbral de aceptación: **score ≥ 6** (evita matches forzados por sola cercanía horaria).
5. **Clasificación**: MATCHED si Δ inicio ≤ 15 min y headcount coincide; TIME_MISMATCH si Δ > 15 min; STAFFING_MISMATCH si headcount o publicación divergen; NEEDS_HUMAN_REVIEW cuando hay actividad Stafly ese día pero la evidencia no alcanza el umbral; MISSING_IN_STAFLY cuando no hay ningún candidato.

**[H] Denominador de cobertura utilizado:** las **108 unidades operacionales reconstruidas de Connecteam**, no las 429 filas ni las 69 del CSV de Stafly. Comparar 69 filas CSV / 108 servicios daría un falso 64 %.

**[H]** Roots/segments considerados: en Stafly hay 4 registros con `parent_shift_id` (QK-001657, QK-001659, QK-001660, QK-001661). Se tratan como unidades operacionales propias porque tienen horario y dotación distintos, pero se documenta su raíz.

---

## 3. Métricas reales

**Connecteam (agosto 2026)** — [H]
- 429 filas de turno · 108 servicios reconstruidos · 26 fechas
- 54 identidades distintas (52 personas + `OPEN SHIFT` + `SYSTEM n` como marcadores)
- Clientes activos: NEW CONSTUMER (23), PAY RIDE (17), EMMINENCE HALL (13), ELUM FRANKLHALL (8), YF PRODUCTIONS (7), J EVENTS (7), ELY PRODUCCION (6), SPARK NEW YORK (5), SHOIMY (5), IMPERIAL HALL (4), BOOSER (3), LUMINANCE HALL (3), MANACHEM EVENTS (2), THE MILENIUM SIMCHA (2), TABLE 40 (2), OCCASIONS EVENTS (1)
- `Draft = Yes`: 10 filas · `Draft = No`: 419

**Stafly (agosto 2026, Quality Staff)** — [H]
- 27 servicios vivos (`deleted_at IS NULL`) · 14 fechas · 109 asignaciones activas
- Publicación: 22 `published`, 5 `draft` (QK-001657, QK-001662, QK-001663, QK-001668, QK-001669)
- Claimable: 8 · Con `job_site_address`: 12 de 27
- 1.420 fichas de empleado en el tenant, 200 con acceso a portal, 203 activas

---

## 4. Tabla MATCHED (11)

| Fecha | Connecteam | Stafly QK | Cliente | Headcount CT / Stafly |
|---|---|---|---|---|
| 08-10 | 16:00–21:00 ELUM FRANKLHALL | QK-001592 | ELUM FRANKL HALL | 6 / 6 |
| 08-11 | 16:00–21:00 ELUM FRANKLHALL | QK-001602 | ELUM FRANKL HALL | 6 / 6 |
| 08-12 | 16:00–21:00 ELUM FRANKLHALL | QK-001603 | ELUM FRANKL HALL | 6 / 6 |
| 08-13 | 16:00–21:00 ELUM FRANKLHALL | QK-001604 | ELUM FRANKL HALL | 6 / 6 |
| 08-17 | 15:00–23:59 EMMINENCE HALL | QK-001651 | EMMINENCE HALL | 8 / 8 |
| 08-17 | 16:00–21:00 ELUM FRANKLHALL | QK-001652 | ELUM FRANKL HALL | 6 / 6 |
| 08-18 | 00:08–00:09 IMPERIAL HALL | QK-001579 | IMPERIAL HALL | 1 / 1 |
| 08-18 | 17:30–23:31 LUMINANCE HALL | QK-001578 | LUMINANCE HALL | 5 / 5 |
| 08-28 | 17:00–23:00 IMPERIAL HALL | QK-001605 | IMPERIAL HALL | 1 / 1 |
| 08-30 | 17:00–23:00 IMPERIAL HALL | QK-001581 | IMPERIAL HALL | 1 / 1 |
| 08-31 | 17:00–23:00 IMPERIAL HALL | QK-001582 | IMPERIAL HALL | 1 / 1 |

**[I]** El bloque realmente sano es la serie recurrente **ELUM FRANKL HALL 16:00–21:00** y la serie **IMPERIAL HALL 17:00–23:00**. Fuera de esas dos series, la paridad es marginal.

---

## 5. Tabla PARTIAL (mismatches, 11)

### TIME_MISMATCH (6) — [H]

| Fecha | Connecteam | Stafly | Δ |
|---|---|---|---|
| 08-12 | 14:30–23:30 SHOIMY (2p) | QK-001644 09:00–00:00 | 5 h 30 |
| 08-13 | 10:30–19:00 SHOIMY (4p) | QK-001645 09:00–00:00 | 1 h 30 |
| 08-18 | 07:00–09:01 TABLE 40 (18p) | QK-001646 09:00–09:01 | 2 h |
| 08-24 | 11:00–21:00 J EVENTS (6p) | QK-001647 09:00–09:01 | 2 h |
| 08-27 | 17:30–22:30 J EVENTS (2p) | QK-001668 13:00–17:00 | 4 h 30 |
| 08-28 | 20:00–23:59 J EVENTS (2p) | QK-001669 08:00–17:00 | 12 h |

**[I]** QK-001644/45/46/47 usan horas *placeholder* (`09:00–09:01`, `09:00–00:00`) heredadas de un import previo. El horario real vive sólo en Connecteam. Un worker que abra el portal ve una hora falsa.

### STAFFING_MISMATCH (5) — [H]

| Fecha | Connecteam | Stafly | Detalle |
|---|---|---|---|
| 08-13 | 18:00–23:59 SHOIMY (12p) | QK-001660 (segmento de raíz) | 12 slots / 8 asignados |
| 08-17 | 15:00–22:30 EMMINENCE (3p) | QK-001657 | **draft**, 8 slots, 0 asignados |
| 08-30 | 17:00–23:30 THE MILENIUM SIMCHA (1p) | QK-001606 | 1 slot, **0 asignados** |
| 08-30 | 17:30–22:00 EMMINENCE (1p) | QK-001662 | **draft**, `slots` nulo, 17:30–17:30, 0 asignados |
| 08-31 | 17:30–22:00 EMMINENCE (1p) | QK-001663 | **draft**, `slots` nulo, 17:30–17:30, 0 asignados |

**[H]** QK-001662 y QK-001663 tienen `start_time = end_time = 17:30` y `slots` vacío: registros incompletos, no operables.

---

## 6. MISSING_IN_STAFLY (74)

**[H]** Días con operación real en Connecteam y **cero** contraparte en Stafly:
`08-02, 08-03, 08-04, 08-05, 08-06, 08-07, 08-08, 08-09, 08-16, 08-19, 08-20, 08-25, 08-29` (13 de 26 fechas).

**[H]** Faltantes por cliente (servicios sin ninguna contraparte):

| Cliente Connecteam | Servicios faltantes | Nota |
|---|---|---|
| 12 - NEW CONSTUMER | 22 | serie diaria 16:00–21:00 / 17:30–22:30 |
| 99 - PAY RIDE | 15 | componente de transporte, ver §7 |
| 01 - EMMINENCE HALL | 7 | además de los 4 parciales |
| 14 - YF PRODUCTIONS | 6 | |
| SPARK NEW YORK | 5 | cliente existe en Stafly, sin servicios de agosto |
| 02 - ELY PRODUCCION | 5 | sólo QK-001573 (01-Ago) existe |
| BOOSER | 3 | |
| 03 - J EVENTS | 3 | |
| MANACHEM EVENTS | 2 | **cliente inexistente en Stafly** |
| ELUM FRANKLHALL | 2 | 08-19 y 08-20 (rompe la serie recurrente) |
| LUMINANCE HALL, TABLE 40, OCCASIONS, MILENIUM, SHOIMY | 4 | sueltos |

**[H]** Servicio de alto volumen no representado: **02 - ELY PRODUCCION 08-06 16:00–22:30 con 18 personas** y **08-02 09:00–09:01 con 24 personas**.

---

## 7. Mismatches por dimensión

**LOCATION** — [H] 15 de 27 servicios Stafly de agosto no tienen `job_site_address`; en Connecteam la dirección viaja en texto libre y también falta en varias filas. **[I]** No es posible clasificar LOCATION_MISMATCH de forma independiente sin resolver antes el destino canónico; se reporta como riesgo, no como categoría contada. Casos concretos: QK-001579 y QK-001605/81/82 tienen `job_site_address = "Imperial"` (texto libre, no geocodificable); QK-001646, QK-001647, QK-001651, QK-001578 no tienen dirección alguna, mientras Connecteam sí la trae en varios de esos servicios.

**STATUS** — [H] Connecteam marca `Draft = Yes` en 10 filas; Stafly tiene 5 borradores. No hay solape entre ambos conjuntos: los borradores de Stafly (QK-001657/662/663/668/669) están publicados en Connecteam. **[I]** Esto es un STATUS_MISMATCH real, contabilizado dentro de STAFFING_MISMATCH/TIME_MISMATCH para no duplicar el conteo de la misma unidad.

**PAY RIDE** — [H] 17 servicios de transporte en Connecteam (`99 - PAY RIDE`), del 02 al 28 de agosto, con 1–5 conductores cada uno (Carlos Alvarez, Keury Camilo, Jorge Cortes, William Rodriguez, Luis F Buritica, Cristian Contreras, Jose Diaz, Jeancarlos Ortiz, Sebastian Villegas). **[H]** No existe cliente ni servicio "PAY RIDE" en Stafly; sólo 4 servicios de agosto tienen `transportation_required = true`. **[I]** El componente de transporte remunerado no está modelado en Stafly como unidad facturable/pagable: hoy es invisible para payroll y para el trabajador.

---

## 8. Worker reconciliation

**[H]** 54 identidades distintas en la programación de agosto de Connecteam:

| Resultado | # | Detalle |
|---|---|---|
| Resuelve a **una** ficha canónica en Quality Staff | **29** | asignación segura |
| **Ambiguo** — más de una ficha con el mismo nombre normalizado | **25** | requiere decisión humana |
| Sin ninguna ficha | **0** | — |

**[H]** Nombres ambiguos (fichas duplicadas en el tenant): Alejandro Solano, Alejandro Tzorin, Alison Vargas, Anderson Vargas, Andres Vargas, Angel Colon, **Carlos Alvarez**, Daniel Ochoa, Danna S Prieto, Emilio Quisquina, Felix Yacon, Francisco Patino, Jesus Alpacaja, Julio Velasquez, **Keury Camilo**, Luis Duta, Maria Sanabria, Mariany Ortiz, Peter Sanisaca, Santiago Morales, **Sophia Contreras**, `SYSTEM`, William Guerrero, William Hernandez, **William Rodriguez**.

**[H]** Marcadores no-persona presentes en la programación real: `OPEN SHIFT` (1 ficha creada en Stafly con ese nombre) y `SYSTEM 1…SYSTEM 40` (usados por Kevin/Cristian como cupos anónimos).

**[H]** Cobertura de acceso: 200 de 1.420 fichas de Quality Staff tienen `user_id` (portal). **[I]** Aunque se completara la programación, la mayoría de los trabajadores programados no podría consultarla desde el portal si su ficha no es la canónica con `user_id`.

**Assignments faltantes** — [H] 429 − 109 = **320 relaciones persona-servicio** existen en Connecteam y no en Stafly. No se ha reparado ninguna.

---

## 9. Casos ambiguos (NEEDS_HUMAN_REVIEW, 12)

**[H]** Hay actividad de Stafly ese día, pero la evidencia no permite decidir:

| Fecha | Connecteam | Contexto |
|---|---|---|
| 08-13 | 12:00–22:00 PAY RIDE (2p) | ¿componente de QK-001645/660 o servicio propio? |
| 08-13 | 16:00–23:59 LUMINANCE HALL (1p) | Stafly no tiene Luminance ese día |
| 08-13 | 16:30–23:59 SHOIMY (10p) | posible segundo segmento de QK-001660 |
| 08-13 | 18:00–23:59 PAY RIDE (4p) | transporte del evento SHOIMY |
| 08-17 | 16:30–23:59 EMMINENCE (1p) | ¿segmento de QK-001651? |
| 08-17 | 18:00–23:59 EMMINENCE (20p) | **20 personas**; QK-001651 sólo cubre 8 |
| 08-18 | 09:00–09:01 PAY RIDE (4p) | transporte de QK-001646 |
| 08-18 | 16:00–21:00 ELUM FRANKLHALL (7p) | rompe la serie: no hay QK ese día |
| 08-24 | 09:00–09:01 PAY RIDE (2p) | |
| 08-27 | 17:30–22:30 PAY RIDE (1p) | |
| 08-28 | 17:30–22:30 J EVENTS (2p) | QK-001669 ya tomado por el grupo 20:00 |
| 08-28 | 17:30–22:30 PAY RIDE (2p) | |

**[H]** Servicios Stafly sin contraparte en Connecteam (5): QK-001573 (01-Ago ELY PRODUCCION 12:00–23:30, 23 slots/13 asignados), QK-001649 (11-Ago NEW CONSTUMER 01:20–06:30, dirección en **Minnesota**), QK-001659 (segmento SHOIMY 12-Ago), QK-001658 y QK-001661 (Weekend Job / Ammy, 14 y 15 Ago).
**[I]** QK-001649 con dirección en Bloomington, Minnesota para un tenant que opera en NY es dato sospechoso; QK-001658/661 (cliente "Ammy") parecen trabajos reales gestionados sólo en Stafly, no en Connecteam.

**[H]** El servicio 08-17 18:00–23:59 EMMINENCE con 20 personas es, en volumen, el mayor gap no clasificado de la ventana.

---

## 10. Priorización

### P0 — operación inmediata (hoy 19 Ago en adelante)
1. **08-19 · ELUM FRANKLHALL 16:00–21:00 (6p)** — hoy mismo, no existe en Stafly.
2. **08-20 · 6 servicios** (ELUM FRANKL, NEW CONSTUMER ×2, YF PRODUCTIONS ×2, PAY RIDE) — mañana, ninguno existe.
3. **QK-001668 / QK-001669 (J EVENTS 27–28 Ago)** — en **draft** y con horarios que no coinciden con Connecteam (Δ 4,5 h y 12 h).
4. **QK-001662 / QK-001663 (30–31 Ago)** — draft con `start = end` y `slots` nulo: no publicables tal cual.
5. **08-24 / 08-25 J EVENTS 11:00–21:00 (6p c/u)** — el 24 existe con hora placeholder, el 25 no existe.
6. **PAY RIDE del 20, 24, 27 y 28** — transporte sin representación.

### P1 — cerrar agosto
- Los 74 MISSING del 01–18 de agosto (histórico del mes en curso, necesario para payroll y facturación).
- Los 6 TIME_MISMATCH: corregir horas placeholder `09:00–09:01` / `09:00–00:00`.
- Los 320 assignments faltantes.
- Cliente **MANACHEM EVENTS** inexistente en Stafly.

### P2 — decisión humana / legacy
- 25 identidades ambiguas por fichas duplicadas.
- Marcadores `SYSTEM n` y `OPEN SHIFT`: decidir si se modelan como slots abiertos (`claimable`) o se descartan.
- QK-001649 (dirección Minnesota) y QK-001573 (23 slots / 13 asignados) — verificar validez.
- Duplicados de cliente en Stafly: `21 * PASSOVER` ×2, `NEW CONSTUMER` ×2, `EMMINENCE HALL`/`Emmincence`, `THE MILENIUM SIMCHA`/`The Millennium Simcha Hall`.

---

## 11. Qué ya puede operarse exclusivamente en Stafly

**[H]** Sólo dos series están completas y publicadas con dotación correcta:
- **ELUM FRANKL HALL 16:00–21:00** del 10 al 13 y el 17 de agosto (5 servicios, 30 asignaciones).
- **IMPERIAL HALL 17:00–23:00** del 28, 30 y 31 de agosto (3 servicios).
- Además: QK-001651 (Emminence 17-Ago, 8/8), QK-001578 (Luminance 18-Ago, 5/5), QK-001579 (Imperial 18-Ago).

**[I]** Para esos 11 servicios, Jorge/Keury no necesitan Connecteam.

---

## 12. Qué todavía obliga a abrir Connecteam

**[H]**
1. **13 de 26 fechas del mes** no tienen ningún servicio en Stafly.
2. **Toda la operación del 1 al 9 de agosto** (excepto QK-001573).
3. **NEW CONSTUMER**, el cliente de mayor frecuencia (23 servicios), está prácticamente ausente.
4. **PAY RIDE**: los 17 servicios de transporte y sus conductores.
5. **Horarios reales** de SHOIMY, TABLE 40 y J EVENTS (en Stafly son placeholders).
6. **Direcciones/punto de encuentro** de 15 servicios.
7. **320 asignaciones persona-servicio**.
8. Notas operativas críticas que hoy sólo viven en el campo `Note` de Connecteam (puntos de encuentro por barrio, uniformes, parking).

---

## 13. Recomendación operacional

**[R]** No proponer un importador nuevo: existe ya la infraestructura de import (`import_batches`, `normalized_schedule_rows`, `raw_schedule_import_rows`) y el motor de reconciliación (`reconciliation_*`). La brecha es de **datos**, no de capacidad.

**[R]** Secuencia sugerida, cada paso con autorización previa y explícita:
1. **Cerrar la ventana viva primero** (19–31 Ago): 20–25 servicios. Es lo único que afecta a trabajadores hoy.
2. **Decidir el modelo de PAY RIDE** antes de cargar nada: ¿cliente propio, segmento del servicio, o `transportation_required` + `driver_employee_id`? Cargarlo mal contamina payroll.
3. **Sanear horarios placeholder** (`09:00–09:01`, `09:00–00:00`, `start = end`) — hoy mienten al trabajador en el portal.
4. **Resolver las 25 identidades ambiguas** antes de crear assignments; de lo contrario se consolidan duplicados.
5. **Backfill del 1–18 de agosto** al final, con marca de origen, para cerrar payroll y facturación.
6. **Regla de corte**: fijar una fecha desde la cual toda programación nueva nace en Stafly. Sin corte, el gap se reabre cada semana.

**[R]** Métrica de salida para declarar paridad: cobertura de servicios ≥ 95 % y de asignaciones ≥ 95 % sobre el denominador de unidades reconstruidas de Connecteam, con cero horarios placeholder en la ventana viva.

---

## Confirmación de seguridad

**[H]** Esta auditoría ejecutó exclusivamente sentencias `SELECT` sobre `scheduled_shifts`, `shift_assignments`, `employees`, `clients` e `information_schema`. Cero INSERT / UPDATE / DELETE / UPSERT. Cero migraciones. Cero RPC de escritura. Cero edge functions. Ningún registro fue corregido, creado ni eliminado. Ningún archivo de aplicación fue modificado.

**VEREDICTO FINAL: 🔴 NOT PARITY** — 20,4 % de cobertura de servicios y 25,4 % de asignaciones. A la espera de autorización para el siguiente paso.
