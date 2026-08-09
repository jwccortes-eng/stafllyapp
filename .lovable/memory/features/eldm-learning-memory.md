---
name: ELDM — memoria y aprendizaje del ecosistema
description: Capa única de memoria (facts/observations/inferences/preferences/decisions/outcomes), scopes tenant-safe, getDecisionContext y outcome loop
type: feature
---

Toda memoria y aprendizaje del ecosistema vive en `src/lib/eldm/` (una sola
infraestructura). Prohibido crear motores separados tipo `worker_learning`,
`venue_learning`, `client_learning` o `intake_learning`.

Reglas no negociables:
- Seis tipos de conocimiento separados: fact, observation, inference,
  confirmed_preference, decision, outcome. Una observación aislada no es patrón
  (mínimo 3 evidencias); un patrón nunca es preferencia confirmada sin
  declaración humana.
- Scopes: ecosystem / tenant / person (con consentimiento) / shared_reputation.
  Nada cruza tenants por defecto. `canRead` es la única puerta.
- Toda inferencia lleva evidence_count, confidence, last_observed_at,
  source_domains, contradicting_evidence, tenant_scope. La confianza sube con
  evidencia y baja con contradicción.
- Recomendaciones siempre explicables ("Recomendado porque…"), nunca un score suelto.
- `getDecisionContext` aporta contexto; nunca ejecuta la decisión.
- Rechazar una recomendación se registra como decisión con contexto, no como error.
- Horas programadas nunca son outcome de trabajo realizado.
- Datos sensibles (documentos, pagos, tarifas, contacto, dirección) no alimentan
  inferencias: se eliminan en `stripSensitiveAttributes`.

Doc: `docs/architecture/ECOSYSTEM_LEARNING_DECISION_MEMORY_V1.md`.
