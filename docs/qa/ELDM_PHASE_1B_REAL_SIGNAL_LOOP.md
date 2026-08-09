# ELDM — FASE 1B · REAL SIGNAL LOOP + PERSISTENT CONTINUITY

**Fecha:** 2026-08-09
**Estado:** Circuito real cerrado. Persistencia activa en tres dominios.
**Motor puro:** `src/lib/eldm/*` (sin cambios, sin I/O)
**Adapters:** `src/lib/eldm-adapters/*` · **Persistencia:** `src/lib/eldm-store/*`
**Tests:** `src/test/eldm-phase1b.test.ts` (11) + `src/test/eldm.test.ts` (12) — 23 en verde

---

## 1. Auditoría de persistencia existente

Estructuras revisadas antes de crear nada nuevo:

| Estructura | Contenido | ¿Sirve como memoria ELDM? |
|---|---|---|
| `activity_log` | Acción libre + `details` jsonb, sin sujeto tipado | No: sin identidad de evento estable ni scope |
| `intake_dictionary_events` | Eventos de diccionario por empresa | Parcial: sólo intake, sin outcome ni supersede |
| `employee_aliases` | Alias de personas | Parcial: no cubre venue/cliente ni decisiones |
| `application_events`, `company_lifecycle_events` | Dominios ajenos a la Fase 1B | No |
| `flash_job_responses` | Respuesta del worker a flash jobs | Proyectable, pero sólo un canal de respuesta |
| `clock_events` / time entries | Asistencia real | Proyectable como outcome, sin identidad de evidencia |
| `review_submissions`, `rep_events` | Valoraciones | Proyectable, sin contradicción ni supersede |

**Brecha demostrada:** ninguna estructura ofrece a la vez (a) identidad de evento
estable para idempotencia, (b) invalidación explícita sin borrar historia,
(c) scope de conocimiento, (d) sujeto multi-entidad (persona · venue · cliente ·
tipo de servicio). Por eso se crea **una sola** tabla: `eldm_signals`.
No se duplica ningún evento operativo cuyo dato ya sea proyectable: los adapters
traducen el evento existente y guardan sólo la evidencia mínima no sensible.

### Tabla `eldm_signals`

- Único índice de identidad: `UNIQUE (company_id, source_reference)`.
- Invalidación: `superseded_by`, `superseded_at`, `superseded_reason`.
- Atributos: `jsonb` saneado (`stripSensitiveAttributes`) antes de escribir.
- RLS: lectura/escritura sólo para miembros de la propia empresa
  (`user_company_ids(auth.uid())`). Sin acceso anónimo. Sin cruce de tenants.

---

## 2. Signal adapters (fuera del core)

`src/lib/eldm-adapters/index.ts`

| Adapter | Dominio | Tipo de conocimiento |
|---|---|---|
| `fromEntityResolutionEvent` | intake | `fact` (alias confirmado) / `decision` |
| `fromAssignmentEvent` | assignment | `observation` (recomendado) / `decision` |
| `fromWorkerResponse` | response | `outcome` |
| `fromAttendanceOutcome` | attendance · rating | `outcome` |

Cada uno produce `PersistableSignal`: dominio, verbo, tipo, scope, sujeto,
`occurredAt`, `sourceReference`, evidencia y atributos operativos. Ningún adapter
escribe en base de datos; ninguno acepta PII.

---

## 3. Smart Intake loop

`"Millenium"` → el equipo confirma **The Millennium Hall** →
`intake:alias_confirmed:<intake_item_id>` queda persistido como hecho del tenant.
En una interacción futura de **la misma empresa** el snapshot lo devuelve como
razón: *"El equipo confirmó que «millenium» corresponde a esta entidad."*
Alcance `tenant`: nunca sale de la compañía.

---

## 4. Assignment loop

Se capturan `recommended`, `selected`, `rejected_recommendation`,
`replacement_required` y `staffed`. La decisión guarda `recommended_person_id` y
`followed_recommendation`, de modo que "no seleccionado" nunca se interpreta
solo: siempre viaja con su contexto. El outcome se registra después, por separado.

---

## 5. Outcome loop

Sólo resultados reales: `accepted`, `rejected`, `cancelled_by_worker`, `worked`,
`no_show`, `service_completed`, `rated_positive/negative`.
`fromAttendanceOutcome` exige `evidenceSource` y lanza `InvalidWorkOutcomeError`
si el origen es `scheduled_*`. **Horas programadas nunca son trabajo realizado.**
Payroll puede aportar un hecho de periodo aprobado; ELDM no toca su cálculo.

---

## 6. Continuidad entre sesiones

```text
SESIÓN A   recomendado → admin selecciona → worker acepta → trabaja → outcome +
           ↓ eldm_signals (Postgres)
SESIÓN B   loadMemorySnapshot(company, person, venue) → getDecisionContext
           → "Recomendado porque trabajó 4 veces en este lugar; aceptó 3 de 3
              servicios similares."
```

La memoria vive en base de datos, no en React, localStorage ni sessionStorage.
Sobrevive a cierre de sesión, otro navegador y otro dispositivo.

---

## 7. Explicabilidad

`explainRecommendation(context)` devuelve: motivo humano ("Recomendado porque…"),
razones con su evidencia, contradicciones, `lastObservedAt`, alcances utilizados,
`evidenceCount` y etiqueta `HIGH` / `MEDIUM` / `LOW`. Nunca un número suelto.
Sin historial responde *"Sin historial suficiente. Decide con criterio propio."*

---

## 8. No autonomía

ELDM no asigna, no publica, no bloquea, no cambia tarifas, no aprueba payroll,
no modifica documentos, no altera access state y no envía mensajes. El store
sólo escribe en `eldm_signals`; no hay ninguna escritura a tablas operativas.

---

## 9. Privacidad

`canRead` sigue siendo la única puerta: `tenant` exige misma compañía y `person`
exige consentimiento en ambos lados. Una observación privada de **Quality Staff**
no aparece en **My Staff** ni en **Parceros**, y no se convierte en reputación
compartida por sí sola: `shared_reputation` requiere publicación explícita.

---

## 10. Idempotencia

`recordSignal` hace upsert con `onConflict: company_id,source_reference` e
`ignoreDuplicates`. Un reintento del mismo evento no incrementa `evidence_count`.

## 11. Corrección / reverso

`supersedeSignal` marca la evidencia como invalidada con motivo y fecha, opcional-
mente enlazando la señal correctiva. `loadSignals` filtra lo invalidado, así que
un `no_show` corregido a `attended` deja de contar sin borrar la traza.

---

## 12. QA

| Caso | Resultado |
|---|---|
| A. Alias confirmado reaparece en sesión futura | PASS |
| B. Recomendado → seleccionado → aceptado → outcome | PASS |
| C. Nueva sesión recupera contexto histórico | PASS |
| D. Evidencia contradictoria reduce confianza | PASS |
| E. Retry no duplica evidencia | PASS (identidad estable + índice único) |
| F. Corrección invalida evidencia anterior | PASS |
| G. Tenant B no ve señales de Tenant A | PASS |
| H. Datos sensibles fuera del payload de inferencia | PASS |
| I. Mobile y desktop producen el mismo contexto | PASS (proyección determinista) |
| J. Cero cambios automáticos en operación | PASS (sin escrituras operativas) |

---

## Confirmación

ELDM conserva aprendizaje entre sesiones reales y utiliza resultados operativos
persistentes para enriquecer decisiones futuras de forma explicable, idempotente,
tenant-safe y sin ejecutar decisiones autónomamente.
