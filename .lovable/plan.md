## Rediseño del formulario de Shift (Create / Edit)

Objetivo: convertir el formulario en una experiencia full-screen tipo Stripe/Linear, con jerarquía clara (Job Site protagonista, Meeting Points separados, Transporte como sub-bloque), aprovechando todo el ancho en desktop, manteniendo el wizard vertical en mobile, y eliminando el lag al escribir.

Sin cambios de schema, sin tocar payroll/attendance/compensation/reconciliación, sin romper contratos: `formStateToShiftPayload` / `shiftToFormState` no cambian sus firmas ni los nombres de columna.

---

### 1. Causa raíz del lag (la pieza más importante)

Hoy `Shifts.tsx` mantiene **~25 piezas de `useState` separadas** (`title`, `notes`, `meetingPoint`, etc.) en la página que también renderiza todo el calendario, miles de shifts y assignments. Cada keystroke en el diálogo de creación llama un `setX` del padre → re-renderiza toda la página de turnos → re-pasa props nuevas a `ShiftFormFields` → recalcula efectos.

**Fix estructural**:

- Consolidar todos los campos del create en un solo `useState<ShiftFormState>` (igual a `EMPTY_SHIFT_FORM_STATE`) dentro de un nuevo wrapper `<CreateShiftDialog>` extraído de `Shifts.tsx`. La página solo conserva `createOpen` + `prefill` y pasa callbacks estables (`useCallback`).
- El nuevo `<CreateShiftDialog>` y `<ShiftEditDialog>` envuelven al `<ShiftFormFields>` y son los únicos que se re-renderizan al teclear.
- Aplicar `React.memo` a las nuevas subsecciones (ver punto 3) con comparadores selectivos para que escribir en "Notas internas" no re-renderize Transporte ni el Resumen, y viceversa.
- Mantener `useMemo` ya existente en `shiftAssignedIds`, `driversInTeam`, `conflictNames`, `adminCandidates`.

Resultado esperado: tipear en título / notas / meeting point / job site notes se siente inmediato porque solo el subcomponente correspondiente re-renderiza.

---

### 2. Nuevo layout full-screen

Crear un nuevo componente `ShiftFormShell` (`src/components/shifts/ShiftFormShell.tsx`) que:

- Usa `Dialog` con `max-w-[1200px] w-[96vw] h-[92vh] p-0` en desktop.
- En `< lg` se comporta como antes (un panel scrolleable).
- Header sticky superior con: título ("Nuevo turno" / "Editar turno"), chips de cliente + fecha/hora cuando ya están definidos, botón Cancelar + botón Guardar / Crear.
- Body con grid `lg:grid-cols-[1fr_360px]`:

```text
┌──────────────────────────── header sticky ────────────────────────────┐
│ Nuevo turno · [Cliente] · [Vie 25 abr · 08:00–17:00]   Cancelar  Guardar │
├──────────────────────────────────┬────────────────────────────────────┤
│ FORM (scroll)                    │ RESUMEN (sticky)                    │
│  · Información principal         │  · Título / Cliente / Fecha         │
│  · Job Site (card protagonista)  │  · Plazas / Cobertura               │
│  · Logística (Transporte +       │  · Job Site                         │
│      Meeting points anidados)    │  · Transporte ON/OFF                │
│  · Detalles avanzados ▾          │  · Drivers                          │
│                                  │  · Meeting points                   │
│                                  │  · Estado de capacidad              │
└──────────────────────────────────┴────────────────────────────────────┘
```

El `ShiftFormShell` recibe el form-state y los handlers, decide layout, y monta dentro un nuevo `ShiftFormBody` que organiza las secciones nuevas.

---

### 3. Reorganización del contenido en secciones memoizadas

Reemplazar las 9 `SectionCard` actuales por bloques temáticos. Cada uno es un componente `React.memo` separado en `src/components/shifts/form/` y solo recibe lo que necesita:

