# P0 — William Rodríguez · Auditoría forense Portal / Turno

**Modo: 100% solo lectura.** No se modificó ningún dato, política, asignación ni código de producto.
Fecha de auditoría: agosto 2026 · Empresa: Quality Staff.

---

## 1. Identidad

| Registro | Estado | user_id | Internal ID | Conclusión |
|---|---|---|---|---|
| `28b436c6-a997-4d04-9ee2-2401e6268dba` | activo | `8c04ffea-c79a-4fc5-a201-c8a4897e22d1` | asignado | **Canónico** |
| duplicado en otra empresa | activo (otro tenant) | — | — | Fuera de alcance |
| duplicado consolidado | `identity_status = merged`, inactivo | — | conserva número | Correcto |

- El resolver de identidad (`resolveEmployeeForCompany` / `useEffectiveEmployee`) devuelve el registro canónico para la empresa seleccionada.
- No hay doble cuenta de portal ni colisión de Internal ID.
- **La identidad NO es la causa.**

## 2. Portal y permisos

- `employee_portal_modules`: sin filas explícitas → defaults canónicos (`my_shifts`, `my_clock` habilitados). El fix de configuración parcial ya aplica.
- `PortalModuleGuard` no redirige: `my_shifts` resuelve `true`.
- RLS de `scheduled_shifts` / `shift_assignments` permite lectura al empleado canónico.
- **El portal NO está bloqueado.**

## 3. Asignaciones y publicación (11, 12 y 13 de agosto)

| Turno | Fecha | publication_status | status | deleted_at | Asignación William |
|---|---|---|---|---|---|
| `ccb11265…` | 11 ago | published | published | null | activa |
| `eb335368…` | 12 ago | published | published | null | activa |
| `78218d83…` | 13 ago | published | published | null | activa |

Estas tres asignaciones **sí son visibles** con la consulta real de `MyShifts.tsx` (filtro `employee_id` + `company_id` + `is_draft_reservation = false` + `deleted_at is null` + no canceladas). Coincide con las notificaciones entregadas (`shift_notification` 11 y 12 ago, `no_clockin_alert` 12 ago).

**Conclusión parcial: para los turnos publicados no hay pérdida de visibilidad.**

## 4. Causa raíz demostrada

El turno que William no vio **no era un turno publicado y confirmado**, sino uno de los dos casos siguientes, ambos verificados en datos:

### 4.1 Reserva en borrador / turno no publicado (causa principal)

- Existen **32 `shift_assignments` con `is_draft_reservation = true`** (21 trabajadores), y **35 asignaciones activas sobre turnos con `publication_status <> 'published'`**.
- William tiene asignaciones de este tipo en la ventana del 10–11 de agosto (turnos en borrador/cancelados).
- El portal las oculta **por diseño correcto** (`shift-guards`, `visibility.ts`).
- El problema es de **verdad compartida**: la vista de administración cuenta esas filas como “persona asignada”, así que el operador ve a William en el turno mientras el trabajador no puede verlo. No hay ningún aviso en la pantalla del admin que diga “esta asignación aún no existe para el trabajador”.

### 4.2 Aviso de turno disponible sin cupo real (causa secundaria)

- `src/pages/admin/Shifts.tsx` envía `shift_claimable` a **todos los empleados activos** sin comprobar cupos restantes (líneas ~1156, ~1684, ~1763).
- Además, cuando el portal calcula la ocupación desde el anidado `shift_assignments`, RLS solo devuelve las filas del propio trabajador, así que la capacidad se evalúa a ciegas.
- Resultado observado: el turno `32855b43…` (12 ago, `slots = 1`, **2 asignaciones activas**) le fue notificado; él solicitó a las 16:46 y la solicitud quedó pendiente sin cupo posible.

### 4.3 Divergencia de estados entre superficies (riesgo latente, no causa aquí)

`PortalClock.tsx` filtra `status in ('confirmed','pending')`, mientras `MyShifts` acepta cualquier estado no `removed/rejected`. Hoy no hay asignaciones futuras con `status = 'accepted'` (0 filas), pero cualquier fila legada con ese estado desaparecería del reloj sin desaparecer de Mis turnos.

## 5. Fix recomendado (no aplicado)

1. **Verdad única de “asignado”**: que el admin no muestre como asignada ninguna fila con `is_draft_reservation = true` o sobre turno no publicado; mostrarla como *reserva en borrador* con etiqueta explícita y contador aparte.
2. **Aviso de disponibilidad con cupo**: calcular cupos restantes en servidor (RPC o vista con `security definer`) antes de enviar `shift_claimable`, y usar esa misma fuente en la lista “Disponibles” del portal, que hoy es ciega por RLS.
3. **Un solo conjunto de estados activos** compartido por Mis turnos, Reloj y Detalle (helper único en `src/lib/shifts/visibility.ts`).
4. **Diagnóstico por persona**: en el perfil, un bloque “¿Qué ve esta persona?” que ejecute la consulta real del portal y explique cada exclusión.

## 6. Veredicto

- Identidad, portal, RLS, Internal ID y fecha: **sanos**.
- Causa raíz: **asignaciones en borrador / turnos no publicados contados como asignados en administración**, más avisos de turnos disponibles sin validar cupo.
- Ningún dato fue modificado durante esta auditoría.
