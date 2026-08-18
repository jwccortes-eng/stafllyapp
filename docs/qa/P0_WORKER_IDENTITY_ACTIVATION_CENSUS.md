# P0/P1 — WORKER IDENTITY & ACTIVATION CENSUS

**Modo:** AUDIT ONLY · CERO ESCRITURAS · 2026-08-18
**Alcance:** 1.859 fichas de trabajador en 8 empresas
**Anexo operable:** `/mnt/documents/worker_identity_census.csv` (una fila por ficha, 19 columnas)

---

## 1. Modelo real encontrado

| Concepto | Tabla real | Notas |
|---|---|---|
| Persona / perfil | `profiles` (280 filas) | Ligada a `auth.users` por `user_id`. NO es el registro operativo. |
| Worker / employee | `employees` (1.859) | Registro **company-scoped**: una fila por persona **por empresa** (`company_id` obligatorio, 0 huérfanas). |
| Auth user | `employees.user_id` → `auth.users` | Único puente persona↔portal. |
| Membresía de empresa | `company_users(company_id, user_id, role, operating_role_key)` | 76 fichas la tienen; es la que gobierna permisos y RLS. |
| Activación / invitación | `employee_invitations` (status: sent/resent/accepted/expired) | Por `employee_id`. |
| PIN | `auth_pin_credentials` (canónico, por `user_id`) + `employees.access_pin` (legacy) | Nunca expuesto en esta auditoría. |
| Portal | `employees.portal_access_enabled` + `user_id` | La verdad real es `user_id` (memoria de proyecto). |
| Estado worker | `is_active`, `deleted_at`, `merged_into_employee_id`, `employee_role='historical'`, `worker_type`, `identity_status` | |
| Asignabilidad | `src/lib/people/person-status.ts` (motor) sobre los campos anteriores | |
| Operación | `shift_assignments`, `scheduled_shifts`, `time_entries` (por `employee_id`, no por persona) | |

**Conclusión de modelo:** no existe una identidad canónica de persona. La persona real solo se puede inferir por `user_id` (si existe) o por teléfono normalizado. `employees` es la unidad de trabajo y **el historial (turnos, horas, nómina) cuelga del `employee_id` de cada empresa**, no de la persona.

---

## 2. Métricas globales

| KPI | Valor |
|---|---|
| Fichas totales (workers) | 1.859 |
| Personas estimadas (user_id ∪ teléfono) | ~1.799 |
| Perfiles (`profiles`) | 280 |
| Fichas activas | 488 |
| Con auth user | 284 · Sin auth user | 1.575 |
| Con portal habilitado | 293 |
| Con membresía `company_users` | 76 |
| Con teléfono | 1.585 · Sin teléfono | 274 |
| Con email | 1.756 · Sin email | 103 |

### Funnel de activación (buckets)

| Bucket | Fichas |
|---|---|
| 🟢 READY | 68 |
| 🟡 NEEDS ACTIVATION | 59 |
| 🟠 NEEDS REVIEW | 335 |
| 🔴 BLOCKED | 21 |
| ⚪ ARCHIVED / INACTIVE | 1.376 |

---

## 3. Métricas por compañía

| Compañía | READY | NEEDS ACT. | NEEDS REVIEW | BLOCKED | ARCHIVED |
|---|---|---|---|---|---|
| Quality Staff by Keury | 47 | 35 | 116 | 0 | 1.222 |
| My Staff Solution LLC | 10 | 16 | 40 | 1 | 138 |
| JKitchen Staff | 6 | 0 | 11 | 0 | 1 |
| Parceros | 0 | 0 | 164 | 20 | 1 |
| Stafly Demo | 5 | 2 | 0 | 0 | 14 |
| Sandbox | 0 | 5 | 0 | 0 | 0 |
| QA Testing | 0 | 1 | 4 | 0 | 0 |

---

## 4. Caso Alejandro (testigo)

Cadena reconstruida para **Alejandro Cortes · Quality Staff** (`72dfc8f8…`):

