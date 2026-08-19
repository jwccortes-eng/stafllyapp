# P0 — WORKER PAY STATEMENT CAPABILITY AUDIT

**Fecha:** 2026-08-19
**Tipo:** AUDIT ONLY · ZERO WRITES · ZERO DEVELOPMENT
**Alcance:** Determinar si Stafly ya tiene infraestructura suficiente para publicar al trabajador un *Pay Statement* aprobado (snapshot), sin reemplazar ni recalcular el motor oficial de payroll.

> No se ejecutó ningún INSERT/UPDATE/DELETE, ninguna migración, ningún importador.
> El archivo `142 UNTITLED_REPORT_2026-07-22_2026-07-28.xlsx` **no está disponible** en este entorno.
> Se usó como referencia estructural el archivo equivalente ya cargado: `129_UNTITLED_REPORT_2026-04-22_2026-04-28.xlsx` (mismo formato, mismas columnas, mismas hojas `All Employees` / `PAYROLL` / `SECRETARIA`).

---

## 1. Executive summary

**Veredicto: 🟡 READY WITH SMALL BRIDGE.**

Stafly **ya tiene el modelo de datos completo** para un pay statement: periodo (`pay_periods`), total base por trabajador y periodo (`period_base_pay`), y line items por concepto (`movements` + catálogo `concepts`). El catálogo de conceptos **ya contiene exactamente los conceptos del Excel de Quality Staff**: Pago de Transporte Regular/Especial (Ride), Propinas (Tips), Reintegros (Reimbursements), Horas de viaje (Travel), Pago/día (Pay per Day), Otros pagos, Descuentos. Ya existe una vía **manual** de creación de line items (pantalla Movimientos) y una vía **de importación aprobada** (edge function `import-payroll-extras`) que escribe en la misma tabla canónica.

También ya existe la publicación al trabajador: `pay_periods.published_at` + RLS que deja al empleado leer solo su propio `period_base_pay` y sus propios `movements`.

Lo que falta **no es un motor**, son 4 costuras finas:

1. **Semántica de conceptos en el portal**: hoy las pantallas vivas muestran solo dos cubos (`extra` / `deduction`). Ride, Tips, Reintegros y Travel se ven como "Extras" genéricos, no como líneas etiquetadas.
2. **Dos adaptadores de desglose divergentes** (`weekly-pay-breakdown.ts` que lee `historical_payroll_entries` — tabla **vacía en producción, 0 filas** — vs. las pantallas que leen `movements`). El adaptador "bueno" cae casi siempre a `final_total_only`.
3. **Estado y notas**: `movements.note` se muestra al trabajador **sin distinguir nota interna de nota visible** (771 movimientos tienen nota). No existe `worker_visible_note`.
4. **Gate de visibilidad incompleto**: la política RLS `pay_periods → Employees can view periods` **no filtra por `published_at`**; el trabajador puede leer metadatos de periodos abiertos/no publicados. El filtro hoy es solo de UI.

No hace falta crear un segundo sistema de pagos. El SSOT recomendado es el que ya existe (`pay_periods` + `period_base_pay` + `movements`), más una columna de origen y un gate de publicación real.

---

## 2. Qué existe hoy (inventario)

### 2.1 Tablas

