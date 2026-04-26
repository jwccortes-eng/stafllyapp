
# Plan: Mejora del formulario de creación/edición de turnos

Reorganización integral en 3 fases siguiendo tu prioridad. Modo **estricto de no regresión**: payroll, attendance, reconciliation, imports, multi-tenant y notifications existentes no se tocan.

---

## Lo que ya existe hoy (verificado en código)

- `ShiftFormFields.tsx` — fuente única de verdad usada por create y edit (864 líneas, 1 archivo)
- Secciones actuales: Información básica → Horario → Asignación (cliente/ubicación/plazas/dirección) → Pago → Asistencia → Fichaje + QR → Admin del turno → Transporte → Detalles adicionales → Picker de empleados
- Repeat funciona como **clonado de filas independientes** (no hay `series_id` en DB)
- QR ya es por turno (`shift.qr_token`, `shift.qr_attendance_mode`)
- `default_pay_type`, `default_clock_method`, `require_car`, `default_instructions` ya se heredan de `client_locations`
- `EmployeeCombobox` ya muestra duplicados, conflictos de horario y disponibilidad

## Lo que NO existe y hay que construir

- Reordenar bloques al orden operativo natural que pediste
- Mover Admin del turno **después** de staffing
- Capacidad por vehículo default = **5** (hoy es 4)
- Pegar **link de Google Maps** y parsear address/lat/lng
- Duplicar turno con opción "estructura / +staff / +admins+drivers"
- Series reales (`series_id`) con scope de edición "este / este y futuros / todos"
- Override de pago a nivel shift, dejando el perfil como fuente única
- Recipientes múltiples del QR (más allá del shift_admin)
- Estrellas / badges / alertas operativas en `EmployeeCombobox`
- "Aceptar todos los turnos de la serie" en el portal del worker
- Resumen automático del día siguiente

---

## FASE 1 — Reorganización UX del formulario (sin lógica nueva)

**Objetivo:** mismo contenido y mismo payload de DB, mejor orden y claridad.

### 1.1 Nuevo orden de secciones en `ShiftFormFields.tsx`

```text
1. Identidad        → título, cliente, fecha, horario, hora de convocatoria
2. Lugar            → Job site, Meeting point, Directions, parser de Google Maps link
3. Equipo           → plazas, asignar empleados (combobox), claimable
4. Transporte       → required, capacidad (default 5), drivers, notas
5. Pago             → hourly | day_pay (full/half), nota: "perfil = base, este turno = override"
6. Fichaje          → attendance mode, clock method, QR, recipientes del QR
7. Admin del turno  → ahora DESPUÉS del equipo (validación: debe estar asignado)
8. Notas            → notas internas + instrucciones para el equipo (siempre visibles, no detrás de collapsible)
9. Resumen final    → cobertura, rides estimados, validaciones, conflictos
```

### 1.2 Cambios visuales puntuales

- Renombrar labels:
  - "Dirección / Punto de encuentro" → desdoblar en **Job site** (dónde se trabaja) y **Meeting point** (dónde se reúnen)
  - "Notas internas" se queda; "Instrucciones para el equipo" sale del collapsible
- Capacidad por vehículo default: `4 → 5` en `EMPTY_SHIFT_FORM_STATE`
- Bloque Pago: añadir hint visible *"Tasa base: perfil del empleado. Este turno puede sobrescribirla."*
- Nuevo bloque "Resumen final" al cierre con: nº plazas, nº rides estimados, lista de conflictos detectados, advertencia si falta admin.

### 1.3 Sin cambios de payload

Todas las columnas de DB y el `formStateToShiftPayload()` permanecen iguales en esta fase. Solo cambia la UI.

---

## FASE 2 — Reglas y comportamiento

### 2.1 Parser de Google Maps en Job site / Meeting point

Componente nuevo `MapsLinkInput` aceptando:
- URL `maps.google.com`, `goo.gl/maps`, `maps.app.goo.gl` → extraer lat/lng del path o query, llamar a Mapbox reverse geocoding (ya hay `mapbox-geocoding.ts` y `useMapboxToken`) para obtener `formatted_address` + `place_name`
- Texto libre → caer al `searchAddresses()` con autocomplete existente
- Resultado se vuelca a `meeting_point` (texto) y opcionalmente crea o referencia un `client_location`

### 2.2 Series reales con scope de edición

**Migración nueva:**
- `shifts.series_id uuid null` + índice
- Nullable, sin tocar filas existentes (compatibilidad total con import-schedule, payroll, etc.)

