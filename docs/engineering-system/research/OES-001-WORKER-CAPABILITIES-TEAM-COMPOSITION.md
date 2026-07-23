# OES-001 — Worker Capabilities & Team Composition Assistant

**Tipo:** Organizational Engineering Session — Research & Architecture (read-only)
**Fecha:** 2026-07-23
**Autor:** Principal Architect (Lovable agent)
**Estado:** Propuesta conceptual. **Sin código. Sin migraciones. Sin cambios en RLS, payroll o asignación.**

---

## 0. Contexto y descubrimiento validado

En Quality Staff, el coordinador **no arma equipos seleccionando personas una por una**. Construye un **equipo equilibrado a partir de capacidades distribuidas**. La decisión arranca eligiendo al **capitán**, y desde ahí se completa el equipo cubriendo capacidades faltantes.

Variables observadas que influyen en la decisión:

- Liderazgo (capitán)
- Experiencia con el cliente
- Conocimiento de buffet
- Inglés
- Disponibilidad
- Transporte (vehículo / puede manejar)
- Confiabilidad histórica
- Puntualidad histórica
- Continuidad del equipo (haber trabajado juntos)
- Antigüedad
- Afinidad entre trabajadores
- Distribución de género cuando el evento lo requiere
- Experiencia previa en ese tipo de trabajo

Este sprint documenta cómo el ecosistema podría **representar** estas capacidades sin implementarlas todavía.

---

## 1. Modelo conceptual — "Worker Capabilities"

### 1.1 Principios

1. **No sustituye `employees`.** Las capacidades son una **lente derivada**, no una columna nueva por variable.
2. **Composición sobre atributos.** Cada capacidad es un `{ key, value, confidence, source, computedAt }`.
3. **Trazabilidad.** Toda capacidad declara su fuente (declarada, observada, derivada, importada).
4. **Nunca decide.** Solo informa. La asignación sigue siendo del coordinador.
5. **Reutiliza señales existentes.** Antes de crear datos, se computa desde tablas ya presentes.

### 1.2 Taxonomía propuesta (v0)

Tres familias:

| Familia         | Capacidad             | Tipo         | Origen sugerido (read-only)                                |
| --------------- | --------------------- | ------------ | ---------------------------------------------------------- |
| **Identidad**   | `leadership`          | ordinal 0–3  | `employee_role`, historial como capitán en `shift_assignments` |
|                 | `seniority`           | meses        | `employees.start_date`                                     |
|                 | `english_level`       | ordinal 0–4  | `employees.english_level` (ya existe)                      |
|                 | `driving`             | enum         | `driver_status` derivado (`has_car`, `can_drive`, licencia)|
|                 | `gender_context`      | opcional     | `employees.gender` (solo cuando el evento lo requiere)     |
| **Experiencia** | `client_experience`   | 0–100        | # turnos completados por `client_id`                       |
|                 | `service_experience`  | 0–100        | # turnos por `service_category_id` / tipo de trabajo       |
|                 | `buffet_knowledge`    | boolean+meta | tag / skill declarada + observada en `service_categories`  |
|                 | `special_skills`      | set          | `employees.skills`, `certifications` (ya existen)          |
| **Comportamiento** | `reliability`      | 0–100        | motor existente `computeWorkforceScore` (`reliability`)    |
|                 | `punctuality`         | 0–100        | motor existente (`punctuality`)                            |
|                 | `attendance_confidence` | 0–100      | derivado no-shows/lates últimos 60d                        |
|                 | `team_continuity`     | pares        | co-ocurrencia en `shift_assignments` (mismos turnos)       |
|                 | `affinity`            | pares        | subset de `worker_client_preferences` + continuity         |
|                 | `availability`        | ventana      | `useWorkerAvailability`, `useEmployeeAvailability`         |

Nada de lo anterior requiere una tabla nueva **hoy**. Todo se puede materializar en una **vista lógica** (TypeScript en `src/core/`) que compone desde el `Core Engine` ya existente (`WorkerReputation`, `MatchCandidate`).

### 1.3 Forma del objeto (solo tipo, no implementación)

