# Change Intelligence (CI) — Modelo Conceptual v1

**Estado:** Diseño (sin implementación)
**Fecha:** 2026-07-30
**Alcance:** Capacidad transversal del ecosistema Stafly / Parceros
**Regla de oro:** *Ninguna decisión organizacional termina cuando se guarda. Termina cuando todos los afectados conocen el cambio y la organización vuelve a estar sincronizada.*

---

## 1. Modelo conceptual

CI no es un canal de salida. Es una **capa de interpretación** que se sitúa entre la mutación de datos y la comunicación.

```text
   MUTACIÓN                 CHANGE INTELLIGENCE                 ENTREGA
┌──────────────┐   ┌────────────────────────────────────┐   ┌─────────────┐
│ UPDATE shift │──▶│ 1 Detect   → ChangeSet             │──▶│ Inbox       │
│ DELETE assign│   │ 2 Classify → ImpactLevel           │   │ Push        │
│ INSERT ...   │   │ 3 Resolve  → Audience              │   │ Email / SMS │
└──────────────┘   │ 4 Compose  → ChangeSummary         │   │ WhatsApp    │
                   │ 5 Route    → ChannelPlan           │   └─────────────┘
                   │ 6 Track    → Ack / Read / Pending  │
                   └────────────────────────────────────┘
                                    │
                                    ▼
                            Change Audit (inmutable)
```

Tres afirmaciones que definen el sistema:

1. **El evento no es la unidad.** La unidad es el *cambio semántico* (`3:00 PM → 4:00 PM`), no la fila actualizada.
2. **La audiencia se calcula, no se configura.** Se deriva del impacto operacional, nunca de la pertenencia a la empresa.
3. **El silencio es un resultado válido y deseable.** Nivel 0 es una salida legítima del motor.

### Diferencia con el sistema actual
| Hoy (`notifications` + triggers) | Change Intelligence |
|---|---|
| Un trigger por tabla → un mensaje por evento | Un ChangeSet por transacción → un mensaje por persona |
| Texto compuesto en PL/pgSQL | Texto compuesto desde diffs tipados |
| Audiencia = asignados | Audiencia = afectados por rol de impacto |
| Sin acuse de recibo | Ack obligatorio en Nivel 3 |
| Sin trazabilidad de lectura | Auditoría completa notificado/leído/confirmado |

CI **absorbe** el sistema actual: `notifications` pasa a ser un canal (Inbox), no la fuente de verdad.

---

## 2. Arquitectura

### Capas

| Capa | Responsabilidad | Ubicación propuesta |
|---|---|---|
| **L0 — Emisión** | Toda mutación relevante emite un `ChangeEvent` crudo (antes/después) | Triggers DB + wrappers de escritura en app |
| **L1 — Detección** | Diff tipado por entidad → `ChangeSet` | Motor puro (TS), testeable sin DB |
| **L2 — Clasificación** | Reglas → `ImpactLevel` por campo y agregado | Motor puro (TS) |
| **L3 — Audiencia** | Resolución de afectados y su `AudienceRole` | Consultas de solo lectura |
| **L4 — Composición** | `ChangeSummary` por destinatario (idioma, densidad, CTA) | Motor puro (TS) |
| **L5 — Ruteo** | `ChannelPlan` según nivel + preferencias + horario | Motor puro (TS) + policy |
| **L6 — Entrega** | Ejecución por canal, reintentos, dedupe | Edge functions / queue |
| **L7 — Feedback** | Read receipts, acknowledgements, escalado | DB + realtime |
| **L8 — Auditoría** | Registro inmutable de todo lo anterior | DB append-only |

**Punto crítico de diseño:** L1–L5 son **funciones puras**. Reciben datos, devuelven un plan. Esto permite:
- *Dry-run*: previsualizar "quién será notificado y con qué texto" **antes** de guardar.
- Tests deterministas sin backend.
- Reutilizar el mismo motor en admin (preview) y en servidor (ejecución).

### Modo Preview (obligatorio en el diseño)
Antes de confirmar una edición crítica, el admin ve:

```text
Este cambio notificará a 3 personas.
  Juan Pérez      Nivel 3   Push + Inbox   requiere confirmación
  Carlos Ruiz     Nivel 3   Push + Inbox   requiere confirmación
  Ana (supervisor) Nivel 2  Inbox
  4 trabajadores  Nivel 0   sin interrupción
```

Esto convierte a CI en una herramienta de decisión, no solo de difusión.

---

## 3. Objetos de dominio

