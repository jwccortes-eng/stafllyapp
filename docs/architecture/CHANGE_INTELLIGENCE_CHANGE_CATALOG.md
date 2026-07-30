# Change Intelligence — Catálogo Oficial de Tipos de Cambio

**Estado:** Vigente · v1.0
**Fecha:** 2026-07-30
**Naturaleza:** Referencia oficial y extensible. **Toda funcionalidad nueva que produzca un cambio observable debe registrar su tipo aquí antes de implementarse.** Un tipo de cambio no catalogado no puede ser comunicado por CI.

Rige el `CHANGE_INTELLIGENCE_CHARTER.md`. Cada entrada debe ser evaluable contra P1–P15.

---

## Convenciones

**Nivel de impacto**
| Nivel | Significado | Comunicación |
|---|---|---|
| 0 | Sin impacto operacional | Nunca se comunica. Solo auditoría. |
| 1 | Informativo | Solo Change Feed / historial. |
| 2 | Operativo — cambia la forma de trabajar | Inbox + Push (respeta quiet hours). |
| 3 | Crítico — requiere acción o conocimiento inmediato | Inbox + Push inmediato, ack, escalada. |

**Elevación por proximidad (regla transversal):** un cambio de Nivel 2 sobre un turno que inicia en menos de 12 h se eleva a Nivel 3. Un cambio de Nivel 1 nunca se eleva.

**Ventanas de agrupación** (DEC-CI-03): Nivel 3 = 45 s (0 s si inicio <2 h) · Nivel 2 = 120 s · Nivel 1 = digest diario · techo duro 5 min.

**Prioridad:** orden de despacho y de presentación dentro de un resumen consolidado (P1 = más alta).

**Audiencias** (`AudienceRole`): `affected_worker`, `incoming_worker`, `removed_worker`, `shift_admin`, `supervisor`, `manager_directo`, `dispatcher`, `client_contact`, `auditor`, `actor`.
`manager_directo` = manager con responsabilidad sobre ese turno específico. **Nunca "todos los managers de la compañía"** (Charter P10).

---

## Dominio: Turno — datos operativos

### `shift.date`
| Campo | Valor |
|---|---|
| Nivel | 3 |
| Objetos afectados | Turno, asignaciones, disponibilidad del trabajador |
| Audiencias | `affected_worker` (3), `shift_admin` (3), `supervisor` (2), `manager_directo` (1), `auditor` (0) |
| Canal por defecto | Inbox + Push · Email si no hay lectura en 30 min |
| Requiere confirmación | **Sí** (probatoria) |
| Consolidable | Sí, con cualquier otro cambio del mismo turno |
| Ventana | 45 s |
| Prioridad | P1 |

**Ejemplo**
> **Tu turno cambió de día.**
> Evento VIP · #0175
> Fecha: **sáb 5 abr → dom 6 abr**
> Hora: 3:00 PM → 3:00 PM (sin cambio)
> Confirma que viste este cambio antes del 4 abr, 6:00 PM.
> `[Entendido]` `[Ver turno]`

---

### `shift.time`
| Campo | Valor |
|---|---|
| Nivel | 2 → 3 si inicio <12 h |
| Objetos afectados | Turno, horas programadas, transporte |
| Audiencias | `affected_worker`, `shift_admin`, `supervisor` (2), `manager_directo` (1) |
| Canal por defecto | Inbox + Push |
| Requiere confirmación | Solo si se elevó a Nivel 3 |
| Consolidable | Sí |
| Ventana | 120 s (45 s si Nivel 3) |
| Prioridad | P2 |

**Ejemplo**
> **Tu turno cambió de hora.**
> Hora: **3:00 PM → 4:00 PM**
> Punto de encuentro: 3:30 PM (sin cambio)
> No necesitas hacer nada adicional.

---