Al crear con repeat habilitado: generar `series_id = gen_random_uuid()` y aplicarlo a todas las instancias (hoy ya se generan N filas; solo añadimos el id).

Al editar un turno con `series_id`, el dialog pregunta el scope:
- **Solo este turno** (comportamiento actual)
- **Este y los futuros** (`UPDATE … WHERE series_id = ? AND date >= ?`)
- **Toda la serie** (`UPDATE … WHERE series_id = ?`)

Aplicado solo a campos seguros: título, horario, ubicación, instrucciones, transporte, pago, attendance. **No** se replican asignaciones ni QR tokens.

### 2.3 Duplicar turno con opciones

Hoy `Shifts.tsx:1044` ya tiene un duplicate básico. Reemplazar por dialog con 3 opciones:
- Estructura (campos del shift)
- Estructura + staff asignado
- Estructura + staff + admin + driver

### 2.4 Override de pago — fuente única

**Decisión de producto a implementar:**
- `employee_compensation` = base
- `shifts.pay_type` / `shifts.day_type` = override **solo de este turno**
- `client_locations.default_pay_type` deja de aplicarse silenciosamente al campo pay_type del shift (sigue como hint visible, no auto-asignado a payroll del worker)

Cambio mínimo en payroll: ya respeta el shift override, no requiere migración.

### 2.5 Recipientes múltiples del QR

Hoy solo el `shift_admin_id` recibe el QR. Añadir tabla `shift_qr_recipients (shift_id, employee_id, role)` y selector multi-empleado en la sección QR del edit dialog. RLS: company-scoped igual que el resto.

### 2.6 Capacidad de vehículo y rides estimados visibles

Ya hay cálculo en formularios; subirlo al "Resumen final" + validación si `transport_required && drivers_asignados < rides_necesarios`.

### 2.7 EmployeeCombobox enriquecido

Añadir, junto al nombre:
- ⭐ rating (existe `useEmployeeReputation`)
- 🚗 driver badge (`isEmployeeDriver()`)
- 🔴/🟡 alertas: documentos faltantes, no-show risk, conflictos cercanos
- Conflicto de serie: si ya está asignado en otra fecha de la misma `series_id`

---

## FASE 3 — Automatizaciones y aceptación masiva

### 3.1 "Aceptar todos los turnos de la serie"

En el portal del worker, en el dialog de aceptación:
- Si el turno tiene `series_id` y hay otros turnos pendientes con el mismo `series_id` asignados al mismo employee, mostrar opción "Aceptar también los X turnos restantes de esta serie".

### 3.2 Resumen automático del día siguiente

Edge function programada (`pg_cron`) `next-day-summary`:
- Corre cada noche por empresa
- Genera resumen por empleado: turnos del día siguiente, hora, lugar, transporte
- Canal según `company_config.notification_channels`: app push / email / WhatsApp / SMS
- Configurable on/off en company settings

### 3.3 Live map y ETA

Ya existe `useShiftLiveMap` y `ShiftLiveMapPanel`. Validar que funcione end-to-end (no requiere build nuevo, solo QA).

---

## Lo que NO se toca (modo estricto)

- payroll engine (`payroll-consolidate`, `payroll-interpreter`, mappings)
- attendance resolver y kiosk
- reconciliación (Truth File, matching engine)
- import-schedule, bulk-import-shifts, connecteam-parser
- multi-tenant scoping
- estructura de notifications existentes
- Activación / invitaciones (recién cerrado)

---

## Entregables por fase

| Fase | Entregable | Riesgo |
|------|-----------|--------|
| 1 | Form reorganizado, capacidad default 5, hints nuevos | Bajo — solo UI |
| 2 | series_id, parser maps, duplicate dialog, QR recipients, override clarificado | Medio — 1 migración aditiva |
| 3 | Aceptar serie, edge function next-day-summary, QA del live map | Bajo — features aislados |

---

## Antes de implementar — 2 confirmaciones rápidas

1. **Fase 2.4 (pago):** ¿confirmas que `client_locations.default_pay_type` deja de auto-rellenar el campo pay_type del shift? (hoy sí lo hace en `handleLocationChange`). Sigue mostrándose como info, pero el operador debe elegir explícito.
2. **Fase 2.5 (QR recipients):** ¿quieres tabla nueva o prefieres array `text[]` en `shifts.qr_recipient_employee_ids`? La tabla es más limpia y RLS-friendly; el array es más rápido de implementar.

Si confirmas, arrancamos con **Fase 1 completa** en una sola tanda (es solo UI, riesgo bajo) y dejamos Fase 2 y 3 como tandas separadas.