| Tabla | Rol | Estado real (producción) |
|---|---|---|
| `pay_periods` | Periodo canónico. `start_date`, `end_date`, `status`, `closed_at`, **`published_at`**, **`paid_at`**, `paid_by`, `sequence_number`, `calculation_mode`, `source_type`, `reconciliation_status` | 212 periodos: 144 `closed`, 60 `open`, 8 `paid`. **Solo 1 con `published_at`** |
| `period_base_pay` | Total base por trabajador/periodo. `base_total_pay`, horas, `import_id`, `anomaly_flags` | 2.812 filas, 176 con `import_id` (protegidas del RPC nativo) |
| `movements` | **Line items** por concepto. `concept_id`, `quantity`, `rate`, `total_value`, `note`, `approval_status`, `approved_by` | 873 filas · 21 periodos · 101 trabajadores · 688 approved / 184 pending / 1 denied · 771 con nota |
| `concepts` | Catálogo por empresa. `category` (`extra`/`deduction`), `calc_mode` (`quantity_x_rate` / `manual_value` / `hybrid`), `default_rate` | 44 `extra` + 5 `deduction` |
| `concept_employee_rates` | Tarifa por concepto y trabajador con vigencia | Existe |
| `payroll_adjustments` | Ajustes por turno (`type`, `amount`, `notes`) | Existe, RLS self-view |
| `payroll_period_rate_snapshots` | Foto inmutable de la consolidación (horas reales, rate aplicado, fuente, OT) | Existe, append-only, RLS self-view |
| `historical_payroll_entries` | Staging de payroll externo con `concept_payload` JSONB | **0 filas.** El desglose "rico" del portal depende de esta tabla vacía |
| `payroll_interpreted_entries` | Interpretación de importaciones (detecta `ride`, `daily`, `hourly`, ajuste manual) | Existe |
| `payroll_import_batches`, `imports` | Trazabilidad de archivo importado | Existen |
| `payroll_review_notes` | Notas de revisión (admin) | Existe |

### 2.2 RPC / backend

- `consolidate_period_base_pay(_company_id, _period_id)` — motor nativo, escribe `period_base_pay`. Invocado por `supabase/functions/payroll-consolidate/index.ts`, protegido por `has_action_permission(..., 'aprobar_nomina')`.
- `supabase/functions/import-payroll-extras/index.ts` — **mapea exactamente los conceptos del Excel** (`payperDay`, `ryde`, `tips`, `reimbursements`, `travelHours`, `otros`, `discount`) a `concepts` y los inserta en `movements` como `approval_status: 'approved'`, con deduplicación y `activity_log`.

### 2.3 Frontend

**Admin:** `PayPeriods.tsx` (crear/cerrar/reabrir/publicar), `Movements.tsx` (CRUD manual + import Excel), `EmployeePeriodDetail.tsx` (editar base pay), `PeriodSummary.tsx` (marcar como pagado), `PayrollReviewQueue.tsx` (triage read-only), `WeeklyPayrollReconciliation.tsx` (reconciliación + export ExcelJS), `ImportPayrollExtras.tsx`.

**Worker:** `PayReports.tsx` (pantalla viva en `/portal/pay-reports`), `WeekDetail.tsx`, `PayStub.tsx`, `Accumulated.tsx`, `WorkerPayBreakdownDialog.tsx`, `src/lib/weekly-pay-breakdown.ts`, `useWorkedShiftHistory.tsx`.

`MyPayments.tsx` está **deprecado y no montado** (`/portal/payments` redirige a `/portal/pay-reports`); calculaba `time_entries × rate` sin tope. Se conserva solo para forense.

---

## 3. Qué ve HOY el worker

