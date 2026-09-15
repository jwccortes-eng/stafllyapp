# P0 — Payroll Import / Pay Statement Pipeline Audit

**Fecha:** 2026-09-15
**Modo:** READ-ONLY. Cero escrituras, cero migraciones, cero publicaciones, cero correos.
**Alcance:** SOURCE FILE → IMPORT → PARSING → WORKER MATCH → PERIOD MATCH → COMPONENTES → RECONCILIACIÓN → PUBLICACIÓN → VISIBILIDAD DEL TRABAJADOR.

---

## 1. EXECUTIVE SUMMARY

La vista de pago del trabajador **funciona y está protegida por diseño**: sólo lee los RPC
`worker_pay_statements` / `worker_pay_statement_detail`, que exigen `status='published'` y devuelven
totales **congelados** (`frozen_*`). Ninguna reimportación puede alterar un recibo ya publicado.

El problema real está aguas arriba, en el lado admin, y tiene tres causas concretas:

1. **Siete rutas de importación** conviven bajo el mismo módulo (`/app/import`, `/app/import-extras`,
   `/app/import-timeclock`, `/app/import-schedule`, `/app/import-wizard`, `/app/bulk-import-shifts`,
   `/app/import-inactive`) más **seis pantallas de reconciliación**. Tres dominios distintos
   (horario, reloj, dinero) se presentan como si fueran el mismo flujo.
2. **El periodo lo elige el operador, no el archivo.** El importador de cierre externo no compara el
   rango de fechas del archivo con el del periodo seleccionado. En la corrida real del 14-sep el
   archivo `146 UNTITLED_REPORT_2026-08-19_2026-08-25.xlsx` entró al periodo **146 (19–25 ago)**,
   no al periodo 147 (26 ago–1 sep) que el operador estaba mirando vacío.
3. **`period_base_pay` solo existe si alguien lo importa o lo consolida.** El resumen no tiene otra
   fuente: sin filas de base ni movimientos para ese `period_id`, la pantalla queda vacía aunque el
   periodo exista y esté cerrado.

Riesgo mayor detectado (no explotado): el edge function `import-payroll-extras` **no bloquea
periodos cerrados ni periodos con recibos publicados**. La barrera contra corrupción del recibo es el
congelamiento del statement, no el importador. Los 5 recibos del periodo 142 están intactos.

Veredicto al final del documento.

---

## 2. ALL IMPORT ROUTES

| Ruta | Componente | Dominio real | Permiso |
|---|---|---|---|
| `/app/import` | `ImportConnecteam` | **Dinero + turnos + disponibilidad** (Excel Connecteam completo) | `payroll.manage` |
| `/app/import-extras` | `ImportPayrollExtras` (+ `ExternalPayrollCloseImport`) | **Dinero**: extras legacy *y* cierre externo aprobado | `payroll.manage` |
| `/app/import-timeclock` | `ImportTimeClock` | **Reloj** (`time_entries`) | `time_entries.adjust` |
| `/app/import-schedule` | `ImportSchedule` | **Horario** (`scheduled_shifts`, `shift_assignments`) | módulo `import` |
| `/app/import-wizard` | `ImportWizard` | **Mixto**: horario + reloj + movimientos | `company.settings` |
| `/app/bulk-import-shifts` | `BulkImportShifts` → edge `bulk-import-shifts` | Horario | módulo |
| `/app/import-inactive` | `ImportInactiveEmployees` | Personas | `workers.edit` |
| `/app/import-review` | `ImportReview` | Revisión de lotes de horario | — |
| `/app/payroll-reconciliation`, `/app/weekly-payroll-reconciliation`, `/app/staged-reconciliation`, `/app/reconciliation-report`, `/app/payroll-review-queue`, `/app/payroll-native-dry-run` | varias | Reconciliación / comparación | `payroll.manage` |

Rutas en `src/App.tsx:346-444`.

---

## 3. IMPORTER PURPOSE MATRIX

