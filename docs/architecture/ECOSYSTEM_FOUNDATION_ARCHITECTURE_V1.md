# Ecosystem Foundation Architecture (EFA) v1

**Estado:** Documento fundacional vigente
**Naturaleza:** Documental. No autoriza implementación por sí mismo.
**Pregunta que responde:** ¿Cómo está construido el ecosistema y cuáles son las
reglas obligatorias para que nunca vuelva a fragmentarse?

Este documento resume, conecta y gobierna. No reemplaza la documentación
técnica existente (`docs/engineering-system/`, `docs/qa/`, `docs/architecture/`):
la ordena bajo una sola constitución.

---

## Sección 1 — Visión del ecosistema

Parceros, Stafly Core, Quality Staff, My Staff, JKitchen Staff y cualquier
compañía futura **no son productos separados**. Son superficies y tenants de un
mismo ecosistema operativo.

| Pieza | Rol en el ecosistema |
|-------|----------------------|
| **Stafly** | Marca paraguas y columna técnica del ecosistema |
| **Stafly Core** | Plataforma de operación de fuerza laboral (turnos, asistencia, payroll, documentos, clientes) |
| **Parceros** | Marketplace y comunidad: oportunidades, canales, embajadores |
| **Quality Staff / My Staff / JKitchen Staff** | Compañías operativas (tenants) que consumen la misma plataforma |
| **Compañías futuras** | Se incorporan como tenants, nunca como forks ni apps aisladas |

Regla fundacional: **una compañía nueva es un tenant, no un sistema nuevo.**
Un producto nuevo es una capacidad sobre los motores existentes, no un motor
paralelo.

El trabajador es una sola persona en todo el ecosistema. La compañía es una
sola entidad comercial. La operación es un solo motor. Lo que cambia entre
superficies es el vocabulario y la experiencia, no la verdad.

---

## Sección 2 — Los pilares fundacionales

### 1. Passport — identidad y reputación del trabajador

- **Propósito:** representar a la persona una sola vez en todo el ecosistema.
- **Problema que resuelve:** trabajadores duplicados por compañía, reputación
  no portable, perfiles inconsistentes entre Stafly y Parceros.
- **Responsabilidades:** identidad del worker, historial verificable,
  reputación agregada, perfil público.
- **Qué NO hace:** no asigna turnos, no calcula pago, no otorga permisos, no
  decide acceso comercial, no reemplaza la relación laboral por compañía.
- **Dependencias:** consume evidencia de operación (asistencia, reviews);
  es consumido por Marketplace y Directory. No depende de ECC.

### 2. Versioned Write Contract (VWC) — integridad de escritura

- **Propósito:** carril único de escritura para datos operativos.
- **Problema que resuelve:** *lost updates* por edición concurrente y
  escrituras que se declaraban exitosas sin evidencia.
- **Responsabilidades:** PATCH parcial (solo campos modificados),
  `company_id` siempre presente, `expected_version` obligatorio, relectura y
  comparación campo a campo, auditoría de conflicto y de aplicación.
- **Qué NO hace:** no define permisos de negocio, no transforma datos, no
  calcula payroll, no sustituye RPCs de transición de estado.
- **Dependencias:** toda mutación de entidad versionada pasa por aquí.
  Lifecycle y correcciones de horas se apoyan en VWC.

### 3. Payroll Snapshot — inmutabilidad del cálculo

- **Propósito:** congelar la tarifa y las bases de cálculo del periodo.
- **Problema que resuelve:** tarifas que cambian retroactivamente y alteran
  periodos ya consolidados.
- **Responsabilidades:** resolución canónica de tarifa, snapshots append-only
  por periodo, bloqueo de modificación tras cierre.
- **Qué NO hace:** no ejecuta pagos bancarios, no usa horas programadas, no
  edita asistencia, no decide accesos.
- **Dependencias:** lee horas reales (`time_entries`); escribe bajo VWC;
  es independiente de ECC y de Passport.

> **Payroll consolidado ≠ trabajador pagado.** Cálculo no es ejecución.

