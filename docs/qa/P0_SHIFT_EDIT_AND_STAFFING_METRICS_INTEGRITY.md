# P0 — Integridad de edición y semántica de cobertura del turno

Turno investigado: **QK-001573** (`88469adb-077b-4900-9e0f-acd47edba935`), 23 plazas.

## Fase 1 — Datos reales (backend)

| Dato | Valor |
|---|---|
| Plazas requeridas (`slots`) | 23 |
| Asignaciones vivas | 13 |
| Con `status = confirmed` | 1 |
| `response_status = needs_reacceptance` | 1 (la misma) |
| Pendientes de respuesta | 12 |
| Última actualización del turno | 2026-08-01 22:08 UTC |

Bitácora: la persona aceptó a las **21:59**; a las **22:08** el turno cambió de forma
material y el sistema la marcó `needs_reacceptance`. Es decir: **está cubierta pero ya no
está confirmada** hasta que vuelva a aceptar.

## Fase 2 — Causa raíz de "1/23 vs 13/23"

No había un error de datos: había **dos definiciones distintas de la misma palabra**.

- Calendario (`WeekByJobView`): mostraba `aceptados / plazas` → **1/23**.
- Detalle del turno: mostraba `asignaciones / plazas` → **13/23**.
- Team Hub: contaba `confirmed` incluso cuando la aceptación ya estaba invalidada.

## Fase 3 — Fuente única de verdad

Nuevo módulo puro `src/lib/shifts/staffing-metrics.ts`:

```
Cobertura     = asignados activos / plazas       → "13 de 23 cubiertos"
Confirmación  = confirmados / asignados activos  → "0 de 13 confirmó"
```

Reglas: retirados y rechazados no cubren; `needs_reacceptance` cubre pero **no** confirma;
una aceptación importada no cuenta como confirmación de la persona. Nunca se muestra
confirmación sobre plazas requeridas.

Superficies alineadas: calendario semanal, detalle del turno (barra, plazas y barra de
mando de equipo), Team Hub (`team-hub-model`) y Hoy/Ops (`derive-shift-ops-state`).

Cobertura de pruebas: `src/test/staffing-metrics.test.ts` (8 casos, incluido el escenario
exacto de QK-001573). Suite completa: **368 pruebas en verde**.

## Fase 4 — Integridad de la edición

Los cambios **sí** llegaban a la base (el turno registró `updated_at` 22:08), pero el
guardado no era verificable: ambos flujos hacían `update().eq("id", …)` **sin `select()`**.
Un UPDATE bloqueado por permisos devuelve 200 con cero filas → la pantalla anunciaba
"Turno actualizado" aunque no se hubiera guardado nada, y la UI se refrescaba con el
payload local en vez de con la fila real.

Nuevo helper `src/lib/shifts/update-shift.ts` (`updateShiftVerified`):

1. filtra además por `company_id` (blindaje de inquilino);
2. hace `select("*").maybeSingle()` — sin fila devuelta **no hay éxito**;
3. compara la fila releída contra los campos enviados y reporta los que no se aplicaron;
4. en fallo, el móvil **mantiene la hoja abierta con los cambios del operador**.

Aplicado en `MobileShiftEditSheet.tsx` y en `handleEditShift` de `Shifts.tsx`. Ambas
pantallas ahora refrescan con la fila devuelta por el backend.

No se tocaron fichajes, horas, payroll, `shift_ref` ni `company_id`.

## Confirmación

**Los cambios del turno persisten y todas las superficies distinguen correctamente
cobertura de confirmación.**
