# P1 — USER ROLE ASSIGNMENT EXPERIENCE

Fecha: 2026-08-13 · Superficie: `/app/permissions` → pestaña **Usuarios**

## Objetivo

Responder de un vistazo "¿Qué puede hacer esta persona?" sin obligar al administrador a
razonar sobre plantillas, módulos ni overrides.

## Qué cambió (solo experiencia)

1. **Rol principal visible y editable.** Nuevo bloque REGLA arriba del perfil con un selector
   de rol principal (Worker, Shift Administrator, Time & Closeout Administrator, Payroll
   Administrator, Payroll Approver, Service Supervisor). Al elegir un rol se reescribe el
   borrador de permisos con la plantilla canónica de ese rol; se guarda con el botón existente.
2. **Contexto debajo del rol.** Empresa (empresa activa) y Alcance (`Solo su información`,
   `Solo servicios asignados`, `Toda la empresa`).
3. **Resumen de acceso efectivo.** "Acceso efectivo: N permisos · M excepciones".
4. **Overrides después de la regla**, con cabecera explícita "Excepciones · N".
5. **Listado con columnas**: Nombre · Rol principal · Alcance · Estado · Portal.

## Cómo se deriva el rol principal

`src/lib/auth/primary-role.ts` (nueva capa de lectura):

- Sin overrides explícitos → rol por defecto de la membresía (`company_owner` → Company Owner,
  `manager` → Service Supervisor, `employee` → Worker, `admin` → "Administrador de empresa").
- Con overrides → se compara el conjunto de acciones concedidas contra
  `templateActionsFor()` de cada rol canónico (índice de Jaccard, umbral 0.75). Si nada
  coincide se muestra "Acceso personalizado".
- Estado/Portal de la lista usan el resolver canónico `resolvePortalStatus`.

## Invariantes respetadas

- No se creó ningún rol nuevo: solo se leen los de `src/lib/auth/role-model.ts`.
- No se modificó el modelo de permisos, el catálogo ni el resolver.
- No se tocó RLS, auth ni memberships: el selector escribe únicamente overrides de empresa vía
  la RPC existente `admin_set_user_access`.
- Sin migraciones ni cambios de datos.

## QA

| Prueba | Resultado |
| --- | --- |
| Typecheck del proyecto (`tsgo`) | PASS |
| Listado muestra Nombre / Rol principal / Alcance / Estado / Portal | PASS |
| Rol principal se muestra sin overrides (deriva de la membresía) | PASS |
| Cambiar rol principal reescribe el borrador y marca "Cambios sin guardar" | PASS |
| Guardar usa `admin_set_user_access` (una sola escritura, company-scoped) | PASS |
| Company Owner sin selector (su rol vive en la membresía) y permisos protegidos intactos | PASS |
| Duván: Shift Administrator → Worker = buscar persona, abrir selector, elegir Worker, Guardar (4 pasos, < 30 s) | PASS |

## Alcance no cubierto

Cambiar el rol de **membresía** (`company_users.role`) sigue fuera de esta consola por diseño:
el rol principal se expresa como permisos de empresa, no como cambio de membresía.
