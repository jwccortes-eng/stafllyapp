# P0 — PERIOD 148 PAYROLL RECONCILIATION (READ-ONLY)

**Fecha:** 2026-09-15 · **Modo:** READ-ONLY · **Escrituras de producción:** 0
**Compañía:** Quality Staff by Keury (`00000000-0000-0000-0000-000000000001`)

---

## OPERATOR ANSWER (resumen directo)

```
PERIOD 148  (Sep 2 – Sep 8, 2026)

Source total:              NO SOURCE FILE PERSISTED  (no import record exists)
Stafly comparable total:   $0.00
Difference:                = 100% of whatever the source file contains

Workers matching:          0
Workers with differences:  0
Stafly only:               0
Source only:               unknown (file not persisted by any import)
Unmatched:                 0
```

**El período 148 no "descuadra" por un error de cálculo: está literalmente vacío.**
No existe ninguna fila en `period_base_pay`, ningún `movements`, ningún `time_entries`,
ningún recibo, y ningún registro de importación para ese período. Cualquier comparación
contra un archivo fuente arroja una diferencia igual al 100% del archivo, porque el lado
Stafly es cero.

### ⚠️ HALLAZGO QUE CONTRADICE LA PREMISA — REPORTADO DE INMEDIATO

El período **147 NO está sin publicar**. Hay **2 recibos publicados** el
2026-09-15 a las 02:11 UTC (minutos antes de esta auditoría):

| employee_id | frozen_base | frozen_extras | frozen_total | published_at |
|---|---|---|---|---|
| `72dfc8f8-b1f8-4b93-959f-c895bc3ba593` | 176.00 | 0.00 | **176.00** | 02:11:03 UTC |
| `482e78ca-d42b-4e12-86f5-6963c3012e61` | 762.00 | 1510.00 | **2272.00** | 02:11:14 UTC |

Total ya visible para trabajadores en 147: **$2,448.00** (2 de 60 personas).
No se revocó nada. Se reporta tal cual, sin mutación.

### TOP DIFFERENCES

No existe matriz de diferencias por trabajador para 148: no hay filas en ninguno de los
dos lados dentro del sistema. La única diferencia es estructural, no aritmética.

| Worker | Source | Stafly | Difference | Reason |
|---|---|---|---|---|
| (todos) | archivo no persistido | $0.00 | = total del archivo | `SOURCE_ONLY` — la importación al período 148 nunca se ejecutó |

---

## 1. CANONICAL PERIOD 148

Resuelto desde `pay_periods` (no desde nombre de archivo ni UI).

| Campo | Valor |
|---|---|
| company_id | `00000000-0000-0000-0000-000000000001` |
| company name | Quality Staff by Keury |
| period_id | `b17caedc-c2c7-4a53-85e9-e429162da34f` |
| period number (`sequence_number`) | 148 |
| start_date | 2026-09-02 |
| end_date | 2026-09-08 |
| status | `open` |
| published_at | `null` |
| paid_at | `null` |
| recibos publicados | **0** |
| `period_base_pay` rows | **0** |
| `movements` rows | **0** |
| `time_entries` en el rango | **0** |

Contexto de la secuencia (misma compañía):

| # | Período | Rango | Filas base | Total aprobado |
|---|---|---|---|---|
| 145 | `94890764-…` | Ago 12–18 | 44 | $24,717.94 |
| 146 | `86b967e5-…` | Ago 19–25 | 26 | $15,714.14 |
| 147 | `60bceb71-…` | Ago 26–Sep 1 | 60 | $35,843.44 |
| **148** | `b17caedc-…` | **Sep 2–8** | **0** | **$0.00** |
| 149 | `cfae1242-…` | Sep 9–15 | 0 | $0.00 |

## 2. SOURCE FILE

No se puede identificar un archivo fuente para el período 148 con datos canónicos:

- `activity_log` · acción `import_external_approved_payroll`: sólo **dos** registros en toda
  la ventana reciente —
  - `146 UNTITLED_REPORT_2026-08-19_2026-08-25.xlsx` (2026-09-14 21:39 UTC, 26 workers, $15,714.14)
  - `147 UNTITLED_REPORT_2026-08-26_2026-09-01.xlsx` (2026-09-15 02:07 UTC, 60 workers, $35,843.44)
  - **ningún archivo con rango 2026-09-02 → 2026-09-08.**
- `imports` / `payroll_import_batches`: sin filas para el período 148.
- Logs de la edge function `import-payroll-extras`: vacíos (sin invocaciones retenidas).

