# Smart Service Intake — Fase 3: extracción visual de servicios

Fecha: 2026-01-XX (staging QA Testing)
Alcance: convertir información visual (captura de calendario, foto de agenda, flyer, PDF visual)
en candidatos revisables **dentro del carril canónico existente**. Sin pipeline nuevo, sin bandeja nueva.

## 1. Carril canónico (sin desvíos)

```text
archivo (imagen/PDF)
  -> storage privado  service-intake-files/<company_id>/<batch_id>/<archivo>
  -> import_batches                (mismo registro de lote que CSV y texto)
  -> raw_schedule_import_rows      (evidencia cruda: 1 fila por bloque visual detectado)
  -> extracción visual (sugerencia)  supabase/functions/visual-service-intake
  -> ServiceCandidate normalizado  src/lib/intake/visual-extraction.ts
  -> bandeja compartida            ServiceIntakeReviewInbox (la misma de Fase 1 y 2)
  -> confirmación humana
  -> scheduled_shifts (publication_status = 'draft')
```

Nada se escribe en `scheduled_shifts` sin confirmación explícita persona por persona
(o por selección múltiple). El canal visual **no** asigna trabajadores, **no** publica,
**no** notifica y **no** toca payroll.

## 2. Piezas nuevas

| Pieza | Rol |
| --- | --- |
| `supabase/functions/visual-service-intake/index.ts` | Extracción multimodal (AI Gateway, `openai/gpt-5.6-sol`) con JSON Schema estricto. Sólo sugiere. |
| `src/lib/intake/visual-extraction.ts` | Módulo **puro**: normaliza la salida, resuelve fechas/horas, calcula confianza por campo, deduplica entre páginas. |
| `src/lib/intake/visual-intake.ts` | Orquestación: subida a storage, lote, filas crudas, resolución de entidades y duplicados. |
| `src/components/intake/VisualIntakePanel.tsx` | UI del canal visual (arrastrar, elegir archivo, cámara en móvil, previsualización). |
| `ServiceIntakeReviewInbox.tsx` | Extendida con confianza por campo y bloque "Necesitan revisión". |

Reutilizado sin duplicar: `import_batches`, `raw_schedule_import_rows`, `ServiceCandidate`,
`resolveCandidateEntities`, `detectDuplicate`, `createDraftServiceFromCandidate`, telemetría.

## 3. Comprensión visual

- **Estructura**: el extractor recibe la instrucción de leer rejillas de calendario, columnas
  y bloques, y de agrupar el contenido de **una celda** como **un solo servicio**
  (día + lugar + tipo + hora, aunque estén en líneas distintas).
- **Color**: se registra como `color_group` y se muestra como pista ("Agrupado por color (yellow).
  El color no define el lugar: confirma con el texto."). Nunca se usa como identidad.
- **Año ausente**: si el calendario dice "OCTOBER 13" sin año, `resolveVisualDate` elige el año
  más cercano a la fecha de referencia y marca el candidato con el aviso
  "La imagen no muestra el año. Confirma la fecha antes de crear el borrador."
- **Nunca inventar**: hora ilegible, personal no indicado o cliente ausente quedan vacíos
  y bloquean la creación con `Falta: ...`.

## 4. Confianza por campo

Cada candidato expone nivel por campo: `HIGH` (≥0.85), `MEDIUM` (≥0.6), `LOW` (>0), `MISSING`.
Se rinde como chips: `Fecha · alta`, `Inicio · sin dato`, etc. El resumen del candidato
muestra "Confianza baja/media/alta" según el peor campo requerido.

## 5. Elementos no resueltos

Todo bloque visual que el extractor detecta pero no puede convertir en servicio
(fecha sin identidad, identidad sin fecha, texto borroso) se muestra en
**"Necesitan revisión"** con el texto detectado, la razón, la página y la región.
No se descarta en silencio y no se convierte en candidato.

## 6. PDF multipágina

Cada página se procesa por separado y conserva `page_number` / `region_label`.
`dedupeAcrossPages` unifica el mismo servicio repetido entre páginas (misma fecha,
mismo lugar, misma hora) y reporta cuántos duplicados internos se unieron.

## 7. Aislamiento y seguridad

- Bucket `service-intake-files` **privado**, con RLS por carpeta = `company_id`
  (`public.can_manage_service_intake_files`).
- La función valida el JWT y comprueba pertenencia a la compañía del contexto.
- El `company_id` del candidato viene **siempre** del contexto de la sesión,
  nunca del contenido del archivo.

## 8. QA ejecutado

Automático — `src/test/smart-service-intake-phase3.test.ts`, 24 pruebas:
resolución de fecha/hora, celda de calendario, multi-servicio, dos venues,
elementos ambiguos, PDF multipágina, flyer con hora, aislamiento de tenant,
reintento estable, ningún candidato nace publicado.
Suite completa de intake: **72 pruebas en verde** (Fase 1: 21, Fase 2: 27, Fase 3: 24).

Manual (staging, compañía QA Testing, `/app/import-schedule`):
captura de calendario de octubre con tres celdas de color (Millennium/Bar Mitzvah amarillo,
Zemer/Sheva Brochos morado, Eminence Hall/Wedding 6:00 PM verde).

Resultado observado:
- "Encontramos 3 servicios." — un candidato por celda, no uno por línea.
- Fechas resueltas a 2026-10-13 / 10-14 / 10-20 con aviso de año asumido.
- Chips por campo: `Fecha · alta`, `Lugar · alta`, `Servicio · alta`,
  `Inicio · sin dato`, `Personal · sin dato`.
- `Falta: start_time, end_time` bloquea "Aceptar" hasta completar.
- Aviso de color visible y correcto en cada tarjeta.
- Cero servicios creados durante el análisis (telemetría: `candidateCount: 3, confirmedCount: 0`).

## 9. Límites conocidos

- Un archivo ilegible devuelve cero candidatos y un aviso claro; no se reintenta solo.
- El extractor sugiere; la corrección de lugar/cliente sigue siendo humana en la bandeja.
- Manuscrito muy irregular cae mayormente a "Necesitan revisión", que es el resultado deseado.
