# Smart Service Intake — Fase 4: Audio y notas de voz

Fecha: 2026-08-08
Ámbito: agregar la última fuente principal (audio) al carril canónico ya
construido en Fases 1 (Excel/CSV), 2 (texto/WhatsApp) y 3 (imagen/PDF).

## 1. Carril único (no hay pipeline nuevo)

```
nota de voz
  ↓  bucket privado service-intake-files (temporal, se borra tras leerlo)
import_batches (batch_type='service_intake', source='voice_note')
  ↓  edge function audio-service-intake
transcripción (openai/gpt-4o-transcribe · fallback multimodal para OGG/Opus)
  ↓  extracción con el CONTRATO ÚNICO compartido con imagen y PDF
normalización pura (src/lib/intake/audio-extraction.ts)
  ↓
raw_schedule_import_rows (se guarda la TRANSCRIPCIÓN, nunca el audio)
  ↓
resolución de venue/cliente (entity-resolution) + duplicados (duplicate.ts)
  ↓
ServiceIntakeReviewInbox  ← la MISMA bandeja de las fases 1/2/3
  ↓  revisión humana obligatoria
createDraftServicesFromCandidates → scheduled_shifts (publication_status='draft')
```

No se creó otra bandeja, otro modelo de candidato, otro detector de duplicados
ni otro draft engine.

## 2. Piezas

| Pieza | Rol | Nuevo / reutilizado |
| --- | --- | --- |
| `supabase/functions/_shared/service-extraction-schema.ts` | Contrato ÚNICO de extracción | Nuevo, **consolida**: la Fase 3 ahora lo importa en vez de duplicarlo |
| `supabase/functions/audio-service-intake/index.ts` | Transcribe + extrae, con guardia de tenant | Nuevo |
| `src/lib/intake/audio-extraction.ts` | Módulo puro: fechas habladas + normalización | Nuevo (delega en `normalizeVisualExtraction`) |
| `src/lib/intake/audio-intake.ts` | Orquestación (batch, subida, edge, trazabilidad) | Nuevo (reutiliza `batch.ts`, `text-intake.ts`, `duplicate.ts`) |
| `src/components/intake/AudioIntakePanel.tsx` | Grabar / subir audio | Nuevo; monta la bandeja compartida |
| `ServiceIntakeReviewInbox`, `candidate.ts`, `entity-resolution.ts`, `duplicate.ts`, `create-draft-service.ts`, `telemetry.ts` | Bandeja, modelo, resolución, duplicados, draft, telemetría | **Reutilizados sin cambios** |

## 3. Entrada soportada

- Grabación en vivo (desktop y mobile) con `MediaRecorder`.
- Archivos: MP3, M4A/MP4, WAV, OGG/Opus, WEBM, AAC.
- Máximo 5 audios por análisis, 25 MB por archivo, mínimo 2 KB (bloquea el
  audio vacío antes de gastar una llamada).
- OGG/Opus (nota de voz de WhatsApp): el endpoint dedicado lo rechaza en
  algunos contenedores; en ese caso cae automáticamente al modelo multimodal.

## 4. Política de audio

El audio **no se conserva**. Se sube al bucket privado sólo para que el
servidor pueda leerlo con URL firmada y se borra en la misma ejecución, antes
de transcribir. Lo que queda en `raw_schedule_import_rows` es la
transcripción, el nombre del archivo y `audio_retained: false`.

## 5. Reglas duras verificadas

- No publica, no asigna trabajadores, no toca payroll, no crea `time_entries`.
- `company_id` sale siempre del contexto autenticado y se valida contra roles
  reales en la edge function; el path del objeto debe empezar por el tenant.
- No inventa: hora, personal, cliente, lugar o rol que no se dijo queda `null`
  y bloquea la creación del borrador.
- Las fechas relativas se resuelven con el MISMO resolutor de Fase 2
  (`resolveDateFromText`): "mañana", "pasado mañana", "el martes",
  "la próxima semana el jueves", "next Thursday".
- Ambigüedad ⇒ `Revisar`: la fecha queda vacía y el candidato pide decisión.
- Lo escuchado que no se puede convertir va a "Necesitan revisión"; nunca se
  descarta en silencio.
- Confianza por campo (HIGH / MEDIUM / LOW / MISSING) igual que en Fase 3.

## 6. QA

### Unitario
`src/test/smart-service-intake-phase4.test.ts` — 20 tests en verde.
Fases 1–3 (72 tests) siguen en verde tras consolidar el contrato de extracción.

Cubre: un servicio, varios servicios, fechas relativas, ISO, ambigüedad, sin
fecha, sin hora, sin personal, venue mal pronunciado (confianza LOW), audio sin
contenido, `company_id` del contexto, validación de formatos y audio vacío.

### End-to-end (Playwright, `/app/import-schedule`, empresa QA Testing)

**Nota 1 — español, dos servicios**
Transcripción: "Anota dos servicios: mañana en el Hotel Marina, de 6 de la
tarde a 11 de la noche, necesito 4 personas para montaje. Y el 14 de marzo en
el Convention Center, de 8 de la mañana a 4 de la tarde, dos bartenders para el
cliente Global Events."

Resultado: 2 candidatos.
1. Hotel Marina · 2026-08-09 · 18:00–23:00 · 4 personas · montaje.
2. Convention Center · 2027-03-14 · 08:00–16:00 · 2 personas · cliente Global
   Events, con aviso "La nota no dijo el año".

**Nota 2 — mezcla inglés/español, información faltante**
Transcripción: "Hey, quick note. Tomorrow, we need three servers at the Marina
Hotel from 10 a.m. to 2 p.m. También, la próxima semana el jueves, un evento
en, eh, no me acuerdo del lugar, para el cliente Global Events."

Resultado: 2 candidatos.
1. Marina Hotel · 2026-08-09 · 10:00–14:00 · 3 personas.
2. Global Events · 2026-08-13 (jueves de la próxima semana) · sin lugar, sin
   hora, sin personal → bloqueado con "Falta: start_time, end_time" y
   confianza baja. **No inventó el lugar olvidado.**

En ambos casos: 0 servicios creados sin confirmación humana, 0 asignaciones, 0
escrituras en payroll.

### Tenant
- Llamada sin sesión → `401 Missing auth`.
- Llamada de un usuario que no administra la compañía → `403`.
- Objeto fuera del prefijo `{company_id}/` → `tenant_path_mismatch`, se ignora.

## 7. Confirmación final

**Stafly puede convertir notas de voz en candidatos revisables de Servicios
utilizando el mismo carril canónico construido para todas las demás fuentes.**
