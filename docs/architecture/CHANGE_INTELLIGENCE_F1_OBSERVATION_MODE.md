# Change Intelligence — F1: Plan Técnico en Modo Observación

**Estado:** Propuesta para autorización
**Fecha:** 2026-07-30
**Fase:** F1 — Motor puro en Modo Observación (Shadow Mode)
**Precondición:** F0 cerrada. Charter vigente. Catálogo v1.0 publicado.
**Restricción absoluta:** **cero entregas reales.** Ningún trabajador, manager o supervisor recibe comunicación alguna originada por CI durante F1.

---

## 1. Objetivo de F1

Demostrar, con datos reales del ecosistema, que Change Intelligence identifica correctamente:

1. **Qué cambió** — diff semántico, no diff de columnas.
2. **Quién fue afectado** — audiencia calculada por impacto, no por pertenencia.
3. **Qué mensaje corresponde** — resumen consolidado, redactado, en el idioma del destinatario.
4. **Qué canal utilizaría** — plan de canales, no ejecución.
5. **Si requiere confirmación** — y de qué tipo (ligera o probatoria).

**F1 no es una fase de entrega. Es una fase de prueba de juicio.**

---

## 2. Alcance

### Dentro de alcance
- Motor puro L1–L5 (detección, clasificación, audiencia, composición, ruteo) como funciones TypeScript deterministas.
- Registro de simulación (`observation log`) de cada decisión del motor.
- Auditoría del cambio (Charter P5 — auditar es independiente de comunicar).
- Panel interno de revisión del log de simulación, visible **solo** para el owner/founder.
- Informe de divergencia contra el sistema legacy de notificaciones.

### Fuera de alcance (explícitamente prohibido en F1)
- Envío por Inbox, Push, Email, SMS o WhatsApp.
- Escritura en la tabla `notifications` existente.
- Cualquier UI visible para trabajadores, supervisores o managers.
- Desactivación de triggers legacy.
- Recolección de acks reales.
- Cualquier mutación de negocio (Charter P13).

---

## 3. Arquitectura de F1

```text
Mutación real (ya existente, sin tocar)
        │
        ▼
 [Captura no intrusiva]  ──► ChangeEvent (before / after / actor / causa)
        │
        ▼
 ┌──────────── MOTOR PURO (TS, sin efectos secundarios) ───────────┐
 │ L1 detect   → ChangeSet         (usa el Catálogo)               │
 │ L2 classify → ImpactLevel       (nivel + elevación por proximidad)│
 │ L3 audience → AffectedParty[]   (roles, motivo, ack requerido)   │
 │ L4 compose  → ChangeSummary     (antes → después, 4 preguntas)   │
 │ L5 route    → ChannelPlan       (canales + ventana + escalada)   │
 └──────────────────────────────────────────────────────────────────┘
        │
        ▼
 ObservationRecord  ──►  Log de simulación  ──►  Panel de revisión (owner)
        │
        └──► NINGÚN CANAL. Ninguna entrega. Barrera dura en el borde del motor.
```

**Garantía estructural:** el motor de F1 **no tiene ninguna dependencia de despacho**. No importa un cliente de push, ni de email, ni escribe en `notifications`. La imposibilidad de enviar es arquitectónica, no una bandera de configuración que alguien pueda encender por error.

---

## 4. Entregables de F1

| # | Entregable | Descripción |
|---|---|---|
| E1 | **Contrato de entrada** | Tipos `ChangeEvent` y proyección canónica de turno (DEC-CI-02), versionados |
| E2 | **Motor L1 — detección** | Diff semántico contra el Catálogo; ignora campos no catalogados |
| E3 | **Motor L2 — clasificación** | Nivel por campo + agregado + elevación por proximidad + reglas conservadoras (P14) |
| E4 | **Motor L3 — audiencia** | Resolución de afectados con motivo explícito por persona |
| E5 | **Motor L4 — composición** | Resumen consolidado con `antes → después`, deadline y CTA; es/en/he |
| E6 | **Motor L5 — ruteo** | Plan de canales + ventana de consolidación + regla de escalada |
| E7 | **Consolidador** | Fusión por (persona, entidad, ventana) y supresión por resultado neto nulo |
| E8 | **Log de simulación** | `ObservationRecord` por cada ChangeSet y por cada destinatario calculado |
| E9 | **Suite de casos** | Escenarios reales del Catálogo, incluidos los casos de silencio esperado |
| E10 | **Panel de revisión** | Vista interna, solo owner, para auditar decisiones del motor |
| E11 | **Informe de divergencia** | CI vs legacy: suprimidos, consolidados, elevados, audiencia reducida |

### Forma del `ObservationRecord`
Por cada cambio observado se registra:
- `correlationId`, entidad, actor, causa, timestamp
- diff semántico completo (campos catalogados)
- nivel por campo y nivel agregado, **con la regla que lo determinó**
- audiencia calculada: persona, rol, nivel, motivo, ack requerido
- personas **excluidas** y por qué (esto es tan importante como las incluidas)
- resumen redactado exacto que se habría mostrado
- plan de canales y ventana
- qué habría hecho el sistema legacy con el mismo evento

