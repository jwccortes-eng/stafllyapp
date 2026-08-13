---
name: Sistema de permisos
description: Tres capas (role defaults, overrides por compañía, efectivo), consola /app/permissions, permisos protegidos del owner
type: feature
---

Catálogo canónico en `src/lib/auth/permission-catalog.ts`, espejo de
`public.permission_catalog()`. Autoridad de evaluación: `evaluatePermission`
(`permission-resolver.ts`) ↔ `public.has_permission`. API única en pantallas:
`usePermissions` (`can`/`canAny`/`canAll`) y `PermissionGate`. Nunca comparar roles.

**Tres capas, nunca mezcladas:**
1. Role defaults — lo que concede el rol de compañía.
2. Overrides — filas explícitas por `(user_id, company_id)` en `action_permissions`
   y `module_permissions`. Es lo ÚNICO editable/guardable.
3. Efectivo = 1 + 2. Solo lectura: **nunca** alimentar switches editables con él.

Editar overrides solo con `src/lib/auth/permission-overrides.ts` y guardar con el
RPC `admin_set_user_access` (audita en `activity_log`, scope por compañía).

Un override negativo restringe también a `admin` y `company_owner`. Excepciones:
- staff de plataforma (`developer`/`owner` global): nunca restringible;
- `company_owner` conserva siempre `users.manage`, `roles.manage`,
  `company.settings` (anti-lockout).

Referencia: `docs/qa/P0_PERMISSION_CONSOLE_EDITABLE_STATE_FIX.md`.

Hardcodes de rol retirados en todos los gates de escritura (P1 Hardcode Retirement,
2026-08-13). Nunca reintroducir `role === "admin"` para autorizar escrituras:
usar `can`/`canAny`. Quedan solo en navegación/visibilidad y ámbito plataforma.
Referencia: `docs/qa/P1_PERMISSION_HARDCODE_RETIREMENT.md`.
