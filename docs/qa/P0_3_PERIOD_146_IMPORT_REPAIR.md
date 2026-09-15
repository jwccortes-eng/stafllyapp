# P0.3 — CONTROLLED REPAIR OF MISASSIGNED PAYROLL IMPORT (PERIOD 146)

Modo: preflight de solo lectura primero, según el spec.
**Resultado: la premisa de la reparación no se sostiene. NO se ejecutó ninguna mutación.**

---

## Resumen ejecutivo

La verificación previa (Fase 1 + Fase 3) demuestra que **el período 146 de Quality Staff by
Keury ES exactamente Aug 19 – Aug 25, 2026**, es decir el período canónico correcto para el
archivo `146 UNTITLED_REPORT_2026-08-19_2026-08-25.xlsx`.

No hubo período equivocado. El archivo entró donde correspondía. El único defecto real fue
que el período **ya estaba cerrado** cuando se importó — exactamente el agujero que los
guardarraíles P0.2 ya cerraron.

Por tanto **no existe importación mal asignada que reparar** y cualquier movimiento de esas
26 filas a otro período crearía el error que esta tarea pretendía corregir. Se detuvo antes
de escribir, conforme a la regla «Do not proceed if the 26 rows cannot be isolated safely».

## 1. SOURCE IMPORT BATCH

| Campo | Valor |
| --- | --- |
| Nombre del archivo | `146 UNTITLED_REPORT_2026-08-19_2026-08-25.xlsx` |
| Rango del archivo | 2026-08-19 → 2026-08-25 |
| Fecha/hora de importación | 2026-09-14 21:39:19 UTC |
| Registro de auditoría | `activity_log` id `20ecc5c9-ead2-4307-9aee-f6b87dd5d25f`, acción `import_external_approved_payroll` |
| Operador | `user_id` `e5495b59-8b80-471d-bd64-eec9ea7b1ccb` |
| Compañía / tenant | Quality Staff by Keury · `00000000-0000-0000-0000-000000000001` |
| Período destino | `86b967e5-7602-4712-be3e-f5c0665c8be2` (146) |
| Trabajadores | 26 |
| Total aprobado | $15.714,14 |
| Filas base escritas | 26 |
| Movimientos insertados | 20 |

**No existe identificador canónico de lote de importación.** El bridge de cierre externo no
escribe en `imports` ni en `payroll_import_batches`; su única traza es la fila de
`activity_log` anterior. Las filas de `period_base_pay` y `movements` no llevan columna de
`import_batch_id`, por lo que se aislarían solo por `period_id` + `created_at`.

## 2. WRONG PERIOD

**No lo hay.** El período 146 es:

| Campo | Valor |
| --- | --- |
| ID | `86b967e5-7602-4712-be3e-f5c0665c8be2` |
| Compañía | Quality Staff by Keury |
| Fechas | 2026-08-19 → 2026-08-25 |
| Estado | closed |

Las fechas del período **coinciden al día** con las del archivo.

## 3. CANONICAL CORRECT PERIOD

Resolviendo por fechas (`start_date='2026-08-19' AND end_date='2026-08-25'`), sin asumir
número de período, hay tres períodos con ese rango en todo el sistema, uno por compañía:

| Período | Compañía | Estado |
| --- | --- | --- |
| `86b967e5-…` (146) | **Quality Staff by Keury** | closed |
| `e6309165-…` | otra compañía (`876d404e-…`) | closed |
| `bfbef633-…` | otra compañía (`37f92f75-…`) | closed |

El único válido para este tenant es **`86b967e5-7602-4712-be3e-f5c0665c8be2` = período 146**,
que es precisamente donde ya están los datos. El destino correcto y el destino actual son el
mismo registro.

La secuencia semanal confirma la correspondencia sin ambigüedad:

| Período | Rango | Archivo importado |
| --- | --- | --- |
| 142 | Jul 22–28 | `142 …2026-07-22_2026-07-28.xlsx` |
| 143 | Jul 29–Ago 4 | `143 …2026-07-29_2026-08-04.xlsx` |
| 144 | Ago 5–11 | `144 …2026-08-05_2026-08-11.xlsx` |
| 145 | Ago 12–18 | `145 …2026-08-12_2026-08-18.xlsx` |
| 146 | **Ago 19–25** | `146 …2026-08-19_2026-08-25.xlsx` |
| 147 | Ago 26–Sep 1 | *(sin importar)* |

El período 147 (Ago 26 – Sep 1) está vacío porque **esa semana aún no se ha importado**, no
porque su contenido se haya desviado a otro sitio.

## 4. 26 WORKER ROWS

26 filas en `period_base_pay`, 26 empleados distintos, sin duplicados dentro del período:
Jesus Alpacaja, Carlos Alvarez, Luis F Buritica, Keury Camilo, Sophia Contreras, Alejandro
Cortes, Jorge Cortes, Luis Duta, Claudia Grisales, William Hernandez, Jonathan Jalil, Jorge
Jalil, Jeiber Lopez, Santiago Morales, Carlos Ortiz, Mariany Ortiz, Francisco Patiño,
William Rodriguez, Dannyerson Rojas, Maria Sanabria, Arley Sanchez, Peter Sanisaca,
Alejandro Tzorin, Andres Vargas, Anderson Vargas, Kevin Velasquez.

## 5. $15,714.14 RECONCILIATION

| Concepto | Valor |
| --- | --- |
| Suma `approved_total_override` en el período 146 | **$15.714,14** |
| Total del archivo registrado en auditoría | **$15.714,14** |
| Diferencia | **$0,00** |
| Suma `base_total_pay` | $10.656,14 |
| Movimientos del período | 22 filas (20 de esta importación), $4.478,00 |