El campo "por qué se excluyó a esta persona" es el más valioso de F1: es la evidencia de que P1 funciona.

---

## 5. Criterios de aceptación

F1 se considera superada cuando **todos** se cumplen:

### Corrección del motor
- **CA-1** — 100 % de los tipos del Catálogo v1.0 tienen al menos un caso de prueba con resultado esperado documentado.
- **CA-2** — Determinismo: el mismo `ChangeEvent` produce siempre el mismo `ObservationRecord`. Cero dependencias de reloj no inyectado, aleatoriedad o estado global.
- **CA-3** — Cero falsos silencios en categorías críticas: ningún cambio de `shift.date`, `shift.address`, `shift.cancelled`, `assignment.added`, `assignment.removed` o `pay.rate` resulta en audiencia vacía cuando existe un trabajador asignado activo.
- **CA-4** — Los cambios Nivel 0 del Catálogo producen audiencia vacía en el 100 % de los casos, y aun así generan registro de auditoría.

### Cumplimiento del Charter
- **CA-5 (P1)** — En el conjunto de observación real, ninguna persona aparece como destinataria sin un `reason` explícito y verificable.
- **CA-6 (P4)** — Ningún destinatario recibe más de un `ObservationRecord` entregable por entidad dentro de su ventana. Verificado sobre datos reales, no sintéticos.
- **CA-7 (P10)** — En todos los casos de `assignment.replaced`, la audiencia contiene exactamente: saliente, entrante, supervisor responsable (si existe) y managers directos del turno. Cero managers de compañía por defecto.
- **CA-8 (P9)** — Ningún resumen dirigido a un trabajador contiene, en ningún caso, contenido de `internal_notes` ni campos fuera de la proyección canónica.
- **CA-9 (P3)** — Todo resumen entregable responde las cuatro preguntas. Los que no las responden aparecen degradados a Nivel 1, no enviados.
- **CA-10 (P11)** — El ack solo se solicita en los tipos declarados en el Catálogo. Tasa de ack sobre total de cambios observados por debajo del 20 %.

### Seguridad de la fase
- **CA-11** — Auditoría de código y de red confirma **cero** llamadas a canales de entrega desde el motor. Verificable por ausencia de dependencias, no por configuración.
- **CA-12** — Cero escrituras en `notifications`, `shift_assignments`, `shifts`, `scheduled_shifts` o cualquier tabla de negocio originadas por CI.
- **CA-13** — El panel de revisión es inaccesible para cualquier rol distinto de owner/founder.

### Valor demostrado
- **CA-14** — El informe de divergencia cuantifica sobre un periodo real: nº de notificaciones que el legacy habría enviado vs. nº de comunicaciones que CI habría enviado. Objetivo indicativo: **reducción ≥ 40 %** con **cero pérdidas** en categorías críticas.
- **CA-15** — Revisión humana: el owner revisa una muestra de al menos 50 `ObservationRecord` reales y aprueba el juicio del motor en ≥ 95 % de los casos. **Este criterio es el que autoriza F2.**

---

## 6. Riesgos identificados

| # | Riesgo | Severidad | Mitigación |
|---|---|---|---|
| R1 | **Fuga de entrega** — alguien conecta un canal "para probar" | Crítica | Barrera arquitectónica: el paquete del motor no declara ninguna dependencia de entrega. Revisión obligatoria de imports. |
| R2 | **Falso silencio** — el motor clasifica como Nivel 0 algo crítico | Crítica | P14: ambigüedad en dirección/fecha/asignación → Nivel 3 forzado. CA-3 lo verifica. |
| R3 | **Cobertura incompleta de captura** — cambios por rutas no instrumentadas | Alta | DEC-CI-01 híbrido. En F1 se mide explícitamente el % de eventos `unattributed`. |
| R4 | **Sobreajuste a datos sintéticos** — el motor funciona en tests y falla con datos reales | Alta | CA-6, CA-14 y CA-15 exigen datos de producción reales, no fixtures. |
| R5 | **PII en el log de simulación** — el log contiene nombres, direcciones, tarifas | Alta | Acceso solo owner; retención limitada del periodo de observación; sin exportación fuera del entorno. |
| R6 | **Deriva Catálogo ↔ motor** — se añade un tipo de cambio sin registrarlo | Media | El motor ignora por diseño lo no catalogado y lo registra como `uncatalogued` para revisión. |
| R7 | **Calidad de redacción** — los resúmenes son técnicamente correctos pero ilegibles | Media | CA-15 es revisión humana del texto exacto, no del JSON. |
| R8 | **Ventana de consolidación mal calibrada** | Baja | Parámetro configurable; F1 mide la distribución real de ediciones en ráfaga para calibrar DEC-CI-03 con evidencia. |
| R9 | **Costo de observación** — cómputo sobre cada mutación | Baja | El motor es puro y barato; la observación puede correr de forma diferida. |
| R10 | **Expectativa organizacional** — alguien asume que CI "ya está avisando" | Media | Comunicación explícita: F1 no notifica. El panel lleva rótulo permanente de modo observación. |

---