```ts
type ImpactLevel = 0 | 1 | 2 | 3;

interface ChangeEvent {          // L0 — crudo
  id: string;
  entityType: 'shift' | 'assignment' | 'payroll_period' | 'service_request' | ...;
  entityId: string;
  companyId: string;
  actorId: string | null;        // null = sistema/automatización
  actorRole: string;
  occurredAt: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  cause: 'manual_edit' | 'automation' | 'import' | 'cascade' | 'client_request';
}

interface FieldChange {          // L1
  field: string;                 // 'start_time'
  semanticKey: ChangeType;       // 'shift.time'
  before: unknown;
  after: unknown;
  displayBefore: string;         // '3:00 PM'
  displayAfter: string;          // '4:00 PM'
}

interface ChangeSet {            // L1 — unidad atómica de comunicación
  id: string;
  correlationId: string;         // agrupa cambios de una misma transacción
  source: ChangeEvent;
  changes: FieldChange[];
  aggregateImpact: ImpactLevel;
}

interface AffectedParty {        // L3
  subjectId: string;             // employee_id / user_id
  audienceRole: AudienceRole;
  impact: ImpactLevel;           // puede ser < aggregateImpact
  reason: string;                // 'assigned_worker', 'shift_admin', 'replaced'
  requiresAck: boolean;
}

interface ChangeSummary {        // L4 — lo que la persona lee
  headline: string;              // 'Tu turno cambió'
  lines: Array<{ label: string; from: string; to: string }>;
  action: { label: string; deepLink: string } | null;
  deadline: string | null;       // '¿Antes de cuándo?'
  noActionNeeded: boolean;
  locale: 'es' | 'en' | 'he';
}

interface ChannelPlan {          // L5
  channels: Array<'inbox' | 'push' | 'email' | 'sms' | 'whatsapp'>;
  sendAt: string;                // permite coalescing / quiet hours
  escalation: { afterMinutes: number; channel: string } | null;
}

interface ChangeNotice {         // L6 — instancia entregable
  id: string;
  changeSetId: string;
  recipientId: string;
  summary: ChangeSummary;
  plan: ChannelPlan;
  state: 'pending' | 'sent' | 'delivered' | 'read' | 'acknowledged' | 'expired' | 'suppressed';
}
```

### Tablas propuestas (nombres, sin DDL todavía)
- `change_events` — append-only, crudo.
- `change_sets` — diffs interpretados + nivel agregado.
- `change_recipients` — un renglón por afectado (rol, impacto, motivo, requiere ack).
- `change_notices` — un renglón por (destinatario × canal), con estados y timestamps.
- `change_acknowledgements` — confirmaciones explícitas.
- `change_preferences` — preferencias por persona y por tipo de cambio.

Regla estructural: `change_events` y `change_sets` son **inmutables**. Solo `change_notices` muta de estado.

---

## 4. Flujo operacional

```text
1. Admin edita un turno y guarda.
2. (Preview opcional) CI corre L1–L5 en modo dry-run y muestra el impacto.
3. Se persiste la mutación + se emite ChangeEvent en la MISMA transacción.
4. L1 diffea → ChangeSet con 3 FieldChange.
5. L2 clasifica: time=2, address=3, notes=0 → agregado = 3.
6. L3 resuelve audiencia:
     Juan (trabajador asignado)  → nivel 3, ack requerido
     Ana  (supervisor del turno) → nivel 2, sin ack
     Luis (manager)              → nivel 1, solo auditoría
     resto de la empresa         → nivel 0, suprimido
7. L4 compone UN resumen por persona (no uno por campo).
8. L5 rutea: Juan → push + inbox; Ana → inbox; Luis → sin interrupción.
9. Ventana de coalescing (p.ej. 90 s): si hay más ediciones, se fusionan en el mismo ChangeSet.
10. L6 entrega. L7 registra sent/read/ack. Si Juan no confirma en 30 min y el turno es <12 h → escalada a SMS + alerta al supervisor.
11. L8 cierra el ciclo con el registro de auditoría completo.
```

**Cierre del ciclo:** un cambio Nivel 3 no se considera *sincronizado* hasta que todos los `requiresAck` estén en estado `acknowledged` o `expired`. Ese estado es visible en Shift Ops.

---

## 5. Reglas de negocio

