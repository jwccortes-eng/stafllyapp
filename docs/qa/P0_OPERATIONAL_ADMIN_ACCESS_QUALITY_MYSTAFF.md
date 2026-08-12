# P0 — Operational Admin Access · Quality Staff + My Staff Solution

**Fecha:** 2026-08-12
**Ticket de auditoría:** `operational-admin-access-2026-08-12`
**Empresas:**
- Quality Staff by Keury — `00000000-0000-0000-0000-000000000001`
- My Staff Solution LLC (MyStaff) — `37f92f75-7af4-4496-aa10-793e14b09ed9`

**Regla aplicada:** acceso habilitado únicamente con Roles & Permissions existentes.
Sin Platform Owner, sin Super Admin, sin cambios de RLS, sin nómina, sin configuración global.
No se creó ningún usuario nuevo.

---

## 1. Resolución de identidad (teléfono → auth user → employee canónico)

| Persona | Teléfono | Auth user | Employee Quality Staff | Employee MyStaff |
|---|---|---|---|---|
| Jorge Cortés | 7187515197 | `e5495b59-8b80-471d-bd64-eec9ea7b1ccb` | `482e78ca-d42b-4e12-86f5-6963c3012e61` (activo) | `340db246-c365-4e56-9e9a-ac7d4ef56bc4` (activo) |
| Keury Camilo | 3473358615 | `85000c53-c052-43da-a131-fe7871e43c62` | `e6c121cb-917b-43bf-9a63-9bb54e4341a8` (activo) | `06a6b56e-69b7-492a-ae7c-968568540107` (activo) |
| Sebastián Villegas | 6468585060 | `e4793c12-8571-4d7d-bfcb-38391e12168d` | `3bccba54-4e14-4898-98f4-b24cd58b260c` (activo) | `4df1c02f-5055-4686-850d-fcd3e1e3274e` (activo) |
| María Sanabria | 9296213479 | `96d4a770-87ce-484e-8cbc-97fb827bd561` | `da9cbc9e-ea0a-438a-9f4c-98d9e0172a43` (activo) | `067022cc-2365-491f-be09-acad216a9419` (activo) |
| Duván Gallego | 3472031873 | `4338b336-0f65-4285-9d50-6abcc28e5645` | `4d603205-6937-4159-897e-b3fcd44fbf5f` (inactivo) | `cad09ca0-065e-4e4b-a6ab-58582592c9cd` (activo) |

Todos los candidatos homónimos (Sebastián Barbosa/Barreto/Espinel/Henao/Londoño, María duplicada `14630068…`, Keury duplicado `5dd6fc51…`) quedaron descartados por teléfono/auth y no se tocaron.

---

## 2. Estado final por persona

| Persona | Rol operativo | Quality Staff | MyStaff | Rol de plataforma |
|---|---|---|---|---|
| Jorge C. | Owner de empresa | `company_owner` | `company_owner` | sin cambios |
| Keury C. | Owner de empresa | `company_owner` | `company_owner` | sin cambios |
| Sebastián V. | Administrador de turnos | `admin` | `admin` | `manager` (sin cambios) |
| María S. | Administrador de cierre | `admin` | `admin` | `manager` (sin cambios) |
| Duván G. | Administrador de cierre | `admin` (antes `supervisor`) | `admin` (antes `supervisor`) | `supervisor` (sin cambios) |

El rol de plataforma (`user_roles`) no se modificó para nadie en este ticket.

---

## 3. Permisos efectivos

### Jorge C. y Keury C. — Owner
Acceso completo operativo en ambas compañías: Dashboard, Servicios, Clientes, Workers, Staffing, Publicar, Operaciones, Attendance, Documentos, Reportes y configuración operativa. Ya estaban correctos; no requirieron cambios.

### Sebastián V. — Administrador de turnos
Acciones concedidas en ambas compañías: `crear_turno`, `editar_turno`, `eliminar_turno`, `asignar_turno`.
Módulos visibles: `shifts` (edición), `employees`, `clients`, `locations`, `import`, `announcements`, `chat`, `timeclock`, `reports`.
Denegado explícitamente: nómina (`crear/editar/aprobar/exportar_nomina`, `ver_salarios`), `configurar_empresa`, `configurar_nomina`, y los módulos `periods`, `movements`, `concepts`, `summary`.

### María S. y Duván G. — Administrador de cierre
Acciones concedidas en ambas compañías: `cerrar_turno`, `reabrir_turno`, `editar_clock`, `aprobar_clock`, `cerrar_dia`, `reabrir_dia`.
Módulos visibles: `shifts` (edición para cierre), `timeclock`, `employees`, `clients`, `locations`, `announcements`, `chat`, `reports`.
Denegado explícitamente: creación/edición/eliminación de turnos, nómina completa, `configurar_empresa`, `configurar_nomina` y los módulos de nómina.
Adicionalmente se revocaron los permisos de conciliación de nómina que Duván tenía heredados en MyStaff (`approve_reconciliation_period`, `publish_reconciliation_period`, `reopen_reconciliation_period`, `edit_closed_period`, `view_period_audit`).

---

## 4. Validaciones

- ✅ Auth user resuelto para las 5 personas (ninguno creado).
- ✅ Employee canónico identificado en ambas compañías.
- ✅ Membresía activa en Quality Staff y MyStaff para los 5.
- ✅ Rol asignado y verificado en base de datos tras la ejecución.
- ✅ Menús visibles derivados de `module_permissions`; nómina fuera del menú para Sebastián, María y Duván.
- ✅ Permisos efectivos verificados por compañía en `action_permissions`.
- ✅ Ninguno recibió Platform Owner (`owner`/`developer`) ni Super Admin nuevo.
- ✅ Cambio de empresa desde el selector conserva permisos: la membresía es por compañía y existe en ambas; los módulos son por usuario y aplican en las dos.

---

## 5. Lo que NO se tocó

- `auth.users`, RLS, políticas y aislamiento por tenant.
- Nómina histórica, `pay_periods`, `period_base_pay`, `time_entries`, fichajes y asignaciones.
- Configuración global de plataforma y ajustes de empresa.
- Registros de identidad, documentos y chat.

---

## 6. Observación para seguimiento (no ejecutada)

Jorge C. y Keury C. mantienen el rol de plataforma `admin` en `user_roles`, previo a este ticket. Ese rol otorga alcance transversal fuera de las dos compañías. No se modificó porque el ticket prohíbe otorgar o alterar roles de plataforma; se recomienda decidirlo en un ticket aparte.