### A. Cierre externo aprobado — `ExternalPayrollCloseImport.tsx` + `src/lib/payroll/payroll142-bridge.ts` + edge `import-payroll-extras`
- **Propósito:** cargar el resultado **ya aprobado** de la nómina externa. El `TOTAL` del archivo es autoridad; nunca se recalcula.
- **Archivo:** Excel, sólo hoja `PAYROLL` (validado server-side, `index.ts:162-168`). La hoja `SECRETARIA` es informativa.
- **Parseo:** el cliente sólo extrae filas crudas; dinero e identidad se resuelven en el servidor (`index.ts:262-372`).
- **Escribe:** `period_base_pay` (upsert por `period_id,employee_id`, `index.ts:487-489`), `movements` (insert por lotes, `index.ts:496-506`), `activity_log` (`index.ts:508-525`).
- **Periodo:** obligatorio, elegido en la UI; sólo se valida que pertenezca a la compañía (`index.ts:170-178`).
- **Matching:** `employer_identification` normalizado; fallback a nombre único. **Nunca crea empleados**; filas ambiguas → `BLOCKED`.
- **Duplicados / idempotencia:** `preview` es escritura cero (`index.ts:421-423`); `import` exige `expectedGrandTotal` exacto y confirmación explícita de overrides. Los movimientos ya existentes se **saltan** (no se actualizan).
- **Impacto en publicación:** ninguno sobre recibos ya congelados; sí sobre el resumen admin.

### B. Extras legacy — `ImportPayrollExtras.tsx`
- Excel de conceptos extra mapeados por nombre de columna (`:35-43`).
- Escribe `movements` (`:303`) y puede **crear empleados** (`:362`).
- Matching por nombre normalizado.
- Bloquea si el periodo está `closed` (`:250`) — guard sólo en el cliente.
- Dedupe por `employee_id+concept_id+period_id+company_id` antes de insertar (`:290-301`).

### C. Connecteam completo — `ImportConnecteam.tsx`
- Estrategia **replace**: borra `period_base_pay`, `shifts` e `import_rows` del periodo antes de reinsertar (`:265-270, :500-501`).
- Upsert de `period_base_pay` (`:550-560`), insert de `shifts`, upsert de `employee_availability_overrides`.
- Un solo import por periodo (`:463-472`); bloquea periodo `closed` (`:459`).
- Matching por nombre exacto; no crea empleados.

### D. Reloj — `ImportTimeClock.tsx`
- Inserta `time_entries` con `entry_source:"import"` (`:429`); enlaza `shift_id` por código+fecha.
- Dedupe por constraint de BD (`23505`, `:441`).
- **No** toca `movements` ni `period_base_pay`.

### E. Horario — `ImportSchedule.tsx`, `ImportWizard.tsx`, `BulkImportShifts.tsx`
- `scheduled_shifts`, `shift_assignments`, `clients`, `locations`, `import_batches`.
- `ImportWizard` además inserta `time_entries` (`:925`) y `movements` (`:997`) — es el único flujo que cruza los tres dominios.

---

## 4. TABLES / DATA SOURCES

| Tabla | Rol | Escrita por |
|---|---|---|
| `period_base_pay` | Base de pago por trabajador y periodo (+ `approved_total_override`, `approved_total_source`) | Cierre externo (upsert), Connecteam (replace+upsert), edge `payroll-consolidate` |
| `movements` | Extras y descuentos por concepto (`approval_status`, `visible_to_worker`, `pay_statement_id`) | Cierre externo, extras legacy, ImportWizard, alta manual |
| `pay_statements` | Recibo congelado por `(pay_period_id, employee_id)`: `frozen_total/base/extras/deductions`, `status published|revoked` | Sólo RPC `publish_pay_statement` |
| `pay_periods` | Periodo semanal por compañía, `sequence_number`, `status`, `calculation_mode` | Generación de periodos |
| `activity_log` | Auditoría de import y publicación | Ambos |
| `historical_payroll_entries`, `payroll_interpreted_entries`, `payroll_import_batches`, `import_rows` | **Vacías en producción** (0 filas) | Ningún flujo activo |
| `import_batches` | Lotes de horario / intake de servicio | Importadores de horario |

Tenant: todas las escrituras derivan `company_id` del periodo o de la compañía activa; el bridge valida `period.company_id === companyId` antes de nada.

---

## 5. PERIOD MATCHING

- El periodo se selecciona **manualmente** en la UI; su `id` viaja como `periodId`.
- El identificador canónico es `pay_periods.id`; el número que ve el operador es `sequence_number`.
- **El archivo no determina el periodo.** El bridge lee `start_date`/`end_date` del periodo sólo para
  devolverlos en la respuesta (`index.ts:406`); **no los compara con el contenido ni con el nombre del archivo**.