```ts
type CapabilityKey =
  | "leadership" | "seniority" | "english_level" | "driving" | "gender_context"
  | "client_experience" | "service_experience" | "buffet_knowledge" | "special_skills"
  | "reliability" | "punctuality" | "attendance_confidence"
  | "team_continuity" | "affinity" | "availability";

interface WorkerCapability {
  key: CapabilityKey;
  value: number | string | boolean;
  confidence: number;               // 0–1 — qué tan sólida es la señal
  source: "declared" | "observed" | "derived" | "imported";
  computedAt: string;               // ISO
}

interface WorkerCapabilityProfile {
  employeeId: string;
  companyId: string;
  capabilities: WorkerCapability[];
  computedAt: string;
}
```

Esto extiende `WorkerReputation` (ya definido en `src/core/types.ts`) sin reemplazarlo.

---

## 2. Dónde mostrarlo en el flujo actual (sin pantallas nuevas)

La regla es **no inflar la carga cognitiva del coordinador**. Se aprovechan superficies existentes:

| Superficie existente                             | Qué mostrar                                                                 | Cómo                                                        |
| ------------------------------------------------ | --------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `ShiftRouteHeader` (turno abierto)               | Chip resumen: **cobertura de capacidades** del equipo actual (ej. 6/10)     | badge discreto, click → drawer de composición               |
| Dispatch / candidate list (`getCandidatesForShift`) | Reasons enriquecidas con capacidades ("Buffet ✓ · English ✓ · Puntual 94") | usar `MatchCandidate.reasons` — ya existe                   |
| `WorkerPreferenceBadge`                          | Añadir badges de capacidad ("Captain", "Buffet", "Driver")                  | mismo componente, nuevas variantes                          |
| Portal admin — ficha del worker                  | Sección "Capacidades" (read-only) bajo el bloque de reputación              | tab existente en worker profile                             |
| Shift Ops — bloque STAFFING                      | Alerta "faltan capacidades: liderazgo, inglés" cuando la fase lo permita    | ampliar `AttendanceEvidenceCard` / staffing block existente |

**No se crea pantalla nueva en fase 1.** Solo se enriquecen las que ya existen.

---

## 3. Team Composition Assistant — wireframe conceptual (futuro)

Solo cuando fase 1 y 2 estén validadas. **Asiste, no recomienda automáticamente.**

```text
┌───────────────────────────────────────────────────────────────────┐
│ Shift · Hamaspick · Jul 27 · 18:00 → 23:00                        │
├───────────────────────────────────────────────────────────────────┤
│ CAPTAIN                                                            │
│  [ María R. ✓ ]   Confiabilidad 96 · Cliente ✓ · Buffet ✓         │
│  [ elegir otro ]                                                   │
├───────────────────────────────────────────────────────────────────┤
│ TEAM COVERAGE (8 / 10 slots)                                       │
│                                                                    │
│  Leadership          ██████████ 1 capitán confirmado               │
│  English             ███░░░░░░░ 1 / 3 requeridos    ⚠ falta       │
│  Buffet knowledge    ███████░░░ 5 / 8                              │
│  Driving             ██████████ 2 conductores        ✓            │
│  Client experience   █████████░ 6 con historial                    │
│  Reliability avg     92                              ✓            │
│  Punctuality avg     88                              ✓            │
│  Team continuity     4 pares ya trabajaron juntos    ✓            │
│                                                                    │
├───────────────────────────────────────────────────────────────────┤
│ RIESGOS                                                            │
│  · 1 worker con 2 no-shows recientes  (revisar)                    │
│  · Cobertura de inglés por debajo del histórico del cliente        │
│                                                                    │
│ CAPACIDADES FALTANTES                                              │
│  · English (necesita 2 más)                                        │
│  · Female presence (evento lo pidió: 3 · actual 1)                 │
│                                                                    │
│  [ Ver candidatos con estas capacidades → ]                        │
└───────────────────────────────────────────────────────────────────┘
```

**Propiedades clave del wireframe:**

- El panel **describe el estado del equipo**, no propone nombres automáticamente.
- El botón "Ver candidatos con estas capacidades" abre la lista de dispatch **ya filtrada**, pero la elección final es humana.
- Sin scoring compuesto opaco: cada capacidad se muestra por separado con su barra.
- Los riesgos son **señales**, no bloqueos.

---

## 4. Impacto técnico

| Área                     | Impacto                                                                          |
| ------------------------ | -------------------------------------------------------------------------------- |
| Base de datos            | **Cero en fase 1.** Todo se deriva de tablas existentes.                         |
| RLS                      | Sin cambios.                                                                     |
| Payroll / Attendance     | Sin cambios. Este módulo es solo lectura.                                        |
| `src/core/`              | Nuevo archivo `worker-capabilities.ts` (fase 2) que compone desde reputation.    |
| `dispatch-engine.ts`     | Solo enriquece `MatchCandidate.reasons`. No cambia scoring ni thresholds.        |
| UI                       | Extensiones a componentes existentes (badges, drawers). Sin rutas nuevas.        |
| Multi-tenant             | Respetado — todo pasa por `companyId` como el resto del Core.                    |