```
Persona    → sin profile canónico distinto; identidad = auth user
Employee   → activo, onboarding "complete"
Auth       → user_id PRESENTE
Activation → invitación ACEPTADA, PIN canónico configurado
Portal     → portal_access_enabled = true
Membership → ✗ NO existe fila en company_users
Assignable → 1 asignación registrada
```

**Condición exacta del fallo:** la activación (auth + invitación + PIN + portal) se completó, pero **nunca se creó la membresía `company_users`**. Como el modelo endurecido de autorización deriva TODO de `membership → operating_role_key → has_permission`, la persona aparece como "no activada / sin acceso" pese a tener identidad válida. No es un problema de PIN ni de invitación: es una **membresía faltante**.

Otros "Alejandro" del ecosistema muestran los tres estados del sistema: `Alejandro Tzorin` y `Alejandro Solano` (Quality/MyStaff) sí tienen membresía → READY; sus fichas espejo en Parceros/otras empresas existen sin auth ni membresía.

---

## 5. Personas con el mismo patrón

| Patrón | Fichas |
|---|---|
| **A — idéntico a Alejandro** (activa + auth user + sin membresía) | **156** |
| A con historial operativo real (turnos u horas > 0) | 117 |
| B — activa sin auth user (nunca activada) | 261 |
| C — asignaciones en fichas archivadas/inactivas | 61 |
| D — horas históricas en fichas BLOCKED/NEEDS REVIEW | 94 |
| E — activas sin teléfono (no se puede activar por SMS/PIN) | 200 |
| F — activas sin email | 25 |

---

## 6. Duplicados potenciales y cross-company

- Teléfonos activos únicos: **270**.
- Teléfonos presentes en **más de una empresa**: **18** (mayoría Quality ↔ MyStaff, 1 JKitchen ↔ Quality).
  - **17** comparten (o no contradicen) un mismo `user_id` → identidad cross-company **correcta**.
  - **1** presenta `user_id` distinto por empresa → **identidad partida (sospechosa)**.
- Duplicados de la misma persona **dentro de la misma empresa activa**: **0** (la unicidad teléfono+empresa se sostiene).
- `auth.users` ligados a **más de un nombre de persona**: **5** → revisión humana obligatoria.
- Membresías huérfanas (`company_users` sin employee correspondiente en esa empresa): **12**.
- Employees sin empresa válida: **0**.

---

## 7. Anomalías de auth / membresía / asignabilidad

| Anomalía | Casos | Impacto |
|---|---|---|
| Auth + portal + PIN pero sin membresía | 156 | No entra al workspace / permisos vacíos |
| Membresía sin ficha de empleado | 12 | Acceso sin identidad operativa |
| Un auth user con varias identidades nominales | 5 | Riesgo de ver datos de otra persona |
| Identidad partida cross-company | 1 | Duplicación de historial |
| Fichas archivadas con asignaciones | 61 | Historial cuelga de identidad muerta |
| Activas sin teléfono | 200 | Imposible activar por el flujo actual |

---

## 8. Workers con servicios futuros que NO están READY

**7 casos, todos en Quality Staff** — recibirían turno pero hoy no podrían operar la app:

| Persona | Futuros | Auth | Membresía | Bucket |
|---|---|---|---|---|
| Carlos Alvarez | 4 | sí | ✗ | NEEDS REVIEW |
| Anderson Vargas | 2 | sí | ✗ | NEEDS REVIEW |
| Kevin Velasquez | 1 | sí | ✗ | NEEDS REVIEW |
| Cristian Contreras | 1 | sí | ✗ | NEEDS REVIEW |
| Juliana Quintero | 1 | sí | ✗ | NEEDS REVIEW |
| Martin Cossio | 1 | no | ✗ | NEEDS REVIEW |
| jeancarlos ortiz | 1 | no | ✗ | NEEDS ACTIVATION |

---

## 9. Riesgos Clock y Payroll

