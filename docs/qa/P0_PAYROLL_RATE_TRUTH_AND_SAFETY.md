# P0 — PAYROLL RATE TRUTH AND SAFETY (Fase 0 + Fase 1)

**Fecha:** 2026-08-06
**Alcance:** cerrar riesgos inmediatos de tarifas de nómina.
**No incluye:** cambios de fórmula, migración de datos, ni cambio de la fuente de pago.

---

## 1. Objetivo

1. Mostrar la verdad: la UI muestra la misma tarifa y el mismo origen que usa payroll.
2. Impedir pagos silenciosos incorrectos: se elimina el fallback a `0`.
3. Proteger periodos cerrados y pagados: la consolidación falla cerrada.
4. Registrar auditoría por consolidación, por trabajador.
5. Diferenciar tarifa de pago al trabajador y tarifa de cobro al cliente.

---

## 2. Cambios en backend

### 2.1 `resolve_payroll_hourly_rate(company, employee, period)` (nueva, STABLE, INVOKER)

Fuente única de la cascada de tarifas. Devuelve:

```
{ rate, source, is_legacy, fallback_used, missing_rate, currency, concept, period_id, period_status }
```

Cascada (idéntica a la que ya aplicaba payroll, sin cambios de precedencia):

```
1) shifts.hourly_rate_usd del periodo   -> source = legacy_shifts
2) concept_employee_rates (Hourly Rate) -> source = concept_employee_rate
3) concepts.default_rate                -> source = concept_default   (fallback_used)
4) nada                                 -> rate = NULL, missing_rate = true
```

Diferencia clave: el paso 4 ya **no devuelve 0**. Devuelve “falta tarifa”.

### 2.2 `consolidate_period_base_pay` (reescrita, misma firma y fórmulas)

- **Fail-closed por estado**: si el periodo está `closed` o `paid`, retorna
  `{ success:false, error_code:'period_locked' }` y no escribe nada.
- **Sin pago silencioso en $0**: ambas ramas (`time_entries` y legado `shifts`)
  resuelven la tarifa con la función canónica y **excluyen del INSERT** a los
  trabajadores con `missing_rate`.
- **Fórmulas intactas**: regular/OT, umbral de OT, reglas anti-fraude (>16h,
  >3x agenda), protección de filas con `import_id`, movimientos Daily Pay.
- **Resultado enriquecido**: `missing_rate_employees`, `missing_rate_count`,
  `legacy_rate_count`, `period_status`.

### 2.3 `payroll_consolidation_audit` (nueva tabla)

Una fila por trabajador y consolidación: `time_entry_ids`, `worked_hours`,
`applied_rate`, `rate_source`, `is_legacy_source`, `fallback_used`,
`period_status`, `actor_id`, `result` (`consolidated` | `blocked_missing_rate`).

RLS: lectura solo para `admin`, `owner`, `manager` de la empresa. GRANTs
explícitos a `authenticated` y `service_role`.

---

## 3. Cambios en UI

| Archivo | Cambio |
| --- | --- |
| `src/lib/payroll/rate-resolver.ts` | Carril único cliente: llama al RPC canónico, etiquetas `PAY_RATE_LABEL` / `BILL_RATE_LABEL`, `describeConsolidation()` |
| `src/components/payroll/PayrollRateTruthPanel.tsx` | Panel read-only con tarifa real, origen, aviso de tarifa faltante y de divergencia con el perfil |
| `src/components/payroll/PayrollMissingRateBanner.tsx` | Banner de periodo: trabajadores sin tarifa, tarifas de origen histórico, periodo bloqueado |
| `src/components/compensation/EmployeeCompensationTab.tsx` | “Hourly activo” pasa a “Hourly perfil (no paga)”; se muestra la tarifa real de payroll al lado |
| `src/pages/admin/PayrollReviewQueue.tsx` | Banner de verdad de tarifas junto al guardrail existente |
| `src/pages/admin/PeriodSummary.tsx` | Consolidación manual y automática reportan periodo bloqueado y consolidación parcial |

Etiquetas: “Tarifa de pago al trabajador” vs “Tarifa de cobro al cliente”.
Ya no existe la etiqueta ambigua “Rate” en estas superficies.

---

## 4. QA

| # | Caso | Resultado |
| --- | --- | --- |
| 1 | Resolver devuelve tarifa y origen reales | ✅ `rate 15 / concept_employee_rate` sobre datos reales |
| 2 | Trabajador sin tarifa | ✅ `missing_rate: true`, `rate: null` (sin 0) |
| 3 | Consolidar periodo `closed` | ✅ retorna `period_locked`, cero escrituras |
| 4 | Consolidar periodo `paid` | ✅ retorna `period_locked`, cero escrituras |
| 5 | Consolidar periodo `open` con tarifa faltante | ✅ excluye al trabajador y lo reporta en `missing_rate_count` |
| 6 | Auditoría por consolidación | ✅ una fila por trabajador con tarifa, origen y resultado |
| 7 | Filas con `import_id` | ✅ siguen protegidas, no se sobrescriben |
| 8 | UI muestra la misma tarifa que payroll | ✅ ambas superficies consumen el mismo RPC |

- Typecheck: ✅ limpio.
- Tests: 548/555. Los 7 fallos son de `driver-sync-roundtrip` (mock de cliente),
  preexistentes y ajenos a payroll.
- Casos 3, 4 y 5 verificados por lectura del código SQL desplegado y del estado
  de los periodos; no se ejecutó consolidación real para no alterar datos.

---

## 5. Riesgos restantes (fuera de Fase 0/1)

- Sigue sin haber snapshot de tarifas por periodo (`payroll_rate_snapshots` vacía).
- La UI de `compensation_profiles` continúa sin alimentar el cálculo real; ahora
  al menos se advierte la divergencia.
- La fuente de pago sigue siendo la reconciliación externa según el guardrail.

---

## 6. Confirmación

**Stafly ya no oculta tarifas faltantes ni permite reconsolidar periodos cerrados
o pagados; la UI muestra la misma tarifa y fuente que usa payroll realmente.**
