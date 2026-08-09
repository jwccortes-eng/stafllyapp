# P0 — SMART INTAKE FULL CHANNEL HEALTH AUDIT
Texto · Imagen · PDF · Audio · Excel/CSV — auditoría de punta a punta, sin fixes.

Fecha de ejecución: 2026-08-09
Modo: solo observación + instrumentación (`src/test/__audit_trace.test.ts`). Sin cambios de producto.

---

## 0. Estado del proveedor externo al momento de la auditoría

Registro de AI Gateway del proyecto (últimos 7 días, 45 peticiones): **todas terminan en `client_error (http 403)`**.

| log_id | timestamp | modelo | operación |
| --- | --- | --- | --- |
| 019fe7d6-c8b0-704e-a929-5e1e28455952 | 2026-08-09T18:44:00Z | openai/gpt-4o-transcribe | audio_transcriptions |
| 019fe7d6-c952-761d-8192-b01fd01221cc | 2026-08-09T18:44:01Z | google/gemini-3.6-flash | chat_completions (fallback audio) |
| 019fe7d6-ed1d-71b6-91a8-9c91be04b5cf | 2026-08-09T18:44:10Z | openai/gpt-4o-transcribe | audio_transcriptions |
| 019fe7d6-edb6-70dc-b7a2-639003ab5d33 | 2026-08-09T18:44:10Z | google/gemini-3.6-flash | chat_completions (fallback audio) |
| 019fe7dd-6075-7596-a5a9-26fa76ec0e98 | 2026-08-09T18:51:12Z | openai/gpt-5.6-sol | responses (extracción imagen/PDF/audio) |

Log de la función `visual-service-intake`:
`AI gateway 403 {"type":"credit_limit_reached","message":"Workspace credit limit reached"}`.

**Consecuencia:** hoy los canales que dependen de IA (Imagen, PDF, Audio y la extracción asistida) están
`BLOCKED_BY_EXTERNAL_PROVIDER`, no rotos por parser. Solo Texto/WhatsApp y Excel son deterministas y
observables en su totalidad.

---

## 1. Mapa real por canal

Etapas compartidas (mismo código para texto, imagen, PDF y audio):
`import_batches` → normalización de candidatos (`src/lib/intake/candidate.ts`) → resolución de entidades
(`entity-linking.ts`, `assisted-creation.ts`) → `ServiceIntakeReviewInbox.tsx` → creación de borrador
(`buildCanonicalServiceInsert` / motor de series).

| Etapa | A. Texto | B. Imagen | C. PDF | D. Audio | E. Excel/CSV |
| --- | --- | --- | --- | --- | --- |
| UI | `PastedTextIntakePanel` | `VisualIntakePanel variant="image"` | `VisualIntakePanel variant="pdf"` | `AudioIntakePanel` | rama `source==="excel"` dentro de `ImportSchedule.tsx` |
| Adquisición | textarea | archivo → bucket `service-intake-files` | idéntico a imagen | `MediaRecorder` o archivo → mismo bucket | `<input type=file>` en memoria, **sin bucket** |
| Validación | longitud mínima | `ACCEPTED_VISUAL_MIME`, 15 MB, 8 archivos | igual | `validateAudioFile` (≥2 KB) | 10 MB, `.xls,.xlsx,.csv` |
| import_batches | sí (`source='text'`) | sí (`source='image'`) | sí (`source='pdf'`) | sí (`source='audio'`) | sí, pero `batch_type` de import legacy, **no** `service_intake` |
| Extracción | determinista `text-parser.ts` + `date-expansion.ts` | edge `visual-service-intake` (IA) | **misma** edge, mismo contrato | edge `audio-service-intake`: STT `openai/gpt-4o-transcribe` → fallback `gemini-3.6-flash` → extracción `gpt-5.6-sol` | `connecteam-parser.ts` + `parseSheetData` (determinista) |
| Normalización | `candidate.ts` | `candidate.ts` | `candidate.ts` | `audio-extraction.ts` → `candidate.ts` | `normalized_schedule_rows` (esquema distinto) |
| Resolución de entidades | ELDM/entity-linking | igual | igual | igual | `EmployeeResolver` (matcher legacy, otro motor) |
| Revisión | Review Inbox | Review Inbox | Review Inbox | Review Inbox | dry-run tabular propio (paso 3) |
| Salida | borrador candidato | borrador candidato | borrador candidato | borrador candidato | **escribe `scheduled_shifts` + asignaciones directamente** |

