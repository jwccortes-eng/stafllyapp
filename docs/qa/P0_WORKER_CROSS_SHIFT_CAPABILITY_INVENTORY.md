# P0 — WORKER CROSS-SHIFT CAPABILITY INVENTORY

**Modo:** AUDIT ONLY · ZERO WRITES · sin migraciones, sin cambios de UI, sin cambios de datos.
**Fecha:** 2026-08-18 · **Tenant auditado:** Quality Staff by Keury (`00000000-…-0001`)
**Disparador:** Juliana Quintero relacionada con dos servicios el 2026-08-18.

---

## 1. Executive verdict

**Stafly SÍ tiene el motor de conflicto cross-shift, y funciona — pero solo en dos puntos del
sistema, y no es visible en ninguna superficie centrada en la persona.**

- El **backend ya bloquea de forma dura** el doble booking con solapamiento real:
  trigger `trg_prevent_overlapping_shift_assignments` sobre `shift_assignments`.
- El **frontend ya calcula overlaps por candidato** (`useRecommendationSignals` +
  `rankCandidate`), pero **solo dentro del selector de staffing de un servicio concreto**.
- **No existe** ninguna vista "agenda del día de la persona", ni badge de "N servicios hoy",
  ni detección de conflicto en Command Center / Ops Cockpit, ni validación de conflicto
  en el flujo de **claim / shift_requests** (ni al solicitar ni al aprobar).

Diagnóstico correcto para el caso Juliana: **no hay doble booking**. Hay
**dos asignaciones válidas, sin solapamiento** (09:00–09:01 y 17:30–23:00) más un
**request pendiente para otra fecha**. El fallo es de **contexto y presentación**, no de datos.

Veredicto: 🟡 **Capacidad existente pero desconectada.** Construir un "conflict engine" nuevo
sería crear un tercer silo.

---

## 2. Qué tenemos hoy

| Pieza | Ubicación | Qué hace |
|---|---|---|
| `prevent_overlapping_shift_assignments()` | DB trigger sobre `shift_assignments` (BEFORE) | Rechaza con excepción cualquier assignment cuyo turno solape en tiempo con otro turno del mismo empleado, misma fecha, estado ≠ `rejected/removed`, turno no borrado. |
| `assign_worker_to_shift()` | RPC | Valida tenant, empleado activo, compliance (`get_employee_assignment_status`), override, y **duplicado exacto** (`already_assigned`). Delega el overlap al trigger. |
| `useRecommendationSignals` | `src/hooks/useRecommendationSignals.ts` | Carga por candidato: disponibilidad (`employee_availability_config` / `_overrides`), historial cliente/venue, reviews, preferencias, y **otros turnos del mismo día con cálculo real de solape** (incluye turnos que cruzan medianoche). |
| `rankCandidate` | `src/lib/shifts/worker-recommendation.ts` | Convierte esas señales en score; `conflict` resta 40 pts y fuerza `canAssign=false`. |
| UI de conflicto | `SmartStaffingPanel.tsx` ("Turno solapado ese día"), `MobileShiftTeamHub.tsx` (chip "Conflicto", tono caution, filtro "sin riesgo") | Único lugar donde el usuario ve el conflicto. |
| Disponibilidad declarada | `employee_availability_config`, `employee_availability_overrides`, `worker_service_zones`, `worker_schedule_preferences`, `worker_travel_preferences`; `MyAvailability.tsx`, `EmployeeAvailabilitySection.tsx`, `useEmployeeAvailability`, `useWorkerAvailability` | Preferencias del worker; sí alimentan el ranking, no bloquean. |
| Unicidad de request | índice `shift_requests_shift_id_employee_id_key` | Impide dos solicitudes al mismo turno. |
| `time_entries` overlap | `prevent_overlapping_time_entries()` (trigger) + `detectTimeEntryOverlaps.ts` (diagnóstico read-only) | Protege el reloj real, independiente del schedule. |

---

## 3. Qué no tenemos

- **Agenda diaria de la persona** (una vista con todos sus servicios de un día). No existe.
- **Badge "N servicios hoy"** en perfil, roster, tarjeta de servicio o Command Center.
- **Validación de conflicto en claim/request**: el worker puede solicitar un turno que solapa
  con uno ya confirmado; nada lo advierte al solicitar.
- **Revalidación de conflicto al aprobar**: ni `ShiftRequests.tsx` ni `resolve_shift_request()`
  comprueban solapamiento antes de crear el assignment. Solo el trigger lo impide — y lo hace
  con **excepción cruda de Postgres en español**, no como decisión de producto.
