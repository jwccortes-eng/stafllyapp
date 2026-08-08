# Smart Service Intake — UX Entry Pass

Objetivo: hacer visible la capacidad ya existente. Sin ruta nueva, sin pipeline nuevo,
sin bandeja duplicada, sin cambios de backend, extractores, `scheduled_shifts`, payroll ni ModuleGate.

Ruta canónica (sin cambios): **`/app/import-schedule`**

## 1. Renombrado

`src/pages/admin/ImportSchedule.tsx`

- Antes: `PageHeader` → "Importar Turnos Programados" / "Schedule Export de Connecteam → Turnos y asignaciones".
- Ahora: `OperationalScreenHeader` → **"Importar servicios"** con contexto
  "Convierte mensajes, imágenes, PDFs, notas de voz y archivos en borradores listos para revisar."
- Acción protagonista de la cabecera: enlace a "Diccionario de la empresa".
- La lógica del wizard, el parser y los helpers de escritura no cambiaron.

## 2. Navegación

`src/components/AdminSidebar.tsx`

- Nuevo link en **Daily Operations**, inmediatamente debajo de `Shifts` (Servicios):
  `{ to: "/app/import-schedule", label: "Import Services", module: "import" }`.
- i18n: `sidebar.link.import_services` → "Importar servicios" (`src/i18n/dictionaries/es/app.ts`).
- No se creó `/app/service-intake`. No hay segunda pantalla paralela.

## 3. Selector único de fuente

Un solo selector arriba de la pantalla, cinco opciones, todas sobre el mismo carril canónico:

| Opción | Componente reutilizado |
| --- | --- |
| Audio | `AudioIntakePanel` |
| Imagen | `VisualIntakePanel variant="image"` |
| Texto | `PastedTextIntakePanel` |
| PDF | `VisualIntakePanel variant="pdf"` |
| Excel / CSV | wizard existente de Connecteam (pasos 1–4) |

PDF es visible explícitamente aunque comparte extractor con imagen: el prop `variant`
sólo cambia copy, `accept` y la visibilidad del botón de cámara. Cero componentes paralelos.

## 4. Mobile-first

- Orden del selector: Audio → Imagen → Texto → PDF → Excel.
- Fuente por defecto: `audio` en viewport ≤ 640px, `texto` en escritorio.
- Todos los targets del selector y de las acciones principales usan `min-h-11` (44px).
- Una sola fuente visible por vez: nada de formulario largo ni tablas en móvil.

## 5. Desktop

Mismo selector, misma bandeja compartida. El wizard de Excel conserva revisión masiva,
filtros por rango de fechas, selección y edición previa a la importación.

## 6. Bandeja

Se reutiliza `ServiceIntakeReviewInbox` tal cual, dentro de cada panel de fuente
(fecha, venue, tipo, hora, personal, confianza, duplicado, fuente, estado de revisión,
CTA "Crear X borradores"). No se creó bandeja por source.

## 7. Diccionario

Accesible desde dentro de Importar servicios en dos puntos (cabecera + bloque de cierre),
como configuración del intake. **No** se agregó a la navegación principal.

## 8. Empty state

Bloque de bienvenida "Trae tus trabajos a Stafly" con el selector de fuentes como
opciones (Pegar mensaje / Subir imagen / Grabar audio / Subir PDF / Importar Excel).
Sin lenguaje técnico de imports ni batches en la capa visible.

## 9. Copy

La experiencia admin de intake dice "Servicios" y "borradores". Los nombres técnicos internos
(`import_batches`, `scheduled_shifts`, `raw_schedule_import_rows`, `publication_status='draft'`)
quedaron intactos.

## 10. Plan / gating (sólo documentación, sin cambios)

- El ModuleGate del módulo `import` sigue igual; la ruta continúa envuelta en
  `CompanyRequiredGuard` + `ModuleGate moduleKey="import"`.
- **Quiénes ven el menú:** el link del sidebar declara `module: "import"`, así que sólo aparece
  para compañías cuyo plan habilita el módulo `import`. Las compañías sin el módulo no ven
  la entrada y, si llegan por URL, siguen bloqueadas por el gate.
- **Quiénes quedan ocultos:** usuarios sin compañía seleccionada (guard de contexto),
  compañías sin módulo `import`, y para escribir en el diccionario, usuarios sin rol
  owner/admin/manager.
- No se amplió acceso comercial en esta fase.

## 11. Seguridad

Sin cambios en auth, RLS, aislamiento por tenant, ModuleGate, roles, `scheduled_shifts`,
payroll, `time_entries` ni datos de producción. La entrega es exclusivamente de presentación.

## 12. QA

Verificado con Playwright sobre la app corriendo, compañía QA Testing.

Mobile (390×844): entrada visible, cabecera correcta, selector de 5 fuentes con targets ≥44px,
panel de audio por defecto con "Grabar nota" / "Subir audio", bloque de diccionario visible.
**Sin scroll horizontal** (`scrollWidth <= innerWidth` → true).

Desktop (1280×1800): entrada visible en el sidebar (Daily Operations), cinco fuentes claras,
panel de texto por defecto, bandeja compartida, enlace al diccionario, ModuleGate y roles intactos.
**Sin scroll horizontal.**

Checks automáticos: typecheck limpio; `smart-service-intake-phase5.test.ts` 16/16 en verde.

## Confirmación

Smart Service Intake es ahora visible y fácil de usar desde Daily Operations,
sin crear una ruta, bandeja o pipeline paralelo.
