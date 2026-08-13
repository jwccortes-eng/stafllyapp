# P0 — Roles Tab Roster (forense)

Sin cambios de código. Evidencia: `src/pages/admin/AccessConsole.tsx`,
`src/lib/auth/role-model.ts`, `src/lib/auth/primary-role.ts`, datos de producción.

## Causa raíz

El contador y la lista de "Ver personas con este rol" **no leen el rol operativo**.
Leen el **nivel de membresía** de `company_users.role` (línea 773):

```tsx
const roster = canonical
  ? members.filter((m) => m.role === canonical.membershipRole)
  : [];
```

`membershipRole` viene de `role-model.ts` y **cuatro roles canónicos comparten el
mismo valor `"admin"`**: Administrador de Empresa (`company_owner`), Shift
Administrator, Time & Closeout Administrator, Payroll Administrator y Payroll
Approver (`admin`). Por eso las tarjetas de Shift / Time / Payroll muestran
exactamente la misma gente, y seguirán mostrándola aunque se cambien los roles
operativos: el filtro es insensible a los overrides.

Además, el guardado (`admin_set_user_access`) escribe **solo overrides**
(`action_permissions` / `module_permissions`). **Nunca modifica
`company_users.role`.** Cambiar el rol operativo por diseño no mueve la
membresía, así que el filtro por membresía es estructuralmente incapaz de
reflejar el cambio.

## Consultas utilizadas

Carga única al abrir la consola (líneas 119-133):

- `company_users` → `select user_id, role where company_id = <activa>` → fuente del roster.
- `role_templates` → `where company_id = <activa> or is_system`.
- `profiles`, `action_permissions` (overrides, por compañía), `employees` (estado/portal).

No existen `role_assignments` ni `user_permissions` en el proyecto: no hay fuente
legacy adicional. El roster nunca consulta `overrides`.

## Datos reales vs datos mostrados

El guardado **sí se persistió** (overrides, no membresía):

| Persona | Empresa | `company_users.role` | Overrides concedidos | Último guardado |
|---|---|---|---|---|
| Maria Sanabria | My Staff Solution | `admin` | 8 | 2026-08-13 05:52 |
| Sebastian Villegas | My Staff Solution | `admin` | 4 | 2026-08-13 05:51 |
| Duvan Gallego | My Staff Solution | `admin` | 6 | 2026-08-12 17:34 |
| Maria Sanabria | Quality Staff | `admin` | 10 | 2026-08-13 05:19 |
| Sebastian Villegas | Quality Staff | `admin` | 3 | 2026-08-13 05:50 |
| Duvan Gallego | Quality Staff | `admin` | 0 (filas escritas en negativo) | 2026-08-13 05:48 |

- **Usuarios** deriva el rol con `resolvePrimaryRole(m.role, m.overrides)`
  (líneas 222, 277, 487): membresía **+ overrides**, por similitud con la
  plantilla canónica. Por eso ahí sí se ven roles distintos.
- **Roles** usa solo `m.role`. Resultado: tres personas con roles operativos
  distintos aparecen idénticas en las cinco tarjetas de nivel `admin`.

Diferencia = la pantalla muestra "quién es admin de la empresa", no "quién es
responsable de esta función".

## Single Source of Truth que debería consumir la pantalla

`resolvePrimaryRole(member.role, member.overrides)` — el mismo motor que ya usan
Usuarios y el Modelo Operativo. Un miembro pertenece a la tarjeta `X` cuando
`resolvePrimaryRole(...).role?.key === X.key`. Nada nuevo que consultar: los
overrides ya están en memoria desde la carga inicial.

## Propuesta mínima de corrección (no aplicada)

1. En la tarjeta de rol, sustituir el filtro por membresía por:
   `members.filter((m) => resolvePrimaryRole(m.role, m.overrides).role?.key === canonical.key)`.
   Un solo cambio de expresión, sin consultas, sin escrituras, sin RLS.
2. Copy: `Ver personas con este rol (N)` → **`Responsables actuales (N)`**, y en
   la lista, bajo cada nombre, la misión canónica del rol como etiqueta
   (`🟢 Responsable de publicar y administrar servicios`), tomada de
   `RESPONSIBILITIES[role].mission` en `src/lib/auth/operating-model.ts`.
3. Estado vacío: "Nadie responsable todavía" + acción existente "Aplicar a persona".
4. Personas cuyo acceso no coincide con ninguna plantilla quedan fuera de las
   tarjetas y se ven en Usuarios como "Acceso personalizado" (comportamiento ya
   existente en el Modelo Operativo).

## Intacto

Permisos, overrides, auth, RLS, tablas y datos reales: sin tocar. Solo lectura.
