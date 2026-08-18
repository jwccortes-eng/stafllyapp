# P0 — Worker Portal My Shifts + Assignment Status Consolidation

Fecha: 2026-08-18 · Caso guía: Carlos Alvarez (Quality Staff) · Veredicto: 🟢 GO

## 1. Causa raíz confirmada (medida, no inferida)

Con la sesión real de Carlos, la consulta de "Mis Turnos" devolvía **HTTP 500 / Postgres 57014 (statement timeout)** a los 8.6 s.
Aislando la consulta por partes se identificaron **dos causas independientes**:

| Prueba (sesión real de Carlos) | Antes | Después |
|---|---|---|
| Asignaciones sin embeds (`locations`/`clients`) | 0.4 s | 0.4 s |
| Asignaciones con embeds (consulta real del portal) | **500 · timeout 8.6 s** | **0.6 s** |
| `locations` directo (5 filas) | 2.4 s | < 0.1 s |
| Asignaciones sin ventana temporal (141 filas) | timeout | 0.6 s |

1. **RLS evaluada por fila**: 20 políticas de lectura llamaban `has_module_permission(auth.uid(), company_id, …)` correlacionada con cada fila, ejecutando el catálogo de permisos una vez por fila escaneada.
2. **Falta de índice en `employees.user_id`**: la política "Employees can view active locations" hace `EXISTS (… employees.user_id = auth.uid() …)`; sin índice, cada fila de `locations` provocaba un recorrido completo de 1.859 empleados.

## 2. Cambios aplicados

### Fase 1 — Ventana operativa en la consulta
`src/pages/portal/MyShifts.tsx`: ventana por defecto de **90 días** + límite duro de 500 filas, con acción explícita "ver historial completo". Evita escanear historia completa en cada apertura del portal.

### Fase 2 — RLS sin relajar seguridad
- `public.user_module_company_ids(user_id, module, action)` (SECURITY DEFINER, STABLE): devuelve las empresas permitidas, evaluada como **InitPlan una sola vez por consulta**.
- Reescritura de las 20 políticas de lectura (`clients`, `locations`, `employees`, `shifts`, `pay_periods`, `period_base_pay`, `payroll_*`, `movements`, `imports`, `announcements`, `concepts`, `saved_reports`, `shift_*`, `tax_forms_1099`, …) al patrón `company_id IN (SELECT user_module_company_ids(...))`.
- Índices `idx_employees_user_id` e `idx_employees_user_company`.

**Prueba de equivalencia de autorización** (todas las parejas usuario × empresa del sistema):

```
divergences | pairs | allowed
          0 |    92 |      22
```

Cero divergencias entre el modelo anterior y el nuevo: **nadie ganó ni perdió acceso**.

### Fase 3 — Manejo de error en frontend
`src/lib/data/query-error.ts` clasifica `timeout / unauthorized / network / unknown`. El portal ya no muestra skeleton infinito: muestra "No pudimos cargar tus turnos" con causa y reintento (verificado en navegador durante la fase de fallo).

### Fase 4 — SSOT de estados de asignación
`src/lib/shifts/assignment-status-truth.ts` es el único vocabulario:

- **Comprometidos**: `accepted`, `confirmed`, `scheduled`.
- **Operativos**: comprometidos + `pending`.
- **Excluidos**: `removed`, `rejected`, `declined`, `cancelled`, `canceled`, `unassigned`, `replaced`.
- Estado desconocido → se muestra, nunca se oculta.

Superficies migradas de `status = 'confirmed'` a la lista canónica: `WorkerPassport`, `useEmployeeReputation`, `Dashboard`, `TodayView`, `Invoices`.
Impacto: **3.820 asignaciones `accepted`** que eran invisibles vuelven a contar en pasaporte, reputación, tablero del día y líneas de facturación.
Cobertura con pruebas: `src/test/assignment-status-truth.test.ts` (6 casos, verdes junto a staffing-metrics y worker-visible-shifts).

## 3. Validación con Carlos (navegador, sesión real)

- `/portal/shifts` carga sin error: **Disponibles 5 · Hoy 1**, tarjeta QK-001646 con acciones Aceptar / No puedo.
- Sin errores 500 en la red; la consulta de asignaciones responde en < 1 s.

Divergencia restante **explicada, no defecto**: de sus 7 turnos recientes, 4 están en `publication_status = draft` (J EVENTS 24-ago y dos "Turno" 27/28-ago, más un `removed`). El portal los oculta correctamente según *Shift Publication Truth*. Para que el trabajador los vea, Scheduling debe publicarlos.

## 4. Blast radius

- 66 trabajadores con membresía compartían el mismo timeout: la corrección es de plataforma (políticas + índices), no por usuario.
- El índice `employees.user_id` beneficia a toda política que resuelve identidad por `auth.uid()`, es decir prácticamente toda superficie autenticada.

## 5. Pendientes

- Publicar (o descartar) los 3 turnos en borrador de Carlos desde Scheduling.
- Revisar las 46 políticas de escritura que aún usan la forma correlacionada (`INSERT`/`UPDATE`/`DELETE`): coste bajo por volumen de filas, pero conviene homogeneizar.
- Las advertencias `SECURITY DEFINER` del linter son preexistentes y necesarias para que RLS consulte el catálogo de permisos.
