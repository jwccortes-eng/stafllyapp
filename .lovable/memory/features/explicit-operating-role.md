---
name: Rol operativo explícito
description: El rol de una persona por empresa se declara en company_users.operating_role_key; los permisos nunca lo infieren
type: feature
---

- **SSOT del rol**: `public.company_users.operating_role_key` (company-scoped, nullable, CHECK sobre los 7 roles canónicos). No existe tabla aparte.
- **Separación obligatoria**: ROLE = responsabilidad declarada · PERMISSIONS = autorización efectiva · OVERRIDES = excepciones al rol. Cambiar overrides nunca cambia el rol y viceversa.
- **Resolver único**: `resolvePrimaryRole(membershipRole, overrides, explicitRoleKey)` en `src/lib/auth/primary-role.ts`. Prioridad: Owner protegido → rol explícito → default de membresía.
- **Jaccard** (`suggestRoleFromOverrides`) es solo diagnóstico/migración. Prohibido usarlo para asignar rol.
- **Escritura**: RPC `admin_set_user_access(..., _operating_role)`. `NULL` = no tocar, `''` = limpiar. Owner nunca se degrada.
- Usuarios, Roles y Modelo operativo deben leer siempre este mismo rol explícito.
