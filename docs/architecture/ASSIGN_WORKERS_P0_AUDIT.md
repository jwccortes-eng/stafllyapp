# Sprint P0 — Auditoría del flujo Assign Workers

**Fecha:** 2026-07-31 · **Tipo:** Report-only (sin cambios de código, sin migraciones)
**Alcance protegido (no tocado):** auth, RLS, payroll, `time_entries`, `shift_assignments`, `scheduled_shifts`, tenants, payments, chat, edge functions, partner logic, producción.

---

## 0. Hallazgo crítico (leer primero)

El bloqueo que se observa en operación **no es un bug de UI: es una política caducada**.

`public.get_employee_shift_readiness()` concede `grace_period` solo si:

```
_grace_start = 2026-05-10  ·  _grace_days = 60  →  vence 2026-07-09
_eligible_companies = [Quality Staff by Keury, My Staff Solution, JKitchen Staff]
```

Hoy es **2026-07-31**: la ventana venció hace 22 días. Desde el 10 de julio, **todo worker cuyo `profile_status` sea `incomplete` o `pending_documents` devuelve `incomplete_blocked`** y el trigger `enforce_employee_ready_for_shift` lanza `EMPLOYEE_NOT_READY` al confirmar.

Magnitud real medida en la base (workers activos):

| Compañía | incomplete | pending_documents | ready/active |
|---|---|---|---|
| Quality Staff by Keury | 223 | 6 | 4 |
| My Staff Solution LLC | 69 | 1 | 0 |
| Parceros | 184 | 0 | 0 |
| JKitchen Staff | 15 | 2 | 0 |

**175 workers distintos** con estado `incomplete`/`pending_documents` **ya trabajaron turnos confirmados/completados en los últimos 180 días**. Es decir: la evidencia operacional existe, pero el sistema los trata como no aptos.

Conclusión: el sistema **mezcla evidencia administrativa con capacidad operativa**, exactamente el patrón descrito en el discovery de OAI.

---

## FASE 1 — Auditoría

### 1.1 Mapa del flujo de asignación

```text
UI DESKTOP                          UI MOBILE
Shifts.tsx                          MobileShiftsView
  └ ShiftDetailDialog                 └ MobileShiftOperationsSheet
      ├ EmployeeCombobox                  └ MobileShiftTeamHub
      ├ SingleEmployeePicker                  ├ Recomendados (candidatos)
      ├ ShiftTeamPanel                        ├ Solicitudes (claims)
      └ ShiftRoleSlotsTeamPanel               └ MobileTeamActionDialog
            │                                        │
            └──────────────┬─────────────────────────┘
                           ▼
        A) INSERT directo en shift_assignments (desktop)
        B) RPC assign_worker_to_shift (móvil / manage team)
                           ▼
        TRIGGER enforce_employee_ready_for_shift  ← punto único de bloqueo
                           ▼
        get_employee_shift_readiness(employee, company)
                ├ is_active=false            → 'inactive'
                ├ profile_status ready/active→ 'ready'
                ├ company en allowlist Y hoy ≤ 2026-07-09 → 'grace_period'
                └ resto                      → 'incomplete_blocked'   ⛔
                           ▼
        has_active_assignment_override(shift, employee)  ← escape hatch manual
                           ▼
        compute_employee_profile_status(employee)
                └ get_required_documents_for_company(company)  → ['w9','id'] (+drivers_license si can_drive)
```

### 1.2 Archivos involucrados

**Backend (DB — no modificado en este sprint)**
| Objeto | Rol |
|---|---|
| `enforce_employee_ready_for_shift()` (trigger) | Único enforcement real. Bloquea al pasar a `confirmed`/otros; deja pasar `pending`, `review`, `rejected`, `removed`, drafts y shifts en `draft`. |
| `get_employee_shift_readiness()` | Fuente única del veredicto. Contiene la política de gracia caducada y una allowlist de compañías **hardcodeada**. |
| `compute_employee_profile_status()` | Calcula `incomplete → pending_documents → ready → active`. Solo documentos **approved** cuentan. |
| `get_required_documents_for_company()` | Default `['w9','id']`, override por `company_settings.onboarding_required_documents`. |
| `has_active_assignment_override()` + `shift_assignment_admin_overrides` | Bypass por (shift, employee) con expiración/revocación. Único mecanismo de desbloqueo actual. |
| `assign_worker_to_shift()` (RPC) | Valida company match, `is_active`, readiness, duplicado; inserta `pending` + notificación + audit log. |

