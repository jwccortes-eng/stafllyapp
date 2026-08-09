# P0 — Service Readiness for Connecteam Export (caso real del video)

Fecha: 2026-08-09 · Alcance: **UI + helper puro**. Sin cambios en payroll, `time_entries`,
`shift_assignments`, CSV, mapping de Job/Sub item/Users, tenants, RLS, auth ni datos reales.

---

## FASE A — Auditoría del caso real

### Servicio identificado en el video

| Campo | Valor observado |
|---|---|
| Nombre del turno | **Luminance** (etiqueta interna definida manualmente) |
| Fecha | mar 18 ago 2026 |
| Horario | 00:08 – 00:08 (24 h nominal) |
| Cliente | *Sin asignar* → "Pendiente: cliente" |
| Lugar del servicio | Dirección agregada como texto, **sin lugar guardado** |
| Punto de encuentro | vacío |
| Plazas | 1 · Cobertura 0/1 |
| Transporte | OFF |
| `publication_status` | **Borrador** ("No visible para trabajadores") |
| Código | GK-#61378 |

Recorrido real grabado: abrir servicio → buscar cliente "lum" → el combobox responde
**“No encontramos ese cliente”** y solo ofrece **“Dejar cliente pendiente”** → el usuario sale a
`/app/clients` y luego a `/app/locations` para crear cliente y ubicación → vuelve a buscar el servicio.

### Blockers activos y su origen

| Blocker | Campo | Tabla | Fuente de la regla | Por qué es required | Superficie que lo edita | ¿Dato equivalente en cliente/venue? | ¿Seleccionable sin salir? (antes) |
|---|---|---|---|---|---|---|---|
| Cliente pendiente | `client_id` | `scheduled_shifts` | `getServicePublishReadiness` (`requireClient`, opcional) + Connecteam `Job` | Connecteam necesita un **Job**; sin cliente ni venue el turno no se puede mapear | `PremiumClientSelector` (Información principal) | Sí, `clients` del tenant | **No** — no había creación inline en el editor |
| Lugar del servicio | `location_id` / `job_site_location_id` / `job_site_address` | `scheduled_shifts`, `locations`, `locations_v2` | `getServicePublishReadiness` (`requireLocation`, default true) | Sin lugar el trabajador no sabe dónde ir; Connecteam `Address` queda vacío | `JobSiteSection` → `SmartLocationField` | Sí, `locations_v2` + Mapbox | Sí (texto libre / guardadas), pero el aviso *“sin lugar guardado”* se leía como bloqueo |
| Cobertura 0/1 y no reclamable | `slots`, assignments, `claimable` | `scheduled_shifts`, `shift_assignments` | `getServicePublishReadiness` (`team`) | No se publica un servicio sin equipo ni apertura a reclamos | `TeamSection` | — | Sí |
| No publicado | `publication_status` | `scheduled_shifts` | `validateShiftForExport` (`not_published`) | Connecteam solo debe recibir servicios confirmados | Botón Publicar | — | Sí |
| Título | `title` | `scheduled_shifts` | `validateShiftForExport` (`missing_title`) | Columna `Shift title` | Información principal | — | Sí |
| Timezone | `timezone` (o default tenant) | `scheduled_shifts` | `validateShiftForExport` (`missing_timezone`) | Columna `Timezone` | Default de empresa | — | n/a |
| Capacidad | `slots` | `scheduled_shifts` | `validateShiftForExport` (`no_capacity_no_users`) | `Number of users` | Información principal | — | Sí |

### Punto de encuentro
`meeting_point` / `meeting_point_location_id` permanece **separado** del lugar del servicio y
**nunca** satisface el requisito de job site (regla ya vigente en `service-publish-readiness.ts`).
No se modificó.

### Divergencia confirmada entre validadores

Existían **dos** validadores sin puente:

1. `src/lib/shifts/service-publish-readiness.ts` → publicación (fecha, horas, job site, equipo,
   conductor, duración). No sabe nada de Connecteam.
2. `src/lib/integrations/connecteam-export.ts::validateShiftForExport` → export (publicación,
   título, timezone, contexto de Job, capacidad). Solo se ejecutaba **dentro del diálogo de export**.

