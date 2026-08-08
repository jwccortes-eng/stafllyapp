---
name: Diccionario de aprendizaje por empresa (Smart Service Intake Fase 5)
description: Memoria operativa por tenant que aprende sólo de correcciones humanas; orden de resolución exacto > diccionario > fuzzy; VWC obligatorio
type: feature
---

# Tenant Learning Dictionary

Tablas: `intake_dictionary_rules` (+ `intake_dictionary_events`). Escritura SÓLO por RPC:
`intake_dictionary_upsert_rule`, `intake_dictionary_record_usage`,
`versioned_update_intake_dictionary_rule` (VWC). No hay política de INSERT/UPDATE directa.

Tipos: `venue_alias`, `client_alias`, `service_type_alias`, `role_alias`, `abbreviation`,
`spelling_variant`.

## Orden de resolución (invariante)
1. match canónico exacto del catálogo del tenant
2. diccionario del tenant (activa, no ambigua, confianza ≥ 0.60)
3. resolver fuzzy (sugerencia, exige confirmación)
4. sugerencia de IA (suggestion-only)
5. revisión humana

Punto único de aplicación: `resolveCandidateEntities` en `src/lib/intake/text-intake.ts`
— por eso sirve a todas las fuentes (texto, WhatsApp, imagen, PDF, voz, excel/csv).

## Reglas duras
- Sólo aprende de confirmaciones humanas explícitas (`RememberCorrectionPrompt`).
- Cero cross-tenant: RLS por pertenencia + rol owner/admin/manager para escribir.
- Nunca guarda datos personales ni de pago (guarda en cliente y en backend).
- Ambigüedad o baja confianza → vuelve a revisión humana, jamás automático.
- Confianza = (aciertos + 1) / (aciertos + conflictos + 2), tope 0.99.

Administración: `/app/company-dictionary`. Reporte: `docs/qa/SMART_SERVICE_INTAKE_PHASE_5_TENANT_DICTIONARY.md`.