| # | Regla |
|---|---|
| R1 | Ninguna persona recibe una notificación por pertenecer a la empresa. Solo por impacto calculado. |
| R2 | Un `ChangeSet` produce como máximo **una** notificación por persona por canal. |
| R3 | Cambios dentro de la ventana de coalescing se fusionan; si el resultado neto es idéntico al original, se suprime todo (Nivel 0). |
| R4 | Nivel 0 nunca se entrega; sí se audita. |
| R5 | Nivel 1 solo entra al Change Feed / historial. Nunca push. |
| R6 | Nivel 2 → Inbox + Push (respetando quiet hours). |
| R7 | Nivel 3 → Inbox + Push inmediato, ignora quiet hours, requiere ack, con escalada. |
| R8 | El actor del cambio no se notifica a sí mismo (sí se audita). |
| R9 | Un cambio en un turno que ya terminó no genera notificación operativa (solo Nivel 1). |
| R10 | La proximidad temporal eleva el nivel: mismo cambio a 30 días vista = Nivel 2; a 4 h vista = Nivel 3. |
| R11 | Sin ack en Nivel 3 antes del deadline → escalada al supervisor, no repetición al trabajador. |
| R12 | Las preferencias del usuario pueden reducir canales en Nivel ≤2, **nunca** en Nivel 3. |
| R13 | Toda notificación debe contener respuesta a: qué cambió, por qué importa, qué hacer, antes de cuándo. Si falta alguna, no se envía: se degrada a Nivel 1. |
| R14 | Reemplazo de persona = dos cambios de identidad opuestos, nunca un "turno actualizado". |
| R15 | Cambios masivos (import, cascada) se agrupan por persona en un único digest. |
| R16 | CI nunca ejecuta mutaciones de negocio. Solo lee, comunica y registra. |

---

## 6. Eventos

**Emitidos hacia CI (entrada):**
`shift.updated`, `shift.cancelled`, `shift.published`, `assignment.created`, `assignment.removed`, `assignment.replaced`, `assignment.role_changed`, `meeting_point.changed`, `transport.changed`, `client.changed`, `payroll.period_closed`, `payroll.adjustment_applied`, `document.expired`, `service_request.modified`

**Emitidos por CI (salida):**
`change.detected`, `change.classified`, `change.suppressed`, `change.audience_resolved`, `notice.dispatched`, `notice.delivered`, `notice.read`, `notice.acknowledged`, `notice.escalated`, `change.synchronized` (cierre de ciclo)

---

## 7. Tipos de cambio

| ChangeType | Nivel base | Notas |
|---|---|---|
| `shift.time` | 2 (→3 si <12 h) | Afecta logística personal |
| `shift.date` | 3 | Siempre crítico |
| `shift.address` | 3 | Riesgo de llegar al lugar equivocado |
| `shift.meeting_point` | 2 (→3 si <12 h) | |
| `shift.meeting_time` | 2 | |
| `shift.client` | 1–2 | Operativo si cambia protocolo |
| `shift.transport` | 2 | |
| `shift.uniform` | 2 | Requiere preparación previa |
| `shift.instructions` | 1–2 | Según longitud/semántica |
| `shift.cancelled` | 3 | Ack obligatorio |
| `assignment.added` | 3 | Nueva realidad laboral |
| `assignment.removed` | 3 | |
| `assignment.replaced` | 3 | Dos mensajes opuestos + uno al supervisor |
| `shift.supervisor` | 2 | |
| `shift.slots` | 0–1 | Interno |
| `shift.internal_notes` | 0 | Nunca al trabajador |
| `pay.rate` | 3 | Sensible: canal privado, sin push con preview de contenido |
| `pay.period_closed` | 1 | Informativo |
| `typo / formatting` | 0 | Detección por similitud de cadena |

---

## 8. Tipos de destinatarios (`AudienceRole`)

| Rol | Criterio | Nivel máximo típico |
|---|---|---|
| `affected_worker` | Asignado y activo en el turno | 3 |
| `removed_worker` | Estaba asignado y dejó de estarlo | 3 |
| `incoming_worker` | Recién asignado | 3 |
| `shift_admin` | Responsable operativo del turno | 3 |
| `supervisor` | Supervisa el turno o la ubicación | 2 |
| `manager` | Responsable de la operación | 1–2 |
| `client_contact` | Contacto del cliente, si el cambio es visible externamente | 1–2 |
| `dispatcher` | Rol de asignación | 2 |
| `auditor` | Solo registro | 0 (nunca interrumpido) |
| `actor` | Quien hizo el cambio | 0 |

Una persona puede tener varios roles; se aplica el **impacto máximo** y **un único mensaje**.

---

## 9. Estrategia de canales

| Nivel | Inbox | Push | Email | SMS | WhatsApp |
|---|---|---|---|---|---|
| 0 | — | — | — | — | — |
| 1 | ✓ (feed) | — | digest opcional | — | — |
| 2 | ✓ | ✓ (respeta quiet hours) | opcional | — | — |
| 3 | ✓ | ✓ inmediato | ✓ | escalada | escalada si habilitado |

Reglas de canal:
- **Inbox es siempre el canal base.** Todo lo entregable existe en el feed; los demás canales son *amplificadores*.
- **Quiet hours** (p.ej. 22:00–07:00) aplican a Nivel ≤2. Nivel 3 las ignora.
- **Coalescing window** de 60–120 s por (persona, entidad) para evitar ráfagas de edición.
- **Escalada, no repetición:** si no hay ack, se sube de canal una vez y se alerta al supervisor. Nunca se reenvía el mismo push.
- **Contenido sensible** (pago, documentos) nunca en el cuerpo del push; solo "Tienes una actualización de pago".
- **Fallback:** si un canal falla, se degrada al inmediato inferior y se registra en auditoría.

