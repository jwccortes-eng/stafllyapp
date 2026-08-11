# P0 — Portal Module Partial Config Fix

Caso origen: Carlos Ortiz — turno QK-001592 (ELUM FRANKL HALL, 2026-08-10 16:00–21:00).

## Problema confirmado

1. `employee_portal_modules` tenía filas parciales para Carlos (sin `my_shifts` ni `my_clock`).
2. `usePortalModules` interpretaba "existen filas" (`hasConfig=true`) como whitelist completa → cualquier módulo ausente quedaba deshabilitado.
3. `PortalModuleGuard` redirigía a `/portal` tras el segundo render (cuando `stableEmployeeId` resolvía y llegaba la config real).
4. Home mostraba "Aún no tienes turnos asignados" porque filtraba `.gte(date, hoy)` y el turno era de ayer.

## Cambios (UI / lógica de resolución, sin tocar datos)

### 1. Resolver canónico — `src/lib/portal/portal-modules.ts` (nuevo)

Regla única:

- fila explícita `enabled=true` → habilitado
- fila explícita `enabled=false` → deshabilitado
- **sin fila → default canónico** (`my_shifts`, `my_clock`, `my_payments`)
- `home` / `profile` siempre visibles

Ya no existe el concepto `hasConfig`. Una configuración parcial nunca actúa como whitelist.

### 2. `src/hooks/usePortalModules.tsx`

- Guarda un `Map<module, boolean>` de overrides en vez de un `Set` de habilitados.
- El `useCallback` del fetch depende **solo de `employeeId`**; se eliminaron las dependencias derivadas (`enabledModules.size`, `hasConfig`) que causaban re-ejecuciones.
- `loading` solo se reactiva cuando cambia el `employeeId` (ref `loadedForRef`), evitando parpadeos de permisos.
- `isModuleEnabled` / `enabledModules` delegan en el resolver canónico.

### 3. `src/components/portal/PortalModuleGuard.tsx`

Sin cambios: el guard se mantiene íntegro (incluye bypass admin y red de seguridad de documentos/W-9) y ahora consume el resolver corregido. Con la nueva regla no puede ocurrir "primer render habilitado → segundo render deshabilitado" por config parcial.

### 4. Ventana operativa del Home — `src/pages/portal/EmployeeDashboard.tsx`

Ventana explícita elegida: **`[hoy − 1 día, ∞)`** sobre `scheduled_shifts.date`.

Justificación: cubre el turno de hoy aún activo, el turno terminado recientemente que sigue pendiente de clock-out / cierre, y el turno de ayer que cruzó medianoche. No incluye historial. El orden pasó a ser por fecha ascendente para que el "próximo turno" sea el más relevante.

`MyShifts` no se modificó.

### 5. Clock

`/portal/clock` usa el mismo `PortalModuleGuard` con `my_clock`. No hay lógica especial: al no existir fila explícita, aplica el default canónico `enabled`, por lo que ya no rebota.

## QA

Cobertura determinista en `src/test/portal-modules.test.ts`:

1. Worker sin filas → defaults (`my_shifts`, `my_clock`, `my_payments` habilitados).
2. Config parcial (caso Carlos) → módulos ausentes usan default; `my_profile=false` respeta el override.
3. Override explícito `false` bloquea; al quitarlo vuelve al default.
4. `home` / `profile` siempre visibles.
5. Config completa con overrides → resultado determinista.

Escenarios manuales A–F (Home → Turnos, espera 30 s, refresh, reapertura, `/portal/clock`, override on/off) quedan cubiertos por la regla: ya no existe transición de permisos posterior al primer render provocada por config parcial.

## No tocado

auth, RLS, tenant boundaries, `time_entries`, payroll, `shift_assignments`, `scheduled_shifts`, datos de producción, la asignación de Carlos ni QK-001592. No se editó ninguna fila real de `employee_portal_modules`.
