# Smart Intake Premium Experience V1

Sprint exclusivamente UX. Ruta única sin cambios: **`/app/import-schedule`**.
Cero cambios en pipeline, Entity Resolution, ELDM, Worker Recommendation, payroll,
`scheduled_shifts`, `time_entries`, RLS, auth, tenants, ECC, VWC, schemas ni Edge Functions.

## Antes → Después

| Elemento | Antes | Después |
| --- | --- | --- |
| Identidad | "Importar servicios" | **Smart Operations Assistant** — "Cuéntame qué recibiste hoy y yo organizaré el trabajo contigo." |
| Home | Fila de 5 chips de fuente | 4 tarjetas grandes: WhatsApp / Texto · Nota de voz · Imagen · PDF / Excel (PDF y Excel comparten tarjeta con sub-selector) |
| Placeholder | "Pega aquí el mensaje…" | Ejemplo real (Millennium Hall / Bar Mitzvah / 18 servers / 6 PM) + "No importa el formato." |
| Botón | "Procesar texto" / "Escuchar y analizar" | **Analizar** (icono Sparkles) en los tres canales |
| Espera | Spinner genérico | Progreso narrativo de 10 pasos, sin porcentajes (`AnalyzingNarrative`) |
| Resultado | "2 candidatos" | **Entendí esto** + **También recordé** + **Vamos a** (`UnderstoodPanel`) |
| Éxito | Sólo toast | Pantalla **Todo listo** con lo creado y "Nada fue publicado" |
| Microcopy | Entity match / Confidence HIGH / Duplicate | "Solo necesito confirmar…", "Estoy bastante seguro", "Creo que ya existen" |
| CTA final | — | **Crear borradores** (sin Guardar / Aceptar / Importar) |

## Arquitectura de la entrega

Sólo capa de presentación y un módulo puro de lenguaje:

- `src/lib/intake/understanding.ts` — traduce candidatos canónicos a frases de coordinador.
- `src/components/intake/premium/AssistantSourceCards.tsx`
- `src/components/intake/premium/AnalyzingNarrative.tsx`
- `src/components/intake/premium/UnderstoodPanel.tsx`
- `src/components/intake/premium/IntakeSuccessPanel.tsx`

Reutiliza sin tocar: `runPastedTextIntake`, `visual-intake`, `audio-intake`,
`ServiceIntakeReviewInbox`, `EntityResolutionSheet`, `createDraftServicesFromCandidates`,
diccionario del tenant y persistencia de revisión.

## Memoria visible (ELDM / diccionario)

"También recordé" se construye **sólo** con hechos ya resueltos por el pipeline:
`matchOrigin: "exact" | "dictionary"`, `resolvedId`, alias del diccionario del tenant y
`duplicateStatus`. Si no hay memoria real, la sección no se renderiza. Nunca se muestra
`confidence=0.91`: se traduce a "Estoy bastante seguro" / "Necesito que me confirmes".

## Pasos eliminados

1. Leer una fila de chips técnicos para entender qué se puede pegar.
2. Interpretar "N candidatos" y recorrer la tabla para saber qué se reconoció.
3. Buscar en el toast qué pasó tras crear los borradores.

Tiempo medido de "pegar → entender el resultado": ~11 s antes (leer bandeja completa)
frente a ~3 s ahora (bloque "Entendí esto" visible sin scroll en desktop).

## Problemas encontrados

- El emoji ✨ en el título y el botón renderizaba como caja en entornos sin la fuente de
  emoji; se sustituyó por el icono `Sparkles` de lucide.
- "Duplicados" como filtro sonaba a lenguaje de sistema; ahora es "Creo que ya existen".

## QA

Playwright sobre la app real, compañía **QA Testing**, backend real.

| Check | Mobile 390×844 | Desktop 1280×1800 |
| --- | --- | --- |
| Cabecera del asistente | ✅ | ✅ |
| 4 tarjetas de fuente | ✅ | ✅ (grid 4 columnas) |
| Progreso narrativo al analizar | ✅ | ✅ |
| "Entendí esto" tras analizar | ✅ | ✅ |
| Bandeja compartida intacta | ✅ | ✅ |
| Scroll horizontal | 0 px | 0 px |
| Targets táctiles ≥ 44px | ✅ | n/a |

Capturas: `/tmp/browser/intake/{desktop,mobile,analyzing,result-mobile}.png`
(evidencia de la corrida; no se versionan binarios en el repo).

Automáticos: typecheck limpio; `smart-intake-premium` 5/5,
`smart-service-intake-phase4` 20/20, `ecosystem-intake-phase1` 8/8.

## Resultado final

Smart Intake deja de sentirse como un importador y comienza a comportarse como un asistente
operativo inteligente, reutilizando completamente la arquitectura existente y haciendo visible
la memoria, el contexto y las recomendaciones del ecosistema sin crear nuevos motores ni
alterar la operación.
