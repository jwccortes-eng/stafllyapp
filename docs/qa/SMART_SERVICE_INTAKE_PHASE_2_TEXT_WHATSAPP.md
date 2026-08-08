# Smart Service Intake — Fase 2: Texto + WhatsApp pegado

Fuente: `docs/qa/SMART_SERVICE_INTAKE_PHASE_1_CANONICAL_PIPELINE.md`
Alcance: agregar la primera fuente no tabular al carril canónico existente. No se creó un pipeline nuevo.

## 1. Carril usado (sin duplicar infraestructura)

```text
Texto pegado
  -> import_batches (source='pasted_text', batch_type='service_intake')
  -> raw_schedule_import_rows (fragmento original, con número de línea)
  -> ServiceCandidate (modelo canónico de Fase 1)
  -> resolución fuzzy (clients / locations_v2)  [sin crear entidades]
  -> detector de duplicados canónico
  -> bandeja de revisión (ServiceIntakeReviewInbox)
  -> createDraftServiceFromCandidate -> scheduled_shifts (publication_status='draft')
```

Piezas reutilizadas tal cual: `candidate.ts`, `batch.ts`, `entity-resolution.ts`, `duplicate.ts`,
`create-draft-service.ts`, `ServiceIntakeReviewInbox.tsx`.

Piezas nuevas de Fase 2:

| Archivo | Rol |
| --- | --- |
| `src/lib/intake/text-parser.ts` | Limpieza de WhatsApp, segmentación multi-servicio y extracción |
| `src/lib/intake/text-intake.ts` | Orquestación batch → filas crudas → candidatos → duplicados |
| `src/lib/intake/telemetry.ts` | Métricas de comportamiento sin contenido sensible |
| `src/components/intake/PastedTextIntakePanel.tsx` | Entrada "Pegar texto" + bandeja integrada |

Integración: `src/pages/admin/ImportSchedule.tsx` (misma pantalla "Importar trabajos").

## 2. Reglas de extracción

- Solo se extrae lo que está escrito. Hora y personal ausentes quedan como
  "Hora por confirmar" / "Personal por confirmar"; nunca se inventan.
- Un fragmento se convierte en candidato solo si trae fecha (resuelta o ambigua)
  o un tipo de servicio reconocible. Texto suelto no genera trabajos.
- Un mensaje puede producir varios candidatos independientes. La cabecera de contexto
  ("Zemer:") se hereda a los fragmentos siguientes, incluyendo varios trabajos en una línea.
- Fechas relativas ("mañana", "hoy", "el martes", "la próxima semana") se resuelven contra
  la fecha del sistema. Sin ancla suficiente, el candidato queda "Fecha por confirmar".
- Abreviaciones (BM → Bar Mitzvah, SB → Sheva Brochos) son sugerencia: confianza baja + aviso
  "Interpretamos BM como Bar Mitzvah. Confirma antes de crear."
- Cliente y lugar solo se referencian contra catálogo existente. Nunca se crean entidades.
- `company_id` proviene exclusivamente del contexto de sesión, jamás del contenido del mensaje.

## 3. Duplicados

El detector canónico se aplica sin cambios:

- exacto (misma referencia de origen / hash) → bloqueado, no se puede crear;
- posible (mismo día + mismo lugar) → aviso revisable con enlace al servicio existente;
- la comparación siempre está limitada a la compañía activa.

## 4. Escritura

Único escritor: `createDraftServiceFromCandidate`. El payload nunca publica ni asigna personas
(`publication_status='draft'`, sin asignaciones). No se toca payroll, clock ni facturación.

## 5. Telemetría

Se registra: cantidad de fragmentos, candidatos, avisos, distribución de confianza, tasa de
aceptación y motivos de exclusión. No se guarda el texto del mensaje ni datos de personas.

## 6. QA

### Automatizado
`src/test/smart-service-intake-phase2.test.ts` — 27 tests, todos en verde.
Regresión de Fase 1 (`smart-service-intake-phase1.test.ts`) — 21 tests en verde.

| Caso | Resultado |
| --- | --- |
| A. Texto simple | 1 candidato, sin inventar hora ni personal |
| B. Multi-servicio (varias líneas y una sola línea) | Candidatos independientes con venue heredado |
| C. Fechas relativas y ambiguas | Resueltas con ancla; si no, "Fecha por confirmar" |
| D. Fecha sin lugar | Marcado incompleto, no creable |
| E. Lugar sin fecha | Marcado "Falta fecha" |
| F. Typos de venue | Sugerencia del catálogo, exige confirmación, no crea |
| G. Mismo día y lugar | `possible_duplicate` revisable |
| H. Misma referencia de origen | `exact_duplicate` bloqueado |
| I. Español + inglés en un mensaje | Ambos interpretados |
| J. Texto irrelevante | 0 candidatos + aviso |
| K. Aislamiento de tenant | `company_id` solo del contexto |
| L. Reproceso | Misma referencia de origen, sin duplicar |

### Manual (navegador, empresa QA Testing)
Pegado de 4 líneas con cabecera "Zemer:" y abreviación "BM":
3 candidatos correctos (2026-10-13 Millennium Bar Mitzvah, 2026-10-14 Zemer Sheva Brochos,
2026-10-15 Zemer Bar Mitzvah con aviso de abreviación), botón "Crear 0 servicios en borrador"
deshabilitado hasta completar campos. Nada se creó sin confirmación. Sin errores de consola.

## 7. Resultado

Stafly convierte texto libre y mensajes de WhatsApp en candidatos revisables y luego en
Servicios en borrador, sobre el mismo carril canónico, sin publicar, sin inventar datos y sin
crear duplicados silenciosos.
