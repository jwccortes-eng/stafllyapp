# P0 — EXPLICIT OPERATING ROLE ASSIGNMENT

## Hallazgo confirmado
`resolvePrimaryRole()` inferia el rol operativo por similitud Jaccard entre overrides concedidos y plantillas. Consecuencias reales medidas:

- Duván (Quality): 22 overrides en false → conjunto concedido vacío → coincidencia 1.0 con la plantilla vacía de Worker → aparecía como **Worker**.
- María (MyStaff): responsabilidad deseada Payroll, pero sus overrides se parecían 0.75 a Time & Closeout → aparecía como **Time & Closeout Administrator**.
- Sebastián (MyStaff): al añadir `publicar_anuncio` la similitud bajó de 0.75 a 0.60 → perdía **Shift Administrator** y caía a "Acceso personalizado".

## Auditoría de persistencia
Se evaluaron tres alternativas: tabla nueva de asignaciones, `role_templates` por usuario, o extender la membresía. La membresía (`company_users`) ya es la única fila 1:1 usuario↔empresa, ya está protegida por RLS y ya es la que leen Usuarios, Roles y Modelo operativo. **No se creó ninguna tabla nueva.**

Campo añadido: `public.company_users.operating_role_key text NULL`, con CHECK sobre los 7 roles canónicos. Es company-scoped por construcción.

## Modelo canónico implementado
```text
Auth User
  → Company Membership (company_users.role)
    → Explicit Operating Role (company_users.operating_role_key)  ← SSOT del rol
      → Role Defaults (plantilla canónica)
        → Overrides (action_permissions / module_permissions)
          → Effective Permissions (evaluateAccessPreview)
```

### Prioridad de `resolvePrimaryRole(membershipRole, overrides, explicitRoleKey)`
1. Membresía `company_owner` → **Company Owner** siempre (Owner protegido, no degradable por overrides).
2. `operating_role_key` explícito → ese rol.
3. Default por membresía (`manager` → Service Supervisor, `employee` → Worker, `admin` → "Administrador de empresa" sin rol declarado).

Jaccard ya **no** participa en la resolución. Vive en `suggestRoleFromOverrides()` y se expone únicamente como diagnóstico en el perfil: “Diagnóstico: sus permisos se parecen 75% a Time & Closeout Administrator. Es solo una sugerencia; el rol no cambia solo.”

## Cambios aplicados
**Base de datos**
- `company_users.operating_role_key` (nullable + CHECK).
- `admin_set_user_access(..., _operating_role text default null)`: `NULL` = no tocar el rol, `''` = limpiar, valor = asignar. Si la membresía es `company_owner`, fuerza `company_owner`. Registra `before/after` del rol en `activity_log`.

**Frontend**
- `src/lib/auth/primary-role.ts`: nueva firma con rol explícito, campos `explicit` y `suggestion`, y `suggestRoleFromOverrides()` como herramienta de diagnóstico/migración.
- `src/pages/admin/AccessConsole.tsx`: carga `operating_role_key`; estado `roleDraft` independiente del borrador de permisos; el selector de rol ya **no** reescribe overrides (existe un botón explícito "Cargar permisos base de este rol"); el guardado envía `_operating_role`; Usuarios, Roles y Modelo operativo leen el mismo rol explícito.
- `src/test/explicit-operating-role.test.ts`: 8 pruebas del contrato (todas en verde).

## Dry-run y migración de datos
Criterio: asignar solo casos no ambiguos; el resto queda para revisión humana.

| Empresa | Persona | Membresía | Sugerencia Jaccard | Decisión |
|---|---|---|---|---|
| MyStaff | Jorge Cortes | company_owner | — | ✅ company_owner |
| MyStaff | Keury Camilo | company_owner | — | ✅ company_owner |
| MyStaff | Desarrollador / Owner Test | owner | — | ✅ company_owner |
| MyStaff | Sebastián Villegas | admin | shift_admin 0.60 | ✅ shift_admin (responsabilidad declarada) |
| MyStaff | Duván Gallego | admin | time_closeout 1.00 | ✅ time_closeout_admin |
| MyStaff | María Sanabria | admin | time_closeout 0.75 | ✅ payroll_admin (decisión de negocio, no Jaccard) |
| MyStaff | Admin Test / Jorge (admin) | admin | sin overrides | ⏸️ revisión humana |
| Quality | Sebastián Villegas | admin | shift_admin 0.75 | ✅ shift_admin |
| Quality | María Sanabria | admin | time_closeout 0.60 | ⏸️ revisión humana (ambiguo) |
| Quality | Duván Gallego | admin | sin permisos concedidos | ⏸️ revisión humana |
| Quality | Nataly Florez | admin | sin overrides | ⏸️ revisión humana |
| Quality | Jorge / Keury / Desarrollador | company_owner | — | ✅ company_owner |

No se tocaron overrides, payroll, `time_entries`, `shift_assignments`, `scheduled_shifts`, auth ni RLS. Quality y MyStaff quedaron con roles independientes.

## QA
| Caso | Resultado |
|---|---|
| Cambiar rol no borra overrides | ✅ el rol viaja en su propio campo |
| Cambiar override no cambia rol | ✅ cubierto por test |
| Refresh conserva rol | ✅ persistido en la membresía |
| Quality y MyStaff con roles distintos | ✅ Sebastián shift_admin en ambas, Duván distinto |
| Roles / Usuarios / Modelo operativo coinciden | ✅ mismo resolver, misma fuente |
| Effective permissions intactos | ✅ sin cambios en la evaluación |
| Owner protegido | ✅ en RPC y en el resolver |

## Cierre
1. **¿Dónde quedó persistido el rol?** En `public.company_users.operating_role_key`, por usuario y empresa.
2. **¿Sigue usándose Jaccard?** Solo como diagnóstico y ayuda de migración (`suggestRoleFromOverrides`). Nunca decide el rol.
3. **¿Overrides pueden cambiar el rol?** No.
4. **¿Sebastián conserva Shift Administrator con permisos adicionales?** Sí, en ambas empresas.
5. **¿María puede ser Payroll Administrator con overrides?** Sí, en MyStaff ya lo es.
6. **¿Duván deja de aparecer como Worker por tener permisos false?** Sí; en Quality queda sin rol declarado pendiente de decisión, no degradado a Worker.
7. **¿Quality y MyStaff quedan independientes?** Sí, el campo es company-scoped.
8. **¿Se creó alguna tabla nueva?** No.
9. **¿Queda algún P0 abierto en Operating Model?** No hay P0. Queda una tarea operativa (no de código): declarar el rol de María, Duván y Nataly en Quality, y de Admin Test / Jorge (admin) en MyStaff.

Veredicto: 🟢 GO