**Clock (alto):** 6 de los 7 casos anteriores tienen turno futuro sin poder abrir el portal → no verán el turno y no podrán hacer Clock In; la asistencia caería a registro manual del admin. Adicionalmente, 156 fichas con auth pero sin membresía podrían autenticarse y quedar bloqueadas al leer datos company-scoped (RLS).

**Payroll (medio-alto):** 94 fichas en estado inconsistente ya acumulan `time_entries`, y 61 fichas archivadas conservan asignaciones. Si un día se fusionan identidades, esas horas cambiarían de dueño y afectarían periodos ya consolidados. Ningún caso detectado de horas duplicadas por la misma persona en la misma empresa y periodo.

---

## 10. Tabla de auditoría operable (priorizada)

Anexo completo por ficha en `worker_identity_census.csv`. Prioridades:

| # | Grupo | Casos | Identidad | Activación | Portal | Asignabilidad | Severidad | Acción recomendada (NO ejecutada) |
|---|---|---|---|---|---|---|---|---|
| 1 | Turno futuro sin READY | 7 | válida | parcial | no | asignado | 🔴 Crítica | Crear membresía / completar activación antes de la fecha del turno |
| 2 | Patrón Alejandro con historial | 117 | válida | completa | sí | sí | 🔴 Crítica | Crear `company_users` con `operating_role_key='worker'` |
| 3 | Patrón Alejandro sin historial | 39 | válida | completa | sí | sí | 🟠 Alta | Igual, en lote controlado |
| 4 | Auth con varias identidades | 5 | dudosa | — | sí | dudosa | 🔴 Crítica | Revisión humana caso por caso |
| 5 | Membresías huérfanas | 12 | ausente | — | sí | no | 🟠 Alta | Confirmar y retirar o vincular ficha |
| 6 | Identidad partida cross-company | 1 | duplicada | — | mixto | mixta | 🟠 Alta | Decidir identidad canónica |
| 7 | Activas sin auth | 261 | válida | pendiente | no | limitada | 🟡 Media | Campaña de invitación por lotes |
| 8 | Activas sin teléfono | 200 | incompleta | imposible | no | limitada | 🟡 Media | Completar contacto antes de invitar |
| 9 | Archivadas con asignaciones | 61 | histórica | — | no | no | 🟡 Media | Reasignar historial solo si se fusiona identidad |
| 10 | Parceros NEEDS REVIEW/BLOCKED | 184 | placeholder/pendiente | no | no | no | ⚪ Baja | Tenant no productivo: excluir del funnel |

---

## 11. Respuestas finales

- **READY:** 68 fichas (47 Quality, 10 MyStaff, 6 JKitchen, 5 Demo).
- **Necesitan activación:** 59 (+261 activas sin auth que aún no entraron al funnel).
- **Mismo problema que Alejandro:** **156** (117 con historial operativo).
- **Necesitan revisión humana:** 335 NEEDS REVIEW + 12 membresías huérfanas + 5 auth multi-identidad.
- **Duplicados potenciales:** 18 teléfonos cross-company; 0 duplicados intra-empresa activos.
- **Identidades cross-company correctas:** 17. **Sospechosas:** 1 (+5 auth multi-identidad).
- **Workers futuros que hoy no podrían usar la app:** **7**.
- **Riesgo directo para Clock:** SÍ (6 turnos futuros sin portal operativo).
- **Riesgo directo para payroll:** SÍ, indirecto (94 fichas inconsistentes con horas; 61 archivadas con asignaciones).

## VEREDICTO

**🟡 GO WITH CONDITIONS** para avanzar de PROGRAMACIÓN hacia WORKER APP / CLOCK.

Condiciones de salida (ninguna ejecutada en esta auditoría):
1. Resolver los **7 workers con turno futuro** antes de su fecha.
2. Cerrar el **patrón de membresía faltante** (156 fichas) con un procedimiento único y auditable.
3. Revisión humana de los **5 auth multi-identidad** y las **12 membresías huérfanas** antes de habilitar Clock masivo.
