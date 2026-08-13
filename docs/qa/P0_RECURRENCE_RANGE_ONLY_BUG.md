# P0 — Recurrencia con rango de fechas creaba 1 Servicio

## Caso

Repetir turno activo, Desde 14 Ago, Hasta 16 Ago. El modal mostró
"Crear 1 Servicio" y al publicar sólo nació el Servicio del 14.

## Auditoría

1. **Payload de Repeat**: `RepeatConfig` con `mode = "weekdays"` (valor por
   defecto), `selectedDays = []`, `rangeStart = 2026-08-14`,
   `rangeEnd = 2026-08-16`.
2. **Publicar no usa otro camino**: `captureSeriesIntent` → `freezeRecurrenceSubmit`
   → `createServiceSeries`. Origen y repeticiones comparten la misma escritura.
   No hay `createSingleService()` alternativo.
3. **Condición que descartaba las fechas**: en `computeRepeatDates`, el modo
   `weekdays` retornaba `[]` cuando `selectedDays.length === 0`, ignorando el
   rango explícito del operador. La serie quedaba en su fecha origen.
4. **Modal**: ya usaba el mismo cálculo; mostraba 1 porque el cálculo devolvía 0
   repeticiones. Corregido el cálculo, confirmación y creación coinciden.

## Corrección

`src/components/shifts/ShiftRepeatSection.tsx` — `computeRepeatDates`:

- Modo `weekdays` sin días marcados = **sin restricción**: se generan todas las
  fechas del rango. Si además no hay rango, no hay intención de repetir → `[]`.
- Modo `range` admite un extremo faltante: sin inicio se usa la fecha del
  Servicio; sin fin, el rango es un solo día.
- Rango invertido sigue produciendo cero fechas.

No se tocó payroll, `time_entries`, `shift_assignments`, RLS, duplicación de
Servicios, secuencia QK ni datos de producción.

## Pruebas

`src/test/repeat-range-dates.test.ts` (6/6) más las suites de recurrencia y del
motor de series: 28/28 en verde.
