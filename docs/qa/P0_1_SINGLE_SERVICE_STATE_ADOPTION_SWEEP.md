# P0.1 — Single Service State: barrido de adopción

Objetivo: que ninguna superficie del servicio mantenga una representación viva propia.
Contrato canónico: `src/lib/shifts/service-state.ts` + `useServiceState` + `updateShiftVerified` + `reconcileServiceAfterSave` + `subscribeToServiceChanges`.

## Superficies ya conformes (verificadas, sin cambios)
- `src/components/shifts/ShiftDetailDialog.tsx` — lee por `useServiceState`.
- `src/components/shifts/mobile/MobileShiftOperationsSheet.tsx` — lee por `useServiceState`.
- `src/components/shifts/mobile/MobileShiftEditSheet.tsx` — guarda con `updateShiftVerified` y reconcilia.
- `src/pages/admin/Shifts.tsx` — reconcilia y se suscribe a cambios.

## Hallazgos y migración

### 1. `src/pages/admin/MobileShiftsView.tsx`
- **Causa:** `select()` parcial en la lista (sin `meeting_point`, transporte, etc.) + snapshots congelados `detailShift` / `editShift` capturados al tocar la tarjeta; sin suscripción a cambios del servicio.
- **Por qué sobrevivió:** el P0 anterior migró las hojas de detalle/edición, pero no el productor de sus props.
- **Migración:** lectura completa `select("*")`; siembra de cada fila en la cache canónica (`writeServiceRow`); `resolveLive()` resuelve cache canónica > lista > snapshot para las props de detalle y edición; `subscribeToServiceChanges` recarga la lista.
- **Riesgo:** bajo. Solo lectura y presentación; misma RLS y mismo rango de fechas.
- **QA:** abrir servicio desde la lista, editar en otra superficie, volver: los campos aparecen actualizados sin recargar.

### 2. `src/pages/admin/ShiftOperations.tsx`
- **Causa:** cargaba el servicio con su propio `select("*").single()` sin filtro de empresa, lo guardaba en `useState` propio y escribía con `update()` directo (sin verificación de filas afectadas ni reconciliación).
- **Por qué sobrevivió:** ruta `/app/shift-ops`, fuera del árbol de `Shifts.tsx`, no aparecía en la lista de superficies de detalle.
- **Migración:** lectura acotada por `company_id` con `maybeSingle()`, siembra en la fuente canónica, guardado por `updateShiftVerified` + `reconcileServiceAfterSave`, y suscripción a cambios del servicio para refrescar en background.
- **Riesgo:** medio-bajo — el guardado ahora falla explícitamente si RLS bloquea (antes fallaba en silencio). Es el comportamiento deseado.
- **QA:** editar desde Shift Ops y comprobar que la lista, el detalle desktop y móvil muestran el mismo valor sin recargar; editar un servicio de otra empresa debe negarse con mensaje claro.

### 3. `src/pages/admin/OperationsCommandCenter.tsx`
- **Causa:** `selectedShift` derivado de una lista propia sin re-sincronización tras cambios del servicio.
- **Por qué sobrevivió:** vista agregada de solo lectura; no se consideró superficie de servicio.
- **Migración:** suscripción a `subscribeToServiceChanges` para recargar los datos del tablero.
- **Riesgo:** bajo (solo lectura; la recarga está acotada a la empresa activa).
- **QA:** con el tablero abierto, editar un servicio en otra pestaña/superficie y ver el drawer actualizado.

## Fuera de alcance (no son representaciones vivas del servicio)
Importadores, reportes, facturación, portal del worker y motores de despacho leen `scheduled_shifts` como datos históricos o agregados por lote, no como estado editable de un servicio abierto en pantalla.

## Verificación
- `bunx tsgo --noEmit`: sin errores.
- Suite completa: 514 tests en verde (45 archivos).
