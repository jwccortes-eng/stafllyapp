# P0 — Smart Intake Multi-Date Expansion

Fecha: 2026-08-09
Alcance: parser de texto del carril canónico de Smart Service Intake (`src/lib/intake/`).
Sin cambios en pipeline canónico, `import_batches`, `scheduled_shifts`, payroll, `time_entries`,
assignments, Entity Resolution, ELDM, Tenant Dictionary, Connecteam, auth, RLS ni tenants.

## 1. Caso reproducido

```
Imperial
Aug 30/31
Sep 1/2/3/4/5/6/7
sin hora definida pero aprox 5pm
cantidad de meseros pendientes
```

Resultado anterior: 2 candidatos (y uno de ellos con fecha equivocada).
Resultado actual: 9 candidatos, uno por día, todos heredando Imperial.

## 2. Causa raíz (auditoría)

| Punto auditado | Hallazgo |
|---|---|
| Listas de días con "/" | No existían. `resolveDateFromText` devuelve **una sola** fecha por fragmento. |
| Cambio de mes en el bloque | Irrelevante: nunca se llegaba a leer el segundo mes de la línea. |
| Fecha errónea en `Sep 1/2/3...` | El patrón numérico `\d{1,2}[/.-]\d{1,2}` capturaba `1/2` como **mes/día** → 2 de enero, ignorando "Sep". |
| Herencia de venue entre líneas | Sólo funcionaba con cabecera con dos puntos (`Imperial:`). Una cabecera suelta (`Imperial`) se descartaba como "no se detectó ningún trabajo". |
| Contexto común (hora, personal) | No existía: las líneas sin fecha se descartaban por completo. |
| Límite accidental de candidatos | No hay ninguno. |
| Deduplicación | No eliminaba fechas: simplemente nunca se generaron. |
| Normalización posterior | Correcta; no participa en el fallo. |

No se creó un segundo extractor ni ninguna regla específica de Imperial: la corrección es genérica
y vive en el mismo parser compartido.

## 3. Cambios

- **`src/lib/intake/date-expansion.ts` (nuevo, puro)** — `expandDateList` expande cualquier lista de
  días asociada a un mes: `/`, `,`, `y`/`and` y rangos `30-31`. Soporta varios grupos de mes en la
  misma línea. Se ejecuta ANTES del patrón numérico, con lo que `Sep 1/2` ya no se lee como `1 de febrero`.
  Rangos: soportados de forma **explícita y documentada** (no silenciosa).
- **`src/lib/intake/text-parser.ts`**
  - `segmentText` reconoce cabeceras sueltas (`Imperial`) y abre un **bloque**; cada candidato guarda su
    `blockIndex`, de modo que el contexto no salta al venue equivocado.
  - Las líneas sin fecha que sólo aportan hora o personal se conservan como segmentos de **contexto**
    del bloque y se heredan a los candidatos de ese bloque cuando el campo está vacío.
  - Una lista de días genera **un candidato por día**, con deduplicación por bloque + fecha + venue + hora.
  - `isApproximateTime` y `detectRoleCandidates` (nuevos, puros).
  - Nuevos avisos: `inferred_year`, `approximate_time`, `pending_workers`.

## 4. Reglas respetadas

- **Año**: si la fuente no lo escribe, se infiere por cercanía y se emite `inferred_year`
  ("El año no está escrito en la fuente… Revisa antes de crear"). Nunca se decide en silencio.
- **Hora aproximada**: `aprox 5pm` → `start_time = 17:00` con confianza 0.5 y aviso
  "La fuente indica que la hora es aproximada". `end_time` permanece `null`.
- **Personal**: `cantidad de meseros pendientes` → `requested_workers = null` (nunca 0), aviso
  `pending_workers`, y rol sugerido `server` sin cantidad.
- **Nada se crea sin confirmación humana**: el parser es suggestion-only; no toca la base de datos.

## 5. QA

| Caso | Entrada | Esperado | Resultado |
|---|---|---|---|
| 1 | Texto real completo | 9 candidatos, 9 fechas correctas, Imperial heredado | PASS |
| 2 | `Aug 30/31/ Sep 1/2/3` | 5 candidatos | PASS |
| 3 | `Aug 30, 31` / `Sep 1, 2, 3` | mismo resultado | PASS |
| 4 | `Aug 30-31` / `Sep 1-7` | 9 candidatos (rangos soportados explícitamente) | PASS |
| 5 | Dos venues con listas distintas | sin herencia cruzada de fechas ni de hora | PASS |
| 6 | Retry del mismo texto | mismos candidatos, cero duplicados | PASS |
| 7 | Mobile y desktop | mismo módulo puro para ambas superficies; sin lógica dependiente de viewport | PASS |

Regresión: `src/test/smart-intake-multi-date.test.ts` (19 tests, incluye el texto exacto del caso real).
Suite de intake completa en verde (`smart-service-intake-phase2` 27 tests).
Typecheck: limpio.
Único fallo del repo: `driver-sync-roundtrip.test.ts`, deuda previa ya documentada en
`docs/qa/DEBT_DRIVER_SYNC_ROUNDTRIP_TEST_FAILURE.md`, sin relación con este cambio.

## 6. Criterios de aceptación

- [x] El input real produce exactamente 9 candidatos
- [x] Las 9 fechas son correctas
- [x] Imperial se hereda correctamente
- [x] 5 PM queda como aproximado/revisable
- [x] No se inventa hora final
- [x] Meseros pendientes permanece como dato faltante
- [x] Nada se crea sin confirmación humana
- [x] No se generan duplicados
- [x] Tests y typecheck pasan