---

## 10. Diseño UX

### 10.1 Tarjeta de cambio (worker)
```text
┌──────────────────────────────────────┐
│ ⚠ Tu turno cambió        hace 5 min  │
│ Evento VIP · #0175 · 5 Abr           │
├──────────────────────────────────────┤
│ Hora        3:00 PM  →  4:00 PM      │
│ Dirección   Hotel A  →  Hotel B      │
│ Encuentro   Lobby    →  Parking sur  │
├──────────────────────────────────────┤
│ No necesitas hacer nada adicional.   │
│ [ Entendido ]        [ Ver turno ]   │
└──────────────────────────────────────┘
```
- Diff en dos columnas, siempre `antes → después`.
- Una sola tarjeta por cambio, aunque haya 6 campos.
- La línea de acción es explícita, incluso cuando es "no hagas nada".
- Deadline visible cuando existe.

### 10.2 Change Feed (worker)
Cronológico, agrupado por día, con densidad decreciente por antigüedad. Los Nivel 1 aparecen aquí y en ningún otro lugar. Filtro por turno.

### 10.3 Panel de sincronización (admin)
En Shift Ops, por turno:
```text
Sincronización del cambio        4 afectados
  Notificados 4 · Leídos 3 · Confirmados 2 · Pendientes 2
  ● Juan Pérez     confirmado    hace 3 min
  ● Carlos Ruiz    leído         hace 8 min
  ○ Ana Gómez      pendiente     escalada en 22 min
```
Estado del turno: **Sincronizado / Parcialmente sincronizado / Desincronizado**. Ese es el KPI real del sistema.

### 10.4 Preview antes de guardar
Diálogo previo al UPDATE con la lista de impacto (ver §2). El admin puede degradar manualmente un cambio a "sin notificar" con justificación obligatoria — y eso queda auditado.

### 10.5 Preferencias
El worker configura canales por tipo de cambio, con los Nivel 3 bloqueados y explicados: *"Los cambios críticos siempre se notifican."*

---

## 11. Métricas de éxito

| Métrica | Objetivo |
|---|---|
| Notificaciones por trabajador por semana | ↓ |
| Tasa de ack en Nivel 3 antes del deadline | > 95 % |
| Tiempo medio hasta "turno sincronizado" | < 15 min |
| % de turnos que llegan al inicio en estado *Desincronizado* | < 2 % |
| Consultas por WhatsApp sobre "¿qué cambió?" | ↓ (proxy cualitativo) |
| Ratio Nivel 0 suprimido / total de cambios | Alto = el motor está funcionando |

---

## 12. Riesgos y decisiones pendientes ⚠️

- **DEC-CI-01** — ¿Emisión desde triggers DB o desde wrappers de aplicación? (triggers = cobertura total; wrappers = contexto semántico más rico). Propuesta: híbrido, trigger como red de seguridad.
- **DEC-CI-02** — Fuente canónica del turno: `shifts` vs `scheduled_shifts` (bloqueado por DEC-001 del registro existente).
- **DEC-CI-03** — Duración exacta de la ventana de coalescing.
- **DEC-CI-04** — ¿Ack es legalmente vinculante para disputas laborales? Impacta retención y firma.
- **DEC-CI-05** — Migración del sistema actual de `notifications` + triggers: ¿coexistencia o corte?
- **Riesgo:** clasificación errónea de nivel genera silencio en un cambio crítico. Mitigación: cualquier cambio en dirección/fecha/asignación es Nivel 3 por defecto no configurable.
- **Riesgo:** el preview añade fricción al admin. Mitigación: solo obligatorio en Nivel 3.

---

## 13. Fases propuestas (para cuando se autorice implementar)

| Fase | Entregable | Sin código de producción hasta aprobación |
|---|---|---|
| F0 | Este documento + decisiones DEC-CI-01..05 resueltas | ✔ actual |
| F1 | Motor puro L1–L5 en TS + suite de tests con casos reales | sin DB |
| F2 | Esquema `change_*` + auditoría append-only | migración |
| F3 | Canal Inbox + Change Feed (worker) | UI |
| F4 | Panel de sincronización (admin) + preview | UI |
| F5 | Ack + escalada | lógica |
| F6 | Push / Email / SMS / WhatsApp | entrega |
| F7 | Retiro del sistema de notificaciones legacy | migración |

---

*Fin del modelo conceptual v1. No hay código de producción asociado a este documento.*
