# Smart Service Intake — UX Review + Mobile Enablement Pass

Ruta única: **`/app/import-schedule`**. Sin ruta nueva, sin bandeja paralela, sin cambios de
pipeline, extractores, contratos, `scheduled_shifts`, payroll ni ModuleGate.

## Fase A — Auditoría

Detalle completo en `docs/qa/SMART_SERVICE_INTAKE_REVIEW_UX_MOBILE_AUDIT.md`.
Hallazgos que originaron la Fase B:

1. La revisión se leía como formulario: inputs nativos siempre abiertos, densidad de metadatos
   técnicos por delante del trabajo detectado.
2. Targets de 36px en móvil (por debajo de 44px) y CTA principal sin safe-area.
3. Selección implícita mezclada con `accepted`; riesgo de incluir duplicados exactos.
4. Pérdida total del lote ante refresh, bloqueo de pantalla o cambio de pestaña.
5. Post-creación sin contexto: no había vuelta a los borradores creados.

## Fase B — Rediseño de la revisión

| Punto | Implementación |
| --- | --- |
| Tarjeta canónica | `ServiceIntakeReviewInbox.tsx` sin tabla en móvil; una card por trabajo detectado |
| Información protagonista | Fecha → Venue → Tipo → Hora → Personal, en ese orden visual |
| Confianza humana | Badges "Alta confianza" / "Revisar" / "Incompleta" (nunca porcentajes crudos) |
| Edición rápida | `CandidateQuickEditSheet.tsx`: fecha, hora, venue, personal sin salir de la bandeja |
| Fecha en móvil | Editor dentro del sheet, con safe-area; sin popovers fuera de viewport |
| Barra sticky | CTA de 56px, `env(safe-area-inset-bottom)` + holgura para la tab bar móvil |
| Selección explícita | Duplicados exactos nunca se auto-seleccionan |
| Filtros | Todos · Listos · Necesitan revisión · Duplicados |
| Source preview | Extracto de la fuente en sheet, sin navegación |
| Captura nativa | Audio e imagen con `capture` en teléfono |
| Post-creación | "Ver borradores" → `/app/shifts?date=<primera fecha>&view=week` |
| Persistencia | `src/lib/intake/review-persistence.ts` en `sessionStorage` (texto, imagen/PDF, audio) |

## QA ejecutado (Playwright, compañía QA Testing, backend real)

Flujo real: pegar mensaje → procesar → bandeja → editar → guardar → refresh.

| Check | Móvil 393×852 | Desktop 1280×1800 |
| --- | --- | --- |
| Scroll horizontal | 0 px | 0 px |
| Bandeja con cards + chips | sí | sí |
| CTA "Crear N borradores" | visible, 56px | visible |
| Editor contextual abre y guarda | sí, sin salir | sí |
| Estado tras refresh | lote conservado | lote conservado |
| Targets < 40px | 2 (checkbox de 24px dentro de área táctil de 44px y campana global del chrome) | n/a |

Automáticos: typecheck limpio; `smart-service-intake-phase3/4` 44/44 en verde.

## Invariantes protegidos

Auth, RLS, aislamiento por tenant, ModuleGate `import`, roles, `scheduled_shifts`, `time_entries`
y payroll sin cambios. La creación sigue siendo sólo `publication_status='draft'` vía el helper
canónico, con idempotencia por lote (el CTA se bloquea durante el envío; el reintento no duplica).

## Confirmación

Smart Service Intake ahora permite revisar y crear borradores de Servicios de forma rápida,
visual y completamente operable desde teléfono, sin modificar el carril canónico ni crear una
experiencia paralela.
