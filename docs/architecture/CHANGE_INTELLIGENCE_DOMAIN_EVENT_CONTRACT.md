# Change Intelligence — Contrato de Eventos de Dominio (v1.0)

> **Principio rector (P16 — invariante):** Change Intelligence **no conoce** Turnos, Nómina,
> Reclutamiento ni Documentos. CI opera exclusivamente sobre un **evento de dominio
> estandarizado**. Cualquier capacidad del ecosistema puede emitirlo sin acoplamiento,
> y CI puede evolucionar sin tocar ningún dominio.

---

## 1. Regla de aislamiento

| Prohibido dentro del motor CI | Permitido |
| --- | --- |
| Importar tipos, hooks, tablas o helpers de un dominio (`shifts`, `payroll`, `recruiting`, `documents`) | Leer únicamente el sobre `DomainChangeEvent` |
| Consultar la base de datos de un dominio para "completar" datos | Recibir el snapshot `before`/`after` ya resuelto por el emisor |
| Condicionales del tipo `if (domain === 'shift') ...` en clasificación | Reglas declarativas por `changeType` cargadas desde el catálogo/registry |
| Redactar texto que mencione un dominio hardcodeado | Plantillas provistas por el registry del dominio |

**Test estructural (CI-ISO-1):** el paquete del motor no puede tener ningún import cuyo
path incluya `shifts|payroll|recruit|document|timeclock`. Falla el build si ocurre.

---

## 2. El sobre estándar: `DomainChangeEvent`

Único punto de entrada al motor. Es serializable, determinista y auto-descriptivo.

```ts
interface DomainChangeEvent {
  // Identidad
  eventId: string;              // uuid, idempotencia
  correlationId: string;        // agrupa cambios de una misma acción de usuario
  occurredAt: string;           // ISO-8601 UTC
  schemaVersion: 1;

  // Origen (opaco para CI: solo se usa para trazabilidad y routing de reglas)
  domain: string;               // 'scheduling' | 'payroll' | 'recruiting' | 'documents' | ...
  changeType: string;           // clave del Change Catalog, ej. 'shift.time.changed'
  subject: EntityRef;           // entidad que cambió
  actor: ActorRef;              // quién lo provocó (o 'system')
  tenantId: string;

  // Contenido del cambio (ya normalizado por el emisor)
  fields: FieldDelta[];         // antes → después
  audienceHints: AudienceRef[]; // candidatos con su relación operacional
  context: Record<string, ScalarOrRef>; // datos para plantillas, sin lógica
}

interface FieldDelta {
  field: string;                // 'startsAt', 'address', 'ratePerHour'
  semantic: FieldSemantic;      // 'datetime' | 'location' | 'money' | 'text' | 'status' | 'person' | 'quantity'
  before: ScalarOrRef | null;
  after: ScalarOrRef | null;
  materiality: 'operational' | 'cosmetic' | 'internal'; // P1 y P9 dependen de esto
}

interface AudienceRef {
  partyId: string;
  partyType: 'worker' | 'manager' | 'client' | 'admin';
  relation: 'assigned' | 'candidate' | 'owner' | 'supervisor' | 'observer';
  reachableChannels: Channel[];
}

interface EntityRef { type: string; id: string; label: string; }
interface ActorRef  { id: string | null; type: 'user' | 'system' | 'import'; label: string; }
```

CI **nunca** interpreta `domain` para decidir lógica; lo usa solo para seleccionar el
registry de reglas y como metadato de auditoría.

---

## 3. Cómo se mantiene genérico el motor

Las 5 capas puras (L1–L5) trabajan sobre semántica, no sobre dominio:

| Capa | Entrada | Lógica genérica |
| --- | --- | --- |
| L1 Detección | `fields[]` | descarta `cosmetic` e `internal`; descarta deltas netos nulos |
| L2 Clasificación | `semantic` + `materiality` + regla del `changeType` | asigna Nivel 0–3 |
| L3 Audiencia | `audienceHints[]` + matriz `relation × nivel` | selecciona afectados y explica exclusiones |
| L4 Composición | `semantic` + plantilla del registry | redacta antes → después |
| L5 Ruteo | nivel + `reachableChannels` | elige canal y ventana de consolidación |

Un dominio nuevo (ej. Documentos) se integra **sin tocar el motor**: registra sus
`changeType` en el catálogo y emite el sobre.

---

## 4. Contrato del emisor (Domain Adapter)

Cada capacidad expone un adapter delgado, propiedad del dominio, no de CI:

1. Detecta la mutación (aplicación o trigger DB, según DEC-CI-01).
2. Normaliza el diff a `FieldDelta[]` con `semantic` y `materiality` correctos.
3. Resuelve `audienceHints` con las relaciones operacionales del dominio.
4. Publica el `DomainChangeEvent`. Fin de su responsabilidad.

Reglas: el adapter no clasifica impacto, no elige canal, no redacta texto y no
puede enviar nada. CI no llama de vuelta al dominio.

---

## 5. Registry por dominio (declarativo)

```ts
interface ChangeTypeRegistration {
  changeType: string;
  defaultLevel: 0 | 1 | 2 | 3;
  audienceMatrix: Partial<Record<AudienceRef['relation'], 0 | 1 | 2 | 3>>;
  requiresAck: 'none' | 'light' | 'probatory';
  templates: Record<string, string>; // por locale, con placeholders de context/fields
}
```

Datos, no código. Versionados junto al Change Catalog.

---

## 6. Criterios de aceptación

- **CA-ISO-1:** el motor compila y pasa tests con cero imports de dominio.
- **CA-ISO-2:** agregar un dominio nuevo requiere 0 líneas modificadas en el motor.
- **CA-ISO-3:** todo evento inválido contra el esquema se rechaza y se registra; nunca se adivina.
- **CA-ISO-4:** dos eventos idénticos (`eventId`) producen exactamente una decisión.
- **CA-ISO-5:** los campos `internal` jamás aparecen en una composición dirigida a `worker` o `client` (P9).
- **CA-ISO-6:** el motor es puro: mismos inputs → mismo `ObservationRecord`.

---

## 7. Impacto en F1 (Modo Observación)

F1 se implementa directamente sobre este contrato: el primer adapter (Scheduling)
emite eventos reales, el motor los procesa en shadow y el log de simulación registra
decisiones y exclusiones. La ausencia de dependencias de dominio hace que el criterio
de "imposibilidad de envío accidental" sea estructural, no disciplinario.

**Dependencia nueva (D11):** definir `materiality` por campo para cada `changeType`
del catálogo antes de codificar el primer adapter.
