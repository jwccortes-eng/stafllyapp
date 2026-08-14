# P0 — AUTHORIZATION MODEL HARDENING
## De "admin = acceso total" a allowlist por rol operativo

Estado: **IMPLEMENTADO — 🟢 GO** (frontend + backend alineados)

---

## 1. Cambio de modelo

| Antes | Ahora |
|---|---|
| `company_users.role = 'admin'` ⇒ acceso total | `admin` sin rol operativo ⇒ **solo lectura operativa** |
| Denylist incompleta (quitar permisos uno a uno) | **Allowlist**: lo no concedido está denegado |
| `operating_role_key` decorativo | `operating_role_key` es **la autoridad** |
| Rol global `admin` administraba cualquier empresa | Requiere pertenecer a la empresa |
| Un admin podía editarse a sí mismo | Auto-edición bloqueada |

Fórmula única (idéntica en TS y SQL):

```
plataforma            -> true (no restringible)
dueño de la empresa   -> críticos: siempre true; resto: override ?? true
users/roles/company.settings (no dueño) -> false SIEMPRE
override explícito de ESA empresa       -> concede o deniega
default del rol operativo (allowlist)   -> deny by default
```

---

## 2. Allowlist canónica

| Rol operativo | Alcance concedido |
|---|---|
| `company_owner` | Todo (críticos irrevocables) |
| `shift_admin` | Servicios + staffing + lecturas de apoyo |
| `time_closeout_admin` | Horas, ajustes, aprobación de horas, cierre/reapertura |
| `payroll_admin` | Payroll ver/preparar/exportar + reportes (**no aprueba**) |
| `payroll_approver` | Ver y aprobar payroll |
| `service_supervisor` | Lectura + revisión de horas de sus servicios |
| `worker` | Nada administrativo |
| `admin_unassigned` | Solo lectura operativa |

Fuente: `src/lib/auth/role-defaults.ts` y `public.operating_role_permissions()`.

---

## 3. Implementación

### Frontend
- `src/lib/auth/role-defaults.ts` — allowlist + `resolveOperatingRoleKey`.
- `src/lib/auth/permission-resolver.ts` — sin fallback de acceso total para `admin`; `OWNER_ONLY_PERMISSIONS`; overrides con `company_id` placeholder o nulo ignorados.
- `src/hooks/useAuth.tsx` / `usePermissions.tsx` — cargan y propagan `operating_role_key`.
- `src/App.tsx` — ~40 rutas críticas envueltas en `PermissionGate` (permisos, usuarios, configuración de empresa, facturación, payroll, integraciones).

### Backend (migración aplicada)
- `operating_role_permissions()` — misma tabla de verdad que el frontend.
- `resolve_operating_role(user, company)` — rol efectivo; `operating_role_key='company_owner'` sin membresía de dueño **no** escala.
- `has_permission()` — reescrita con la fórmula anterior; deny by default.
- `user_is_company_admin()` — ya no acepta el rol global `admin`: plataforma, dueño o membresía admin de **esa** empresa.
- `admin_set_user_access()` — overload antiguo eliminado; solo dueño/plataforma, sin auto-edición, sin asignar `company_owner`, valida el rol contra la allowlist y audita en `activity_log`.

---

## 4. Casos reales verificados (17/17 tests en `src/test/permission-overrides.test.ts`)

| Persona | Rol operativo | Resultado |
|---|---|---|
| Jorge / Keury | `company_owner` | Acceso total; críticos irrevocables; sin poder en otra empresa |
| Sebastián | `shift_admin` | Crea/publica/asigna. **Sin** horas, payroll ni administración |
| Duván | `time_closeout_admin` | Horas y cierre. **Sin** crear servicios, clientes, payroll |
| María | `payroll_admin` | Prepara y exporta. **No aprueba**, no opera servicios |
| Worker | `worker` | Sin superficies administrativas |
| Admin sin rol | `admin_unassigned` | Solo lectura hasta que el dueño le asigne rol |

Bypasses cerrados: cross-tenant por rol global, auto-escalada, overrides placeholder (`company_id = 0000…0001`), concesión de `users.manage` / `roles.manage` / `company.settings` por override.

---

## 5. Operación posterior

Cada administrador debe recibir su `operating_role_key` en `/app/permissions`. Mientras no lo tenga, queda en solo lectura: es intencional y visible, no un fallo.

**VEREDICTO: 🟢 GO** — cada rol operativo solo puede hacer aquello de lo que es responsable.