- Consecuencia: un desajuste de periodo es silencioso y perfectamente posible. Ocurrió el 14-sep (§8).
- `period_base_pay` tiene una fila por `(period_id, employee_id)`, así que el desajuste no duplica: **sobrescribe el periodo equivocado**.

---

## 6. WORKER MATCHING

| Importador | Clave primaria | Fallback | Ambiguo | Sin match | Crea personas |
|---|---|---|---|---|---|
| Cierre externo | `employer_identification` normalizado | Nombre único | `BLOCKED` | `BLOCKED` | **No** |
| Extras legacy | Nombre normalizado | — | Primer match | Ofrece crear | **Sí** |
| Connecteam | Nombre exacto | — | Primer match | Lista "unmatched" | No |
| Time clock | Nombre exacto | — | Primer match | Se descarta | No |

Cross-tenant: el roster siempre se lee filtrado por `company_id`, y el bridge además excluye
`merged_into_employee_id`. Riesgo real de homónimos: alto en los importadores por nombre, nulo en el
cierre externo cuando la columna de identificación viene completa.

---

## 7. PERIOD 142 TRACE (22–28 jul) — CASO A

| Dato | Valor |
|---|---|
| `pay_periods.id` | `a2cd1554-adb2-4a67-b82d-c6e2bb451d81` (`sequence_number` 142, `closed`) |
| Compañía | `00000000-…-0001` (Quality Staff) |
| `period_base_pay` | 50 filas · base **$23,989.24** |
| `movements` | 58 filas, todas `approved` · **$4,976.00** |
| Calculado | 23,989.24 + 4,976.00 = **$28,965.24** ✅ coincide con el dato del negocio |
| Aprobado (`COALESCE(override, base)` + extras) | **$28,418.24** ✅ |
| Diferencia | **−$547.00** ✅ |
| `pay_statements` | **5 publicados** ($287.00, $1,895.00, $765.33, $898.75, $2,510.00), 45 trabajadores sin recibo |
| Ajustes / entradas históricas | 0 |

Sin cambios durante esta auditoría. Hallazgo relevante: el periodo financieramente validado **sólo
tiene 5 de 50 recibos publicados** — la mayoría de trabajadores no ve nada de ese periodo.

---

## 8. AUG 26–SEP 1 TRACE — CASO B

Tres periodos distintos cubren ese rango, uno por compañía:

| Compañía | `pay_periods.id` | Nº | base | movimientos | recibos |
|---|---|---|---|---|---|
| Quality Staff | `60bceb71-…` | 147 | 0 | 0 | 0 |
| Parceros | `5c96f037-…` | — | 0 | 0 | 0 |
| My Staff | `9907cebe-…` | — | 0 | 0 | 0 |

**El archivo que se importó no entró aquí.** Evidencia en `activity_log` (14-sep 21:39 UTC):

```
action: import_external_approved_payroll
entity:  pay_periods / 86b967e5-…  → periodo 146, 19–25 ago
file:    "146 UNTITLED_REPORT_2026-08-19_2026-08-25.xlsx"
workers: 26 · basePayRows: 26 · movementsInserted: 20
grandApprovedTotal: 15,714.14 · grandComponentSum: 15,714.14 · overrides: 0
```

Estado posterior del periodo 146: 26 filas base ($10,656.14), 22 movimientos ($4,478.00 aprobados +
$200.00 pendientes de agosto), aprobado $15,714.14, **0 recibos publicados**.
El periodo 146 estaba `closed` y aun así el import se ejecutó (§11).

---

## 9. WHY SUMMARY IS EMPTY

Causa exacta, no inferida. `src/pages/admin/PeriodSummary.tsx:188-215` construye las filas con dos
consultas filtradas únicamente por `period_id`:

1. `period_base_pay` donde `period_id = selectedPeriod`
2. `movements` donde `period_id = selectedPeriod` y `approval_status = 'approved'`

Si ambas devuelven cero filas, `empMap` queda vacío y `rows = []`. No hay ninguna otra fuente:
el resumen **no** lee `pay_statements`, ni `time_entries`, ni el calendario de turnos.

Existe un único auto-rescate (`:285-323`): si no hay base, el usuario puede `aprobar_nomina` y hay
`time_entries` **aprobadas** dentro del rango, se invoca la edge function `payroll-consolidate`.
Para el periodo 147 no hay `time_entries` aprobadas en ese rango, así que el rescate no dispara y la
pantalla permanece vacía indefinidamente.