### 4. Company Lifecycle — estado de la compañía

- **Propósito:** una sola máquina de estados para la vida de un tenant.
- **Problema que resuelve:** acceso deducido de banderas sueltas
  (`is_active`, suscripciones simuladas) y aprobaciones ambiguas.
- **Responsabilidades:** transiciones explícitas y auditadas, separación entre
  aprobación y acceso, matriz de capacidades por estado.
- **Qué NO hace:** no cobra, no otorga capacidades comerciales por sí mismo,
  no borra datos, no activa compañías desde signup.
- **Dependencias:** ECC lee el estado de lifecycle como insumo; las
  transiciones se ejecutan por RPC canónica con VWC.

### 5. Ecosystem Commercial Contract (ECC) — verdad comercial y de acceso

- **Propósito:** explicar y resolver qué puede hacer cada compañía.
- **Problema que resuelve:** gates dispersos por pantalla, planes no
  versionados, acceso imposible de auditar o explicar.
- **Responsabilidades:** catálogo canónico de capacidades, versiones de plan
  inmutables, resolución de entitlements, reconciliación contra legacy.
- **Qué NO hace:** no cobra, no crea compañías, no reemplaza RLS, no gestiona
  identidad, no decide reputación.
- **Dependencias:** consume Lifecycle; es consumido por toda superficie que
  necesite saber si una capacidad está disponible.

### 6. ECC Stable Pilot — adopción controlada

- **Propósito:** graduar compañías hacia ECC como fuente efectiva sin riesgo.
- **Problema que resuelve:** migrar el modelo de acceso sin apagones ni
  regresiones silenciosas.
- **Responsabilidades:** modos (`legacy_only`, `ecc_pilot`, `ecc_stable`),
  comparación dual, confidence score, fallback y rollback inmediato,
  contención de flota, incidentes tipificados.
- **Qué NO hace:** no retira Legacy, no cambia gates globales, no amplía
  alcance automáticamente a otras compañías.
- **Dependencias:** envuelve a ECC; conserva Legacy como comparación.

---

## Sección 3 — Principios obligatorios

1. **Una sola fuente de verdad** por dominio. Si hay dos, una es un bug.
2. **Nunca crear silos.** Cada dato nuevo debe pertenecer a un motor existente.
3. **Operación primero.** La verdad nace de lo que ocurrió en el turno.
4. **Historial inmutable.** Lo consolidado no se reescribe; se corrige con
   evidencia y auditoría.
5. **Fail closed.** Ante duda, incertidumbre o baja confianza: denegar o caer
   al camino seguro conocido.
6. **Idempotencia.** Toda transición debe poder repetirse sin duplicar efecto.
7. **Versionado.** Toda escritura de entidad crítica lleva `expected_version`.
8. **Auditoría.** Toda decisión relevante deja rastro explicable.
9. **Multi-tenant.** `company_id` siempre presente; aislamiento no negociable.
10. **Mobile first.** La operación se ejecuta desde el teléfono.
11. **Payroll usa horas reales**, nunca horas programadas.
12. **No activar compañías desde signup.** La activación es una decisión.
13. **El acceso no depende de `is_active`**, depende de Lifecycle + ECC.
14. **Los pagos nunca borran datos.** Degradan capacidades, no historial.
15. **Toda decisión debe ser explicable** a un humano no técnico.

---

## Sección 4 — Mapa del ecosistema

