# P0 — Smart Intake Operational Recovery Layer

## Principio
La existencia de un Servicio real no depende de que el proveedor de IA responda bien.
Un fallo técnico nunca se traduce en "0 servicios".

## Tres resultados posibles
| Outcome | Cuándo | Mensaje |
|---|---|---|
| `ANALYSIS_SUCCESS` | el análisis terminó y hay candidatos | "N servicios detectados" |
| `NO_EVIDENCE` | el análisis terminó y no hay señales | "No encontramos servicios" |
| `TECHNICAL_FAILURE_WITH_EVIDENCE` | falló el proveedor pero hay señales estructurales | "No pudimos completar el análisis, pero encontramos esto" + CTA *Revisar lo encontrado* |
| `TECHNICAL_FAILURE_NO_EVIDENCE` | falló el proveedor y no hay texto utilizable | "No pudimos completar el análisis" + reintento / escribir a mano |

## Detección determinista (sin LLM obligatorio)
`src/lib/intake/recovery.ts` — `detectStructuralEvidence()` reconoce fecha, weekday,
horario (inicio / fin / rango), Job/título, dirección, encabezado de turno y usuarios.
Mínimo de Servicio visual: **fecha + horario** o **fecha + Job**
(o fecha + dirección + estructura de turno).

## Recuperación
`runStructuralRecovery()` produce candidatos del **mismo modelo canónico**
(`ServiceCandidate`), marcados como recuperados, con estado por campo
(`detected` / `approximate` / `missing`). No inventa horas, ni personal, ni entidades.
`company_id` viene siempre del contexto autenticado.

## Recurrencia
Se preserva la señal literal ("Every day for 4 times") como dato revisable.
No se expanden fechas automáticamente.

## Reconciliación (reintento)
Prioridad: **Humano > Evidencia recuperada > Nueva IA**.
`reconcileAfterRetry()` conserva los candidatos con corrección humana y avisa
cuántos datos del nuevo análisis quedaron descartados.

## Superficie
- `src/components/intake/IntakeRecoveryPanel.tsx` — campos detectados, recurrencia,
  CTA *Revisar lo encontrado*, *Reintentar análisis*, *Empezar de nuevo*, y campo
  de texto para que la persona escriba lo que muestra la fuente.
- `VisualIntakePanel` entrega los candidatos recuperados a la **bandeja de revisión
  compartida**: no hay nueva bandeja ni nuevo modelo de draft.

## Garantías
Sin creación, sin publicación, sin asignación, sin payroll, sin time entries.
Nada se crea sin aprobación humana explícita.

## Caso real de regresión
Captura Connecteam: `Monday, Aug 10, 2026 · 4:00 PM - 9:00 PM · Job: ELUM FRANKLHALL ·
Recurrence: Every day for 4 times` con la gateway devolviendo 403 (credit limit).
Resultado esperado: `TECHNICAL_FAILURE_WITH_EVIDENCE` con fecha, inicio, fin y job
recuperados y la recurrencia conservada como texto.

## Matriz QA ejecutada (`src/test/smart-intake-operational-recovery.test.ts`, 17 tests)
| Caso | Resultado |
|---|---|
| A. Captura real + proveedor OK | extracción normal (`ANALYSIS_SUCCESS`) ✅ |
| B. Misma captura + 403 `credit_limit_reached` | recupera 1 Servicio revisable con fecha 2026-08-10, 16:00–21:00 y Job ELUM FRANKLHALL ✅ |
| C. Timeout / 429 / 503 / respuesta malformada | mismo principio, fallo clasificado sólo para telemetría ✅ |
| D. Fuente sin evidencia | `NO_SERVICE_EVIDENCE`, sin inventar ✅ |
| E. Señales parciales (fecha + Job) | supera el mínimo; horario queda `missing` ✅ |
| F. "Every day for 4 times" | señal literal preservada, sin expandir fechas ✅ |
| G. Retry exitoso | idempotente: no duplica candidatos equivalentes; añade sólo lo nuevo ✅ |
| H. Corrección humana antes del retry | no se sobrescribe; se reporta conflicto ✅ |
| I. Mobile | card apilada, sin tablas ni scroll horizontal, CTAs `min-h-11` (44px) ✅ |
| J. Desktop | mismo componente, CTAs en fila ✅ |
| K. Tenant distinto | `company_id` siempre del contexto autenticado, nunca del contenido ✅ |

Suite completa: 827 tests en verde. Único fallo restante, `driver-sync-roundtrip`,
es un mock preexistente ajeno a esta capa. Typecheck limpio.

## Normalización de capturas
`normalizeStructuralText()` reordena texto con etiquetas sueltas
("Shift details / Monday, Aug 10, 2026 / Start 4:00 PM / End 9:00 PM / Job: …")
al formato de una línea que el parser canónico ya entiende. No agrega
información: sólo reacomoda lo que la fuente ya dice.

## Confirmación
Cuando existe evidencia suficiente de un trabajo real, Smart Intake puede continuar
de forma segura aun si falla el proveedor de IA, preservando lo detectado para
revisión humana sin inventar información, crear automáticamente ni perder trazabilidad.