- **Concepto de "worker ocupado / no disponible"** en Command Center, Ops Cockpit, DailyOps.
- **Reglas de descanso entre turnos** y **conflicto por viaje/distancia entre venues**: no existen
  (hay zonas de servicio declaradas, pero no se cruzan con la agenda del día).
- **Warning de "turnos contiguos sin holgura"**: no existe (el trigger solo mira solape estricto).
- **Notificaciones de conflicto**: no existen.

---

## 4. Qué existe pero no está conectado

1. `conflictEmpIds` se calcula **solo** cuando ya estás dentro del selector de staffing de un
   servicio. No se expone como servicio reutilizable por persona.
2. El trigger de DB es la única autoridad real, pero **el frontend no anticipa su veredicto**
   fuera del selector: el error llega como excepción de Postgres.
3. `useEmployeeAvailability` / `useWorkerAvailability` existen y tienen datos, pero
   ninguna superficie de admin muestra "hoy está bloqueado / fuera de zona" al asignar
   desde flujos que no pasan por SmartStaffing.
4. `shift_requests` vive en un flujo paralelo (`ShiftRequests.tsx` inserta el assignment
   directamente, sin usar `assign_worker_to_shift`), saltándose las validaciones de
   compliance del RPC.

---

## 5. Trace completo de Juliana (READ ONLY)

Persona canónica Quality Staff: `f3d4334f-231b-49ed-a354-ba8c447f2f2d` · activa · con portal.
(Existe además una ficha homónima en el tenant **Parceros**, `ecb86245-…`, sin portal —
tenant distinto, fuera del alcance operativo de Quality Staff.)

### ASSIGNED / ACCEPTED / CONFIRMED — 2026-08-18

| # | shift_ref | QK raíz | Título | Cliente | Horario | publication | shift status | assignment_id | status | response | accepted_at | draft res. | asistencia | ubicación | time_entry |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | QK-001646 | QK-001646 (raíz, sin padre) | Informacion Pendienre | TABLE 40 | 09:00–09:01 | published | published | dbbb3672… | **confirmed** | **accepted** | 18/08 16:36 UTC | no | pending | `location_id` f4df9755… | **no** |
| 2 | QK-001578 | QK-001578 (raíz, sin padre) | Luminance | LUMINANCE HALL | 17:30–23:00 | published | published | 81d4c48e… | **confirmed** | **accepted** | 18/08 18:01 UTC | no | pending | sin location, sin job_site | **no** |

### REQUESTED (claim pendiente)

| request_id | shift_ref | Título | Fecha | Horario | status | reviewed_by |
|---|---|---|---|---|---|---|
| cae4dcc9… | **QK-001584** | Imperial — Imperial | **2026-09-02** | 17:00–23:00 | **pending** | — |

### REJECTED / CANCELLED / REMOVED
Ninguno para esta persona en el rango auditado.

### Respuestas directas

- **¿Dos assignments activos?** Sí: dos, ambos `confirmed` + `accepted`, ambos en turnos publicados.
- **¿Uno es request?** No en esa fecha. El request pendiente es de **otro servicio y otra fecha** (2026-09-02).
- **¿Los dos son válidos?** Sí. Son servicios distintos, clientes distintos, sin solape.
- **¿Existe overlap?** **No.** 09:00–09:01 vs 17:30–23:00 no se intersecan.
  (Nota operativa separada: QK-001646 dura **1 minuto** y se llama "Informacion Pendienre" —
  claramente un servicio sin definir, no un conflicto.)
- **¿Alguna regla debería haber detectado algo?** El trigger de overlap **sí evaluó** el caso al
  crear el segundo assignment y **lo permitió correctamente**. No hay regla incumplida.
- **¿Stafly lo considera normal, warning o conflict?** **Normal.** No hay estado intermedio:
  hoy sólo existen "bloqueo por solape" y "nada". La categoría "warning por carga/contexto
  del día" no existe en el modelo.

---

## 6. Inventario frontend