**Frontend**
| Archivo | Rol |
|---|---|
| `src/components/shifts/ShiftDetailDialog.tsx` (1.684 líneas) | Panel de asignación desktop. `unassigned = employees.filter(!assigned)` — **no filtra por compliance** (correcto). |
| `src/components/shifts/EmployeeCombobox.tsx` (888 líneas) | Buscador; deriva readiness de `profile_status`, `disabled={isHardBlocked}`. |
| `src/components/shifts/mobile/MobileShiftTeamHub.tsx` (2.200 líneas) | Hub móvil de 5 pestañas; `computeReadiness()` duplica la lógica SQL en TS. |
| `src/components/shifts/mobile/MobileTeamActionDialog.tsx` | Traduce `EMPLOYEE_NOT_READY` a copy de usuario. |
| `src/lib/shifts/readiness-grace.ts` | **Espejo manual** de las constantes SQL (fecha, días, allowlist de UUIDs). |
| `src/lib/onboarding/profile-status.ts` · `required-documents.ts` | Segundo espejo de las reglas de documentos. |
| `src/hooks/useEmployeeReadiness.tsx` | Tercer cálculo, con un parche explícito por `profile_status` obsoleto en DB. |
| `src/lib/import/assignment-failures.ts` | Clasificación de errores en imports masivos. |
| `src/pages/admin/AssignmentOverrides.tsx` (746 líneas) | Gestión de overrides. |

**Deuda estructural:** la misma regla vive en **4 lugares** (SQL + 3 espejos TS). Ya divergieron: `useEmployeeReadiness` reescribe el estado del backend porque no confía en él.

### 1.3 Condiciones que generan bloqueo

| # | Condición | Dónde | Efecto |
|---|---|---|---|
| 1 | `employee_id` inexistente | trigger / RPC | Error duro |
| 2 | `employees.is_active = false` | trigger / RPC | Error duro |
| 3 | `employee.company_id ≠ shift.company_id` | trigger / RPC | Error duro |
| 4 | Ya asignado (activo) | RPC / unique | Error duro |
| 5 | Solape horario | trigger de overlap | Error duro |
| 6 | `profile_status = incomplete` (falta 1 de 10 campos personales) | readiness | **Bloqueo** |
| 7 | `profile_status = pending_documents` (falta W-9, ID o licencia) | readiness | **Bloqueo** |
| 8 | Documento subido pero `review_status ≠ approved` | `compute_employee_profile_status` | **Bloqueo** (RRHH es el cuello de botella, no el worker) |
| 9 | Compañía fuera de la allowlist hardcodeada | readiness | **Bloqueo** sin ruta de configuración |
| 10 | Ventana de gracia vencida (2026-07-09) | readiness | **Bloqueo global desde esa fecha** |
| 11 | `onboarding_status` pendiente | solo UI móvil | Advertencia |
| 12 | Sin teléfono | solo UI móvil | Advertencia |

### 1.4 Clasificación

**Bloqueos operativos legítimos** (mantener duros): 1, 2, 3, 4, 5.
Motivo: son imposibilidades físicas o de integridad de tenant. Ninguno depende de papeleo.

**Bloqueos legales reales** (deben existir — hoy **no existen**): licencia obligatoria vencida, certificación exigida por el cliente, autorización de trabajo expirada, requisito de sitio/ubicación.
Hallazgo: **el sistema no modela ninguno**. No hay requisitos por cliente ni por ubicación, no hay fechas de expiración operativas por documento. Se compensa bloqueando *todo*, que es exactamente el falso positivo que rompe la operación.

**Advertencias mal clasificadas como bloqueos** (6, 7, 8, 9, 10): W-9 pendiente, dirección incompleta, SSN last4 faltante, ID en revisión. Ninguna impide físicamente trabajar; son deuda administrativa. Hoy detienen la operación.

**Advertencias ya correctas**: 11, 12.

---

## FASE 2 — Propuesta de arquitectura de estados

Separación estricta en dos ejes independientes que **nunca** se colapsan en un solo campo:

### Operational Status — «¿puede participar en esta operación?»