- `ShiftBasicInfoSection` → Título, Cliente, Fecha, Entrada/Salida, Hora de convocatoria, Plazas, Tipo de pago + Override (toggle).
- `JobSiteSection` (card protagonista, borde acentuado, fondo levemente destacado):
  - Subtítulo: "Dirección principal donde se realizará el trabajo."
  - Selector de Location guardada + autocomplete premium (`LocationPicker` reutilizado del `ShiftLocationsSection` actual, mostrando solo el bloque de **job site**).
  - Nombre del lugar, dirección formateada, botón "Abrir en Google Maps" cuando hay coords/dirección válida.
  - Notas visibles para el trabajador (mapeadas a `special_instructions`, mantenemos el nombre de columna).
  - **Sin** campos de meeting point en esta card.
- `TransportationSection` (siempre visible como card secundaria, contenido condicional):
  - Toggle "¿Este turno requiere transporte?".
  - Si OFF: muestra solo un estado informativo discreto: "Activa transporte si necesitas coordinar puntos de encuentro o drivers." Y los Meeting Points quedan colapsados en su propia card (ver siguiente).
  - Si ON: capacidad por vehículo (default 5), vehículos necesarios, hint de drivers en equipo, conductor asignado, notas de transporte.
  - Warning de capacidad solo cuando `capacityNum * ridesNeeded < slotsNum` (regla ya corregida — se mantiene). Mensaje: "Capacidad insuficiente: necesitas N vehículos para cubrir X personas con capacidad de Y por vehículo."
  - Si capacidad cubierta: chip discreto verde "Capacidad cubierta" (opcional, sin contaminar).
- `MeetingPointsSection`:
  - Subtítulo: "Lugares donde los trabajadores se reúnen antes de ir al Job Site."
  - Si Transporte OFF: card colapsada con la pista informativa.
  - Si Transporte ON: meeting point principal (legacy `meeting_point` text + autocomplete del `ShiftLocationsSection` para `meeting_point_location_id`), botón "Abrir en Google Maps" cuando hay dirección. (Por ahora 1 meeting point, los múltiples puntos quedan fuera de scope para no tocar schema.)
- `TeamSection`:
  - Asignar empleados (combobox actual con `requiresDriver`, hint de drivers, etc.).
  - Admin del turno (sigue siendo obligatorio cuando hay equipo).
- `AdvancedDetailsSection` (`<Collapsible>` cerrado por defecto):
  - Notas internas (solo admins).
  - Método de fichaje, Modo de asistencia, QR (solo edit).
  - Permitir reclamo abierto.
- `ShiftSummaryPanel` (panel derecho sticky en desktop, oculto en mobile):
  - Renderiza KPIs ya calculados (Plazas, Cobertura, Vehículos), validaciones bloqueantes y advertencias, "Capacidad cubierta" verde, "Faltan drivers" rojo, etc. — exactamente las mismas reglas del bloque "Resumen final" actual, pero como panel lateral en vez de sección apilada.

Cada sección recibe solo el subset de campos que necesita y un `onChange(patch)` estable. Con `React.memo` + comparación por referencia esto evita recomputar todo en cada tecla.

---

### 4. Estado del Resumen / "Todo en orden"

Mantener exactamente la regla actual:

- No bloquea el guardado técnicamente (botón Guardar sigue habilitado salvo por las validaciones duras existentes: falta fecha, falta admin con equipo, admin no asignado).
- No muestra "Todo en orden — listo para guardar" si hay shortage de drivers o capacidad insuficiente.
- `driver_employee_id` solo cuenta como driver si está dentro de `selectedEmployees` (ya implementado, se conserva).

---

### 5. Defaults / compatibilidad

- `carCapacity` default = `"5"` en `EMPTY_SHIFT_FORM_STATE` (ya está) — se confirma en `Shifts.tsx` y `ShiftDetailDialog.tsx`.
- Crear, editar y duplicar siguen funcionando (la duplicación llama al mismo `resetForm` + `setCreateOpen`).
- Shifts existentes con datos legacy se siguen mapeando vía `shiftToFormState` sin cambios.
- `formStateToShiftPayload` no cambia.