### `shift.address` (dirección del evento)
| Campo | Valor |
|---|---|
| Nivel | 3 |
| Objetos afectados | Turno, ubicación, transporte, tiempo de traslado |
| Audiencias | `affected_worker`, `shift_admin`, `supervisor` (2), `manager_directo` (1) |
| Canal por defecto | Inbox + Push · SMS en escalada |
| Requiere confirmación | **Sí** (probatoria) |
| Consolidable | Sí |
| Ventana | 45 s |
| Prioridad | P1 |

**Ejemplo**
> **Cambió la dirección de tu turno.**
> Dirección: **Hotel A, 220 W 42nd → Hotel B, 4315 16th Ave**
> Punto de encuentro: Lobby → Parking sur
> Confirma que viste este cambio.
> `[Entendido]` `[Abrir en mapas]`

---

### `shift.meeting_point`
| Campo | Valor |
|---|---|
| Nivel | 2 → 3 si inicio <12 h |
| Objetos afectados | Turno, logística de llegada |
| Audiencias | `affected_worker`, `shift_admin`, `supervisor` (1) |
| Canal por defecto | Inbox + Push |
| Requiere confirmación | Solo si Nivel 3 |
| Consolidable | Sí |
| Ventana | 120 s |
| Prioridad | P3 |

**Ejemplo**
> **Cambió el punto de encuentro.**
> Encuentro: **Lobby principal → Entrada de servicio (calle 43)**
> Misma hora, misma dirección.

---

### `shift.meeting_time`
| Nivel | 2 → 3 si <12 h · Audiencias: `affected_worker`, `shift_admin` · Inbox + Push · Ack solo si N3 · Consolidable · 120 s · P3 |
|---|

**Ejemplo**
> **Cambió la hora de encuentro.** Encuentro: **2:30 PM → 2:00 PM**. Tu turno sigue iniciando a las 3:00 PM.

---

### `shift.transport`
| Nivel | 2 · Audiencias: `affected_worker`, conductor asignado (3), `shift_admin`, `supervisor` (1) · Inbox + Push · Sin ack · Consolidable · 120 s · P4 |
|---|

**Ejemplo**
> **Cambió el transporte de tu turno.** Transporte: **Van compartida → Traslado por cuenta propia**. Revisa cómo llegarás al punto de encuentro.

---

### `shift.uniform`
| Nivel | 2 · Audiencias: `affected_worker`, `shift_admin` · Inbox + Push · Sin ack · Consolidable · 120 s · P4 |
|---|

**Ejemplo**
> **Cambió el uniforme requerido.** Uniforme: **Camisa negra → Camisa blanca y corbatín**. Prepáralo antes del turno.

---

### `shift.instructions`
| Nivel | 1 → 2 si el cambio es sustantivo (heurística de similitud) · Audiencias: `affected_worker`, `shift_admin` · Inbox (Push solo en N2) · Sin ack · Consolidable · 120 s · P5 |
|---|

**Ejemplo**
> **Se actualizaron las instrucciones de tu turno.** Ver detalles.

---

### `shift.client`
| Nivel | 1 → 2 si cambia protocolo, uniforme o contacto en sitio · Audiencias: `affected_worker` (1–2), `shift_admin` (2), `supervisor` (2), `manager_directo` (1) · Inbox · Sin ack · Consolidable · 120 s · P4 |
|---|

**Ejemplo**
> **Cambió el cliente de tu turno.** Cliente: **Emminence Hall → Grand Prospect**. Mismo lugar y misma hora.

---

### `shift.cancelled`
| Campo | Valor |
|---|---|
| Nivel | 3 |
| Objetos afectados | Turno, todas las asignaciones, expectativa de pago |
| Audiencias | `affected_worker` (3), `shift_admin` (3), `supervisor` (3), `manager_directo` (2), `client_contact` (2, si aplica) |
| Canal por defecto | Inbox + Push + Email · SMS en escalada |
| Requiere confirmación | **Sí** (probatoria) |
| Consolidable | **No** — suprime y reemplaza cualquier otro cambio pendiente del mismo turno |
| Ventana | 0 s |
| Prioridad | P0 |