```
active           → puede ser asignado
conflicted       → solape con otro turno (contextual al turno)
already_assigned → ya está en este turno
inactive         → archivado / baja
legally_blocked  → requisito legal duro incumplido y verificado
```
Solo `legally_blocked`, `inactive`, `conflicted` y `already_assigned` bloquean. Se calcula **por turno** (persona × rol × cliente × ubicación × fecha), no por persona en abstracto.

### Compliance Status — «¿qué documentación le falta?»

```
compliant             → sin pendientes
pending_review        → documento subido, esperando a RRHH
missing_administrative→ W-9, dirección, SSN last4… (nunca bloquea)
missing_legal         → licencia/certificación exigida (alimenta legally_blocked)
expiring_soon         → vence en ≤ 30 días (nunca bloquea)
expired_legal         → vencido y exigido → legally_blocked
```

**Regla invariante:** solo `missing_legal` y `expired_legal` pueden proyectarse al eje operativo. Todo lo demás es advertencia visible y accionable, jamás un bloqueo.

**Qué implica:** el requisito legal deja de ser «tiene todos sus documentos» y pasa a ser «el cliente/ubicación/rol de *este* turno exige X, y X no está vigente». Requiere modelar requisitos por cliente/rol — hoy inexistentes. Mientras no existan, **por defecto no hay bloqueo legal**, solo advertencias. Esa es la corrección que devuelve la operación a la realidad.

**Compromiso operacional:** al asignar con pendientes administrativos, se registra quién autorizó, qué falta y para cuándo. Conecta directamente con el `OPERATIONAL_COMMITMENT_CONTRACT` ya aprobado (OAI) y convierte el override manual actual en el camino normal, auditado.

**Consolidación:** una sola fuente de verdad. La función SQL decide; el frontend consume el veredicto. Se eliminan los tres espejos TS y las allowlists de UUIDs hardcodeadas, que pasan a `company_settings`.

---

## FASE 3 — Experiencia de usuario (Assign Workers)

### Conteo de clics actual (desktop, asignar 1 worker)

1. Abrir turno → `ShiftDetailDialog`
2. Bajar a la sección de equipo
3. Clic en «Agregar» / abrir panel de asignación
4. Clic en el combobox
5. Escribir el nombre
6. Seleccionar el worker
7. Clic en confirmar/agregar
8. (Si bloquea) leer error → abrir Assignment Overrides → crear override → volver → repetir

**7 pasos en el camino feliz; 12+ con bloqueo.** El diálogo tiene 1.684 líneas y ~8 secciones compitiendo por atención antes de llegar a asignar.

### Qué sobra
- Estado de compliance mostrado como veredicto binario sin decir qué falta.
- Paneles de mapa, QR, rides, chat, auditoría y timeline visibles durante el acto de asignar.
- Duplicación entre `EmployeeCombobox`, `SingleEmployeePicker` y `ShiftTeamPanel`.
- El texto de error `EMPLOYEE_NOT_READY: … Estado: incomplete, onboarding: …` expone vocabulario de base de datos.

### Qué falta
- Qué documento exacto falta y quién debe actuar (worker vs RRHH).
- Un botón de asignar-con-advertencia en el mismo lugar del error, en vez de un viaje a otra pantalla.
- Señal de historial: «trabajó aquí 12 veces» pesa más que «le falta el W-9». (El hub móvil ya lo calcula; el desktop no lo usa.)

### Flujo propuesto (3 pasos)
1. Abrir turno → **Asignar** es la acción primaria, siempre visible.
2. Lista de candidatos ordenada por historial en la ubicación/cliente, con advertencias inline en la fila.
3. Tap/clic para asignar. Si hay pendientes administrativos: se asigna y se muestra un aviso con acción («Recordar documentos») — no un muro.
   Solo un bloqueo legal verificado abre un diálogo que explica qué requisito, quién lo exige y qué se necesita para levantarlo.

---

## FASE 4 — Mobile UX

Auditoría de `MobileShiftTeamHub.tsx` (2.200 líneas, 5 pestañas):

