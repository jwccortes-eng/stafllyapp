# Payment Story & Smart Work Card — Audit & Design (Read-Only)

> Status: **DESIGN ONLY — no code, no schema, no payroll changes.**
> Owner: Stafly product. Companion to `SHIFT_OPERATIONAL_FLOW.md`.
> Principio: **Ningún pago sin historia. Ninguna historia sin evidencia.
> Ninguna evidencia sin contexto operativo.**

---

## 1. Auditoría del modelo actual de payroll

### 1.1 Tablas relevantes ya existentes

| Tabla | Rol en la historia del pago | ¿Sirve hoy para “Payment Story”? |
|---|---|---|
| `pay_periods` | Ventana (start/end), status (`open/closed/published/paid`), `paid_at`, `paid_by`, `calculation_mode` (`historical_import / native_stafly / hybrid`), `source_type`. | ✅ Cabecera del statement. |
| `period_base_pay` | Total por worker × período: `total_paid_hours`, `total_regular`, `total_overtime`, `base_total_pay`, `anomaly_flags`. | ✅ Es el *Pay Statement* de facto. |
| `payroll_adjustments` | Bonus / transport / deduction / manual_adjustment, ligados opcionalmente a `shift_id` y `period_id`, con `notes` y `created_by`. | ✅ Novedades / ajustes. |
| `historical_payroll_entries` | Filas importadas de Connecteam: `base_total_pay`, `concept_payload` (jsonb), `worker_name_raw`, `matched_employee_id`. | ✅ Pago histórico cuando NO hay nativo. |
| `normalized_payroll_rows` | Filas normalizadas por día con `total_hours`, `hourly_rate`, `pay_type`, `ride_amount`, `weekend_amount`, `manual_amount`, `base_pay`. | ✅ Mejor granularidad por día/turno (cuando viene de import). |
| `payroll_rate_snapshots` | Rate vigente al momento del pago (`hourly_rate`, `daily_rate`, `half_day_rate`, `ride_rate`, `payment_mode`). | ✅ Explica el “cómo se calculó”. |
| `payroll_interpreted_entries` / `payroll_concept_mappings` | Decodificación de conceptos del import a categorías Stafly. | ✅ Para mostrar “concepto humano”. |
| `time_entries` | Evidencia real de fichaje (clock-in/out, GPS). | ✅ Evidencia primaria. |
| `shift_notes (note_type='attendance_validation')` | Validación admin (Presente / Tarde / Ausente / Salió temprano) cuando no hay clock. | ✅ Evidencia secundaria. |
| `scheduled_shifts` + `shift_assignments` | Turno, cliente, ubicación, rol/categoría, pay_type del turno. | ✅ Contexto operativo. |
| `reconciliation_period_journal` / `reconciliation_period_status` | Quién aprobó/cerró/reabrió el período. | ✅ Auditoría. |

### 1.2 Lo que **NO existe hoy** (gaps reales)

1. **Pay items por línea operativa**. `period_base_pay` es un agregado por
   worker × período. No hay tabla canónica “una línea = un trabajo
   pagado” en modo nativo. Hoy se reconstruye desde `time_entries +
   payroll_adjustments + (opcional) normalized_payroll_rows`.
2. **Payment Transaction / Check reference**. No hay tabla
   `payroll_payments` con número de cheque, ACH ref, método, fecha de
   emisión, monto neto. `pay_periods.paid_at` es el único marcador.
   `finance_transactions_manual` existe pero es **personal finance del
   owner**, no payroll del worker.
3. **Vínculo turno → línea pagada** en modo nativo. `payroll_adjustments`
   tiene `shift_id` opcional; `time_entries` tiene `scheduled_shift_id`.
   Pero no hay un “pay line” explícito por turno (`pay_line(shift_id,
   hours_paid, rate_used, amount, evidence_source)`).
4. **Snapshot de rate aplicado al período**. `payroll_rate_snapshots`
   existe pero no está garantizado por cada período/worker.
5. **Worker-facing explanation persistida**. No hay tabla / vista que
   diga “para este pago: estos trabajos, esta evidencia, este total, en
   lenguaje humano”.
6. **Reporte de problemas del worker** sobre un pago específico.

> **Conclusión:** Stafly tiene **70 % del modelo** para contar la
> historia. Lo que falta es una capa de presentación (ViewModel) que
> une los pedazos y, en un futuro, dos tablas pequeñas
> (`payroll_pay_lines`, `payroll_payments`). Esta auditoría **no las
> crea**, sólo las propone.