**Respuesta:** el periodo 26 ago–1 sep está vacío porque nunca se cargó ni se consolidó nada en él;
el archivo que el operador creyó haber cargado ahí se escribió en el periodo 19–25 ago.

---

## 10. 14-RECORD / $5,249 EXPLANATION

No existe en la base ningún lote persistido de 14 registros por ~$5,249. La única importación
registrada en la ventana es la de 26 trabajadores / $15,714.14 del §8. Lecturas de esa cifra:

- **Lo más probable:** una pantalla de **preview** del cierre externo (modo `preview`, escritura cero,
  `index.ts:421-423`) o del importador de extras legacy, que cuenta **filas del archivo**, no recibos.
- El contador "14 registros / 14 válidos / 0 errores" es siempre **filas leídas del Excel**, y el total
  es la **suma de la columna de dinero de esas filas**, no la nómina del periodo.
- Si esa cifra hubiera provenido del cierre externo en modo `import`, habría quedado en `activity_log`
  y en `period_base_pay`; no está. Es decir: **esa pantalla no dejó datos en ningún periodo**.

Qué significa cada número cuando el import sí se ejecuta:
- `basePayRows` = trabajadores escritos en `period_base_pay` (uno por persona).
- `movementsInserted` = líneas de concepto escritas en `movements` (varias por persona).
- `grandApprovedTotal` = suma de los totales aprobados del archivo; es lo que verá el recibo si se publica.

---

## 11. PAYROLL AUTHORITY CONFIRMATION

| Tabla | ¿La tocan los importadores de dinero? |
|---|---|
| `time_entries` | **No** desde los importadores de nómina. Sí desde `ImportTimeClock` (`:429`) y `ImportWizard` (`:925`) — importadores de reloj, dominio distinto |
| `scheduled_shifts` | No desde nómina. Sí desde `ImportSchedule` / `ImportWizard` |
| `shift_assignments` | Igual que arriba |
| Horas trabajadas / programadas | No se reescriben desde ningún importador de pago |
| Cálculo base | **No hay recálculo automático**: `period_base_pay` sólo se escribe con valores literales del Excel o por `payroll-consolidate` (que lee `time_entries`) |
| Recibos publicados | **Inmutables**: el trigger `trg_movements_block_published_changes` bloquea UPDATE/DELETE de líneas vinculadas a un statement `published` |

Dos guardas **ausentes** en el edge function `import-payroll-extras` (no es corrupción, es falta de red de seguridad):

- No verifica `pay_periods.status = 'closed'` (el periodo 146 estaba cerrado y el import procedió).
- No verifica si el periodo ya tiene recibos publicados antes de sobrescribir `period_base_pay`.

No escala a P0 de corrupción porque el recibo del trabajador está congelado: una reimportación
posterior cambia el resumen admin, **no** lo que ve la persona. Pero produce divergencia
admin-vs-trabajador sin aviso.

---

## 12. RECONCILIATION CAPABILITIES

Sí existe comparación calculado-vs-importado, por trabajador:

- `src/lib/weekly-payroll-reconciliation.ts` — `reconcile()`, tolerancia $0.01 (`:68, :272`),
  buckets `matched_exact`, `amount_mismatch`, `missing_in_stafly`, `extra_in_stafly`,
  `name_id_mismatch`, `needs_review` (`:336-391`). Fuente Stafly = `period_base_pay` únicamente.
- Consumida por `/app/weekly-payroll-reconciliation` (read-only).
- Conviven además `PayrollReconciliation`, `StagedReconciliation`, `DiscrepancyReport`,
  `ComparisonReport` y `PeriodReconciliationCell` (que enlaza a staged) — **cinco superficies para el
  mismo concepto**, sin una declarada canónica.

Gap real: la reconciliación no está integrada al flujo de importación. El operador puede importar y
publicar sin pasar nunca por ella. No se implementa nada en esta auditoría.

---

## 13. PUBLICATION PIPELINE

- **Por trabajador**, nunca por periodo: `publish_pay_statement(_period_id,_employee_id,_source)`
  (migración `20260819183347…:8-119`), con `UNIQUE (pay_period_id, employee_id)`.
