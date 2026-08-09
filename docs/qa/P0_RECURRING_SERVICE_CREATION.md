# P0 — Recurrencia de Servicios (caso QK-001590)

## Qué falló

1. La recurrencia sólo se aplicaba en el camino **Publicar** (`handleCreate`).
   `handleSaveDraft` creaba **una sola** ocurrencia aunque el operador hubiera
   configurado Lunes–Jueves. QK-001590 nació como borrador → 1 Servicio.
2. QuickCreate no tiene recurrencia (fuera de alcance, sigue siendo 1 Servicio).
3. En el bucle de repetición se manipulaba `selectedEmployees` con `setState`
   y `createSingleShift` leía el estado viejo (closure stale): copiar equipo
   podía corromperse o filtrarse a ocurrencias que no debían tenerlo.
4. No había idempotencia: doble tap o reintento creaba duplicados.

## Qué se corrigió

- `src/lib/shifts/recurrence.ts` — modelo puro de la serie: `intentId`,
  referencia por ocurrencia `series:<intentId>:<fecha>`, plan ordenado con la
  fecha origen incluida, resumen y micro-copy.
- `src/pages/admin/Shifts.tsx`
  - `createServiceSeries()` — único camino de creación para borrador y
    publicación. La ocurrencia origen y las repeticiones usan la misma escritura.
  - `createSingleShift(..., opts)` acepta `employeeIds` y `sourceRef` explícitos:
    ya no depende del estado de React dentro del bucle.
  - Idempotencia real: antes de insertar se busca por
    `(company_id, reconciliation_hash = sourceRef)`; si existe, se reutiliza.
    También en el camino de error, para cubrir carreras.
  - Un fallo al copiar equipo **no** borra ni aborta la serie: se reporta la
    fecha afectada y el Servicio se conserva.
  - `recurrenceIntentRef` vive mientras dure el formulario y se limpia en
    `resetForm()`.

## Garantías

| Requisito | Estado |
|---|---|
| Cada ocurrencia con UUID propio | Sí (insert independiente) |
| Cada ocurrencia con QK propio | Sí (secuencia por empresa, sin cambios) |
| Trazabilidad de la serie | `reconciliation_hash = series:<intentId>:<fecha>` |
| Recurrencia en borrador | Sí |
| Recurrencia al publicar | Sí (origen publicado, repeticiones en borrador) |
| Copia de equipo opcional | Sí, y nunca condiciona la creación |
| Doble tap / retry | Idempotente por referencia de ocurrencia |
| Payroll / VWC / asistencia | Sin tocar |

## Pruebas

`src/test/recurring-service-creation.test.ts` — 9 tests en verde, incluyendo la
regresión Lunes–Jueves (4 ocurrencias), cruce de mes, deduplicación de fechas y
Servicio creado con equipo fallido.