| Elemento | Estado | Evidencia |
|---|---|---|
| Monto total | **EXISTS** | `PayReports.tsx:543`, `PayStub.tsx:119`, `WeekDetail.tsx:97` |
| Periodo (rango) | **EXISTS** | `PayReports.tsx:535`, `PayStub.tsx:107` |
| Estado (pagado/publicado/cerrado) | **EXISTS** | `PayReports.tsx:145-174`, `PayStub.tsx:94-99` |
| Fecha de pago | **PARTIAL** | Solo si `paid_at` está seteado (`PayStub.tsx:120-124`). En `PayReports` muestra "Importado el", que no es fecha de pago |
| Desglose por concepto | **PARTIAL** | Dos caminos divergentes: `PayStub`/`WeekDetail` muestran `movements` en dos cubos (`extra`/`deduction`); `WorkerPayBreakdownDialog` depende de `historical_payroll_entries.concept_payload` (**tabla vacía**) → cae a `final_total_only` |
| Historial | **EXISTS** | `PayReports.tsx:291-296`, `Accumulated.tsx` (running total) |
| Rides | **NOT IMPLEMENTED** como línea etiquetada | Caen dentro de "Extras" en pantallas vivas |
| Tips | **NOT IMPLEMENTED** como línea etiquetada | Idem. En `weekly-pay-breakdown.ts:91` se clasifican mal como `bonus` |
| Reimbursements | **NOT IMPLEMENTED** como línea etiquetada | Idem |
| Deductions | **EXISTS** | `PayStub.tsx:88/166-182`, `WeekDetail.tsx:67/146-170` |
| Notes visibles | **EXISTS pero riesgoso** | Se renderiza `movements.note` crudo (`PayStub.tsx:154/173`) sin separar nota interna |
| PDF / receipt | **NOT IMPLEMENTED** | Solo `window.print()` en `PayReports.tsx:327-329`. Hay generadores PDF en el repo (`shift-pdf.ts`, `w9-pdf.ts`) pero ninguno cableado a payroll |
| Detalle por turno | **PARTIAL, sin dinero** | `useWorkedShiftHistory` + `HistoricalShiftWorkSummary` muestran horas y estado, nunca monto por turno (decisión deliberada) |

**Rutas huérfanas detectadas:** `/portal/paystub/:periodId` y `/portal/accumulated` están montadas y accesibles por RLS pero **sin punto de entrada** desde el flujo principal `PayReports`. Riesgo de UX divergente.

---

## 4. Qué puede hacer HOY el admin

| Capacidad | Estado | Dónde |
|---|---|---|
| Crear periodo | **EXISTS** | `PayPeriods.tsx:194-213`; generación anual `:215-242` |
| Revisar horas | **EXISTS** | `PayrollReviewQueue.tsx` (read-only), `EmployeePeriodDetail.tsx` |
| Aprobar / cerrar periodo | **EXISTS** | `PayPeriods.tsx:276-315` (bloquea cierre si hay `movements` pendientes); consolidación vía RPC |
| Editar ajustes (movements) | **EXISTS** | `Movements.tsx` CRUD completo + import Excel; bloqueado si el periodo está `closed` |
| Añadir Ride / Tips / Reimbursements / Travel / Discounts | **EXISTS vía concepto genérico** | Formulario manual de `Movements.tsx` (empleado + periodo + concepto + qty/rate/nota) y `CONCEPT_MAP` de `import-payroll-extras`. **No hay acciones dedicadas por tipo** |
| Marcar pagado | **EXISTS** | `PeriodSummary.tsx:450` → `pay_periods.status='paid'`, `paid_at` |
| Publicar al worker | **EXISTS** | `PayPeriods.tsx:317-329` → toggle `published_at`. **No existe columna `visible_to_worker`** |
| Generar recibo / PDF | **NOT IMPLEMENTED** | Sin generación de PDF en payroll (ni admin ni worker) |
| Exportar | **EXISTS** | `WeeklyPayrollReconciliation.tsx:199-289` (ExcelJS multi-hoja), CSV en `Movements.tsx` |
| Importar settlement externo | **EXISTS** | `import-payroll-extras` edge fn + `Movements.tsx` import + `/app/import` |
| Reconciliar | **EXISTS (read-only)** | `WeeklyPayrollReconciliation.tsx` contra `period_base_pay`, tolerancia $0.01 |

---

## 5. Mapeo Payroll 142 (referencia estructural) → Stafly

Columnas de la hoja `PAYROLL` (índices 39-50 del archivo de referencia):

