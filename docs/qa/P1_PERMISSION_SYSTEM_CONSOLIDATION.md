# P1 — Permission System Consolidation + Admin Access Console

## Contrato canónico
1 persona × 1 empresa × 1 catálogo de permisos.

- **Catálogo:** `src/lib/auth/permission-catalog.ts` (espejo de `public.permission_catalog`).
- **Resolver puro:** `src/lib/auth/permission-resolver.ts` (`evaluatePermission`, espejo de `public.has_permission`).
- **API de pantalla:** `src/hooks/usePermissions.tsx` → `can()`, `canAny()`, `canAll()`, `status`.
- **Guard de superficie:** `src/components/auth/PermissionGate.tsx`.
- **Escritura auditada:** RPC `admin_set_user_access(user, company, actions, modules, reason)`.

## Fases
| Fase | Estado | Evidencia |
|---|---|---|
| 1 — Permisos con scope de empresa | HECHO | `module_permissions.company_id`, `has_module_permission_in_company` |
| 2 — Sin bypass de carga en `useAuth` | HECHO | `authorizationStatus: loading \| ready \| error`; permisos se leen para todo rol |
| 3 — Retirar hardcodes de rol | PENDIENTE | ~30 archivos aún comparan `role === 'admin'`; migrar a `can(...)` |
| 4 — Contrato canónico único | HECHO | catálogo + resolver + hook único |
| 8 — Consola de accesos | HECHO | `/app/permissions` → `src/pages/admin/AccessConsole.tsx` |

## Consola de accesos (`/app/permissions`)
- **Usuarios:** miembros de la empresa activa, perfil de acceso por dominio, motivo del cambio y guardado auditado.
- **Roles:** plantillas (`role_templates`) como punto de partida, no como autoridad final.
- **Permisos:** catálogo canónico visible, agrupado por dominio.
- **Acceso efectivo:** previsualización calculada con el mismo resolver que usa la app.

La pantalla anterior `src/pages/admin/Permissions.tsx` fue eliminada: una sola consola.

## Reglas de adopción
- Prohibido comparar roles en pantallas nuevas: usar `can("dominio.accion")`.
- Prohibido renderizar contenido mientras `status === "loading"` (fail-closed sin parpadeo).
- Todo cambio de acceso pasa por `admin_set_user_access` (nunca escritura directa a las tablas de permisos).