```text
                         ┌───────────────┐
                         │   IDENTITY    │  quién es (auth + tenant)
                         └───────┬───────┘
                 ┌───────────────┼────────────────┐
                 ▼               ▼                ▼
          ┌────────────┐  ┌────────────┐   ┌────────────┐
          │  WORKERS   │  │ COMPANIES  │   │  PARTNERS  │
          └─────┬──────┘  └─────┬──────┘   └─────┬──────┘
                │               │                │
                ▼               ▼                │
          ┌────────────┐  ┌────────────┐         │
          │  PASSPORT  │  │ LIFECYCLE  │         │
          │ (persona)  │  │ (estado)   │         │
          └─────┬──────┘  └─────┬──────┘         │
                │               ▼                │
                │         ┌────────────┐         │
                │         │    ECC     │◄────────┘
                │         │ (acceso)   │
                │         └─────┬──────┘
                │               │ habilita capacidades
    ┌───────────┼───────────────┼────────────────┬─────────────┐
    ▼           ▼               ▼                ▼             ▼
┌────────┐ ┌──────────┐  ┌────────────┐  ┌───────────┐  ┌──────────┐
│MARKET- │ │COMMUNITY │  │ OPERACIÓN  │  │ DOCUMENTS │  │    AI    │
│ PLACE  │ │(Parceros)│  │ turnos /   │  │compliance │  │asistencia│
│        │ │          │  │ asistencia │  │           │  │explicable│
└────────┘ └──────────┘  └─────┬──────┘  └───────────┘  └──────────┘
                               │ horas reales
                               ▼
                        ┌─────────────┐
                        │   PAYROLL   │ snapshot inmutable
                        └─────────────┘

Escritura de cualquier caja operativa ──► VWC (versionado + auditoría)
```

Lecturas clave del mapa:

- Identity responde *quién*; Passport responde *quién es esta persona en el
  ecosistema*; Lifecycle responde *en qué estado está la compañía*; ECC
  responde *qué puede hacer*.
- La operación es la única fuente de horas. Payroll consume horas reales.
- Marketplace y Community consumen Passport, no crean identidad propia.
- AI explica y asiste; nunca es fuente de verdad ni ejecuta escrituras
  fuera de VWC.

---

## Sección 5 — Reglas de arquitectura

### Qué puede hacer un módulo

- Leer de los motores canónicos.
- Escribir su propio dominio a través de VWC o de la RPC canónica de transición.
- Emitir eventos de dominio con `company_id`, actor, entidad y versión.
- Presentar vocabulario propio de su superficie (lexicón), sin cambiar el dato.

### Qué nunca debe hacer un módulo

- Crear su propia tabla de planes, permisos, identidad, documentos o auditoría.
- Deducir acceso de banderas locales o de storage del cliente.
- Escribir directo a tablas versionadas saltándose VWC.
- Copiar datos de otro dominio para "tenerlos a mano".
- Bloquear la operación por una decisión comercial no explicada.

### Cómo consumir ECC

Preguntar por **capacidad**, nunca por plan ni por estado crudo. Una capacidad
inexistente en el catálogo no se inventa en la pantalla: se agrega al catálogo.
Si la resolución no es confiable, aplicar fail closed o el fallback definido.

### Cómo consumir Passport

Leer identidad y reputación; nunca duplicar el perfil por compañía. Los datos
laborales específicos del tenant viven en el tenant, referenciando al Passport.

### Cómo crear eventos

Un evento describe **algo que ocurrió**, en pasado, con tenant, actor, entidad,
versión y correlación. No transporta intención ni reemplaza una escritura.

### Cómo escribir datos

PATCH parcial → `company_id` → `expected_version` → RPC canónica → relectura y
comparación → auditoría. Conflicto significa **rechazar y explicar**, nunca
sobrescribir.

### Cómo crear nuevas capacidades

1. Nombrarla en el catálogo canónico de ECC.
2. Versionar los planes que la incluyen (versiones inmutables, nueva versión).
3. Mapearla contra el gate legacy equivalente.
4. Observarla en comparación dual antes de gobernar con ella.

### Cómo evitar duplicaciones

Antes de crear algo nuevo, identificar el motor dueño del concepto. Si ningún
motor lo reclama, la decisión es de arquitectura, no de feature. Si dos motores
lo reclaman, la frontera está mal definida y debe resolverse antes de escribir
código.

---

## Sección 6 — Modelo de evolución

El ecosistema crece por **capas**, no por aplicaciones.

- **Nueva compañía** → nuevo tenant. Cero código nuevo.
- **Nuevo producto** → nueva superficie sobre motores existentes.
- **Nueva funcionalidad** → nueva capacidad en el catálogo ECC.
- **Nuevo dato** → nuevo campo o entidad dentro del dominio dueño.
- **Nuevo motor** → excepción rara, con decisión formal y frontera explícita.