**Divergencia estructural confirmada:** PDF **sí** comparte el contrato de imagen (mismo panel, misma edge,
mismo esquema `SERVICE_EXTRACTION_SCHEMA`). **Excel/CSV no pertenece a Smart Intake**: es el importador
legacy de Connecteam, con parser propio, matching propio, revisión propia y escritura directa de turnos.

---

## 2. Matriz de salud

| Canal | Caso real | Input recibido | Parse/Transcribe | Normalize | Servicios detectados | Review | Draft | Estado | Error/Causa |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A. Texto | Imperial Aug 30/31 Sep 1–7, aprox 5pm, meseros pendientes | OK | OK (determinista) | OK | **9** independientes, Imperial heredado, 17:00 aprox., personal pendiente, sin `end_time` inventado | OK | OK | **PASS** | — |
| A. Texto (P2) | mismo caso | OK | OK | venue arrastra ruido | 9 | muestra `Imperial … sin hora definida` | OK | **DEGRADED** | `venueCandidate.raw` no se limpia de la nota operativa |
| A′. Recovery estructural | `Monday, Aug 10, 2026 / 4:00 PM - 9:00 PM / Job: ELUM FRANKLHALL` | OK | OK | OK | **2** (10 AGO correcto + **20 AGO fantasma**) | OK | crearía 2 borradores | **FAIL** | `GROUP_RE` en `date-expansion.ts` (ver §4) |
| B. Imagen | captura Connecteam real | archivo subido, batch creado | 403 `credit_limit_reached` | n/a | 0 | `IntakeRecoveryPanel` sí aparece | vía recovery manual | **BLOCKED_BY_EXTERNAL_PROVIDER** | crédito de workspace agotado |
| C. PDF | PDF de servicios | archivo subido, batch creado | 403 mismo gateway | n/a | 0 | igual que imagen | vía recovery manual | **BLOCKED_BY_EXTERNAL_PROVIDER** | mismo crédito |
| D. Audio | nota de voz grabada en la app | blob válido (≥2 KB) subido; UI muestra `0.0 MB` | STT 403 → fallback 403 → `transcription_failed` | n/a | 0 | **no** hay recovery para audio | no | **FAIL + BLOCKED_BY_EXTERNAL_PROVIDER** | ver §7 |
| E. Excel/CSV | export Connecteam Schedule | aceptado | OK si el sheet coincide | OK | filas agrupadas | dry-run propio | escribe turnos reales | **PASS (solo formato Connecteam)** | — |
| E′. Excel/CSV | Excel de cliente (formato libre) | aceptado | `pickScheduleSheet` no encuentra hoja → `continue` **silencioso** | — | 0 | pantalla vacía sin explicación | no | **FAIL** | ver §8 |

---

## 3. Texto / WhatsApp — caso Imperial

Traza (`__audit_trace.test.ts`): `parseTextToCandidates` segmenta, `date-expansion.ts` expande la lista
`Aug 30/31 Sep 1..7` → 9 fechas, hereda venue Imperial y hora aproximada 17:00 en todas, deja
`headcount = null` (Pendiente) y `end_time = null`. Los 9 candidatos pasan readiness **Draft** y son
creables. Único defecto: el string de venue conserva `"sin hora definida pero aprox 5pm"` (cosmético, P2).

---

## 4. Falso positivo 20 AGO — causa exacta

- Archivo: `src/lib/intake/date-expansion.ts`, línea 80, constante `GROUP_RE`.
- Regla: tras detectar un mes y un día (`Aug 10`), la expresión acepta **cualquier** secuencia numérica
  separada por coma / barra / `y` como día adicional del mismo mes.
- Con `Monday, Aug 10, 2026` el token `2026` se tokeniza y el grupo captura `20` como segundo día
  (el resto `26` se descarta por el límite 1–31), produciendo `2026-08-20`.
- Falta un *lookahead* que descarte un número de 4 dígitos inmediatamente posterior a una coma cuando ya
  hay un año resuelto en el segmento.
- Efecto secundario: el candidato fantasma hereda hora y job del real, por lo que parece legítimo en la
  bandeja. **No corregido en esta auditoría.**

---

## 5. Imagen — separación de estados

