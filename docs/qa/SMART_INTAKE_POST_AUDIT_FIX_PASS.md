# Smart Intake — Fix pass sobre auditoría confirmada

Fuente: `docs/qa/P0_SMART_INTAKE_FULL_CHANNEL_HEALTH_AUDIT.md` (no se repitió la auditoría).
Alcance: sólo bugs de producto confirmados. No se tocó pipeline canónico, `scheduled_shifts`,
payroll, `time_entries`, exportación Connecteam, ELDM, ni auth/RLS/tenants.

## 1. GROUP_RE — fantasma "20 AGO"

- Archivo: `src/lib/intake/date-expansion.ts`
- Causa: el token de día aceptaba cualquier dígito, por lo que en
  `Monday, Aug 10, 2026` la coma más el `20` del año se leían como segundo día.
- Corrección: token de día con negative lookahead `\d{1,2}(?!\d)`.
- Resultado: `Aug 10, 2026` produce **una** fecha (`2026-08-10`). Las listas y rangos
  reales (`Aug 30/31 Sep 1-3` → 5 fechas) siguen expandiéndose.

## 2. Audio — un fallo técnico ya no dice "No encontramos servicios"

- Archivos: `src/lib/intake/audio-intake.ts`, `src/components/intake/AudioIntakePanel.tsx`
- Antes: el error del proveedor se lanzaba como excepción genérica y, cuando llegaba
  respuesta vacía, la UI mostraba "No encontramos servicios".
- Ahora: el fallo se conserva por archivo (`requestFailure`), el resultado expone
  `analysisIncomplete`, `failureKind`, `outcome` y `recovery`, mismo contrato que el canal
  visual. La UI usa `describeOutcome`, por lo que un fallo técnico dice
  "No pudimos completar el análisis" con el motivo humano.
- Si hay transcripción utilizable, se corre la recuperación estructural y el resultado
  puede ser `TECHNICAL_FAILURE_WITH_EVIDENCE` (encontró información suficiente).

## 3. Audio — 0.0 MB

- Archivo: `src/components/intake/AudioIntakePanel.tsx`
- `formatFileSize` muestra bytes/KB/MB reales; 380 KB ya no aparece como `0.0 MB`.
- Si el archivo es realmente 0 bytes: se marca en rojo como "vacío (0 bytes)" y el análisis
  se bloquea con la explicación de que la grabación está vacía.

## 4. Excel — sin descarte silencioso de hojas

- Archivo: `src/pages/admin/ImportSchedule.tsx`
- `pickScheduleSheet` (elegía una hoja y callaba el resto) fue sustituida por
  `auditWorkbookSheets`, que inventaría **todas** las hojas con estado y motivo:
  `procesada`, `vacía`, `no compatible`, `ignorada`.
- Se procesan todas las hojas compatibles (≥3 columnas de horario reconocidas); si ninguna
  califica, se intenta la primera con datos y queda registrado el motivo.
- El inventario se muestra en el bloque de diagnóstico de la importación.

## 5. Proveedor — `credit_limit_reached` no es bug de contenido

- `classifyProviderFailure` lo clasifica como `quota_or_credit` y `describeOutcome` lo
  comunica como fallo técnico del análisis automático, con tono de error y opción de
  reintentar o escribir los datos.

## QA

- `src/test/smart-intake-post-audit-fix.test.ts` — 4/4 PASS
  (fantasma 20 AGO, expansión real, clasificación de crédito, copy sin "No encontramos servicios").
- Suite completa: 845 PASS. Los 7 fallos restantes son de
  `src/test/driver-sync-roundtrip.test.ts` (mock de backend), preexistentes y ajenos a este pase.
- Typecheck limpio.

### Canales

| Canal | Estado tras el fix |
| --- | --- |
| Texto | OK — sin fecha fantasma |
| Imagen | Contrato de fallo técnico intacto |
| PDF | Contrato de fallo técnico intacto |
| Audio | Fallo técnico y tamaño de archivo correctos; sin mensaje contradictorio |
| Excel | Toda hoja reportada con estado y motivo |

QA de extremo a extremo con proveedor real (imagen/PDF/audio) queda pendiente hasta que se
restablezca la disponibilidad del proveedor: hoy sigue devolviendo `credit_limit_reached`,
que ahora se presenta correctamente como fallo técnico.
