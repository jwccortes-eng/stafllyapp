# P1 — Payroll Adjustments UX + Canonical Worker Identity

**Fecha:** 2026-09-15  
**Alcance:** normalización visual de `/app/movements`; sin cambios de lógica ni datos de nómina.

## 1. Legacy avatar source found

La pantalla importaba `EmployeeAvatar` desde `src/components/ui/employee-avatar.tsx`. Cuando `avatarUrl` no estaba disponible, ese componente renderizaba `GeneratedAvatar`: un SVG ilustrado derivado del nombre, con tonos de piel, peinados, accesorios y fondos generados.

Además, la consulta de movimientos solo leía `employees(first_name, last_name)`, por lo que Ajustes nunca recibía `avatar_url` y siempre caía en la ilustración legacy.

Se eliminó ese consumo de `/app/movements`. No se modificó ni eliminó el componente compartido porque todavía tiene consumidores fuera de esta pantalla.

## 2. Canonical identity component reused

Ajustes ahora consume la misma representación canónica usada por Equipo:

- `buildWorkerEntityView()` deriva nombre, referencia humana `ST-`, estado y fallback de identidad.
- `EntityCard` presenta foto real mediante `AvatarImage` cuando existe `employees.avatar_url`.
- Si no existe foto, `EntityCard` usa las iniciales canónicas de `entityInitials()`; no genera ilustraciones.
- La lectura del movimiento se amplió únicamente con `id`, `avatar_url`, `employer_identification`, `is_active` y `user_id` del trabajador relacionado.

No se creó un avatar de nómina ni un registro de identidad adicional.

## 3. Files/components changed

- `src/pages/admin/Movements.tsx`
  - Presentación operativa, identidad canónica, filtros derivados, tabla de escritorio, tarjetas móviles y detalle.
  - Consulta read-only ampliada con campos existentes de identidad.
- `docs/qa/P1_PAYROLL_ADJUSTMENTS_UX_CANONICAL_IDENTITY.md`
  - Este informe.

No se modificaron migraciones, funciones, tablas, políticas, fórmulas ni contratos de movimientos.

## 4. Desktop before/after architecture

**Antes**

- Cabecera legacy `PageHeader`.
- Selector y búsqueda separados.
- Cinco tarjetas KPI grandes y barra de progreso sin relación directa con la tarea principal.
- Una tabla comprimida también en móvil.
- Persona mostrada con ilustración generada.
- Nota truncada y trazabilidad dependiente del hover.

**Después**

- `OperationalWorkspace`: empresa → Ajustes → período activo → acciones.
- Fila compacta con selector de período y filtros canónicos.
- Resumen compacto derivado de los movimientos visibles del período.
- Tabla de alta densidad con: Persona, Concepto, Tipo, Estado, Cant., Valor, Total, Origen y Acciones.
- Total con mayor jerarquía que el valor unitario.
- Identidad canónica foto/iniciales con referencia humana del trabajador.
- Origen abre un detalle accesible sin depender del tooltip.

## 5. Mobile architecture

En anchos móviles la tabla queda oculta y cada movimiento usa una tarjeta operativa con:

1. identidad canónica y nombre;
2. total protagonista;
3. concepto;
4. tipo y estado;
5. cantidad × valor o indicación de valor directo;
6. origen/nota;
7. acciones existentes y acceso a detalle.

QA real a 393 × 852:

- 46 tarjetas renderizadas para el período con datos;
- tabla de escritorio no visible;
- `documentElement.scrollWidth === clientWidth`;
- sin gráficos;
- controles iconográficos con nombre accesible;
- foto real visible cuando existe y fallback de iniciales en los demás casos.

## 6. Period-context implementation

La cabecera muestra el rango del período seleccionado con fecha legible. El selector conserva la fuente actual `pay_periods` y el comportamiento de selección existente.

El resumen usa solo `movements` ya cargados:

- número de movimientos;
- suma de extras aprobados;
- suma de deducciones aprobadas;
- neto de movimientos = extras − deducciones.

No representa ni reemplaza el total de nómina, no lee `period_base_pay` y no persiste agregados.

QA de referencia sobre Quality Staff, período 2–8 septiembre 2026:

- 46 movimientos;
- 45 extras;
- 1 deducción;
- extras aprobados: $18,730.00;
- deducciones aprobadas: $652.00;
- neto visual de ajustes: $18,078.00.

## 7. Movement traceability

El detalle conserva y hace accesibles:

- persona;
- referencia canónica;
- concepto;
- tipo existente;
- estado de aprobación existente;
- cantidad × valor unitario;
- total original;
- origen/nota;
- motivo de denegación cuando existe.

La tabla mantiene Origen como columna. En móvil se muestra en la tarjeta y `Ver detalle` abre el mismo contenido completo.

## 8. Payroll/data writes performed

**CERO.**

La implementación no ejecutó migraciones ni mutaciones de producción. La validación navegó, seleccionó compañía/período, filtró y abrió vistas. No se creó, editó, aprobó, denegó, eliminó, importó ni publicó ningún movimiento o recibo.

Los handlers existentes de creación, importación, edición, aprobación, denegación y eliminación conservan sus operaciones y condiciones de permiso originales.

## 9. Regression results

- Ausencia de `EmployeeAvatar` y `GeneratedAvatar` en `src/pages/admin/Movements.tsx`: confirmada.
- Escritorio 1280 × 1800: tabla operativa visible y escaneable.
- Móvil 393 × 852: tarjetas visibles, sin tabla comprimida y sin overflow horizontal.
- Foto real: confirmada en Francisco Patino.
- Fallback por iniciales: confirmado en múltiples trabajadores sin foto.
- Filtros: contadores derivados de las categorías/estados existentes; no se añadieron estados.
- Permisos: `canApprove` y bloqueo por período cerrado conservados.
- Pruebas enfocadas de identidad/presentación: 39/39 verdes.
- Los importes se renderizan desde `movement.total_value`; no hay transformación ni escritura monetaria nueva.
- Períodos reconciliados e históricos: no fueron mutados durante implementación o QA.

## 10. Remaining legacy identity usages discovered elsewhere

El componente ilustrado `EmployeeAvatar` sigue teniendo consumidores fuera de Ajustes. La búsqueda encontró 49 archivos con referencia al símbolo, incluyendo categorías como:

- turnos y asignación: `ShiftCard`, `ShiftDetailDialog`, `EmployeeCombobox`, vistas de día/semana;
- reloj y asistencia: `TimeClockCommandView`, `TimesheetView`, `Attendance`;
- directorio y workforce: `Directory`, `Workforce`, partes legacy de `Employees`;
- perfil/portal: `PortalProfile`, `PortalMoreSheet`, `WorkerSelfServiceSections`;
- reportes operativos y ranking.

Algunos archivos solo importan grupos o componentes modernos relacionados; cada consumidor debe auditarse antes de sustituirse. No se hizo un reemplazo global para evitar ampliar el alcance o alterar otras experiencias.

## Final verdict

🟢 ADJUSTMENTS UX ALIGNED — CANONICAL WORKER IDENTITY REUSED