---

## 2. ViewModel read-only propuesto

Ubicación sugerida: `src/lib/payroll/pay-story/` (no creado todavía).
Sólo lee de Supabase, no escribe.

### 2.1 Tipos

```ts
type PayStoryViewModel = {
  statement: PayStatementSummary;        // cabecera
  items: PayItemSummary[];               // 1 fila por trabajo o concepto
  evidence: PayEvidenceSummary;          // resumen de evidencia
  adjustments: PayAdjustmentSummary[];   // novedades
  transaction: PayTransactionSummary | null;
  explanation: WorkerPayExplanation;     // texto humano
  audit: PayAuditTrail;                  // sólo admin/owner
  source: "native" | "historical" | "hybrid";
  trust_level: "final" | "preliminary" | "estimated";
};
```

### 2.2 Funciones puras

| Función | Inputs | Output | Notas |
|---|---|---|---|
| `buildPayStoryViewModel({ period, employee })` | period + employee + colecciones cargadas | `PayStoryViewModel` | Orquestador. |
| `getPayItemsForStatement(period, employee, shifts, time_entries, adjustments, rate_snapshots, historical)` | — | `PayItemSummary[]` | Si `pay_periods.calculation_mode='historical_import'` → leer de `historical_payroll_entries` + `normalized_payroll_rows`. Si nativo/hybrid → derivar 1 ítem por turno con `time_entries`. |
| `getPayEvidenceSummary(items, time_entries, validations)` | — | `{ clocked, admin_validated, missing, percentage_evidence }` | Real clock siempre gana sobre validación admin. |
| `getPayAdjustmentsSummary(period, employee, adjustments)` | — | bonus/transport/deduction/manual con `shift_id` enlazado | — |
| `getWorkerPayExplanation(viewmodel)` | — | string i18n (ES/EN/HE) | Plantilla: “Este pago corresponde a … Incluye N trabajos …”. |
| `getPayTrustLevel(period, items, evidence)` | — | `'final' \| 'preliminary' \| 'estimated'` | `final` sólo si `period.status='paid'` y 100 % evidencia. |
| `getPayProblemReportPayload(viewmodel)` | — | objeto serializable | Botón “Reportar un problema” → abre flujo (no implementado). |

**Reglas de oro del ViewModel:**

- No calcula payroll. Sólo agrega y formatea lo que ya está aprobado.
- No escribe a `time_entries` ni a `payroll_adjustments`.
- Cuando hay conflicto (ej. `time_entries` indica 7.5h pero
  `period_base_pay.total_paid_hours` indica 8.0h), **muestra ambos** y
  marca `discrepancy: true`. Nunca silencia el real.
- Si el período es `historical_import`, se etiqueta visiblemente como
  “Pago histórico — importado desde Connecteam”.

---

## 3. Cards conceptuales

> Todas read-only. Tokens semánticos. Spanish-first.

### 3.1 Pay Statement Card (cabecera)

```
┌────────────────────────────────────────────────┐
│  Pago · Período 130 (Jun 1 – Jun 7)            │
│  Total: $487.50    Estado: Pagado · Jun 9      │
│  Modalidad: Nativo Stafly                      │
│  Trust: ✅ Final · 100 % evidencia              │
└────────────────────────────────────────────────┘
```

### 3.2 Pay Item Card (una por trabajo)

```
┌────────────────────────────────────────────────┐
│  Eminence Ballroom · Mesero · Sáb 4 Jun        │
│  8.0 h aprobadas · $25/h · $200.00             │
│  Evidencia: Fichaje real (in 17:58 / out 02:05)│
│  Ref turno: #0258                              │
└────────────────────────────────────────────────┘
```

Variantes de estado por ítem:
- `clocked_complete` → “Fichaje real”
- `present_no_clock` → “Validación admin · payroll requiere ajuste”
- `missing_clock_out` → “Falta hora de salida — pago final pendiente”
- `historical_import` → “Pago histórico Connecteam”

### 3.3 Evidence Card (resumen)

```
┌────────────────────────────────────────────────┐
│  Evidencia del pago                            │
│  ▓▓▓▓▓▓▓▓▓░  90 %                              │
│  • 4 turnos con fichaje real                   │
│  • 1 turno con validación admin (Keury, 4 Jun) │
│  • 0 turnos sin evidencia                      │
└────────────────────────────────────────────────┘
```

### 3.4 Adjustment / Novedad Card

