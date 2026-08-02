# P0 — SINGLE SERVICE STATE · Causa raíz y corrección

Fecha: 2026-08-02 · Alcance: UI/estado. Cero cambios en DB, RLS, payroll, fichajes, `shift_ref`, multi-driver, `getShiftStaffingMetrics` ni `updateShiftVerified`.

## 1. Causa raíz exacta

No era cache de React Query, ni realtime. **No existía estado de servicio: existían snapshots.**

Tres defectos concretos, todos verificados en código:

1. **Snapshot congelado en desktop.** `src/pages/admin/Shifts.tsx` guardaba `selectedShift` como una **copia** del objeto al hacer clic (`handleShiftClick` → `setSelectedShift(s)`). `loadData()` refrescaba el array `shifts` pero **nunca re-sincronizaba `selectedShift`**. El detalle seguía renderizando la versión del clic hasta cerrar y reabrir (y aun así podía perder campos, ver punto 3).
2. **`select()` parcial en móvil.** `src/pages/admin/MobileShiftsView.tsx` cargaba una lista de columnas explícita que **omite** `meeting_point`, ubicación operativa, transporte, `shift_admin_id`, etc. Esa fila incompleta se pasaba como prop al detalle **y al editor**. Guardabas meeting point, la DB quedaba correcta, y al reabrir la hoja el campo volvía vacío/antiguo porque la fuente ya no lo contenía.
3. **Sin reconciliación tras guardar.** Ambos editores hacían `updateShiftVerified` → `toast.success` → cerrar → refetch en segundo plano. El cierre ocurría **antes** de que el estado visible coincidiera con la DB, y cada superficie invalidaba lo suyo a mano (o nada).

Consecuencia: `scheduled_shifts` correcta, UI mostrando una de N versiones distintas del mismo servicio.

## 2. Estado ANTES

```text
DB scheduled_shifts
 ├─ Shifts.tsx      select("*")        → useState shifts[] ─┐
 │                                       useState selectedShift (COPIA congelada) → ShiftDetailDialog (props)
 ├─ MobileShiftsView select(parcial)   → useState shifts[] ─┐
 │                                       useState detailShift (COPIA parcial) ──→ MobileShiftOperationsSheet
 │                                       useState editShift  (COPIA parcial) ──→ MobileShiftEditSheet (defaultValues)
 ├─ useTodayOperations  fetch propio   → Today Hub
 ├─ Team Hub / TimeClock / PRQ         → fetches propios
 └─ (sin fuente común, sin invalidación común)
```

## 3. Estado DESPUÉS

```text
DB scheduled_shifts
        │  fetchServiceRow(company_id, shift_id)  ← select("*") siempre scoped al tenant
        ▼
 CACHE CANÓNICA  key = ["service-state", company_id, shift_id]
        │   (guardia de versión por updated_at: nunca degrada)
        ├─ ShiftDetailDialog          → useServiceState (prop = solo semilla visual)
        ├─ MobileShiftOperationsSheet → useServiceState
        ├─ MobileShiftEditSheet       → reconcileServiceAfterSave antes de cerrar
        └─ listas / Today Hub / calendario
              ← invalidateServiceEverywhere() + subscribeToServiceChanges()
```

Archivos nuevos:
- `src/lib/shifts/service-state.ts` — contrato canónico.
- `src/hooks/useServiceState.ts` — lectura observable por superficie.
- `src/test/service-state.test.ts` — 8 tests.

## 4. Queries y keys afectadas

| Superficie | Antes | Después |
| --- | --- | --- |
| Detalle desktop | prop snapshot | `["service-state", companyId, shiftId]` |
| Hoja móvil de operación | prop snapshot parcial | misma key canónica |
| Editor móvil | `defaultValues` desde prop | reconcilia con la fila releída |
| Lista desktop / calendario | `useState` + `refreshShifts()` | igual + suscripción a `service-state:changed` y re-sync de `selectedShift` |
| Lista móvil | `useState` + `reloadKey` | recibe fila reconciliada en `onSaved` |
| Today Hub / Team Hub / PRQ / Time Clock / Validation Center | invalidación ad-hoc o ninguna | prefijos invalidados por `invalidateServiceEverywhere` |

`serviceStateKey` incluye **siempre** `company_id` y `shift_id`: el mismo `shift_id` en otra empresa es otra entrada de cache (fail-closed multi-tenant).

## 5. Invalidación consolidada

Una sola función: `invalidateServiceEverywhere(queryClient, companyId, shiftId)`.
Invalida la key canónica + los prefijos `shifts`, `shift-coverage`, `shift-role-slots`, `today-operations`, `today-hub`, `team-hub`, `validation-center`, `prq`, `timeclock`, `staffing-metrics`, `service-requests`, y emite `emitServiceChanged` para las superficies que todavía cargan con `useState` + fetch manual. Ningún componente vuelve a inventar su propia lista.

## 6. Realtime

Auditado `useTodayOperations` (`daily-ops-shifts-${companyId}`, filtro `company_id=eq.…`): el handler **solo dispara un refetch**, nunca inyecta el payload del evento. Por lo tanto un evento atrasado no puede sobrescribir una versión más reciente. Para el caso en que alguna superficie quiera consumir payload en el futuro, `mergeServiceRow`/`isNewerServiceRow` imponen orden temporal por `updated_at` y descartan lo más antiguo.

## 7. Formularios

- `MobileShiftEditSheet`: en error **no cierra**, no muestra éxito y conserva los cambios locales; en éxito reconcilia con el backend y solo entonces cierra y notifica (OX-1).
- `ShiftDetailDialog` y la hoja móvil ya no mantienen estado de edición propio: delegan al editor canónico y renderizan la versión canónica.

## 8. Continuidad de carga

`useServiceState` muestra la semilla de la lista al instante y reconcilia en segundo plano (`isReconciling`), sin spinner de pantalla completa, sin desmontar la vista y sin perder scroll. `isInitialLoading` solo es true cuando literalmente no hay nada que pintar.

## 9. QA

| Caso | Resultado |
| --- | --- |
| 1 — Editar cliente | DB, detalle, lista y calendario coinciden; refresh conserva |
| 2 — Título / ubicación / meeting point | Ninguna superficie vuelve al valor viejo (era el fallo del `select()` parcial móvil) |
| 3 — Navegar fuera y volver | Datos nuevos permanecen (re-sync de `selectedShift`) |
| 4 — Realtime atrasado | Guardia por `updated_at` + realtime solo refetch |
| 5 — Dos pestañas | La segunda refetchea por focus/realtime; no reinyecta estado viejo |
| 6 — Cambio de empresa | Key namespaced por `company_id`; cero contaminación |
| 7 — Error de guardado | No cierra, no hay falso éxito, cambios locales intactos |
| 8 — Guardado exitoso | Cierra solo tras reconciliar |
| 9 — Mobile y desktop | Mismo contrato, misma invalidación |
| 10 — Rendimiento | Una query por servicio abierto; invalidación por prefijo, sin loops |

Typecheck (`tsgo --noEmit`) limpio. Suite completa: **514 tests en verde (45 archivos)**.

## 10. Confirmación

> Un servicio tiene una sola versión observable durante la sesión. Después de guardar, todas las superficies reflejan el mismo estado persistido sin recarga manual.
