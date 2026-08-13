# P0 — SERVICE ROOT QK DISPLAY CONSOLIDATION

Fuente: `docs/qa/P0_SERVICE_EVENT_MODEL_OPTION_B_DESIGN.md` (recomendación B1).

## Regla aplicada

- El turno **raíz** es el servicio canónico; su `shift_ref` es el **único QK visible**.
- Los horarios hijos (`parent_shift_id`) conservan su `shift_ref` en base de datos
  (no se borra, no se renumera, no se toca ninguna FK) pero **nunca** se muestran
  como identificador principal: quedan como referencia técnica en el tooltip.
- Si la raíz aún no se conoce, el hijo muestra su propia referencia. Nunca se inventa un QK.
- Turnos sin `parent_shift_id` (todo el histórico) se comportan exactamente igual que antes.

## Implementación (solo presentación)

| Archivo | Rol |
|---|---|
| `src/lib/shifts/service-ref-registry.ts` | Registro en memoria `id → shift_ref` de raíces, con suscripción. Puro, sin writes. |
| `src/lib/shifts/shift-identity.ts` | `getShiftDisplayIdentity` resuelve el QK raíz: nuevos campos `isServiceSegment`, `serviceRef`, `serviceId`, `segmentLabel`, `segmentRef`, y nuevo `primaryRefKind: "service_root"`. |
| `src/hooks/useServiceRootRefs.ts` | Registra las filas cargadas y descarga (`select id, shift_ref`) las raíces que falten. Solo lectura. |
| `src/lib/shifts/shift-ref.ts` | `matchesShiftQuery` acepta el QK raíz: buscar `QK-001655` devuelve todos sus horarios. |
| `src/components/shifts/types.ts` | El tipo `Shift` expone `parent_shift_id` y `segment_label`. |
| `src/components/shifts/ServiceSegmentsPanel.tsx` | Publica en el registro las referencias del grupo ya consultado. |

Superficies enganchadas (todas comparten `getShiftDisplayIdentity`, por lo que la
consolidación es global): tarjetas de servicio, drawer/detalle, Command Center
(`TodayHubView`), calendario y lista de `/app/shifts`, vista móvil de servicios,
portal (`PortalShiftDetailDrawer`), búsquedas, cabeceras, closeout y payroll queue.

En el detalle, junto al QK raíz aparece el chip del horario (`Setup`, `Service`,
`VIP`, `Breakdown`), de modo que la lectura es "estoy en QK-001655 administrando Setup".

## Protegido

Sin migraciones, sin cambios de RLS, sin renumerado. `payroll`, `time_entries`,
`shift_assignments`, `clock`, `closeout` y `bookings` siguen operando por `id` de fila:
ninguna consulta de escritura fue modificada.

## QA (`src/test/service-root-qk.test.ts`, 7 casos, verde)

1. Raíz + 2 hijos → las tres filas muestran `QK-001655`. ✅
2. Hijo seleccionado → etiqueta de segmento visible y `segmentRef` sólo como dato técnico. ✅
3. Búsqueda por QK raíz → devuelve raíz e hijos. ✅
4. Históricos sin padre → conservan su propio QK (o el fallback legado). ✅
5. Payroll / time_entries → sin cambios de consulta ni de esquema. ✅
6. Raíz no cargada → el hijo muestra su ref propia; no se inventa nada. ✅

`vitest`: 18/18 tests verdes (incluye la suite previa de identidad de turno).