```
┌────────────────────────────────────────────────┐
│  Novedades                                     │
│  + Transporte    $20.00   (Sáb 4 Jun · Keury) │
│  + Bonus         $50.00   (Cierre rápido)      │
│  − Adelanto      $30.00   (Préstamo #12)       │
└────────────────────────────────────────────────┘
```

### 3.5 Transaction Card

```
┌────────────────────────────────────────────────┐
│  Transacción                                   │
│  Método: Cheque · #1042                        │
│  Emitido: Jun 9, 2026                          │
│  Monto neto: $487.50                           │
│  Confirmación worker: ✅ Recibido (Jun 10)      │
└────────────────────────────────────────────────┘
```

> **Gap:** sin tabla `payroll_payments`, la Transaction Card mostrará
> hoy sólo `pay_periods.paid_at` y un placeholder “Referencia pendiente
> de captura”. **No inventar datos.**

### 3.6 Botón “Explicar este pago”

Genera el texto de `getWorkerPayExplanation()` y lo muestra en un
modal. Copy-to-clipboard + “Reportar problema”.

---

## 4. Versiones por rol

| Sección | Worker | Admin | Owner / Payroll |
|---|---|---|---|
| Statement Card | ✅ | ✅ | ✅ |
| Pay Items | ✅ (sin rate técnico salvo si pay_type=hourly) | ✅ con rate, evidencia y link al turno | ✅ |
| Evidence Card | ✅ (barra simple + frase) | ✅ detallado por worker | ✅ por período |
| Adjustments | ✅ (humano: “+ Transporte $20”) | ✅ con autor y nota | ✅ + filtros |
| Transaction | ✅ (método + fecha + monto neto) | ✅ + referencia | ✅ + export |
| Audit trail | ❌ | ✅ (quién aprobó, cuándo, qué cambió) | ✅ |
| Botón “Explicar” | ✅ | ✅ | ✅ |
| Botón “Reportar problema” | ✅ | ❌ | ❌ |
| Discrepancias internas | ❌ ocultas si están resueltas | ✅ siempre | ✅ siempre |

**Worker view:** sin jerga técnica (sin “base_total_pay”, sin
“calculation_mode”, sin IDs).
**Admin view:** auditable, deep-link a `/app/shift-ops?id=…` por ítem.
**Owner/payroll view:** totales del período, excepciones abiertas, link
al Centro de Validación.

---

## 5. Preguntas que Payment Story debe responder

### Worker
- ¿Qué me pagaron? → Statement Card + Explanation
- ¿Qué trabajos incluye? → Pay Items
- ¿Cuántas horas/días aprobaron? → Pay Items
- ¿Qué ajustes/novedades hubo? → Adjustment Card
- ¿Cuándo me pagaron? → Transaction Card
- ¿Cómo reporto un problema? → Botón “Reportar problema”

### Admin
- ¿De qué turno viene esta línea? → `pay_item.shift_id` deep-link
- ¿Qué evidencia soporta el pago? → Evidence Card + por ítem
- ¿Quién validó? → `audit.validated_by`
- ¿Hay presentes sin clock? → Evidence Card resalta `present_no_clock`
- ¿Hubo ajuste manual? → Adjustments con `type='manual_adjustment'`
- ¿Qué falta revisar? → `trust_level !== 'final'`

### Owner / payroll
- ¿Qué período cubre? → Statement Card
- ¿Qué workers están incluidos? → vista de período (otra pantalla)
- ¿Qué totales hay? → `period_base_pay` agregado
- ¿Qué transacciones salieron? → Transaction Cards del período
- ¿Qué excepciones quedan? → flags de `reconciliation_period_status`

---

## 6. Conexión con la Smart Work Card

La Work Card que ya existe (`PortalShiftCard`, `OpsShiftCard`,
`MobileShiftCard`) debe **prepar el terreno** para que el Payment
Story futuro no sea una sorpresa. Tres bloques nuevos a nivel diseño:

### A. Pago estimado / explicación previa

Reglas (todas presentacionales, **sin tocar payroll calculations**):

- Nunca mostrar “Te van a pagar $X” como hecho.
- Etiquetas permitidas: **“Estimado”**, **“Aprox.”**, **“Pago final
  pendiente”**.
- Si `pay_type=hourly` y turno no terminó: mostrar `rate × horas
  programadas` con etiqueta *“Estimado · payroll final depende del
  fichaje real.”*
- Si `pay_type=daily`: mostrar `daily_rate` (o `half_day_rate`) con
  etiqueta *“Pago por día.”*
