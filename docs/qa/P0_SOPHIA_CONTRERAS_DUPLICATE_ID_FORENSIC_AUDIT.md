# P0 — SOPHIA CONTRERAS · AUDITORÍA FORENSE DE ID DUPLICADO (SOLO LECTURA)

Fecha: 2026-08-11 · Alcance: lectura de base de datos + trazado de código.
**Cero cambios**: no se fusionó, no se borró, no se modificó ningún registro.

---

## 1. ¿Cuántos registros existen para Sophia?

El sistema **no tiene** tablas `person`, `worker` ni `staff`. El modelo real es:
`employees` (registro operativo por empresa) → `employees.user_id` (cuenta de acceso)
→ `profiles` (perfil de esa cuenta).

| Capa | Cantidad | Detalle |
|---|---:|---|
| person | 0 tablas — **no existe** capa persona | la identidad de persona solo se infiere en runtime (`src/lib/identity/person-truth.ts`) |
| worker | 0 tablas — **no existe** entidad Worker separada | "worker" = fila de `employees` |
| employee | **4** filas | 1073, 1204, 1225 (Quality Staff) + 1 clon en otra empresa |
| auth user | **1** | `27a62131-6459-4d8b-8fb7-0c98a30d4ae4` |
| portal user (`profiles`) | **1** | `6602007e-…`, email interno `emp_9294168269@employee.internal` |

---

## 2. Todos los IDs

| Campo pedido | 1073 (perfil) | 1204 (selector) | 1225 | clon otra empresa |
|---|---|---|---|---|
| person_id | — (no existe la capa) | — | — | — |
| worker_id | — (no existe la capa) | — | — | — |
| employee_id | `b21476e3-8048-416b-b552-bdfdc0308a07` | `ef96e166-7724-49f9-8eb9-7b5969af321f` | `f5a6230d-51e2-47a2-87c1-0563b230750e` | `511ba843-c028-4676-a295-e05af2225668` |
| staff_id (`employer_identification`) | `1073` → ST-01073 | `1204` → ST-01204 | `1225` | (vacío) |
| auth_user_id (`employees.user_id`) | `27a62131-6459-4d8b-8fb7-0c98a30d4ae4` | **null** | null | null |
| profile_id | `6602007e-fbc2-48ed-b4ae-bc08c78e5a55` | — | — | — |
| tenant_id (`company_id`) | `00000000-…-0001` (Quality Staff) | `00000000-…-0001` | `00000000-…-0001` | `0b58f1d4-…` |

Datos de contacto: solo 1073 tiene teléfono `9294168269` y email `Sophiacontrerassoto@gmail.com`.
1204 y 1225 **no tienen teléfono, ni email, ni rol, ni `connecteam_employee_id`**.

---

## 3. ¿Existe realmente un segundo Worker?

**No como entidad.** Sí como **segunda fila de `employees`** (y una tercera, 1225).
No es una segunda persona: son registros vacíos creados por proceso automático.

Quién los creó — evidencia temporal:

- `1204` creado `2026-04-20 19:07:21.101`. En **ese mismo segundo** se crearon 1200–1205
  (Julio Velasquez, Justin Mora, Ivan Morales, Lizardy Castillo, Sophia Contreras, Angel Colon).
  9 segundos después (`19:07:30`) se crearon sus asignaciones a los turnos `#0173 M` y `34234`.
- `1225` creado `2026-04-23 23:37:02`, dentro de una tanda de ~20 empleados creados entre
  `23:37:00` y `23:37:02` (1206–1225).

Conclusión: **creación masiva por importación de horario** que resuelve trabajadores por
nombre y, al no encontrar coincidencia con su regla, crea fila nueva y le asigna el siguiente
`employer_identification` vía `auto_assign_employer_identification`.
No hay `import_batches` ni `imports` registrados para esas fechas → **la importación que los
creó no dejó lote auditable**. No hay `created_by` en `employees`, por lo que no se puede
atribuir a un usuario concreto; no hay entradas en `activity_log` para 1204 ni 1225
(el único log existente es de `reset_access_pin` sobre 1073).

---

## 4. ¿Por qué el selector usa ST-01204?

No es que "elija" 1204: **oculta 1073**.

- Consulta: `src/hooks/useEmployeeRoster.tsx` → `useEmployeeRoster()`, líneas 71-81.
  `supabase.from("employees").select(...).eq("company_id", …).is("deleted_at", null)`.
  Trae **las tres** filas (1073, 1204, 1225).
- Filtro que las separa: `src/lib/shifts/assignable-workers.ts` →
  `classifyWorkerAssignability()` / `isPendingApproval()`, línea 78:
  `return (e.added_via ?? "").toLowerCase().trim() === "pending approval";`
- `1073` tiene `added_via = 'Pending approval'` → bucket `pending_approval` → **no asignable**,
  se esconde en el grupo "Pendientes de aprobación".
- `1204` tiene `added_via = NULL` → **asignable**, y es el que queda visible.
- Aplicación en UI: `src/components/shifts/EmployeeCombobox.tsx` líneas 245-271
  (`isNonAssignable` bloquea el toggle y `nonAssignableHiddenCount` los agrupa aparte).

**Esa es la consulta/regla responsable.** El registro real con portal, historia y nómina queda
fuera del selector por una etiqueta de alta (`Pending approval`) que nunca se limpió.

---

## 5. ¿Por qué el perfil usa ST-01073?

Porque el perfil **no busca por persona: lee por UUID de la URL**.

