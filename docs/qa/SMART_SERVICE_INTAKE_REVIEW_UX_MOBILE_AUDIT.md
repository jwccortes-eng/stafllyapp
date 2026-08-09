# Smart Service Intake — Auditoría UX de revisión + mobile (Fase A)

Alcance auditado: `/app/import-schedule` (texto, imagen, PDF, audio, Excel/CSV),
bandeja compartida `ServiceIntakeReviewInbox`, edición de candidatos, selector de fecha,
creación de borradores, navegación mobile y desktop. Sin cambios de código en esta fase.

## 1. Cómo está compuesta hoy la revisión

`ImportSchedule` renderiza un selector de fuente y un solo panel por vez
(`PastedTextIntakePanel`, `VisualIntakePanel variant=image|pdf`, `AudioIntakePanel`, wizard Excel).
Cada panel corre su intake, guarda `candidates` en estado local y monta
`ServiceIntakeReviewInbox` con `onPatch / onAccept / onExclude / onCreateDrafts`.

La bandeja es una lista de `Card`, cada una con: título (venue o cliente), línea de metadatos,
badges de estado, fila de confianza por campo, avisos, un **grid de 4 inputs siempre abiertos**
(fecha, inicio, fin, personal) y una fila de 4–6 botones.

## 2. Componentes reutilizados

- `ServiceIntakeReviewInbox` (única bandeja, todos los canales).
- `createDraftServicesFromCandidates` + `applyOutcome` (único escritor de drafts).
- `refreshDuplicateStatus`, `confirmRef`, `recomputeCandidate`, `closeServiceIntakeBatch`.
- `RememberCorrectionPrompt` (diccionario del tenant).
- `notify*` de OX-1 para todo el feedback.

## 3. Herencia de ImportSchedule legacy

- El wizard Excel/CSV (pasos 1–4, tablas, `PasswordConfirmDialog`, resúmenes de matching)
  es íntegramente legacy y ocupa la mayor parte del archivo (~3.2k líneas).
- Los intake modernos sólo cuelgan del selector; no comparten wizard ni tabla.
- Vocabulario legacy residual en la capa Excel ("Turnos programados", "batch", "filas").

## 4. Qué se siente como formulario tradicional

- Los 4 inputs nativos (`type=date`, `type=time`, `number`) están **siempre visibles** en cada card:
  la card parece un registro editable, no una sugerencia de IA.
- La jerarquía visual arranca por venue, no por fecha; el tipo de servicio es texto secundario gris.
- La confianza se expone como fila de píldoras por campo ("Fecha · alta, Inicio · media"…):
  ruido de auditoría en primer plano.
- No hay concepto visible de "incluida / excluida / necesita revisión"; hay `Aceptar` + `Excluir`
  como botones sueltos, y en mobile ni siquiera hay checkbox de selección.

## 5. Elementos que generan más scroll

Por candidato: badges (hasta 6) + fila de confianza (hasta 8 píldoras) + avisos + grid 2×2 de inputs
+ 4–6 botones envueltos ⇒ ~340–420px de alto en 393px. Con 10 candidatos son ~4.000px de scroll.
El bloque "Necesitan revisión" al final añade otra lista sin colapsar.

## 6. Acciones duplicadas

- `Aceptar` por card y `Aceptar selección` en la barra desktop.
- `Excluir` por card y `Excluir selección`.
- CTA inferior "Crear N servicios en borrador" usa **sólo** los `accepted`, mientras que la barra de
  selección opera sobre `selected` o sobre todos los visibles: dos modelos de selección conviviendo.
- "Revisar fuente" abre un toast informativo, no un preview real.

## 7. Campos que ocupan demasiado espacio

`ConfidenceRow` (hasta 8 píldoras), `StatusBadges` (badge de "Falta: ..." concatenando nombres
técnicos `service_date`, `start_time`), y el grid de inputs, que en 393px cae a 2 columnas de
~170px con inputs nativos de 36px de alto (por debajo de 44px).

## 8. Editar fecha/hora/venue

- Fecha/hora usan inputs nativos: en iOS Safari abren la rueda nativa (aceptable) pero el input
  mide 36px y el foco desplaza el layout; en Chrome Android el date picker es correcto.
