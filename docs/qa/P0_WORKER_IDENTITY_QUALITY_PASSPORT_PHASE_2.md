# P0 — WORKER IDENTITY QUALITY / PASSPORT PHASE 2
## Plan de consolidación asistida — sin fusión automática

Estado: implementado (UI + motor de simulación + registro de decisiones).
Alcance de datos: **cero mutaciones** sobre trabajadores, asignaciones, horas,
documentos, nómina o cuentas de acceso. La única escritura es la bitácora de
decisiones (`employee_identity_reviews`).

---

## 1. Evidencia adicional levantada en esta fase

Por cada registro de trabajador el read model ahora reúne:

| Dominio | Fuente | Uso |
|---|---|---|
| Servicios | `shift_assignments` | Determina qué registro es el operativo real |
| Horas | `time_entries` (total y `approved`) | Bloquea consolidación si hay horas aprobadas |
| Nómina | `period_base_pay` | Bloquea consolidación si hay referencias |
| Documentos | `employee_documents` (total y legales) | Marca revisión obligatoria |
| Disponibilidad | `employee_availability_config` | Señala configuración a rehacer |
| Reputación | `review_submissions` | Señala historial evaluativo |
| Acceso | `employees.user_id` | Detecta conflicto de dos cuentas |
| Externo | `connecteam_employee_id` | Detecta identidades externas distintas |

Hallazgo relevante en Quality Staff: 7 233 registros de horas en estado
`approved` frente a 9 `pending`. Es decir, casi todo el historial de horas ya es
inmutable, por lo que la mayoría de grupos con actividad real caen en `BLOCKED`
para consolidación. Esto es correcto: la integridad de nómina manda.

---

## 2. Merge Plan — Dry Run

`src/lib/identity/merge-plan.ts` evalúa 12 dominios y devuelve por cada uno un
estado y una acción legible:

- **SAFE** — se puede consolidar sin pérdida ni ambigüedad.
- **REVIEW_REQUIRED** — necesita criterio humano antes de tocar nada.
- **BLOCKED** — no se puede consolidar; se explica por qué.

Reglas de bloqueo duro:

1. Horas aprobadas en más de un registro del grupo.
2. Referencias de nómina (`period_base_pay`) en registros que no son el principal.
3. Dos cuentas de acceso distintas dentro del grupo.
4. Registros de compañías distintas (frontera de tenant).
5. Documentos legales en el registro secundario.

El plan es siempre `dryRun: true`. No existe ejecutor: no hay ninguna ruta de
código que aplique el plan sobre la base de datos.

---

## 3. Separación de acciones

La confusión anterior era tratar "asignación equivocada" y "persona duplicada"
como el mismo problema. Ahora son acciones distintas en el diálogo de revisión:

| Acción | Qué significa | Qué escribe |
|---|---|---|
| Corregir asignación | El servicio apuntaba al registro equivocado | Decisión `assignment_reviewed` |
| Preparar consolidación | Los registros son la misma persona y el plan queda listo | Decisión `consolidation_prepared` + plan |
| Personas distintas | Coincidencia falsa; no volver a proponerlo | Decisión `not_duplicate` |
| Posponer | Falta información | Decisión `deferred` |

El sistema **recomienda** un registro principal con confianza explicable, pero el
administrador puede elegir otro con "Usar como principal". Las contradicciones
(el recomendado no tiene portal, otro tiene más horas, etc.) se listan de forma
explícita en lugar de esconderse.

---

## 4. Passport vs Tenant Worker (modelo conceptual)

- **Tenant Worker** (`employees`) — el registro operativo de una compañía.
  Contiene asignaciones, horas, documentos, nómina y acceso. Nunca cruza tenants.
- **Passport** — la identidad de la persona a nivel ecosistema. Agrupa registros
  de distintas compañías bajo un mismo ser humano.

Fronteras que no se rompen:

1. Un grupo de identidad que abarca dos compañías **nunca** se consolida: se
   modela como un mismo Passport con dos Tenant Workers.
2. El Passport no hereda horas, nómina ni documentos legales del tenant.
3. La consolidación real solo puede ocurrir **dentro** de una compañía.

---

## 5. Qué sigue (Phase 3, no implementado aquí)

- Ejecutor de consolidación con contrato versionado y reversión auditada,
  habilitado únicamente para planes `SAFE`.
- Reasignación puntual de servicios sin horas al registro principal.
- Enlace Passport ↔ Tenant Worker persistido.

---

## 6. Verificación

- Sin migraciones destructivas: solo se creó `employee_identity_reviews`.
- Tipos verificados en verde.
- La pantalla `/app/identity-quality` no expone ningún botón que fusione.