Consecuencia real: el editor podía decir *“Todo en orden — listo para publicar”* mientras el
exportador seguía bloqueando por título/Job/capacidad, y el usuario solo lo descubría al abrir
el diálogo de Connecteam.

---

## FASE B — Completar sin salir del editor

- **Cliente**: `ShiftEditDialog` ahora pasa `onQuickAddClient`. El combobox permite buscar,
  seleccionar y —solo mediante acción explícita **“Crear cliente «X»”**— crear el cliente,
  seleccionarlo en el servicio abierto y añadirlo a la lista local sin refrescar la pantalla.
  Antes esto solo existía en creación (`Shifts.tsx`), no en edición → causa raíz del video.
- **Lugar del servicio**: sin cambios de modelo. `SmartLocationField` ya permite buscar
  ubicaciones guardadas (`locations_v2`), pegar/buscar dirección y guardar para reutilizar.
  No se duplican ubicaciones: guardar es opt-in explícito.
- **Punto de encuentro**: intacto y separado.
- Ninguna ruta obliga ya a navegar a `/app/clients` o `/app/locations` para una selección normal.

---

## FASE C — Readiness único

Nuevo helper puro: `src/lib/shifts/service-operational-readiness.ts`

```ts
getServiceOperationalReadiness(input) => {
  readyToPublish, readyToExportConnecteam,
  blockers, warnings, nextActions,
  publishBlockers, exportBlockers, publish
}
```

Cada blocker expone `code`, `label`, `reason`, `field`, `action` y `scope`
(`publish` | `export` | `both`). La publicación **reutiliza** `getServicePublishReadiness`
(no se duplicaron reglas) y el carril de export **refleja** los bloqueos de
`validateShiftForExport`. Sin mensajes genéricos: se prohíbe “Falta información”
(cubierto por test).

---

## FASE D — Export readiness visible

Nuevo `ServiceReadinessCard` en el rail derecho del editor:

```
Listo para publicar                      ✓
Faltan 2 datos para exportar a Connecteam
  • Cliente o venue — Connecteam necesita un Job… [Seleccionar cliente]
  • Publicación — el servicio está en "draft"…    [Publicar servicio]
```

READY TO PUBLISH y READY TO EXPORT CONNECTEAM se muestran como dos estados distintos,
con la lista exacta de lo que falta en cada uno.

---

## FASE E — Continuidad

Crear el cliente desde el editor:
- no navega ni desmonta el diálogo;
- conserva scroll, pestaña y el resto del formulario;
- selecciona el cliente recién creado en el estado del formulario (`touched = true`);
- lo fusiona en la lista local de opciones → sin refetch de pantalla completa;
- el guardado sigue pasando por el contrato versionado existente (VWC). Sin cambios.

Las acciones de los blockers usan `focusServiceSection(anchorId)` (scroll + focus dentro del
mismo editor); se añadió el ancla `service-basic-info-section` a Información principal.

---

## FASE F — QA

| Paso | Antes | Después |
|---|---|---|
| 1. Abrir servicio Luminance | Blockers dispersos en badges | Igual + tarjeta de readiness dual |
| 2. Ver blockers | “Pendiente: cliente / lugar”, sin motivo ni acción | `label + reason + acción` por blocker |
| 3. Completar cliente | Solo “Dejar cliente pendiente” → salir a `/app/clients` | “Crear cliente «Luminance»” inline y seleccionado |
| 4. Completar lugar | Texto libre con aviso ambiguo | Igual, aviso reclasificado como warning de export |
| 5. Regresar | Requería volver a buscar el servicio | No se sale del editor |
| 6. Confirmar readiness | “Todo en orden” aun con bloqueos de export | Dos estados separados y exactos |
| 7. Publicar | Sin cambios | Sin cambios |
| 8/9. Export Connecteam | Bloqueo descubierto al final | Anticipado en el editor |

Cobertura automatizada: `src/test/service-operational-readiness.test.ts` (5 casos, verde).

---

## Qué NO se tocó

payroll · `time_entries` · `shift_assignments` · formato CSV · Job/Sub item · Users mapping ·
tenants · RLS · auth · datos de producción · `scheduled_shifts` (schema) · permisos del exportador.

---

## Confirmación final

**El servicio puede completarse desde un flujo continuo y el sistema distingue claramente qué
falta para publicar y qué falta para exportar a Connecteam.**
