# P0 — Visual Intake: falso negativo en captura de turno

Fecha: 2026-08-09
Caso: captura de "Shift details" (Monday, Aug 10, 2026 · Start 4:00 PM · End 9:00 PM ·
Job ELUM FRANKLHALL · Address · Users · Recurrence: Every day for 4 times)
devolvía `ai_error` y el mensaje "No encontramos servicios".

## 1. Causa raíz (evidencia, no supuesto)

Logs de la función `visual-service-intake` en el momento del caso:

```
2026-08-09T16:08:09Z ERROR AI gateway error 403 {"status":403,"type":"credit_limit_reached",
"title":"Workspace credit limit reached", ...}
2026-08-09T16:07:49Z ERROR AI gateway error 403 {"status":403,"type":"credit_limit_reached", ...}
```

- **No** fue el modelo, ni el schema, ni el parsing, ni el umbral de confianza.
- El gateway respondió **403 credit_limit_reached** (límite de créditos del workspace).
- La función sólo trataba 429 y 402; cualquier otro estado caía en el genérico `ai_error`
  por archivo, la orquestación lo contaba como "archivo no leído" y la UI, al ver
  `candidates.length === 0`, mostraba **"No encontramos servicios"**.

Es decir: **un fallo de plataforma se traducía en una conclusión de negocio falsa.**

Causa secundaria encontrada en la auditoría: el mínimo de evidencia visual exigía
`fecha + identidad` (lugar/cliente/tipo). Una captura de turno con fecha y horario pero
Job ilegible habría ido a "Necesitan revisión" en vez de producir un servicio revisable.

## 2. Regla aplicada

| Situación | Mensaje |
| --- | --- |
| El análisis no terminó (403/429/5xx/parse) | **"No pudimos completar el análisis."** |
| El análisis terminó y no hay estructura de servicio | "No encontramos servicios" |
| Hay servicio pero con huecos | "Encontré un posible turno, pero necesito que revises algunos datos" |

`VisualIntakeResult` expone ahora `analysisIncomplete` y `failures[]` (código + detalle),
y la UI decide el mensaje con esa señal, no con el conteo de candidatos.

## 3. Fallback en el servidor

`visual-service-intake`:

- 403 con `credit`: devuelve 402 con `code: credit_limit_reached` y copy accionable
  ("El workspace alcanzó su límite de créditos de IA…"), en vez de `ai_error` mudo.
- 429 → `rate_limited`; 402 → `credits_exhausted`.
- 400 o 5xx: **reintento único** con `json_object` (por si el rechazo fue de esquema).
- Parse: si el JSON directo falla, se intenta el primer objeto `{...}` del texto.
- Cada fallo por archivo viaja con `error_status` y `error_detail` para diagnóstico.
- El cliente lee el cuerpo del error de la función (`error.context`) y muestra el motivo real.

## 4. Mínimo de servicio visual

`hasMinimumEvidence` = **fecha** + al menos una de:

- identidad (lugar, cliente o tipo de servicio),
- horario (inicio u fin),
- dirección.

La captura del caso supera el mínimo por partida triple. Los bloques que no lo superan
siguen yendo a "Necesitan revisión": nada se descarta en silencio.

El prompt del extractor declara además de forma explícita que una captura de
"Shift details" es **un** servicio y debe devolverse aunque el Job sea dudoso.

## 5. Recurrencia

`detectVisualRecurrence` lee "Every day for 4 times" / "cada día por N veces" desde
`notes`, `extraction_notes` o `source_excerpt` y lo conserva como aviso del candidato:

> La imagen indica recurrencia ("Every day for 4 times"): 4 ocurrencias. Se conserva
> como dato detectado; aquí sólo se prepara este servicio.

No se expanden ocurrencias automáticamente en esta fase.

## 6. QA — regresión con la imagen del caso

`src/test/visual-intake-false-negative.test.ts` (14 pruebas) fija el caso exacto:

- ≥ 1 servicio detectado.
- Fecha `2026-08-10`, inicio `16:00`, fin `21:00`.
- Job `ELUM FRANKLHALL` conservado; el candidato admite borrador.
- Cero elementos en "Necesitan revisión".
- Recurrencia conservada como dato, sin crear 4 borradores.
- `ai_error` no produce "0 servicios": cada código de fallo habla de análisis incompleto.

Suites ejecutadas: **38 pruebas en verde** (Fase 3: 24, regresión nueva: 14).

## 7. Nota operativa

El disparador real del caso fue el límite de créditos de IA del workspace. Con el fix,
esa condición se comunica como tal y el operador puede pegar el texto del turno como
alternativa inmediata; antes quedaba oculta tras un falso "no hay servicios".