## 7. Dependencias antes de escribir código

### Bloqueantes duras
| # | Dependencia | Estado | Responsable |
|---|---|---|---|
| D1 | **DEC-CI-02 aprobada** — definición formal y versionada de la proyección canónica de turno (lista exacta de campos incluidos y excluidos) | ⏳ Aprobada como decisión; falta la especificación de campos | Owner + Arquitectura |
| D2 | **Catálogo v1.0 congelado** para el alcance de F1 (qué tipos entran en la primera iteración) | ⏳ Publicado; falta selección del subconjunto F1 | Owner |
| D3 | **Definición de `manager_directo`** — regla exacta para determinar qué managers tienen responsabilidad sobre un turno. Sin esto, P10 no es verificable | ❌ Pendiente | Owner + Operaciones |
| D4 | **Contrato `ChangeEvent` v1** aprobado y versionado | ❌ Pendiente | Arquitectura |
| D5 | **Periodo y alcance de observación** — qué compañías, qué ventana temporal, qué volumen | ❌ Pendiente | Owner |
| D6 | **Política de retención y privacidad del log de simulación** | ❌ Pendiente | Owner |

### Bloqueantes blandas (necesarias antes de terminar F1, no de empezar)
| # | Dependencia |
|---|---|
| D7 | DEC-CI-01: mecanismo concreto de captura y clave de correlación |
| D8 | Reglas de quiet hours por compañía |
| D9 | Idiomas soportados en composición (es / en / he) y responsable de las traducciones |
| D10 | Definición de "supervisor responsable" cuando un turno tiene varios |

### No dependencias
DEC-CI-03 (ventana), DEC-CI-04 (ack) y DEC-CI-05 (migración) **no bloquean F1**: la ventana entra como parámetro, el ack como bandera en el registro, y la migración no aplica porque F1 no entrega nada.

---

## 8. Secuencia propuesta dentro de F1

| Paso | Contenido | Salida verificable |
|---|---|---|
| F1.0 | Cerrar D1–D6 | Especificaciones aprobadas |
| F1.1 | Contratos y tipos (E1) | Tipos compilables, sin lógica |
| F1.2 | L1 + L2 con el subconjunto del Catálogo (E2, E3) | Tests de clasificación verdes |
| F1.3 | L3 audiencia (E4) | Tests de audiencia, incluidos casos de exclusión |
| F1.4 | L4 composición (E5) | Snapshots de texto revisables por humano |
| F1.5 | L5 ruteo + consolidador (E6, E7) | Planes de canal y fusión de ráfagas |
| F1.6 | Log de simulación (E8) | `ObservationRecord` sobre datos reales |
| F1.7 | Panel de revisión owner (E10) | Muestra revisable |
| F1.8 | Informe de divergencia (E11) | Números CI vs legacy |
| F1.9 | Revisión humana (CA-15) | Autorización o iteración |

---

## 9. Condición de salida de F1

F1 termina, y solo entonces se evalúa F2, cuando:

1. Todos los criterios CA-1 … CA-15 están cumplidos y documentados.
2. El owner ha revisado la muestra real y aprobado el juicio del motor.
3. El informe de divergencia demuestra reducción de interrupciones **sin pérdida de seguridad operacional**.
4. Existe una decisión humana explícita y registrada que autoriza pasar de observación a entrega — **canal por canal**, empezando por Inbox.

**Ningún canal se activa por defecto al finalizar F1.**

---

---

## D3 cerrada — impacto en F1

**D3 deja de ser dependencia abierta.** F1 implementa `resolveDirectManagers()` como
función pura sobre `audienceHints[]` del sobre estándar, aplicando la precedencia
`shift_explicit → location_responsibility → client_responsibility →
operational_unit_responsibility → duty_manager → unresolved`, sin mezcla de niveles.

### Requisitos F1 añadidos

- **F1-D3-a:** cada `ObservationRecord` incluye un bloque `managerResolution` con
  `manager_id`, `relationship_type`, `source_object_id`, `resolution_priority`,
  `resolved_at`, `reason`, `whether_notification_was_required`, `deduplication_key`.
- **F1-D3-b:** cuando el set queda vacío, se registra
  `manager_resolution_status = unresolved` + alerta de configuración simulada; jamás
  fallback a "todos los managers".
- **F1-D3-c:** los trabajadores y supervisores afectados se resuelven de forma
  independiente; un manager `unresolved` no los suprime.
- **F1-D3-d:** dedupe supervisor/manager verificado por `deduplication_key`.
- **F1-D3-e:** el autor del cambio se excluye salvo relación explícita independiente.

### Criterios de aceptación nuevos

**CA-16:** los 10 casos CA-D3-01…CA-D3-10 pasan como tests deterministas del motor.
**CA-17:** ningún `ObservationRecord` de la corrida shadow contiene un destinatario
manager sin `relationship_type` explícito distinto de `unresolved`.
**CA-18:** informe de divergencia reporta cuántas notificaciones legacy a managers
serían suprimidas por D3.

---

*Plan F1 v1.1 — D3 cerrada. Pendiente de autorización. No existe código asociado a este documento.*