Prohibido: apps aisladas, motores duplicados, bases paralelas, permisos
propios, historiales propios. Si algo requiere duplicar un motor, primero se
corrige el motor.

La dirección de largo plazo: menos código por funcionalidad, más capacidad por
motor, y una sola explicación posible para cada decisión del sistema.

---

## Sección 7 — Roadmap por estado

| Pilar / capacidad | Estado |
|-------------------|--------|
| Versioned Write Contract (servicios, horas, compensación, documentos, configuración, asignaciones) | **Implementado** |
| Payroll Snapshot (tarifa canónica + inmutabilidad de periodo) | **Implementado** |
| Company Lifecycle (estados, transición auditada, matriz de capacidades) | **Implementado** |
| Company Billing Truth (realidad operativa sin suscripciones simuladas) | **Implementado** |
| ECC — catálogo, planes versionados, entitlements, reconciliación | **Implementado** |
| ECC — piloto real de una compañía con comparación dual | **Piloto** |
| ECC — modo estable por compañía con Legacy en comparación | **Piloto** |
| Passport como fuente canónica única de identidad/reputación | **Pendiente** |
| Frontera formal de datos Stafly ↔ Parceros | **Pendiente** |
| Retiro de Legacy en acceso | **Pendiente** |
| Ampliación de ECC al resto de la flota | **Pendiente** |
| Contrato único de eventos de dominio | **Pendiente** |
| Unificación `shifts` / `scheduled_shifts` | **Pendiente** |
| Ejecución bancaria de pago al trabajador | **Pendiente** |

---

## Sección 8 — Anti-patrones prohibidos

Cada uno de estos ya tiene dueño en el ecosistema. Crear un segundo es un
defecto de arquitectura, no una decisión de producto.

| Anti-patrón | Dueño canónico existente |
|-------------|--------------------------|
| Otro sistema de billing | Billing Truth + ECC |
| Otro sistema de identidad | Identity + Passport |
| Otro sistema de permisos | ECC + roles en tabla dedicada |
| Otro sistema de documentos | Documents & Compliance |
| Otro sistema de marketplace | Parceros |
| Otro sistema de eventos | Contrato de eventos de dominio |
| Otro sistema de auditoría | Auditoría transversal + auditoría VWC |
| Otro sistema de planes | Plan versions de ECC |
| Otro sistema de chat | Communications |
| Otro sistema de notificaciones | Notifications + capa única de feedback |
| Otro cálculo de horas | Operación (horas reales) |
| Otra máquina de estados de compañía | Company Lifecycle |

---

## Sección 9 — Checklist obligatorio

Ningún desarrollo se aprueba sin responder las once preguntas:

1. ¿Duplica información que ya existe?
2. ¿Rompe Passport?
3. ¿Rompe ECC?
4. ¿Rompe Lifecycle?
5. ¿Rompe Payroll?
6. ¿Rompe VWC?
7. ¿Genera otro silo?
8. ¿Es multi-tenant?
9. ¿Tiene auditoría?
10. ¿Tiene rollback?
11. ¿Es explicable a un humano no técnico?

Una sola respuesta problemática detiene el desarrollo hasta corregir el diseño.

---

## Riesgos de comprensión vigentes

Registrados aquí como advertencia, sin autorizar cambios:

- Coexistencia de `shifts` y `scheduled_shifts` sin frontera formal.
- Doble fuente de verdad en asistencia (nativa vs reconciliación externa).
- Cierre operativo sin bandera canónica única.
- Frontera de datos Stafly ↔ Parceros no formalizada.
- Fuente canónica del Passport aún no decidida.
- Legacy sigue activo en paralelo a ECC; el retiro no tiene decisión aprobada.
- Payroll no cubre ejecución bancaria: "preparado" no es "pagado".

---

## Alcance de esta fase

No se modificó código, producción, datos, arquitectura operativa ni componentes
del ecosistema durante esta fase documental.