- `src/pages/admin/UnifiedPersonProfile.tsx`, línea 117: `const { id } = useParams()`.
- Línea 191-193: `.from("employees").select(EMPLOYEE_COLUMNS_NO_FISCAL).eq("id", id)`.
- Se llegó a `b21476e3-…` (ST-01073) porque es el registro que aparece en Equipo/portal.

No hay contradicción de lógica: son **dos claves distintas** (UUID de ruta vs. filtro de
asignabilidad) sobre **dos filas distintas** de la misma persona.

---

## 6. ¿Por qué busca el motor de Staffing?

Por **`employees.id` dentro de `company_id`**. Exactamente:
`useEmployeeRoster(companyId)` → filas de `employees` → `classifyWorkerAssignability(employee)`.
No usa `person`, ni `worker`, ni `profile`, ni `staff_id`/`employer_identification`, ni `user_id`.
`employer_identification` es solo texto mostrado (ST-0xxxx); nunca se usa para deduplicar.

---

## 7. ¿Existe un índice de duplicados? ¿Quién marca "Possible duplicate"?

No existe tabla ni índice de duplicados persistido. Se calcula **en memoria, en cada render**:

- `src/lib/employee-duplicate-hints.ts` → `computeDuplicateHints()`, invocado en
  `EmployeeCombobox.tsx:157`.
- Criterio (grupo de ≥2 dentro de la misma lista): mismo teléfono normalizado (≥7 dígitos),
  o mismo email en minúsculas, o **mismo nombre completo normalizado sin acentos**.
- Sophia cae por la **tercera** regla: 1073, 1204 y 1225 comparten "sophia contreras".
  1204/1225 no tienen teléfono ni email, así que la única señal posible es el nombre.
- Un segundo motor de lectura, `src/lib/identity/person-truth.ts` (`buildIdentityGroups`),
  clasificaría este grupo como `POSSIBLE_DUPLICATE` (solo nombre, sin teléfono coincidente).
- `src/lib/people/person-status.ts` (`resolvePersonStatus`) es el que traduce eso a la
  dimensión ASIGNABILIDAD que ves en la fila del selector.
- `employee_identity_reviews`: **0 decisiones** registradas para este grupo → nadie ha
  revisado ni descartado el duplicado.

---

## 8. Árbol completo y punto exacto de ruptura

```
Sophia Contreras (persona real)
│
├── Person ..................... NO EXISTE en el modelo  ← ruptura estructural
├── Worker ..................... NO EXISTE en el modelo  ← ruptura estructural
│
└── Employee (3 filas en Quality Staff)   ← RUPTURA REAL: la identidad se fragmenta aquí
    │
    ├── b21476e3 · ST-01073 · added_via='Pending approval'
    │   ├── Portal ............ user_id 27a62131 + profile 6602007e   ✅ activo
    │   ├── Assignments ....... 36 (30 accepted, 5 confirmed, 1 removed)
    │   ├── Scheduled shifts .. históricos + activos
    │   ├── Time entries ...... 23
    │   └── Payroll ........... 10 filas en period_base_pay
    │
    ├── ef96e166 · ST-01204 · added_via=NULL, sin contacto
    │   ├── Portal ............ ninguno
    │   ├── Assignments ....... 3 (2 accepted del 2026-04-13/22, 1 removed del 2026-08-10)
    │   ├── Time entries ...... 0
    │   └── Payroll ........... 0
    │
    └── f5a6230d · ST-01225 · is_active=false, sin contacto
        └── 0 asignaciones, 0 horas, 0 nómina  (cascarón muerto)
```

**Dónde se rompe, en una línea:** en la capa `Employee`. La importación de horario del
2026-04-20 creó una fila nueva en vez de reconocer a ST-01073, y el filtro
`added_via = 'Pending approval'` de `assignable-workers.ts:78` esconde justamente la fila buena,
dejando visible únicamente la fila vacía. Portal, horas y nómina viven en 1073; el staffing
opera sobre 1204.

**Consecuencia operativa ya materializada:** las 2 asignaciones aceptadas de abril del turno
`#0173 M` y `34234` quedaron colgadas de 1204, que no tiene portal → esa persona no pudo
fichar desde esos turnos. Es el mismo patrón del caso Carlos Ortiz.

---

## 9. ¿Cuál es el registro correcto?

**ST-01073 (`b21476e3-8048-416b-b552-bdfdc0308a07`).** Es el único con:
teléfono, email, `connecteam_employee_id` 13919485, rol Mesero_Waiter, cuenta de portal,
36 asignaciones, 23 fichajes y 10 referencias de nómina.

- **1204**: no es la persona correcta; es un registro vacío generado por importación.
  Tiene 3 asignaciones que en realidad pertenecen a 1073.
- **1225**: registro muerto (inactivo, sin ninguna referencia).
- **Los dos, no.** No hay caso de negocio que justifique dos registros de Sophia en la misma
  empresa (`511ba843` en otra empresa sí es legítimo: otro tenant, otro Employee).

---

## 10. Sin fix aplicado

No se ejecutó ninguna mutación. Cuando se autorice, el orden correcto de reparación sería,
en este orden y con revisión humana:

1. Quitar la etiqueta `added_via = 'Pending approval'` de 1073 (o dejar de tratarla como
   bloqueo de asignabilidad) — devuelve la fila buena al selector.
2. Reasignar las 2 asignaciones vivas de 1204 a 1073 (no tienen horas → seguro).
3. Marcar 1204 y 1225 como no asignables / archivados, sin borrar.
4. Cerrar el hueco de origen: la importación de horario debe resolver contra registros
   existentes antes de crear, y debe dejar lote auditable (`import_batches`).