El total cuadra al centavo con el archivo y con la auditoría del día de la importación.

## 6. TABLES AFFECTED

Tablas que contienen datos de esta importación: `period_base_pay` (26 filas),
`movements` (20 de las 22 del período), `activity_log` (1 fila de auditoría).
No hay filas en `imports`, `payroll_import_batches`, `import_rows` ni tablas históricas.

**Tablas modificadas en esta tarea: ninguna.**

## 7. DOWNSTREAM DEPENDENCY CHECK

| Dependencia | Resultado |
| --- | --- |
| Recibos publicados (`pay_statements` published) | **0** |
| Recibos de cualquier estado en el período | **0** |
| Totales congelados de trabajador | 0 |
| Historial de pagos visible al trabajador | 0 registros |
| Snapshots de nómina aprobados | 0 |
| Exportaciones de pago | 0 |
| Transacciones de pago | 0 |
| `movements` ligadas a un recibo | 0 |
| `time_entries` / `scheduled_shifts` / `shift_assignments` / tarifas | sin relación; el bridge no los escribe |

Cero dependencias ejecutadas financieramente. Ningún trabajador ha visto estos importes.

## 8. REPAIR METHOD

**Ninguna.** La reparación se detuvo en el preflight porque el diagnóstico de partida era
incorrecto: no hay asignación errónea. Mover estas 26 filas al período 147 (Ago 26 – Sep 1)
habría introducido un error real de nómina de $15.714,14 en una semana que no corresponde.

Lo que sí queda registrado como defecto genuino, ya mitigado por P0.2: la importación se
ejecutó sobre un período **cerrado**. A partir de ahora esa misma operación queda bloqueada
en el servidor.

No se creó ninguna vía de excepción, ni reapertura de períodos, ni bypass administrativo:
no hizo falta, y el spec prohíbe crearlo sin necesidad.

## 9. AUDIT TRAIL PRESERVED

Intacto y sin tocar: `activity_log` `20ecc5c9-ead2-4307-9aee-f6b87dd5d25f` conserva fecha de
importación, período destino, nombre del archivo, operador, número de trabajadores y totales.

## 10. BEFORE / AFTER COUNTS

| Métrica | Antes | Después |
| --- | --- | --- |
| Período 146 · filas base | 26 | 26 |
| Período 146 · aprobado | $15.714,14 | $15.714,14 |
| Período 146 · movimientos | 22 | 22 |
| Período 146 · recibos | 0 | 0 |
| Período 147 · filas | 0 | 0 |
| Período 142 · filas base | 50 | 50 |

Sin cambios porque no se escribió nada.

## 11. DUPLICATE CHECK

Dentro del período 146: 26 filas / 26 empleados distintos → sin duplicados. 22 de esos
empleados también tienen fila en el período 145 (Ago 12–18), lo cual es normal: son las
mismas personas en semanas consecutivas, no una duplicación.

Si se hubieran movido las filas al período 147 se habría creado una colisión conceptual con
la futura importación de esa semana.

## 12. PERIOD 142 REGRESSION

| Métrica | Valor |
| --- | --- |
| Filas base | 50 |
| Movimientos | 58 |
| Aprobado | **$28.418,24** |
| Calculado (auditoría del día del import) | **$28.965,24** |
| Diferencia | **−$547,00** |
| Recibos publicados | 5 |

Sin cambios. Solo lectura.

## 13. NORMAL GUARDRAILS REGRESSION

Los guardarraíles de P0.2 siguen activos y sin debilitar: rango del archivo distinto del
período → bloqueo; período `closed`/`paid`/`locked` → bloqueo; período con recibos publicados
→ bloqueo. La suite `src/lib/payroll/__tests__/import-period-guard.test.ts` (7 pruebas) sigue
verde y no se ha alterado ninguna de las tres reglas.

Nota sobre la Regla 1: dado que 146 = Aug 19–25, si hoy se reintentara ese mismo archivo, la
validación de rango lo **aceptaría** y sería la regla de período cerrado la que lo detendría.
Comportamiento correcto.

## 14. PRODUCTION WRITES PERFORMED

**Cero.** Ningún insert, update ni delete. Ninguna migración. Ningún recibo publicado.
Ninguna notificación enviada. Ningún período reabierto.

Cambios en este turno: solo documentación — este informe y la corrección del diagnóstico
erróneo en `docs/qa/P0_2_PAYROLL_IMPORT_GUARDRAILS.md`.

## 15. REMAINING RISKS

1. **Sin identificador de lote.** Si algún día hace falta revertir una importación concreta,
   hoy solo se puede aislar por `period_id` + marca de tiempo. Añadir un `import_batch_id` a
   `period_base_pay`/`movements` haría posible una reversión limpia.
2. **Período 147 pendiente.** La semana Ago 26 – Sep 1 sigue sin datos y el período ya está
   cerrado: importarla requerirá el flujo privilegiado de reapertura, aún inexistente.
3. **Escritura sobre período cerrado ya consumada.** Los datos de 146 entraron fuera de
   proceso. Son correctos y nadie los ha visto, pero conviene una revalidación humana del
   cierre de esa semana antes de publicar recibos.
4. **Falta flujo de reapertura.** Con 153 períodos cerrados, cualquier corrección legítima
   sigue bloqueada hasta que exista ese flujo administrativo acotado.

---

🟡 REPAIR BLOCKED — DATA REQUIRES HUMAN RECONCILIATION