| Aspecto | Estado | Observación |
|---|---|---|
| Áreas táctiles | ⚠️ | Chips de readiness de **18 px** de alto con `title` como único portador de la explicación — el tooltip no existe en táctil: la razón del bloqueo es **inaccesible en móvil**. |
| Tamaño de texto | ⚠️ | `text-[10px]` / `text-[10.5px]` en información crítica; por debajo del mínimo legible recomendado. |
| Densidad | ⚠️ | 5 pestañas + chips + resúmenes + helpers por fila; el usuario debe leer 3 líneas para decidir un tap. |
| Navegación | ⚠️ | Asignar exige elegir pestaña correcta («Recomendados») sin acción primaria persistente. |
| Botones | ⚠️ | Sin barra de acción fija; la acción principal se pierde al hacer scroll. |
| Copy | ⚠️ | Mezcla español/inglés (`GRACE_HELPER` en inglés dentro de UI en español). |

Objetivo: acción primaria fija, filas de ≥56 px, texto crítico ≥12 px, explicación de advertencia expandible con tap (no tooltip), y una sola pestaña por defecto.

---

## Riesgos identificados

| Riesgo | Nivel | Mitigación |
|---|---|---|
| Relajar el trigger permite asignar a alguien legalmente inhabilitado | **Alto** | No relajar en abstracto: introducir primero `missing_legal` explícito. Sin requisito legal modelado, no hay bloqueo legal que perder — hoy tampoco existe. |
| Perder trazabilidad de quién autorizó con pendientes | Alto | Compromiso operacional obligatorio + `shift_audit_log` (ya existe). |
| Divergencia SQL ↔ espejos TS | Alto (ya materializado) | Fuente única en SQL; el frontend solo renderiza. |
| Allowlist de compañías hardcodeada en SQL y TS | Medio | Mover a `company_settings`. |
| Ventana de gracia vuelve a vencer en silencio | Medio | Sin fecha de corte global; política por compañía, no por constante. |
| Tocar `shift_assignments`/payroll por accidente | Alto | Fases 1–2 son UI y política de readiness; sin cambios en payroll, `time_entries` ni columnas de assignments. |
| RRHH deja de procesar documentos al desaparecer el bloqueo | Medio | Panel de pendientes + vencimiento del compromiso visible en Shift Ops. |

---

## Plan de implementación por fases

**P0.1 — Desbloqueo inmediato (sin cambio estructural).**
Sustituir la ventana de gracia caducada por una política por compañía en `company_settings`, sin fecha de corte global. Efecto: los 175 workers con historial real vuelven a ser asignables hoy. Cambio acotado a `get_employee_shift_readiness`; sin tocar payroll ni assignments.

**P0.2 — Separación de ejes (UI-only).**
Helper puro `src/lib/assignment/operational-status.ts` que devuelve `{ operational, compliance, warnings[] }`. Consumido por desktop y móvil. Cero writes.

**P0.3 — Advertencias accionables.**
Cada advertencia responde: qué falta · por qué · quién actúa · acción sugerida. Reemplaza chips con tooltip por filas expandibles.

**P0.4 — Rediseño móvil.**
Acción primaria fija, filas ≥56 px, tipografía ≥12 px, una pestaña por defecto, copy unificado en español.

**P0.5 — Requisitos legales reales.**
Modelar requisitos por cliente/ubicación/rol con vigencia. Solo entonces `legally_blocked` tiene contenido verdadero.

**P0.6 — Compromiso operacional.**
Sustituir `shift_assignment_admin_overrides` (excepción manual) por el compromiso auditado del contrato OAI.

**P0.7 — Consolidación.**
Eliminar los tres espejos TS de la política de readiness.

---

## Escenarios QA esperados

| Caso | Esperado | Estado hoy |
|---|---|---|
| 1. Worker con documentos pendientes | Advertencia, no bloqueo | ❌ Bloqueado |
| 2. Worker con bloqueo legal | Bloqueo con motivo claro | ❌ No modelado |
| 3. Asignación móvil | Menos pasos | ❌ 5 pestañas, sin acción primaria |
| 4. Toda advertencia explica qué/por qué/acción | Sí | ❌ Solo `title` tooltip, inaccesible en táctil |

---

## Recomendación

Ejecutar **P0.1 de inmediato** (bloqueo activo en producción para prácticamente toda la fuerza laboral desde el 2026-07-09) y luego P0.2–P0.4 como sprint UI. P0.5–P0.7 requieren decisión arquitectónica alineada con OAI.