- **A. proveedor disponible:** no reproducible hoy (todo el gateway devuelve 403).
- **B. proveedor bloqueado:** `visual-extraction.ts` devuelve `ai_error` con `failureKind`;
  `VisualIntakePanel` muestra el `IntakeRecoveryPanel`. Verificado: `TECHNICAL_FAILURE` **no** se convierte
  en `NO_SERVICE_EVIDENCE` en esta ruta. Clasificación correcta: `BLOCKED_BY_EXTERNAL_PROVIDER`, no bug de parser.

---

## 6. PDF

Mismo panel, misma edge, mismo esquema y mismo `IntakeRecoveryPanel` que imagen; la única diferencia es
`classifyVisualSource` → `source='pdf'` y el `accept` del input. **No hay divergencia de contrato.**
Estado actual heredado del gateway: `BLOCKED_BY_EXTERNAL_PROVIDER`.

---

## 7. Audio — respuestas puntuales

1. **¿MediaRecorder inicia?** Sí, `AudioIntakePanel` obtiene `getUserMedia` y arranca sin timeslice.
2. **¿Hay `dataavailable`?** Sí, un único chunk al `stop()`.
3. **¿`blob.size > 0`?** Sí. `validateAudioFile` rechaza <2 KB, así que todo archivo listado tiene bytes.
4. **¿Por qué la UI muestra 0.0 MB?** `AudioIntakePanel.tsx:479` → `(f.size/1024/1024).toFixed(1)`.
   Una nota de 20–60 KB redondea a `0.0`. **Bug de presentación, no archivo vacío.**
5. **MIME generado:** `audio/webm;codecs=opus` (Chrome) / `audio/mp4` (Safari).
6. **¿Aceptado?** Sí: la validación parte por `;` y la edge normaliza vía `audioFormat()` → `webm`/`m4a`.
7. **¿Llega completo al upload?** Sí, sube a `service-intake-files/<company_id>/…`.
8. **¿La edge recibe bytes?** Sí: firma URL, descarga, borra el objeto y valida `byteLength ≥ 2048`
   (`index.ts:215-224`). No aparece `audio_empty` en logs.
9. **¿El proveedor recibe audio?** Sí: hay peticiones reales `audio_transcriptions` en el gateway.
10. **Error exacto:** HTTP **403** `credit_limit_reached` (log_id `019fe7d6-c8b0-704e-a929-5e1e28455952`),
    y el fallback `google/gemini-3.6-flash` devuelve **403** un segundo después
    (`019fe7d6-c952-761d-8192-b01fd01221cc`).
11. **¿Antes o después de la transcripción?** **Antes**: nunca hay transcript.
12. **¿Por qué además aparece “No encontramos servicios”?** Dos defectos encadenados:
    - `supabase/functions/audio-service-intake/index.ts:233-236` sólo mapea **429** y **402**. El **403**
      cae por el camino genérico → `transcription_failed` por archivo, con HTTP 200 de la función.
    - `AudioIntakePanel.handleAnalyze` (≈224-246) evalúa después `run.candidates.length === 0` y emite el
      aviso genérico de ausencia de evidencia, encima del aviso de transcripción fallida.

Estados canónicos hoy: el canal **mezcla** `TRANSCRIPTION_FAILED` con `TRANSCRIPTION_SUCCESS_NO_SERVICE`.
Además, audio **no** tiene `IntakeRecoveryPanel`, a diferencia de imagen/PDF.

---

## 8. Excel / CSV — respuestas puntuales

- **UI visible hoy:** `src/pages/admin/ImportSchedule.tsx`, rama `source === "excel"` (línea 2107), bajo
  `ModuleGate moduleKey="import"` (`App.tsx:358`). No hay otra ruta Excel.
- **¿Se acepta el archivo?** Sí: `.xls,.xlsx,.csv`, máximo 10 MB.
- **¿Se reconocen headers?** Sólo los del **Schedule Export de Connecteam** (`mapHeader` /
  `buildHeaderIndex`). Un Excel de cliente con encabezados propios no mapea.
- **Fallo silencioso principal:** en `handleFileUpload`, si `pickScheduleSheet(wb)` devuelve `null` el
  archivo se salta con `continue` **sin ninguna notificación**. El usuario ve “Procesando…” y luego nada.
- **¿Filas crudas escritas?** Sí, pero sólo cuando la importación avanza (Fase 4, `raw_schedule_import_rows`).
- **¿Filas normalizadas?** Sí, en el mismo paso (`normalized_schedule_rows`).
- **¿Aparece el dry run?** Sí, paso 3, con `PasswordConfirmDialog` y bloqueo por periodos de nómina
  cerrados (`hasLockedPeriods && !dryRun`).
