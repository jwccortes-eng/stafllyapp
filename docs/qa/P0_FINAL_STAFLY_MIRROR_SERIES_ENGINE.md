# P0 FINAL — Stafly como espejo de la operación

Consolidación del ciclo operativo de Servicios para alojar una temporada completa
con información parcial, sin inventar datos.

## 1. Motor único de series

`src/lib/shifts/series-engine.ts` es la única fuente de verdad para clonar y
verificar Servicios:

- `snapshotFromServiceRow` — único traductor fila real → snapshot canónico.
- `buildSeriesIntentFromSnapshot` — intención congelada (fechas + snapshot).
- `buildSeriesPreview` — qué se creará exactamente.
- `verifySeriesIntegrity` / `describeSeriesVerification` — verificación posterior.

`buildCanonicalServiceInsert` (`src/lib/shifts/recurrence.ts`) es el único
constructor de la fila insertada. Ninguna ruta arma su propio payload.

## 2. Rutas consolidadas

| Ruta | Snapshot canónico | Vista previa | Verificación |
|---|---|---|---|
| Crear / Publicar | Sí | Sí | Sí |
| Guardar borrador | Sí | Sí | Sí |
| Duplicar (drag&drop) | Sí | Sí | Sí |
| Duplicar (diálogo) | Sí | Diálogo propio | Sí |
| Copiar semana | Sí (uno por Servicio origen) | Sí (combinada) | Sí (por Servicio) |
| Editar → Repetir | Sí | Sí | Sí |

Se eliminaron los `insert` manuales de `handleDuplicateToDay`, `handleCopyWeek` y
`DuplicateShiftDialog`: cada uno derivaba campos por su cuenta y era la vía por la
que se perdían cliente, venue o título.

## 3. Vista previa obligatoria

`SeriesPreviewDialog` es compuerta dura antes de cualquier escritura. Lista fecha
a fecha lo que se creará y enumera lo que queda pendiente (personal, hora,
cliente) sin rellenarlo con valores inventados.

Para Copiar semana la vista previa combina las intenciones de todos los Servicios
de la semana en una sola lista.

## 4. Verificación automática posterior

Tras persistir se contrastan contra la base: cliente, venue, horario, headcount,
assignments, QK (`shift_ref`) y referencia de serie (`reconciliation_hash`).
Las diferencias se reportan al operador; nunca se corrigen en silencio.

## 5. Alcance respetado

No se tocó payroll, time entries, exportación Connecteam, ELDM, auth ni RLS.
Sin migraciones de base de datos.

## 6. Pruebas

- `src/test/recurring-service-creation.test.ts` — 17 en verde (caso maestro QK-001592).
- `src/test/series-engine-routes.test.ts` — 5 en verde (snapshot, exclusiones,
  payload canónico, vista previa, detección de divergencias).

## 7. QA operativo

Los calendarios Imperial, Eminence, Luminance, Millennium y Zemer se pueden cargar
completos en estado BORRADOR con información parcial: la fecha y la referencia
bastan; hora aproximada y personal pendiente se conservan como pendientes visibles
en la vista previa y en el calendario, sin bloquear la creación.