- Requiere `aprobar_nomina` / `periods.edit` / global owner; **bloquea si hay movimientos `pending`**.
- Congela: `frozen_base_total`, `frozen_extras_total`, `frozen_deductions_total`, `frozen_total`.
  Si existe `approved_total_override`, se congela **el override sin recalcular**.
- Vincula las líneas aprobadas y visibles al statement (`pay_statement_id`).
- `bulk_publish_pay_statements` (`20260820035842…:160-247`) itera y es **idempotente**:
  ya publicado → `skipped`; cross-tenant → `blocked`; pendientes → `blocked`.
- `unpublish_pay_statement` exige motivo y pasa a `revoked`; es la única vía de corrección.
- Reimportar después de publicar **no cambia el recibo** (está congelado y sus líneas son inmutables);
  sólo cambia el resumen admin.
- Se puede añadir un movimiento nuevo después de publicar: no entra al recibo congelado.

No se publicó ni despublicó nada durante esta auditoría.

---

## 14. WORKER PAYMENT VIEW PIPELINE

- Entrada: portal → `/portal/paystub/:periodId` (`src/pages/portal/PayStub.tsx`). `/portal/week/:periodId` sólo redirige.
- Lista de periodos: `fetchWorkerPayStatements()` → RPC `worker_pay_statements`
  (`src/lib/payroll/pay-statement.ts:144`), que filtra
  `status='published' AND published_at IS NOT NULL AND employee_id IN user_identity_employee_ids(auth.uid())`.
- Detalle: RPC `worker_pay_statement_detail`; líneas sólo `approval_status='approved' AND visible_to_worker`,
  y expone `worker_visible_note`, nunca la nota interna.
- Valores mostrados: siempre los `frozen_*`. Nunca se recalcula en el portal.
- La visibilidad depende **enteramente** de la publicación.
- **Trabajador sin cuenta:** el recibo puede existir publicado y queda esperando; al vincular la cuenta
  (`employees.user_id`) aparece con todo su histórico. `bulk_pay_statement_preview` ya expone
  `portal_access` para avisar al admin. Hoy en Quality Staff: **152 de 218 activos tienen portal**.
- Existe una segunda ruta de lectura paralela, `WorkerPayBreakdownDialog` →
  `src/lib/weekly-pay-breakdown.ts`, que lee `period_base_pay` / `imports` / `historical_payroll_entries`
  directamente, **sin depender de la publicación**. Es un camino antiguo que convive con el canónico;
  conviene revisarlo, no se tocó.

No se modificó ninguna pantalla del portal.

---

## 15. REIMPORT / DUPLICATE SAFETY

| Escenario | Comportamiento |
|---|---|
| Mismo archivo, mismo periodo, cierre externo | `period_base_pay` se sobrescribe (upsert); los `movements` ya existentes se **saltan** — no duplica, pero tampoco corrige valores cambiados |
| Mismo archivo, periodo equivocado | **Sobrescribe el periodo equivocado en silencio**. Riesgo principal |
| Reimport en periodo con recibos publicados | Permitido; el recibo no cambia, el resumen sí → divergencia |
| Extras legacy repetidos | Dedupe check-then-insert por concepto; ventana de carrera teórica |
| Connecteam repetido | Borra y reinserta todo el periodo (destructivo para ediciones manuales posteriores) |
| Doble publicación | Imposible: `bulk_publish` salta lo ya publicado |

No se ejecutó ninguna reimportación de prueba.

---

## 16. ADMIN UX CONFUSION

Los tres nombres que el operador ve **no** describen tres dominios:

- "Import Excel" (`/app/import`) = Connecteam completo → dinero + turnos + disponibilidad, destructivo.
- "Import Extras" (`/app/import-extras`) = **dos importadores distintos en una sola pantalla**:
  extras legacy por nombre, y el cierre externo aprobado (que es el importador principal de dinero).
- "Import Time Clock", "Import Schedule", "Import Wizard", "Bulk Import Shifts" = dominio operativo.

El importador más importante del negocio (cierre aprobado) está escondido dentro de una pantalla
llamada "Extras". Esa es la raíz de la confusión, más que cualquier bug.

Estructura recomendada (coincide con la arquitectura real, no la fuerza):