**Ejemplo**
> **Tu turno fue cancelado.**
> Evento VIP · #0175 · dom 6 abr, 3:00 PM
> Motivo: cancelación del cliente.
> No te presentes. Confirma que recibiste este aviso.
> `[Entendido]`

---

### `shift.published`
| Nivel | 2 · Audiencias: trabajadores elegibles con disponibilidad declarada · Inbox + Push · Sin ack · Consolidable con otros turnos publicados (digest) · 120 s · P4 |
|---|

**Ejemplo**
> **3 turnos nuevos disponibles.** 5–7 abr · Brooklyn y Manhattan. Ver y postularte.

---

### `shift.slots`
| Nivel | 0 (interno) → 1 si el turno pasa a estar completo y había postulantes · Audiencias: `shift_admin`, `dispatcher` · Solo Inbox admin · Sin ack · Consolidable · 120 s · P6 |
|---|

---

### `shift.internal_notes`
| Nivel | 0 hacia el trabajador (Charter P9) · 1 hacia `shift_admin` / `supervisor` · Nunca Push · Sin ack · Consolidable · digest · P7 |
|---|

**Nunca se comunica al trabajador bajo ninguna circunstancia.**

---

### `shift.supervisor`
| Nivel | 2 · Audiencias: `affected_worker` (1), supervisor entrante (3), supervisor saliente (2), `manager_directo` (1) · Inbox (+Push para los supervisores) · Sin ack · Consolidable · 120 s · P3 |
|---|

**Ejemplo (supervisor entrante)**
> **Eres el supervisor de un turno.** Evento VIP · #0175 · 6 abr, 3:00 PM · 8 trabajadores asignados.

---

## Dominio: Asignaciones

### `assignment.added`
| Campo | Valor |
|---|---|
| Nivel | 3 |
| Objetos afectados | Asignación, turno, disponibilidad, expectativa de pago |
| Audiencias | `incoming_worker` (3), `shift_admin` (2), `supervisor` (1) |
| Canal por defecto | Inbox + Push |
| Requiere confirmación | **Sí** (probatoria) |
| Consolidable | Sí, con los datos del turno (se envía la ficha completa, no un diff) |
| Ventana | 45 s |
| Prioridad | P1 |

**Ejemplo**
> **Fuiste asignado a un turno.**
> Evento VIP · #0175 · dom 6 abr
> 3:00 PM – 11:00 PM · Hotel B, 4315 16th Ave
> Encuentro: 2:30 PM, parking sur · Uniforme: camisa blanca
> Confirma tu asignación.
> `[Entendido]` `[Ver turno]`

---

### `assignment.removed`
| Nivel | 3 · Audiencias: `removed_worker` (3), `shift_admin` (2), `supervisor` (1) · Inbox + Push · **Ack probatorio** · No consolidable con otros cambios del turno · 45 s · P1 |
|---|

**Ejemplo**
> **Ya no estás asignado a este turno.**
> Evento VIP · #0175 · dom 6 abr, 3:00 PM
> No te presentes. Confirma que viste este aviso.
> `[Entendido]`

---

### `assignment.replaced`
Cambio compuesto. Se descompone en **tres comunicaciones dirigidas** y ninguna más (Charter P10).

| Campo | Valor |
|---|---|
| Nivel | 3 |
| Objetos afectados | Dos asignaciones, turno |
| Audiencias | `removed_worker` (3, ack), `incoming_worker` (3, ack), `supervisor` (2, sin ack), `manager_directo` (1, solo feed), `auditor` (0) |
| Canal por defecto | Inbox + Push a los dos trabajadores; Inbox al supervisor |
| Requiere confirmación | Sí, para ambos trabajadores |
| Consolidable | No entre sí — son realidades opuestas |
| Ventana | 45 s |
| Prioridad | P1 |