---

### 6. QA antes de cerrar

Casos a verificar en preview:

1. Plazas=3 / capacidad=5 / transporte ON → sin warning + chip verde "Capacidad cubierta".
2. Plazas=8 / capacidad=5 / transporte ON con 1 driver → warning rojo "necesitas 2 vehículos".
3. Turno nuevo desde cero → capacidad por vehículo = 5.
4. Tipear rápido en título, notas, meeting point, job site notes → sin lag.
5. Job Site se entiende como dirección del trabajo; meeting points están en card aparte.
6. Desktop ≥ 1280px usa todo el ancho con panel resumen a la derecha.
7. Transporte OFF → meeting points no contaminan el formulario.
8. Transporte ON → capacidad, drivers y meeting points aparecen ordenados.
9. Editar un shift existente con `meeting_point` legacy → se ve correctamente en MeetingPointsSection sin duplicarse en JobSite.
10. Duplicar turno desde calendario → abre el create dialog con los mismos defaults.

---

### Archivos que se crean / modifican

Nuevos:

- `src/components/shifts/ShiftFormShell.tsx` — modal full-screen + header sticky + grid 2 columnas + panel resumen.
- `src/components/shifts/form/ShiftBasicInfoSection.tsx`
- `src/components/shifts/form/JobSiteSection.tsx`
- `src/components/shifts/form/TransportationSection.tsx`
- `src/components/shifts/form/MeetingPointsSection.tsx`
- `src/components/shifts/form/TeamSection.tsx`
- `src/components/shifts/form/AdvancedDetailsSection.tsx`
- `src/components/shifts/form/ShiftSummaryPanel.tsx`
- `src/components/shifts/CreateShiftDialog.tsx` — extrae el create dialog de `Shifts.tsx`, dueña del `useState<ShiftFormState>` consolidado.

Modificados:

- `src/components/shifts/ShiftFormFields.tsx` → se convierte en orquestador delgado que monta las nuevas secciones (manteniendo export de `EMPTY_SHIFT_FORM_STATE`, `shiftToFormState`, `formStateToShiftPayload`, `ShiftFormState`, `LocationOption` y `ShiftFormFieldsProps` para no romper imports).
- `src/components/shifts/ShiftEditDialog.tsx` → usa el nuevo `ShiftFormShell` para el layout full-screen; lógica interna intacta.
- `src/pages/admin/Shifts.tsx` → reemplaza el bloque inline `<Dialog>...<ShiftFormFields .../>` por `<CreateShiftDialog>` y elimina los ~25 `useState` individuales del create (los reemplaza por un solo `prefill` para el quick-create desde el calendario).

No se crea ni modifica ningún archivo de payroll, attendance, compensation ni reconciliación. No se ejecutan migraciones de base de datos.

---

### Notas técnicas (para el equipo)

- Riesgo principal: extraer el state del create dialog de `Shifts.tsx` cambia cómo se hidrata el `prefill` desde el calendario (`handleQuickCreate`, `handleAddShiftFromCalendar`, `handleOpenFullWithPrefill`). Se conserva la API exponiendo `<CreateShiftDialog open prefill onOpenChange onCreated />` y mapeando el `prefill` → `ShiftFormState` parcial al abrir.
- El header sticky reutiliza tokens de `border`, `bg-card`, `bg-background/95 backdrop-blur` para mantener consistencia con el resto del SaaS.
- El panel resumen es `position: sticky; top: 0` dentro de la columna derecha con `overflow-y: auto` propio.
- El autocomplete premium del Job Site reutiliza el `LocationPicker` ya integrado en `ShiftLocationsSection` — no se crea otro componente de mapas.
- "Abrir en Google Maps" usa `https://www.google.com/maps/search/?api=1&query=` con coords si existen, o con la dirección formateada como fallback.