| Componente | Archivo | Dónde se usa | Datos que recibe | Activo | Oculto | Incompleto | Reutilizable |
|---|---|---|---|---|---|---|---|
| SmartStaffingPanel | `src/components/shifts/copilot/SmartStaffingPanel.tsx` | Detalle de servicio (desktop) | candidatos + `RecommendationSignals` | Sí | No | Solo dentro de un servicio | **Sí — es el motor visual ya existente** |
| MobileShiftTeamHub | `src/components/shifts/mobile/MobileShiftTeamHub.tsx` | Detalle de servicio (móvil) | idem | Sí | No | idem | Sí |
| `useRecommendationSignals` | `src/hooks/useRecommendationSignals.ts` | los dos anteriores | shift + lista de empleados | Sí | — | Requiere `shift.id`; no funciona "por persona" | **Sí, con refactor de firma** |
| `rankCandidate` / `worker-recommendation.ts` | `src/lib/shifts/worker-recommendation.ts` | idem | señales | Sí | — | Score orientado a "elegir para ESTE turno" | Sí |
| EmployeeCombobox | `src/components/shifts/EmployeeCombobox.tsx` | selectores rápidos | empleados | Sí | — | **No muestra conflicto ni disponibilidad** | Debe consumir el motor |
| WeekByEmployeeView / MonthView | `src/components/shifts/…` | Scheduling | turnos por empleado | Sí | No | Muestra la fila del worker pero **sin marcar solapes ni carga** | **Sí — es lo más cercano a una agenda** |
| EmployeeDayDetailDrawer | `src/components/today/EmployeeDayDetailDrawer.tsx` | Command Center / Hoy | horas y fichajes del día | Sí | No | Es de **horas**, no de servicios; "conflict" ahí = conflicto de versión (VWC), no de agenda | Parcialmente |
| EmployeeAvailabilitySection / MyAvailability | `src/components/EmployeeAvailabilitySection.tsx`, `src/pages/portal/MyAvailability.tsx` | perfil / portal | config + overrides | Sí | No | Declarativo, no cruzado con asignaciones | Sí como insumo |
| ShiftRequests | `src/pages/admin/ShiftRequests.tsx` | Solicitudes | requests + turno | Sí | No | **Solo valida cupos**, no conflicto ni compliance | Debe migrar al RPC |
| PersonStatusMatrix | `src/components/employee/PersonStatusMatrix.tsx` | Perfil | 4 dimensiones de estado | Sí | No | No incluye dimensión "agenda/carga" | Sí como contenedor |

---

## 7. Inventario backend / DB

| Pieza | Qué hace hoy | Qué protege | Qué NO protege |
|---|---|---|---|
| `trg_prevent_overlapping_shift_assignments` | Excepción si el nuevo assignment solapa con otro del mismo empleado, misma fecha | Doble booking con solape real, en **cualquier** ruta de escritura (UI, RPC, import, request approval) | Turnos que cruzan medianoche a **otra fecha** (compara solo `date` igual); descansos; viajes; contigüidad; solo compara turnos, no `time_entries` |
| `assign_worker_to_shift(...)` | Tenant, empleado activo, compliance/override, duplicado exacto, auditoría, notificación | Asignación inválida por identidad/compliance | No evalúa agenda del día ni disponibilidad declarada |
| `versioned_assignment_transition` / `set_shift_assignment_state` | Transiciones VWC con `expected_updated_at` | Lost update | Nada de conflicto de agenda |
| `resolve_shift_request(...)` | Aprueba/rechaza request y crea assignment | Estado del request, permisos de tenant | **No revalida conflicto ni compliance**; el bloqueo llega solo desde el trigger |
| `ShiftRequests.tsx` (`handleApprove`) | Cuenta cupos e inserta assignment directo | Sobre-cupo (con conteo laxo: cuenta también `rejected/removed`) | Conflicto, compliance, identidad |
| `shift_requests_shift_id_employee_id_key` | Único (shift, employee) | Solicitudes duplicadas al mismo turno | Solicitudes a turnos distintos que solapan |
| `shift_assignments` constraints | PK, FKs, CHECK de status/attendance | Integridad referencial y de estados | **No hay UNIQUE (shift_id, employee_id)** — el duplicado exacto solo lo evita el RPC |
| `prevent_overlapping_time_entries` | Excepción en fichajes solapados | Integridad del reloj real (base de payroll) | No relaciona el fichaje con la agenda programada |
| `employee_availability_config` / `_overrides` | Disponibilidad declarada por día/semana | Nada (informativo) | No bloquea ni advierte fuera de SmartStaffing |
| `get_employees_assignment_status` | Veredicto de asignabilidad por persona (identidad/compliance) | Asignar a alguien no apto | **No incluye la dimensión agenda/ocupación** |

---

## 8. Validaciones actuales por momento del flujo