- **¿Camino legacy compitiendo?** Sí: este canal **no** usa Smart Intake, no genera candidatos, no usa
  ELDM ni resolución asistida de entidades, y escribe turnos reales en vez de borradores.

---

## 9. Contrato de error compartido — divergencias actuales

| Estado propuesto | Texto | Imagen/PDF | Audio | Excel |
| --- | --- | --- | --- | --- |
| `TECHNICAL_FAILURE` | n/a | `ai_error` + `failureKind` ✔ | `transcription_failed` **sin** distinguir 403 ✘ | no existe ✘ |
| `INVALID_SOURCE` | longitud mínima | MIME/tamaño ✔ | tamaño ✔ | silencioso ✘ |
| `NO_SERVICE_EVIDENCE` | ✔ | ✔ | **se emite junto al fallo técnico** ✘ | “0 turnos” sin causa ✘ |
| `PARTIAL_EXTRACTION` | implícito | `IntakeRecoveryPanel` ✔ | no existe ✘ | `missingByReason` (diagnóstico interno) |
| `READY_FOR_REVIEW` | ✔ | ✔ | ✔ | dry-run propio |
| `PERSISTENCE_FAILURE` | ✔ | ✔ | ✔ | notificación de import |

No se implementa el contrato único todavía; se documenta la divergencia.

---

## 10. Salud del proveedor externo vs bug de producto

| Evento | Clasificación |
| --- | --- |
| `credit_limit_reached` (403) en imagen, PDF, audio y extracción | EXTERNAL PROVIDER FAILURE |
| 403 no mapeado en `audio-service-intake` | PRODUCT BUG |
| Doble mensaje de error en audio | PRODUCT BUG |
| `0.0 MB` en la lista de audio | PRODUCT BUG (UI) |
| Candidato fantasma 20 AGO | PRODUCT BUG (parser) |
| Hoja Excel no reconocida sin aviso | PRODUCT BUG (UX) |
| Ausencia de recovery en audio | PRODUCT BUG (cobertura) |

Ninguno de estos eventos se registró en ELDM: son observabilidad técnica.

---

## 11. Casos de crash

Durante esta auditoría **no** se reprodujo “The app encountered an error”: 0 `pageerror`, 0 errores de
consola en los flujos ejecutados. No se abre causa raíz sin evidencia nueva.

---

## 12. Prioridades

**P0**
1. Audio: mapear 403 del gateway y separar `TRANSCRIPTION_FAILED` de `NO_SERVICE_EVIDENCE` (canal completo inutilizable y mensaje contradictorio).
2. Recovery estructural: eliminar el candidato fantasma 20 AGO (corrompe resultados: crearía servicios inexistentes).
3. Excel: hacer visible el rechazo cuando no se reconoce la hoja/headers (hoy falla en silencio).

**P1**
4. Audio sin `IntakeRecoveryPanel` — imagen y PDF sí lo tienen.
5. Contrato de error único entre los cinco canales.

**P2**
6. `0.0 MB` en la lista de audio.
7. Venue con ruido operativo en el caso Imperial.

---

## Resultado final

- **A. Matriz:** §2.
- **B. Funciona realmente:** Texto/WhatsApp (9 servicios Imperial correctos) y Excel con formato Connecteam.
- **C. Falla realmente:** falso positivo 20 AGO, mensajes de audio contradictorios, `0.0 MB`, Excel silencioso.
- **D. Bloqueado por proveedor externo:** Imagen, PDF y transcripción de audio — 403 `credit_limit_reached`.
- **E. Fallos compartidos:** clasificación de errores inconsistente; dependencia del mismo gateway.
- **F. Fallos específicos:** audio (403 no mapeado, sin recovery, MB), texto/recovery (`GROUP_RE`), Excel (parser legacy Connecteam-only).
- **G. Causa del 20 AGO:** §4 — `GROUP_RE` captura `20` del año `2026`.
- **H. Causa del audio:** §7 — bytes correctos; 403 del proveedor no mapeado; `0.0 MB` es redondeo de UI.
- **I. Causa del Excel/CSV:** §8 — sólo entiende el Schedule Export de Connecteam y descarta hojas desconocidas sin avisar.
- **J. Orden de fixes:** §12.

---

No se corrigieron síntomas por separado. Se trazaron todos los canales de Smart Intake de punta a punta,
reutilizando la evidencia ya confirmada y separando bugs de producto, fallos de proveedor y problemas de UX.