- **Venue no es editable**: sólo se puede "Confirmar lugar" si hubo sugerencia. Si el venue está mal,
  no hay camino en la bandeja.
- Cada `onPatch` recalcula el candidato; no se pierde scroll (no hay remount), pero al cambiar
  `reviewStatus` a `needs_input` la card puede desaparecer si hay un filtro activo distinto de "Todos".

## 9. Después de "Crear borradores"

`createDraftServicesFromCandidates` es idempotente por candidato (`createdShiftId` + reuse), cierra
el batch y notifica con acción "Ver servicios" → `/app/shifts` **sin contexto** (sin fecha ni filtro
de borradores). Las cards creadas quedan con badge "Draft creado" pero el CTA inferior sigue
ofreciendo crear si quedan aceptados.

## 10. Vuelta a Servicios

Sólo por el toast ("Ver servicios") o por el sidebar. No hay CTA persistente de cierre de flujo.

## 11. ¿El batch puede ejecutarse dos veces?

A nivel de datos, no: el helper reutiliza `createdShiftId` y reporta `reused`. A nivel de UX sí:
el botón se rehabilita apenas termina `isCreating`, no hay bloqueo de doble tap ni marca de
"lote procesado". En móvil un doble toque dispara dos pasadas (la segunda devuelve `reused`).

## 12. Comportamiento por viewport

- **393px / 430px**: sin scroll horizontal (todo usa `flex-wrap` y grid de 2 columnas), pero
  densidad excesiva y targets de 36px (`h-9`) en inputs y `size="sm"` en botones (32px).
- **Safari iPhone**: la barra "sticky bottom-0" no respeta `safe-area-inset-bottom`; el CTA queda
  bajo la home indicator. Con teclado abierto (input numérico de personal) la sticky bar sube
  correctamente pero tapa el input activo.
- **Chrome Android**: correcto salvo altura de targets; el `Select` de filtros abre a ancho de
  trigger (176px) y trunca etiquetas largas.

### Checklist mobile

| Riesgo | Estado |
| --- | --- |
| Scroll horizontal | OK (no se observa) |
| Inputs pequeños | **Falla** (36px < 44px) |
| Modales más anchos que viewport | OK (no hay modales en la bandeja) |
| Teclado tapa CTA | **Riesgo** (sticky bar sobre el campo activo) |
| Date picker incómodo | Parcial (nativo, pero input pequeño) |
| Bottom nav tapada | **Falla** (sticky sin safe-area) |
| Botones <44px | **Falla** (`size="sm"`) |
| Estado al volver | **Falla** (todo en estado local; salir del panel pierde candidatos) |
| Pérdida de candidatos | **Falla** (cambiar de fuente desmonta el panel) |
| Refresh accidental | **Falla** (no hay persistencia del texto ni del batch) |
| Audio/cámara | OK (grabación + `capture` en imagen) |
| Selector de archivos | OK |
| Safe area | **Falla** |
| Doble submit | **Falla** a nivel UX |

## Resumen

**Qué está bien:** el carril canónico, la idempotencia de datos, una sola bandeja, detección de
duplicados, diccionario, y que nada se crea sin confirmación humana.

**Qué está confuso:** dos modelos de selección (accepted vs selected), confianza como píldoras por
campo, campos faltantes con nombres técnicos, venue no editable, "Revisar fuente" como toast.

**Qué rompe mobile:** targets <44px, sticky bar sin safe-area, inputs siempre abiertos, pérdida de
estado al cambiar de fuente o refrescar, doble submit posible.

**Qué debe conservarse:** pipeline, helper canónico, duplicados, diccionario, telemetría, contratos
de extracción, ModuleGate y la ruta única.

**Propuesta de ajuste (Fase B):** rediseñar sólo la capa de presentación de la bandeja —card
canónica de candidato con jerarquía fecha → venue → tipo → hora → personal → confianza humana →
pendientes → duplicado; edición contextual en sheet; chips de filtro; barra inferior sticky con
safe-area y CTA ≥56px; selección explícita que nunca incluye duplicados exactos; preview de fuente
en sheet; persistencia del borrador de revisión; bloqueo de doble submit y marca de lote procesado.