**A. Admin abre un servicio** — la query carga **solo** los assignments de ese shift
(`ShiftDetailDialog`, `staffing-metrics`). No conoce otros turnos del worker. ❌

**B. Admin busca/agrega un worker** —
disponibilidad: ✅ (config + overrides) ·
otros assignments del día: ✅ ·
overlap: ✅ (cálculo real, medianoche incluida) ·
"ocupado": ✅ como chip "Conflicto" ·
warnings: ✅ — **pero solo en SmartStaffingPanel / MobileShiftTeamHub**. En `EmployeeCombobox`
y otros atajos de asignación: ❌ nada.

**C. Guardar un assignment** — validación backend: ✅ trigger (dura) ·
RPC: ✅ `assign_worker_to_shift` (compliance + duplicado) ·
constraint: ⚠️ no hay UNIQUE por (shift, employee) ·
¿puede quedar asignado dos veces al mismo horario? **No** con solape; **sí** el mismo día sin solape (correcto).

**D. Worker hace Claim / Request** — ❌ nada: no valida otro servicio, ni overlap, ni
disponibilidad, ni capacity real, ni assignment existente. Solo el índice único por turno.

**E. Admin aprueba un request** — ❌ no revalida conflicto. Solo cuenta cupos (y los cuenta mal:
incluye `rejected`/`removed`). Si hay solape, la aprobación **falla con excepción de Postgres**
sin mensaje de producto.

**F. Command Center / Ops Cockpit** — ❌ no existe ningún concepto de scheduling conflict,
worker conflict, double booking, worker unavailable ni overlapping assignments.

---

## 9. Blast radius — Quality Staff (read only)

| Métrica | Resultado |
|---|---|
| Workers con **>1 relación de shift el mismo día** | **97 workers**, 683 pares día/worker |
| Workers con **>1 assignment activo el mismo día** | los mismos 97 (todas las relaciones contadas son activas: status ∉ `rejected/removed`) |
| **Overlaps reales** (intersección horaria) | **0** ✅ |
| **Duplicate assignments al mismo shift** | **0** ✅ |
| Workers **confirmados en shifts superpuestos** | **0** ✅ |
| Requests pendientes de workers que ya tienen assignment activo **ese mismo día** | **3** |
| `time_entries` abiertas (sin `clock_out`) en el tenant | **2** |

Ejemplo representativo: Juliana Quintero — QK-001646 (09:00–09:01, TABLE 40) + QK-001578
(17:30–23:00, LUMINANCE HALL), ambos válidos, más request pendiente en QK-001584 (2026-09-02).

**Lectura:** la integridad de datos está sana. El volumen (97 workers con múltiples servicios/día)
confirma que la multiplicidad es **normal operativa**, no anomalía — lo que falta es **contexto**.

---

## 10. Matriz EXISTE / PARCIAL / NO EXISTE