| Campo | Valor |
|---|---|
| filename | **no persistido** |
| detected start / end | n/d |
| row count / worker count | n/d |
| source total | n/d |

**FILE PERIOD == CANONICAL PERIOD 148 → no verificable.** Conforme al STEP 2, la
reconciliación se detiene aquí. **ZERO WRITES.**

La causa es estructural y esperada: la vista previa de importación es *read-only* por diseño
(guardrails P0.2, RULE 5). Si el operador abrió una vista previa del archivo de la semana
Sep 2–8 y no confirmó la importación — o fue bloqueada por un guardrail — el sistema no
conserva rastro alguno del archivo ni de sus totales.

## 3. COMPARABLE TOTAL DEFINITION

Definición canónica usada tanto para 147 como para 148 (idéntica, sin ambigüedad de semántica):

```
STAFLY COMPARABLE TOTAL (por trabajador)
  = period_base_pay.base_total_pay
  + SUM(movements.total_value WHERE concepts.category = 'extra'   AND approval_status='approved')
  - SUM(movements.total_value WHERE concepts.category = 'deduction' AND approval_status='approved')
  = period_base_pay.approved_total_override      (cuando el período viene de cierre externo)
```

Esto corresponde al **total aprobado / pagado (final paid)** del archivo, no a gross ni a net
fiscal. El archivo externo es la autoridad de pago; `approved_total_override` congela ese
importe por trabajador.

## 4. STAFLY CALCULATION — PERÍODO 148

| Componente | Fuente | Valor |
|---|---|---|
| Horas trabajadas | `time_entries` en Sep 2–8 | 0 registros |
| Base pay | `period_base_pay.base_total_pay` | $0.00 |
| Additional payments | `movements` extra aprobados | $0.00 |
| Deductions | `movements` deduction aprobados | $0.00 |
| Adjustments | `movements` pendientes/denegados | $0.00 |
| Approved overrides | `approved_total_override` | ninguno (0 filas) |

```
BASE   $0.00
+ ADDITIONS  $0.00
- DEDUCTIONS $0.00
± ADJUSTMENTS $0.00
= STAFLY FINAL  $0.00
```

Ningún cálculo fue modificado.

## 5. SOURCE CALCULATION

Imposible de calcular: el archivo no está persistido en el sistema (ver §2). Para completar
esta sección se requiere que el operador vuelva a abrir la vista previa del archivo
Sep 2–8 (acción read-only) y comparta las métricas que la vista previa ya muestra:
filas detectadas, válidas, no emparejadas, duplicadas y total aprobado.

## 6. GLOBAL DIFFERENCE

```
SOURCE COMPARABLE TOTAL   =  S   (desconocido, archivo no persistido)
STAFLY COMPARABLE TOTAL   =  $0.00
DIFFERENCE                =  S   (100% del archivo)
```

La diferencia está **totalmente explicada por una única causa**: la importación al período
148 nunca se confirmó. No hay componente aritmético residual.

## 7. WORKER RECONCILIATION MATRIX

| worker_id | worker name | source id | source amt | Stafly base | Stafly mov. | Stafly final | diff | status | reason |
|---|---|---|---|---|---|---|---|---|---|
| — | — | — | — | — | — | — | — | — | Sin filas en ninguno de los dos lados dentro del sistema |

Población Stafly del período 148 = **0 trabajadores**. Población fuente = no persistida.
No hay `DUPLICATE_CANDIDATE`, `UNMATCHED`, ni `STAFLY_ONLY`.

## 8. DIFFERENCE ROOT CAUSES

Única causa raíz sustentada por datos:

1. **`IMPORT_NOT_COMMITTED` (confirmado).** No existe registro de importación, filas base,
   movimientos ni horas para `b17caedc-…`. El período está intacto desde su creación.

Descartado con evidencia (no son la causa):

- Selección de tarifa incorrecta — no hay filas que tarificar.
- `time_entries` faltantes/sobrantes — 0 entradas en el rango; el período no usa cálculo nativo.
- Movimiento duplicado — 0 movimientos.
- Problema de emparejamiento de trabajadores — no hubo proceso de emparejamiento.
- Redondeo — no aplica sobre cero.
- Semántica gross/net distinta — se usa una sola definición (§3), validada contra 147.

## 9. MATHEMATICAL PROOF

```
SUM(diferencias por trabajador) = 0 filas = $0.00 residual
GLOBAL DIFFERENCE               = S - $0.00 = S
```