| Concepto Excel | Equivalente Stafly | Clasificación |
|---|---|---|
| `Total pay` | `period_base_pay.base_total_pay` | **SUPPORTED** |
| `Payper Day` | `concepts` "Pago/dia" (`hybrid`, 200.00) / "Daily Pay" / "Weekend Job" → `movements` | **SUPPORTED** |
| `Ryde` | `concepts` "Pago de Transporte Regular" (100.00) / "Especial Ryde" / "Pago de Transporte Especial" (160.00) → `movements` | **SUPPORTED** |
| `TIPS` | `concepts` "Propinas" (`manual_value`) → `movements` | **SUPPORTED** (dato) / **PARTIAL** (no etiquetado en portal) |
| `Reimbursements` | `concepts` "Reintegros" (`manual_value`) → `movements` | **SUPPORTED** (dato) / **PARTIAL** (portal) |
| `Travel Hours` | `concepts` "Horas de viaje" (`quantity_x_rate`, 15.00) → `movements` | **SUPPORTED** |
| `Otros` | `concepts` "Otros pagos" (`manual_value`) → `movements` | **SUPPORTED** |
| `Discount` | `concepts` categoría `deduction`: "Descuentos", "Adelantos/Préstamo" → `movements` con `total_value` negativo | **SUPPORTED** |
| `TOTAL` | Derivado: `base_total_pay + Σ movements.total_value` | **PARTIALLY SUPPORTED** — se recalcula en cliente; **no existe campo persistido de total final** |
| `Observaciones` | `movements.note` / `payroll_review_notes` | **AMBIGUOUS** — no hay separación interna/visible |
| `Date` (fecha de pago) | `pay_periods.paid_at` | **PARTIALLY SUPPORTED** — a nivel periodo, no por trabajador |
| `Corte` (rango) | `pay_periods.start_date` / `end_date` | **SUPPORTED** |
| `Employer identification` / `Verification SSN-EIN` | `employees` + `historical_payroll_entries.ssn_last4` / `employer_identification_hash` | **SUPPORTED, NO EXPONER AL WORKER** |
| Nº de payroll (142) | `pay_periods.sequence_number` | **SUPPORTED** |
| `Manager notes` (VERIFIED) | Sin equivalente en el statement | **NO EQUIVALENT** (y no debe ser visible) |

**Conclusión del mapeo:** 9 de 12 conceptos monetarios ya tienen equivalente canónico exacto. Los tres puntos débiles son **total final persistido**, **fecha de pago por statement** y **separación de notas**.

---

## 6. Gaps

| # | Gap | Severidad | Naturaleza |
|---|---|---|---|
| G1 | No existe **total final persistido** del statement (`base + extras − deducciones`). Se recalcula en cada pantalla → riesgo de divergencia entre admin, portal y el Excel | 🔴 Alta | Modelo |
| G2 | El adaptador de desglose "rico" (`weekly-pay-breakdown.ts`) lee `historical_payroll_entries`, tabla con **0 filas**; siempre degrada a `final_total_only`. La verdad real está en `movements` y no se usa allí | 🔴 Alta | Adaptador |
| G3 | Portal muestra solo `extra`/`deduction`: Ride, Tips, Reintegros, Travel indistinguibles | 🟠 Media | Presentación |
| G4 | `movements.note` visible al trabajador sin separar nota interna (771 notas existentes) | 🔴 Alta | Privacidad |
| G5 | RLS de `pay_periods` no filtra por `published_at`: el trabajador puede leer periodos no publicados | 🟠 Media | Seguridad |
| G6 | RLS de `movements` self-view no filtra por `approval_status`: el trabajador puede leer movimientos `pending` y `denied` (185 filas) | 🟠 Media | Seguridad |
| G7 | Sin campo `source` / `origin` en el statement (`external_approved` vs `stafly_calculated`) | 🟠 Media | Modelo |
| G8 | Sin `published_at` / `approved_at` a nivel **trabajador** (solo a nivel periodo) | 🟡 Baja | Modelo |
| G9 | Sin recibo PDF descargable | 🟡 Baja | Feature |
| G10 | Rutas huérfanas `/portal/paystub`, `/portal/accumulated` con lógica de desglose distinta a la viva | 🟠 Media | Consistencia |
| G11 | Solo 1 de 212 periodos tiene `published_at` → si se activa hoy, el portal aparece casi vacío | 🟠 Media | Operación |

---

## 7. Riesgos