- Si falta clock-out después del fin: mostrar *“Falta hora de salida;
  pago final pendiente.”*
- Si hay validación admin sin clock: *“Presente confirmado por admin;
  payroll requiere ajuste aprobado.”*
- Estimado inteligente (futuro): promedio histórico por
  `(client_id, role_slot, location_id)` para mostrar rango — sólo si
  hay ≥ 5 muestras. Marcar como *“basado en históricos.”*
- **Nunca usar `scheduled_shifts.start_time / end_time` como horas
  pagadas.**

Helper propuesto:
```ts
estimateShiftPay({ shift, rate_snapshot, time_entry?, validation? })
  → { amount: number | null, label: string, trust: 'final'|'preliminary'|'estimated' }
```

### B. Qué llevar / uniforme

Prioridad de fuente (de mayor a menor):

1. Override del turno específico (`scheduled_shifts.uniform_override` —
   *propuesta de columna, no crear hoy*).
2. Default por `client_id + role_slot + location_id`
   (`locations_v2.uniform_default` o `clients.uniform_default` —
   *propuesta*).
3. Default por compañía.
4. Texto manual en `scheduled_shifts.notes` (legacy).

UI:
- **Worker:** card “Qué llevar” con foto + bullets (“Camisa blanca”,
  “Pantalón negro”, “Zapatos cerrados”).
- **Admin:** badge “Uniforme: completo / falta foto / falta texto” en
  Shift Operations.

**Hoy:** ya existe `scheduled_shifts.notes` y se puede renderizar como
fallback inmediato sin schema.

### C. Cómo llegar / mapa inteligente

Bloque “Cómo llegar” en la Work Card:

- Dirección limpia (vía `StructuredAddress` ya existente en
  `src/lib/address`).
- Botón **“Abrir en Google Maps”** → `buildMapsUrl(...)` (ya
  implementado).
- Botón **“Punto de encuentro”** si `meeting_point` existe (canonical
  rule del Work Route standard: *Entrada protagonista, Termina aprox.
  secundario, meeting_point destacado*).
- Hora de salida sugerida (futuro, basada en distancia estimada — no
  hoy).
- Indicación de transporte si `shift_rides` aplica (legacy, payroll-
  coupled — no tocar).

---

## 7. Gaps que bloquean la versión completa

| Gap | Severidad | Solución propuesta (NO ejecutar) |
|---|---|---|
| No hay `payroll_pay_lines` por turno en modo nativo | Alta | Vista derivada read-only en SQL primero; tabla material si se valida. |
| No hay `payroll_payments` (cheque / ACH / fecha emisión) | Alta | Nueva tabla `payroll_payments(period_id, employee_id, method, reference, paid_at, amount_net, confirmed_by_worker_at)`. |
| `payroll_rate_snapshots` no garantizado por período | Media | Trigger en cierre de período (futuro). |
| Worker no puede reportar problema sobre un pago | Media | Nueva tabla `payroll_disputes` (futuro). |
| Confirmación de recibo por parte del worker | Baja | Columna en `payroll_payments` arriba. |

---

## 8. Confirmación de no-tocados críticos

Esta auditoría **no toca**:

- `time_entries` (lectura conceptual; no se diseña ningún write).
- `period_base_pay`, `pay_periods`, `payroll_adjustments`,
  `payroll_rate_snapshots`, `historical_payroll_entries`,
  `normalized_payroll_rows` — sólo lectura propuesta.
- Cálculos de payroll, closeout, reconciliation.
- Worker portal productivo, admin productivo.
- Schema (no migrations).
- RLS, auth, edge functions.
- Connecteam export/import.
- Smart Work Card existente (sólo se proponen tres bloques nuevos
  presentacionales).
- Tenants (no se mezclan).

---

## 9. Próximos pasos sugeridos (requieren aprobación)

1. Crear `src/lib/payroll/pay-story/` con los helpers puros del §2
   (tests Vitest, **sin UI**).
2. Prototipo visual de las 5 cards en Storybook-like (`/app/_design`),
   con data mock — **no en /portal ni /app/payments productivos**.
3. Cuando el modelo conceptual se valide con un período real (ej.
   Quality Staff #128), proponer las dos tablas faltantes
   (`payroll_pay_lines`, `payroll_payments`) en migración separada.
4. Recién entonces, conectar Worker view en `/portal/pay-reports` y
   Admin view en `/app/payroll-review-queue`.

Hasta que esos pasos se aprueben, este documento es la única huella.