**Ejemplo — saliente:** *"Ya no estás asignado al turno #0175."*
**Ejemplo — entrante:** *"Fuiste asignado al turno #0175."*
**Ejemplo — supervisor:** *"Cambio de personal en #0175: **Carlos Ruiz → Juan Pérez**. Sin cambios en horario ni ubicación."*
**El resto del equipo asignado no recibe nada.**

---

### `assignment.role_changed`
| Nivel | 2 → 3 si pasa a rol de responsabilidad (admin del turno, conductor) · Audiencias: `affected_worker`, `shift_admin`, `supervisor` (1) · Inbox + Push · Ack solo si N3 · Consolidable · 120 s · P3 |
|---|

**Ejemplo**
> **Cambió tu rol en el turno.** Rol: **Staff → Conductor**. Revisa las instrucciones de transporte.

---

### `assignment.status_changed` (pendiente → confirmado, etc.)
| Nivel | 1 hacia el trabajador · 2 hacia `shift_admin` si genera hueco de cobertura · Inbox · Sin ack · Consolidable · digest · P5 |
|---|

---

## Dominio: Nómina y pago

### `pay.rate`
| Campo | Valor |
|---|---|
| Nivel | 3 |
| Objetos afectados | Compensación del trabajador, expectativa de pago |
| Audiencias | `affected_worker` (3), `manager_directo` (1), `auditor` (0) |
| Canal por defecto | Inbox + Push **sin contenido sensible en el cuerpo** |
| Requiere confirmación | **Sí** (probatoria) |
| Consolidable | No con cambios operativos del turno |
| Ventana | 45 s |
| Prioridad | P1 |

**Ejemplo (push):** *"Tienes una actualización de tu compensación. Ábrela en la app."*
**Ejemplo (inbox):** *"Cambió tu tarifa para el turno #0175. Tarifa: **$22/h → $25/h**. Confirma que viste este cambio."*

---

### `pay.adjustment_applied`
| Nivel | 2 · Audiencias: `affected_worker`, `manager_directo` (1) · Inbox (Push sin monto) · Sin ack · Consolidable por periodo · 120 s · P3 |
|---|

---

### `pay.period_closed`
| Nivel | 1 · Audiencias: `affected_worker`, `manager_directo` · Inbox + digest email opcional · Sin ack · Consolidable · digest diario · P5 |
|---|

**Ejemplo**
> **Se cerró tu periodo de pago.** 16–31 mar · 68.5 h. Ver resumen.

---

## Dominio: Cumplimiento y documentos

### `document.expiring`
| Nivel | 2 (30 días antes) → 3 (7 días o vencido, si bloquea asignación) · Audiencias: `affected_worker`, `manager_directo` (1) · Inbox + Push · Ack en N3 · Consolidable entre documentos · digest / 45 s · P2 |
|---|

**Ejemplo**
> **Un documento tuyo vence pronto.** Certificación de seguridad · vence el **12 abr** (en 7 días). Sin este documento no podrás ser asignado. `[Subir documento]`

---

### `document.rejected`
| Nivel | 3 · Audiencias: `affected_worker` · Inbox + Push · Ack · No consolidable · 0 s · P2 |
|---|

---

## Dominio: Solicitudes de servicio (cliente)

### `service_request.modified`
| Nivel | 2 hacia `dispatcher` y `manager_directo`; 0 hacia trabajadores hasta que se materialice en cambios de turno · Inbox · Sin ack · Consolidable · 120 s · P3 |
|---|

**Regla:** un cambio en la solicitud **no** se comunica al trabajador. Solo se comunican sus efectos concretos sobre turnos y asignaciones.

---

### `service_request.cancelled`
| Nivel | 3 hacia `dispatcher`, `manager_directo`, `supervisor`; hacia trabajadores se propaga como `shift.cancelled` · Inbox + Push · Ack para dispatcher · No consolidable · 0 s · P0 |
|---|