1. **Divergencia de total (crítico).** Si el total mostrado al trabajador se recalcula en cliente y el archivo externo dice otra cifra, se genera disputa laboral. El statement debe congelar el número aprobado.
2. **Fuga de notas internas.** `movements.note` incluye texto operativo/administrativo. Publicar sin separar es un riesgo reputacional inmediato.
3. **Movimientos pendientes visibles.** 184 movimientos `pending` son legibles por el trabajador; publicar podría mostrar montos que luego cambian o se deniegan.
4. **Doble verdad.** Ya coexisten payroll nativo y reconciliación externa (MRI-001). Un tercer camino "statement" crearía el silo que el usuario pide evitar.
5. **Expectativa de adopción.** Publicar con solo 1 periodo publicado y desglose colapsado a "total final" produce una primera impresión pobre.
6. **Datos sensibles del Excel.** El archivo de referencia contiene SSN/EIN, teléfono, email, GPS y selfies. Nada de esa columna puede alcanzar el statement.

---

## 8. SSOT recomendado (propuesta — NO implementado)

**Reutilizar el modelo existente. No crear tablas nuevas de pagos.**

```
pay_periods            → canonical period      (ya existe)
employees              → canonical worker      (ya existe)
period_base_pay        → base amount           (ya existe)
movements + concepts   → canonical line items  (ya existe)
```

Puente mínimo (una capa delgada, no un motor):

| Elemento canónico | Dónde vive | Cambio propuesto |
|---|---|---|
| `canonical period` | `pay_periods` | ninguno |
| `canonical worker` | `employees.id` | ninguno |
| `canonical line items` | `movements` | añadir `worker_visible_note text` y `is_worker_visible boolean default true` |
| `canonical total` | nuevo `pay_statements` (1 fila por trabajador+periodo) | `final_total numeric` **congelado** al publicar |
| `source / origin` | `pay_statements.source` | enum `external_approved` \| `stafly_calculated` |
| `status` | `pay_statements.status` | `draft` \| `approved` \| `published` \| `paid` |
| `approved_at` / `approved_by` | `pay_statements` | — |
| `published_at` / `published_by` | `pay_statements` | — |
| `visible_to_worker` | `pay_statements` | derivado de `status in ('published','paid')`, aplicado **en RLS**, no en UI |

`pay_statements` **no calcula nada**: es la foto aprobada (total + puntero al periodo + origen + timestamps). Los line items siguen siendo `movements`. Mañana, cuando el motor nativo se certifique, `consolidate_period_base_pay` produce exactamente el mismo `pay_statements` con `source='stafly_calculated'`. **Mismo statement, mismo portal, cero migración de pantallas.**

Regla de oro que ya cumple el código actual y debe mantenerse: **nunca derivar pago desde `scheduled_shifts` ni recalcular desde `time_entries` en la capa de statement.**

---

## 9. Camino mínimo sin crear silo (propuesta — NO implementado)

Orden sugerido, cada paso independiente y reversible:

1. **Notas seguras (G4).** Añadir `worker_visible_note` a `movements`; el portal deja de renderizar `note`. Sin esto no se debe publicar nada.
2. **Endurecer RLS (G5, G6).** `pay_periods` self-view solo con `published_at is not null`; `movements` self-view solo `approval_status='approved'`.
3. **Un solo adaptador de desglose (G2, G3, G10).** Reescribir `weekly-pay-breakdown.ts` para leer `movements + concepts` (fuente real) y clasificar por concepto → `base`, `pay_per_day`, `ride`, `tips`, `reimbursement`, `travel`, `other`, `deduction`. Retirar/redirigir `/portal/paystub` y `/portal/accumulated`. Cero pantallas nuevas.
4. **`pay_statements` + total congelado (G1, G7, G8).** Tabla mínima; RPC único `publish_pay_statement(period_id)` que congela `final_total` por trabajador y sella `published_at`, con `activity_log`.
5. **Admin: reusar lo existente.** Crear/abrir periodo (`PayPeriods`) → cargar resultado aprobado (`import-payroll-extras` o el formulario manual de `Movements`) → revisar → **Publicar statements**. Un solo botón nuevo. Ninguna pantalla nueva.
6. **(Opcional, después)** Recibo PDF reutilizando los generadores existentes del repo.

