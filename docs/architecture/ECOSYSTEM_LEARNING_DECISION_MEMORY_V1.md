# ECOSYSTEM LEARNING & DECISION MEMORY (ELDM) — V1

**Fecha:** 2026-08-09
**Estado:** Fundación implementada (capa pura, sin I/O, sin tablas nuevas).
**Código:** `src/lib/eldm/*` · **Tests:** `src/test/eldm.test.ts` (12 en verde)

---

## 1. Principio

El ecosistema no empieza de cero en cada interacción. Cada interacción relevante
produce una señal estructurada; las señales forman memoria; la memoria produce
patrones; los patrones mejoran recomendaciones explicables; las decisiones
humanas y los resultados reales validan o contradicen esos patrones.

No se entrenan modelos. No se modifican reglas de negocio de forma autónoma.
No existe scoring opaco. No hay cruce entre tenants por defecto.

---

## 2. Una sola infraestructura (no silos)

No existen `worker_learning`, `venue_learning`, `client_learning` ni
`intake_learning` como motores independientes. Todo entra por la misma memoria
con **scope explícito**:

| Scope | Contenido | Cruza fronteras |
|---|---|---|
| `ecosystem` | Hechos verificables del ecosistema | Sí |
| `tenant` | Observaciones privadas de la compañía | **Nunca** |
| `person` | Preferencias confirmadas por la persona | Sólo con consentimiento en ambos lados |
| `shared_reputation` | Reputación publicada explícitamente | Sí |

`canRead(scope, reader)` (`scopes.ts`) es la única puerta de lectura del ecosistema.

Consumidores previstos: Passport Resolution, recomendaciones de workers, Smart
Intake, Staffing, Community, Marketplace, Parceros y asistentes AI.

---

## 3. Tipos de conocimiento (`types.ts`)

| Tipo | Significado | Ejemplo |
|---|---|---|
| `fact` | Hecho confirmado y trazable | Trabajó QK-001578 |
| `observation` | Conteo histórico | Aceptó 7 de 8 nocturnos |
| `inference` | Patrón con confianza | Alta probabilidad de aceptar nocturnos |
| `confirmed_preference` | Declarada por la persona | Prefiere Brooklyn |
| `decision` | Decisión tomada | Admin seleccionó a este worker |
| `outcome` | Resultado posterior | Aceptó, trabajó, rating positivo |

Reglas duras verificadas por test:

- Una observación aislada **nunca** se convierte en patrón
  (`MIN_EVIDENCE_FOR_INFERENCE = 3`).
- Un patrón **nunca** se convierte en preferencia confirmada. La preferencia
  requiere declaración humana explícita (`toConfirmedPreference`).

---

## 4. Confianza (`confidence.ts`)

Cada inferencia lleva: `evidence_count`, `contradicting_evidence`, `confidence`,
`last_observed_at`, `source_domains`, `tenant_scope`.

Fórmula reproducible a mano: evidencia a favor ponderada por recencia
(semivida 120 días) contra el total, con prior Laplace y factor de volumen.
La confianza **sube** con evidencia y **baja** cuando la realidad la contradice.

---

## 5. Continuidad por persona y memoria por compañía (`patterns.ts`)

- `buildPersonPatterns` — trabajos previos, venues, aceptación/rechazo, ratings,
  cumplimiento y documentos de una persona en la compañía.
- `buildCompanyPatterns` — staffing típico por venue y tipo de servicio,
  horarios frecuentes, cancelaciones de cliente, response rate y correcciones
  comunes al importar.

Ambos producen el mismo tipo `KnowledgeItem`; sólo cambia el scope. El
aprendizaje de compañía pertenece al tenant y no se comparte automáticamente.

---

## 6. `getDecisionContext` (`decision-context.ts`)

```ts
getDecisionContext(
  { companyId, personId?, venueId?, clientId?, serviceType?, decisionType },
  snapshot,
)
```

Devuelve hechos, preferencias confirmadas, patrones históricos, patrones
inferidos, confianza, evidencia contradictoria, decisiones previas, outcomes
relevantes, razones ponderadas y una explicación en lenguaje de negocio.

**No ejecuta la decisión.** Sólo aporta contexto. Sin historial responde
"Sin historial suficiente. Decide con criterio propio." en lugar de inventar.

Toda recomendación futura puede decir "Recomendado porque…": trabajó 14 veces en
este venue, aceptó 8/9 servicios similares, documentos vigentes, rating alto.
Nunca "AI score = 87".

---

## 7. Feedback humano y outcome loop (`feedback.ts`)

`recordAdminFeedback` registra aceptar/rechazar recomendación, corregir entidad,
elegir otra persona, cambiar cantidad, venue u horario. El rechazo se guarda como
**decisión con contexto**, jamás como error del sistema.

`recordOutcome` cierra el ciclo por etapas reales: respuesta del worker →
asistencia → time entry → completion → rating → payroll aprobado.
`isValidWorkOutcome` bloquea el uso de horas programadas como resultado de
trabajo realizado.

---

## 8. Privacidad

`stripSensitiveAttributes` elimina antes de cualquier escritura: documentos,
identificadores, tarifas, pagos, cuentas, direcciones, contacto, datos médicos e
inmigratorios. Ninguna inferencia se construye sobre datos sensibles.

---

## 9. Alcance de esta entrega

Capa pura, determinista y sin I/O. No crea tablas, no escribe en la base, no
altera payroll, servicios, asignaciones ni time entries. La persistencia y los
adaptadores por dominio se conectan en fases siguientes contra esta misma
interfaz, sin crear memorias paralelas.