---

## 5. Impacto UX

- **Refuerza el modelo mental real** del coordinador (equipos, no personas sueltas).
- Mantiene la **autoridad humana** — no automatiza decisiones.
- Reduce carga cognitiva mostrando **cobertura agregada**, no listas más largas.
- Riesgo mitigado: capacidades opcionales, ocultables, sin bloquear flujos existentes.

---

## 6. Riesgos

| Riesgo                                                  | Mitigación                                                          |
| ------------------------------------------------------- | ------------------------------------------------------------------- |
| Percepción de "scoring de personas" / sesgo             | Nunca combinar en un único número. Mostrar dimensiones separadas.   |
| Datos derivados poco confiables (sample size bajo)      | Campo `confidence`; ocultar capacidad si `confidence < umbral`.     |
| Género usado fuera de contexto                          | `gender_context` solo se calcula/expone cuando el evento lo pide.   |
| Duplicación con `WorkerReputation` / `MatchCandidate`   | Capabilities compone sobre ellos, no los reemplaza.                 |
| Presión para automatizar asignación                     | Documentar explícitamente: **assist-only**. Sin acción por defecto. |
| Filtraciones de PII (afinidad, preferencias)            | Todo internal-only; nunca expuesto al worker ni al cliente.         |
| Legal — capacidades observadas usadas para desvinculación | Fuera de alcance. Módulo es planning, no HR-action.                |

---

## 7. Plan de implementación en fases

**Fase 0 — Esta sesión (hecho):** propuesta conceptual. Cero código.

**Fase 1 — Read model (1 sprint).**
- `src/core/worker-capabilities.ts`: función `getWorkerCapabilities(companyId, employeeId)` que compone desde datos ya existentes (`WorkerReputation`, `employees`, `shift_assignments`).
- Tipos en `src/core/types.ts`.
- Zero UI. Zero DB.

**Fase 2 — Enriquecer superficies existentes (1 sprint).**
- Reasons enriquecidas en candidate list.
- Badges de capacidad en worker profile admin.
- Chip de cobertura en `ShiftRouteHeader`.

**Fase 3 — Team Composition Drawer (1 sprint).**
- Drawer lateral desde Shift Ops mostrando el wireframe de §3.
- Filtro "ver candidatos con estas capacidades" → reutiliza dispatch engine actual.

**Fase 4 — Señales declaradas (opcional, requiere decisión de producto).**
- Solo entonces evaluar si necesitamos tabla `worker_capability_declarations` para capturar señales que hoy no existen (ej. "buffet ✓ declarado por manager"). Requiere ADR aparte.

**Fase 5 — Team Continuity & Affinity avanzada (opcional).**
- Modelo de pares co-ocurrentes. Requiere volumen histórico y ADR de privacidad.

---

## 8. Trazabilidad con documentación previa

- Reutiliza `src/core/types.ts` — `WorkerReputation`, `MatchCandidate`, `AssignmentSuggestion`.
- Alineado con `docs/architecture/OPERATIONS_PLANNING_CENTER_SPRINT0.md` (modelo centrado en Operaciones).
- Complementa `CAP-001` (dominios Workforce + Scheduling).
- No modifica `MRI-001` (Attendance-to-Payroll).

---

## 9. Observaciones para futuras inspecciones

Registradas aquí para no salir del alcance del sprint actual:

- Backend: eventual RPC `get_worker_capabilities(company_id, employee_id)` si el cómputo TS resulta caro.
- DB: evaluar índice en `shift_assignments (employee_id, shift_id)` para queries de continuity — ya podría existir; verificar en MRI dedicado.
- Seguridad: `gender_context` requiere revisión legal antes de exponerlo en UI.
- Frontend: unificar `WorkerPreferenceBadge` + futuras "Capability badges" bajo un solo átomo.
- Parceros: capacidades públicas (subset) podrían alimentar el perfil público — fuera de alcance hoy.

---

**Fin del documento OES-001.** Sin cambios en `src/`, `supabase/`, `package.json`, `vite.config.*`, `capacitor.*`.