La igualdad se cumple de forma trivial y completa: el 100% de la diferencia se atribuye a
una sola causa estructural (importación no ejecutada), sin residuo inexplicado y sin
redondeo. **No se declara la reconciliación de importes completa** mientras el total del
archivo `S` no sea aportado, porque el lado fuente no es observable desde la base de datos.

## 10. PERIOD 147 CONTROL

Mismo motor, mismas definiciones (§3). Período `60bceb71-…`, Ago 26–Sep 1, `open`.

| Componente | Valor |
|---|---|
| Trabajadores (`period_base_pay`) | 60 |
| Base pay | $30,594.44 |
| Extras aprobados | $5,706.00 |
| Descuentos aprobados | −$457.00 |
| Movimientos netos | $5,249.00 |
| **Total Stafly** | **$35,843.44** |
| Total del archivo (`grandApprovedTotal`) | **$35,843.44** |
| **Diferencia** | **$0.00** |

Desglose de los 17 movimientos aprobados: Weekend Job $3,000.00 · Pago de Transporte Regular
$1,340.00 · Otros pagos $850.00 · Reintegros $501.00 · Horas de viaje $15.00 · Descuentos
−$457.00.

Prueba por trabajador (consulta read-only): **0 de 60** trabajadores con
`base + movimientos netos − approved_total_override ≠ 0`. 147 reconcilia al centavo, persona
por persona.

**Conclusión del control:** 148 **no** es un problema semántico de comparación. Las
definiciones son correctas y se demuestran exactas en 147. 148 es una **excepción de datos**:
el período está vacío.

## 11. PUBLICATION STATUS

| Período | status | published_at | Recibos publicados |
|---|---|---|---|
| 147 | `open` | `null` | **2 (⚠️ $2,448.00 visibles para 2 trabajadores)** |
| 148 | `open` | `null` | **0** |

- Período 148: **sin publicar, sin recibos, sin visibilidad para trabajadores.** ✅
- Período 147: contiene 2 recibos publicados el 2026-09-15 02:11 UTC, contrario a la premisa
  de la tarea. **Reportado, no modificado.** Requiere decisión humana: mantenerlos o revocarlos
  antes del cierre formal del período.
- Cero publicaciones, cero notificaciones, cero ajustes, cero cambios de estado en esta auditoría.

## 12. RECOMMENDED ACTIONS

1. **Decidir sobre los 2 recibos publicados del 147** (mantener o revocar). No se tocó nada.
2. **Aportar el archivo de la semana Sep 2–8** y abrir la vista previa (read-only). La vista
   previa ya muestra período detectado vs. seleccionado, filas válidas/inválidas, no
   emparejados, duplicados y total aprobado — con eso se completa §5, §6 y §7 en minutos.
3. **Verificar si la importación de 148 fue bloqueada por un guardrail** al intentarla: los
   bloqueos por rango de fechas / período cerrado / recibos publicados son visibles en la
   vista previa. Hoy el 148 está `open` y sin recibos, así que una importación con archivo
   Sep 2–8 debería pasar.
4. **Deuda de observabilidad (P1):** el bridge de cierre externo no escribe en `imports` ni
   `payroll_import_batches`; sólo deja una línea en `activity_log`. Una vista previa
   descartada no deja rastro alguno, lo que hace imposible auditar un intento fallido.
   Recomendado: registrar los intentos de vista previa (archivo, período, total, resultado
   del guardrail) sin escribir datos de nómina.
5. **Rutas rotas detectadas (fuera de alcance, sin tocar):** `WeeklyPayrollReconciliation.tsx`,
   `StagedReconciliation.tsx` y `DevCommandCenter.tsx` consultan `pay_periods.n`, columna que
   **no existe** (el número canónico es `sequence_number`). Esas pantallas fallan al cargar.

## 13. WHAT MUST NOT CHANGE

Sin cambios en: fórmulas de nómina, `time_entries`, tarifas, ajustes aprobados,
`period_base_pay`, `movements`, recibos publicados, `scheduled_shifts`, `shift_assignments`,
auth, RLS, pagos, reservas, chat, documentos, tenants, límites de compañía, billing,
entitlements. No se creó ningún ajuste de balanceo. No se reimportó nada. No se publicó
el 147 ni el 148. Período 142 no fue consultado para escritura y permanece intacto.

---

## FINAL VERDICT

🟡 PERIOD 148 DIFFERENCE ISOLATED — HUMAN DECISION REQUIRED
