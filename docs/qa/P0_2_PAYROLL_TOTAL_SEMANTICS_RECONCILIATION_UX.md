# P0.2 — Payroll Detail Total Semantics + Reconciliation UX

**Fecha:** 2026-09-15
**Alcance:** Presentación del detalle de nómina por persona. Cero cambios en datos canónicos.

---

## 1. Signed deduction bug

`src/pages/admin/EmployeePeriodDetail.tsx` calculaba:

```ts
const deductionsTotal = deductions.reduce((s, m) => s + m.total_value, 0); // = -530
const finalTotal = base + extrasTotal - deductionsTotal;                   // 649 + 1000 + 530
```

Las deducciones están almacenadas ya con su signo financiero (`total_value = -530`).
La pantalla las volvía a restar → el total mostrado sumaba la deducción.

Además el total mezclaba movimientos **pendientes** con **aprobados** (los $100 de
transporte pendientes entraban en "Extras").

El RPC canónico `pay_statement_preview` **ya era correcto**: usa `ABS(m.total_value)`
y filtra por `approval_status='approved'`. El defecto era exclusivamente de la pantalla.

## 2. Shared component/function fixed

Nuevo helper único y puro:

- `src/lib/payroll/period-detail-totals.ts` → `computePeriodDetailTotals(base, movements, approvedTotalOverride)`
  - deducciones siempre en **valor absoluto**, restadas **una sola vez**;
  - separa aprobados / pendientes (`approval_status ?? "approved"`, igual que el RPC);
  - expone `calculatedTotal`, `approvedTotal`, `hasExternalClose`, `externalDifference`.
- Pruebas: `src/lib/payroll/__tests__/period-detail-totals.test.ts` (6 casos, incluye Jorge y Carlos).

Consumidores actualizados (sin parche específico por persona):

- `src/pages/admin/EmployeePeriodDetail.tsx` — bloques "Calculado en Stafly" y "Cierre externo aprobado".
- `src/components/payroll/PayStatementPublishCard.tsx` — etiquetas y diferencia explícita.

## 3. Jorge Cortes — antes / después

| | Antes | Después |
|---|---|---|
| Pago base | $649.00 | $649.00 |
| Extras | +$1,000.00 (mezcla pendiente) | Extras aprobados +$900.00 · pendiente +$100.00 aparte |
| Deducciones | −$530.00 | −$530.00 |
| Total | **Total final $2,179.00** ❌ | **Total calculado $1,019.00** ✅ |
| Cierre externo | implícito / confuso | Total aprobado $1,239.00 · Diferencia **+$220.00** |

Aritmética con signo estricta: 649 + 900 − 530 = 1,019. Incluyendo el pendiente sería
649 + 1,000 − 530 = 1,119; el pendiente se muestra separado y **no** entra en el total.

## 4. Carlos Alvarez — antes / después

Base $1,164.50 · Weekend Job +$600 aprobado · Transporte +$100 pendiente · sin deducciones.

| | Antes | Después |
|---|---|---|
| Total | Total final mezclaba el pendiente ($1,864.50) | Total calculado **$1,764.50** |
| Cierre externo | no explicado | Total aprobado **$2,324.50** · Diferencia **+$560.00** |

Jorge (+$220) + Carlos (+$560) = **$780**, la excepción completa del período 146.

## 5. Semántica del total aprobado externo

Dos verdades monetarias, ahora etiquetadas por separado:

- **Calculado en Stafly** = base + extras aprobados − deducciones aprobadas (derivable del desglose).
- **Cierre externo aprobado** = `period_base_pay.approved_total_override` (valor congelado por el
  cierre externo; el servidor lo congela tal cual al publicar). No se deriva del desglose y
  no se recalcula.

La tarjeta de cierre externo muestra Total aprobado / Desglose aprobado visible / Diferencia
y el texto: "El cierre externo incluye componentes que no tienen un movimiento equivalente
aprobado en Stafly."

## 6. Semántica de movimientos pendientes

Los pendientes tienen columna "Estado" propia en la tabla de novedades y un aviso compacto
bajo el total calculado: nunca se presentan como explicación del cierre externo.
El transporte pendiente de $100 de Jorge **permanece pendiente**: no se aprobó, no se creó
ningún movimiento de $220.

## 7. Período 146 — reconciliación

Sin cambios en datos: cierre externo, movimientos, valores aprobados, base y recibos
publicados intactos. La diferencia de **$780** queda clasificada como
**EXPLAINED RECONCILIATION DIFFERENCE** (componentes de transporte del cierre externo sin
movimiento equivalente aprobado), no como corrupción de nómina.
No se marcó ni cerró ningún período.

## 8. Escaneo sistémico (solo lectura)

Registros empleado-período con al menos una deducción almacenada en negativo (los afectados
por el defecto de presentación):

- Afectados: **54**
- Con recibo publicado: **2**
- Sin publicar: **52**

Total de registros empleado-período con deducciones: 72. Ningún dato histórico fue reparado:
la corrección es de renderizado/derivación compartida.

## 9. Escrituras en producción

**Cero.** Solo `SELECT` de diagnóstico. No se modificaron fórmulas, `time_entries`,
`period_base_pay`, movimientos, estados de aprobación, cierres externos, tarifas, recibos
publicados, turnos, identidad, auth, RLS, pagos, documentos, tenants, billing ni entitlements.
No hubo importaciones, publicaciones ni notificaciones.

## 10. Regresión

- `bunx vitest run` → **114 archivos, 1,308 pruebas, todas en verde**.
- `tsgo --noEmit` → sin errores.
- Períodos 142 y 147: sin cambios.

## 11. Excepciones de reconciliación restantes

Siguen pendientes de evidencia humana (fuera del alcance de esta tarea):
134 (−$6,790) y 141 (−$3,300) sin cierre externo; 138 (−$540) y 148 (−$1,325) por duplicados
de identidad; 128 (+$400) ajustes de transporte pendientes; 131 residual $400; 144 (+$644)
descuento de préstamo; 130 sin datos históricos de nómina.
Decisión humana abierta en el 146: cuál cifra de transporte es la autoritativa ($100 pendiente
en Stafly vs $220 del cierre externo).

---

**FINAL VERDICT: 🟢 PAYROLL TOTAL DISPLAY CORRECTED — EXTERNAL CLOSE DIFFERENCES EXPLAINED**