| Capacidad | Existe | Parcial | No existe | Backend | Frontend | Activa | Usada |
|---|---|---|---|---|---|---|---|
| Worker availability (declarada) | ✅ | | | ✅ | ✅ | ✅ | Solo ranking |
| Overlap detection | ✅ | | | ✅ trigger | ✅ hook | ✅ | Solo staffing |
| Double-booking prevention | ✅ | | | ✅ | ⚠️ | ✅ | Todas las rutas |
| Cross-shift context (persona) | | ⚠️ | | ⚠️ dato disponible | ❌ | ❌ | No |
| Daily worker agenda | | | ❌ | | | | |
| Claim conflict validation | | | ❌ | | | | |
| Assignment conflict validation | ✅ | | | ✅ | ⚠️ solo 2 pantallas | ✅ | Sí |
| Request approval conflict revalidation | | ⚠️ (vía trigger, sin UX) | | ⚠️ | ❌ | ⚠️ | Involuntaria |
| Conflict warning UI | | ⚠️ | | | ✅ 2 componentes | ✅ | Local |
| Command Center conflict visibility | | | ❌ | | | | |
| Worker workload context (# servicios/día, horas) | | | ❌ | | | | |
| Rest period / travel conflict | | | ❌ | | | | |
| Conflict notifications | | | ❌ | | | | |

---

## 11. Riesgos actuales

1. **Riesgo UX/operativo (el del caso):** el admin no puede ver la jornada completa de una
   persona sin recorrer varias pantallas. 97 workers están hoy en esa situación.
2. **Riesgo de error crudo:** aprobar un request con solape produce una excepción de Postgres
   en español, no un mensaje de producto. Falla segura, pero opaca.
3. **Riesgo de bypass de compliance:** `ShiftRequests.tsx` inserta assignments sin pasar por
   `assign_worker_to_shift` — se salta compliance, override y auditoría.
4. **Riesgo de conteo de cupos:** el conteo de plazas en la aprobación incluye assignments
   `rejected`/`removed`, pudiendo bloquear aprobaciones legítimas.
5. **Riesgo de turnos nocturnos:** el trigger compara `date` exacta; un turno 22:00–06:00 y otro
   al día siguiente 05:00–09:00 no se detectan como solape.
6. **Riesgo de silo:** dos fuentes de verdad de "conflicto" (trigger SQL vs cálculo TS del hook)
   ya conviven. Añadir una tercera lo convertiría en inmanejable.

---

## 12. Qué se puede reutilizar / qué NO duplicar

**Reutilizar:**
- `useRecommendationSignals` + `rankCandidate` como base del contexto cross-shift (ya calculan
  overlap con medianoche y disponibilidad).
- `prevent_overlapping_shift_assignments` como **autoridad final** — no debe tocarse.
- `WeekByEmployeeView` como esqueleto de agenda por persona.
- `PersonStatusMatrix` como contenedor natural de una quinta dimensión "AGENDA / CARGA".
- `assign_worker_to_shift` como única puerta de escritura.

**NO duplicar:**
- No crear una nueva tabla de disponibilidad ni de conflictos.
- No crear un "conflict engine" nuevo: hay que **unificar** los dos existentes, no sumar un tercero.
- No crear un badge propio por pantalla: el veredicto debe venir de una única función.
- No crear un RPC nuevo de validación antes de intentar reutilizar `assign_worker_to_shift` +
  el veredicto ya emitido por el trigger.

---

## 13. Respuesta a la pregunta principal

> ¿Ya tenemos motor, o falta construirlo, o hay implementaciones parciales desconectadas?

**Hay implementaciones parciales desconectadas, con el núcleo ya resuelto.**
El bloqueo duro existe y funciona (0 overlaps reales en producción lo demuestra). El cálculo
enriquecido existe y funciona. Lo que falta no es un motor: falta **(a)** exponer ese motor
como lectura "por persona / por día" en vez de "por servicio", y **(b)** distinguir
`conflict` (bloqueo) de `context` (dos servicios válidos el mismo día → informar, no alarmar).

Riesgo explícito de silo: ya existen **dos** definiciones de overlap (SQL y TypeScript).
Cualquier trabajo futuro debe consolidarlas en una sola fuente antes de añadir UI.

---

## 14. Próximo paso arquitectónico recomendado (NO implementado)

Un único **Worker Day Context** de lectura, sin tablas nuevas:

1. Una función de DB `SECURITY DEFINER` de solo lectura que, dada `(employee_id, date_range)`,
   devuelva sus servicios, estados, requests pendientes, disponibilidad declarada, fichajes
   abiertos y el veredicto por par: `ok | context | conflict`, **usando exactamente el mismo
   predicado de solape del trigger** (extraído a una función compartida, sin cambiar su comportamiento).
2. Un adapter frontend único que sustituya el cálculo local del hook y alimente:
   selector de staffing, perfil de persona, tarjeta de servicio, portal y Command Center.
3. Semántica de tres niveles, no dos: `conflict` = solape (bloquea, ya lo hace el trigger);
   `context` = varios servicios el mismo día sin solape (informa: "2 servicios hoy · 09:00 y 17:30");
   `ok` = nada que decir.
4. Cerrar la brecha de `ShiftRequests.tsx`: aprobar debe pasar por `resolve_shift_request` /
   `assign_worker_to_shift` y anticipar el veredicto antes de escribir.

Payroll no participa: sigue leyendo exclusivamente `time_entries` / validaciones aprobadas.

---

## 15. Confirmación explícita — ZERO WRITES

Esta auditoría ejecutó **únicamente** sentencias `SELECT` y lecturas de archivos.
No se crearon, modificaron ni eliminaron: assignments, requests, turnos, fichajes,
disponibilidad, notificaciones, roles, políticas RLS, funciones, triggers ni tablas.
No se ejecutaron migraciones. No se cambió UI ni lógica. No se enviaron notificaciones.
No se cruzaron fronteras de tenant: los censos se limitan a Quality Staff; la ficha homónima
en Parceros se menciona solo como hecho de identidad, sin exponer sus datos operativos.
El único artefacto creado es este documento.
