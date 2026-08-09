# ELDM — Fase 1C · Worker Recommendation Layer

Fuentes: `docs/architecture/ECOSYSTEM_LEARNING_DECISION_MEMORY_V1.md`, `docs/qa/ELDM_PHASE_1B_REAL_SIGNAL_LOOP.md`, `src/lib/eldm/`.

## 1. Qué se construyó

| Pieza | Archivo | Responsabilidad |
|---|---|---|
| Contratos | `src/lib/eldm-recommendation/types.ts` | Query canónica, candidato operativo, recomendación explicable |
| Filtros duros | `src/lib/eldm-recommendation/eligibility.ts` | Sólo reglas operativas canónicas |
| Motor | `src/lib/eldm-recommendation/engine.ts` | `getWorkerRecommendations` puro, sin I/O |
| Carga | `src/lib/eldm-recommendation/load.ts` | Único punto de lectura de `eldm_signals` |
| Feedback | `src/lib/eldm-recommendation/feedback.ts` | Registra la decisión humana como memoria |
| UI | `src/components/shifts/assign/RecommendedForServiceBlock.tsx` | Bloque reutilizable "Recomendados para este servicio" |
| QA | `src/test/eldm-phase1c.test.ts` | 11 tests en verde |

No se creó otro motor de scoring: la memoria, la confianza y la explicabilidad son las de ELDM (`getDecisionContext`, `buildPersonPatterns`, `confidenceLabel`).

## 2. Input canónico

```ts
getWorkerRecommendations({
  query: { companyId, serviceId, venueId?, clientId?, serviceType?,
           requiredRole?, requiredSkills?, startAt?, endAt?, limit?, now? },
  candidates,        // estado operativo real, nunca inventado
  signalsByPerson,   // memoria persistente acotada al tenant
  sort?,
})
```

Disponibilidad, compliance y skills llegan desde la capa operativa. Si no hay dato, el valor es `unknown` y no descalifica.

## 3. Filtros duros (nunca ELDM)

`not_in_company`, `inactive`, `access_blocked`, `schedule_conflict`, `confirmed_unavailable`,
`compliance_missing | expired | blocked`, `role_not_met`, `skill_not_met`.

Un patrón como "suele rechazar los domingos" **no** genera bloqueo: aparece como evidencia contradictoria.

## 4. Salida explicable

Cada recomendación entrega: confianza `HIGH | MEDIUM | LOW`, titular "Recomendado porque…",
2–4 razones a favor, hasta 3 contradicciones, recencia y contadores visibles
(experiencia por lugar / cliente / tipo de servicio, aceptaciones, rechazos, resultados).
No existe "Score 92". `LOW` significa poca certeza contextual, no mal trabajador.

## 5. Ranking sin caja negra

Modos: mejor contexto, experiencia en el lugar, disponibilidad, historial de aceptación,
resultados recientes. El resto de elegibles nunca se oculta: se muestran bajo
"Ver por qué no aparecen arriba", con motivo no penalizante.

## 6. Multi-tenant y privacidad

El motor descarta cualquier señal cuyo `companyId` no coincida con la consulta, además de la
barrera de RLS y de `canRead` en ELDM. No entran datos financieros, tarifas, documentos,
información médica ni contacto como señal de calidad: el compliance sólo aporta el estado
operativo (`vigente / faltante / vencido / bloqueado`).

## 7. Feedback y outcome loop

`recordRecommendationDecision` registra `chose_recommended`, `chose_other`,
`dismissed_recommendation`, `changed_role` con contexto e idempotencia
(`company_id, source_reference`). Elegir a otra persona no penaliza al recomendado.
Los resultados reales (aceptación, asistencia, no-show, completado, rating) siguen entrando
por los adapters de Fase 1B; las horas programadas siguen rechazadas como outcome.

## 8. QA

| Caso | Resultado |
|---|---|
| A · historial fuerte en venue | HIGH/MEDIUM con explicación · PASS |
| B · worker nuevo | elegible, sin penalización · PASS |
| C · positivo + contradicción | ambas visibles · PASS |
| D · no disponible confirmado | no elegible por regla operativa · PASS |
| E · documento vencido | blocker canónico · PASS |
| F · dos tenants, misma persona | contexto aislado · PASS |
| G · admin elige otro worker | decisión registrada sin penalización · PASS |
| H · outcome positivo posterior | mejora contexto/confianza · PASS |
| I · retry del mismo evento | evidencia no se duplica · PASS |
| J · mobile y desktop | mismo modelo puro, misma explicación · PASS |

`bunx vitest run src/test/eldm-phase1c.test.ts` → 11/11. Typecheck limpio.

## 9. A/B de explicabilidad

El bloque expone `sort` y la lista completa, de modo que puede compararse la vista tradicional
(A) contra la vista con contexto ELDM (B) midiendo tiempo hasta selección, número de búsquedas,
cambios posteriores, aceptación, reemplazos y no-shows. No se optimiza por clicks.

## 10. Fuera de alcance (intacto)

payroll, rates, `time_entries`, cálculos de turno, esquema de `scheduled_shifts`,
contrato de transición de asignación, auth, RLS y documentos.

---

**Stafly puede recomendar workers para un Servicio usando memoria operativa real y explicable,
manteniendo filtros operativos canónicos, aislamiento por tenant y control humano sobre la
decisión final.**