```
IMPORTAR DATOS
 ├─ 1. Asistencia y horario   → reloj, turnos programados
 ├─ 2. Cierre de nómina       → Excel aprobado (period_base_pay + movements)   ← autoridad financiera
 └─ 3. Pagos adicionales      → extras y descuentos sueltos (movements)
```

Con dos reglas de producto: el paso 2 debe **confirmar el periodo contra las fechas del archivo**, y
debe advertir si el periodo ya tiene recibos publicados. No se renombró nada.

---

## 17. SUMMARY UX FINDINGS

Hoy `/app/summary` muestra filas por trabajador armadas desde `period_base_pay` + `movements`, sin
indicar de dónde viene cada número ni cuántos recibos existen. Ausencias concretas:

- No dice si el periodo tiene datos importados, consolidados o nada.
- No muestra cuántos recibos están publicados (142: 5 de 50 — invisible en pantalla).
- No distingue "base calculada" de "total aprobado externo" en el encabezado.
- No avisa de movimientos `pending`, que son los que bloquean la publicación.

Jerarquía recomendada (sin implementar):

```
PERIODO 142 · 22–28 jul · cerrado · origen: cierre externo aprobado
PERSONAS 50 · BASE $23,989.24 · AJUSTES +$4,976.00 · CALCULADO $28,965.24
APROBADO $28,418.24 (−$547.00) · RECIBOS PUBLICADOS 5 / 50 · PENDIENTES 0
```

---

## 18. PRODUCTION RISKS

1. **Desajuste de periodo silencioso** (ocurrido, confirmado). Alto.
2. **Import permitido en periodo cerrado y con recibos publicados** (sin guard server-side). Medio-alto.
3. **Divergencia admin-vs-recibo** tras reimportar: el recibo congelado y el resumen dejan de coincidir. Medio.
4. **Cobertura de recibos muy baja**: periodo 142 con 5/50 publicados; periodo 146 con 0/26. El trabajador no ve su pago aunque el dato esté cargado. Alto para adopción.
5. **Segunda ruta de lectura del trabajador** (`weekly-pay-breakdown`) que no respeta la publicación. Medio.
6. **Cinco pantallas de reconciliación** sin una canónica. Medio (confusión, no corrupción).
7. Matching por nombre en tres importadores → riesgo de homónimos. Medio.

---

## 19. WHAT MUST NOT CHANGE

- Periodo 142 (`a2cd1554-…`): base, movimientos, overrides y sus 5 recibos publicados.
- El congelamiento (`frozen_*`) y la inmutabilidad de líneas publicadas.
- Los RPC del portal (`worker_pay_statements`, `worker_pay_statement_detail`) y su filtro por publicación.
- `publish_pay_statement` como única vía de publicación y `unpublish_pay_statement` como única corrección.
- `time_entries`, `scheduled_shifts`, `shift_assignments`, tarifas, ajustes aprobados.
- La pantalla de pago del trabajador: no se rediseña.

---

## 20. RECOMMENDED IMPLEMENTATION ORDER

1. **Guard de periodo en el importador de cierre** (server-side): comparar el rango de fechas del
   archivo con el periodo y exigir confirmación explícita si no coinciden. Resuelve el incidente real.
2. **Guard de periodo cerrado / con recibos publicados** en `import-payroll-extras`: advertir y exigir
   confirmación, nunca sobrescribir en silencio.
3. **Resumen con procedencia y cobertura**: origen del dato, calculado vs aprobado, recibos publicados
   y pendientes que bloquean.
4. **Renombrar y agrupar los importadores** en los tres dominios del §16; sacar el cierre externo de
   "Extras" y darle nombre propio.
5. **Declarar una sola pantalla de reconciliación canónica** y enlazar el resto desde ahí.
6. **Cerrar la segunda ruta de lectura del trabajador** (`weekly-pay-breakdown`) o alinearla a la publicación.
7. Sólo después: revisar por qué la publicación de recibos se quedó en 5/50 y definir el flujo de cierre
   semanal completo (importar → reconciliar → publicar).

---

## Confirmación read-only

Auditoría 100% estática y de sólo lectura. Cero escrituras, cero migraciones, cero publicaciones,
cero despublicaciones, cero reimportaciones, cero notificaciones. Periodo 142 y todos los recibos
existentes quedaron exactamente como estaban.

---

🟡 WORKER PAYMENT VIEW WORKS — IMPORT / PERIOD PIPELINE NEEDS CLEANUP