---

## Dominio: Comunicación organizacional

### `announcement.published`
| Nivel | 1 → 2 si está dirigido a una audiencia operativa específica · Audiencias: destinatarios declarados · Inbox (Push solo N2) · Ack opcional configurable · Consolidable en digest · digest diario · P6 |
|---|

**Regla:** los anuncios no son cambios. Se catalogan aquí solo para garantizar que **no** compitan con los avisos de cambio por el mismo canal en Nivel 3.

---

## Cambios de Nivel 0 explícitos (nunca se comunican)

| Tipo | Motivo |
|---|---|
| `meta.typo_correction` | Detección por similitud de cadena > 0.9 |
| `meta.formatting` | Mayúsculas, espacios, puntuación |
| `shift.internal_notes` | Charter P9 |
| `meta.reordering` | Orden de listas sin cambio de contenido |
| `meta.no_op` | Estado final idéntico al inicial tras consolidación (DEC-CI-03) |
| `meta.actor_self` | El autor del cambio no se notifica a sí mismo |

Todos se **auditan** (Charter P5).

---

## Cómo extender este catálogo

Toda nueva funcionalidad que genere un cambio observable debe añadir su entrada con **todos** los campos obligatorios:

```text
### <dominio>.<nombre>
- Nivel de impacto (y reglas de elevación)
- Objetos afectados
- Audiencias afectadas, con nivel por audiencia
- Canal por defecto
- Requiere confirmación (y si es probatoria)
- Puede consolidarse con otros cambios
- Ventana de agrupación
- Prioridad
- Ejemplo de comunicación real, redactado como lo verá la persona
```

Checklist de aprobación:
1. ¿Cambia la realidad operacional de cada audiencia listada? (P1)
2. ¿El ejemplo muestra `antes → después` y responde las cuatro preguntas? (P2, P3)
3. ¿Se consolida con los cambios vecinos del mismo objeto? (P4)
4. ¿La confirmación está justificada por riesgo real? (P11)
5. ¿El canal es proporcional al nivel? (P7)
6. ¿La audiencia excluye a "todos los managers"? (P10)
7. ¿Hay algún campo interno que pudiera filtrarse al trabajador? (P9)

Un tipo de cambio que no supere el checklist no se incorpora.

---

---

## Anexo D3 — Resolución de audiencia `manager_directo`

Toda fila del catálogo que declare `manager_directo` como audiencia se resuelve
**exclusivamente** con `DirectManagerSet(shift)` (ver D3 en `CHANGE_INTELLIGENCE_DECISIONS_F0.md`):
relación explícita persona ↔ turno, con precedencia estricta
`shift_explicit → location_responsibility → client_responsibility →
operational_unit_responsibility → duty_manager → unresolved`, sin mezclar niveles.

El rol genérico `manager` **no** es criterio de audiencia en ninguna fila del catálogo.

### Audiencia por familia de cambio (normativa)

| Familia | Destinatarios | Nunca |
| --- | --- | --- |
| Cambio de empleado (reemplazo/alta/baja) | trabajador que sale, trabajador que entra, supervisor del turno si existe, `manager_directo` resuelto | demás trabajadores, todos los managers, admins sin responsabilidad, payroll salvo consecuencia real |
| Hora / fecha / dirección | trabajadores asignados, supervisor del turno, `manager_directo` solo si la fila lo marca relevante | ampliación jerárquica |
| Nota interna | solo roles expresamente autorizados en la fila | trabajadores, siempre |

### Deduplicación

Si una persona califica como supervisor y como `manager_directo` (o por varias
relaciones), se emite **una sola** comunicación consolidada usando `deduplication_key`.

---

*Catálogo v1.0 — 27 tipos de cambio en 6 dominios. Anexo D3 incorporado. Sin implementación asociada.*