Estimación de superficie: ~1 tabla, ~2 columnas, ~2 políticas RLS, 1 RPC, 1 adaptador reescrito, 1 botón. **Ningún motor de cálculo nuevo.**

---

## 10. Qué NO tocar

- `time_entries`, `shift_assignments`, `scheduled_shifts`, `clock_events` — intactos.
- `consolidate_period_base_pay` y el flujo nativo de consolidación — intacto.
- `period_base_pay.import_id` (176 filas protegidas) — no sobrescribir.
- Reconciliación externa (Connecteam) y `PayrollSourceGuardrailBanner` — se mantiene como fuente declarada.
- `auth`, PIN canónico, `company_users`, `employees`, documentos, chat, bookings, campañas, partner logic.
- Nunca exponer al trabajador: SSN, EIN, `employer_identification_raw/hash`, datos bancarios, `Manager notes`, `payroll_review_notes`, notas internas de `movements`, ni ninguna fila de otro trabajador.
- No usar horas programadas como base de pago, en ninguna circunstancia.

---

## 11. QA recomendado (contra casos del Payroll 142)

| Caso | ¿El modelo actual lo representa? | Nota |
|---|---|---|
| Solo base pay | ✅ Sí | `period_base_pay` sin `movements` |
| Con Ride | ✅ Sí | concepto "Pago de Transporte Regular/Especial" |
| Con Pay per Day | ✅ Sí | "Pago/dia" (`hybrid`) / "Weekend Job" |
| Con Tips | ✅ Dato sí / ⚠️ portal no etiqueta | "Propinas" (`manual_value`) |
| Con Reimbursement | ✅ Dato sí / ⚠️ portal no etiqueta | "Reintegros" |
| Con Travel | ✅ Sí | "Horas de viaje" (`quantity_x_rate`, 15.00) |
| Con Discount | ✅ Sí | categoría `deduction`, valor negativo |
| Combinación de varios | ✅ Sí | N filas en `movements` |
| Total 0 | ⚠️ Ambiguo | No se distingue "0 real aprobado" de "sin fila". Requiere `pay_statements` con `final_total = 0` explícito |
| Notas internas | ❌ No | Se filtrarían al trabajador. Bloqueante |
| Trabajador sin match de identidad | ⚠️ | `historical_payroll_entries.needs_identity_review` existe pero la tabla está vacía; el import manual matchea por nombre normalizado |

Pruebas de seguridad obligatorias antes de publicar: sesión de trabajador A no puede leer statements de B; trabajador no ve periodos sin publicar; trabajador no ve movimientos `pending`/`denied`; ninguna respuesta contiene SSN/EIN/notas internas.

---

## 12. Veredicto

# 🟡 READY WITH SMALL BRIDGE

Stafly **no necesita un motor de payroll nuevo ni un segundo sistema de pagos** para publicar un Pay Statement aprobado. El periodo, el total base, los line items por concepto, el catálogo exacto de conceptos del Excel, la vía manual, la vía de importación aprobada, la publicación por `published_at` y las RLS self-view **ya existen y están en producción**.

El puente faltante es delgado y no desechable: **total final congelado + origen del resultado + separación de notas visibles/internas + RLS de publicación real + un único adaptador de desglose leyendo `movements`**. Todo ello se construye sobre el mismo modelo que mañana consumirá el payroll calculado desde `time_entries`, con `source='stafly_calculated'` en lugar de `external_approved`. **No se crea silo.**

**Bloqueantes antes de cualquier publicación al trabajador:** G4 (notas internas expuestas), G6 (movimientos pendientes visibles), G1 (total no congelado).

---

*Auditoría estática y read-only. Cero escrituras, cero migraciones, cero importaciones. A la espera de autorización para implementar.*
