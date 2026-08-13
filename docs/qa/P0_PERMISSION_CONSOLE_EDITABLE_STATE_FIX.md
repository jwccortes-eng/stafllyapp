# P0 — Permission Console Editable State Fix (`/app/permissions`)

Corrige la causa raíz de `docs/qa/P0_PERMISSION_CONSOLE_TOGGLE_FORENSIC.md`:
los switches estaban enlazados al **acceso efectivo evaluado**, que para
`company_owner` / `admin` siempre devolvía `true` y revertía cada clic.

## Modelo: tres capas separadas

| Capa | Qué es | Dónde vive | Editable |
|---|---|---|---|
| 1. Role defaults | Lo que concede el rol de compañía por sí solo | `company_users.role` + resolver | No |
| 2. Overrides | Excepciones explícitas por `(user_id, company_id, permiso)` | `action_permissions` / `module_permissions` (ambas con `company_id`) | **Sí — lo único que la consola escribe** |
| 3. Effective | 1 + 2 | `evaluatePermission` / `public.has_permission` | No (preview de solo lectura) |

Ejemplo:

```
role default: service.publish = true
override:     service.publish = false
effective:    false
```

## Cambios

### `src/lib/auth/permission-overrides.ts` (nuevo)
Modela la capa 2: `overrideValue`, `switchValue`, `applyToggle`,
`applyTemplateToDraft`, `isDirty`, `changedPermissions`, `isProtected`.
Un override es `undefined` cuando no hay fila explícita (se hereda del rol).

### `src/lib/auth/permission-resolver.ts`
- `explicitOverride(input, permission, companyId)`: valor explícito de la
  compañía activa (`undefined` si no hay fila).
- `evaluatePermission`: para roles de acceso total, un override **negativo**
  ahora restringe de verdad. Excepciones:
  - staff de plataforma (`developer` / `owner` global): nunca restringible;
  - `company_owner` sobre sus permisos críticos (ver abajo).
- `PROTECTED_OWNER_PERMISSIONS` exportado como contrato.

### `public.has_permission` (migración)
Espejo exacto de la regla anterior en base de datos: mismo orden, mismas
excepciones. Frontend y backend siguen respondiendo lo mismo.

### `src/pages/admin/AccessConsole.tsx`
- Estado editable único: `draft: OverrideDraft` + `baseline` persistido.
- `roleDefaults` = evaluación con overrides vacíos. `preview` = evaluación con
  el borrador. El switch usa `switchValue(spec, draft, roleDefault)`; el preview
  **nunca** alimenta el switch.
- Cada permiso muestra su procedencia: heredado del rol · excepción de esta
  empresa · efectivo sí/no.
- Filas heredadas (`company_id NULL`) ya no se copian al borrador: alimentan el
  preview, no la edición.
- "Cambios sin guardar · N", Guardar deshabilitado sin cambios, botón Descartar.
- Fallo al guardar → revierte al baseline y muestra el error explícito.
- Éxito → recarga el perfil y recalcula el preview.

## Permisos NON-REMOVABLE

Para `company_owner`, y solo para él, estos permisos no se pueden quitar
(anti-lockout: dejarían la empresa sin dueño operativo ni forma de recuperarse):

- `users.manage` — administrar usuarios
- `roles.manage` — administrar roles y permisos
- `company.settings` — configuración de empresa

En la UI aparecen en ON, deshabilitados, con la leyenda
"Protegido: el dueño no puede quitárselo". Para rol `admin` **no** están
protegidos: un owner sí puede restringir a un admin.

Staff de plataforma (`developer` / `owner` global) no es restringible por
compañía en ningún permiso.

## Company scope

Todo override se escribe con la `company_id` activa vía
`admin_set_user_access(_user_id, _company_id, _actions, _modules, _reason)`,
que ya valida `user_is_company_admin`, exige membresía y audita en
`activity_log`. Un mismo `auth_user_id` puede tener `service.publish = true` en
Quality y `false` en MyStaff sin duplicar usuario.

## QA — `src/test/permission-overrides.test.ts` (9 casos, en verde)

| Caso | Resultado |
|---|---|
| Switch sigue al borrador, no rebota | PASS |
| Editar implica ver; quitar ver retira editar/eliminar | PASS |
| Sebastián: sin publish en Quality, con publish en MyStaff | PASS |
| María: ajusta horas, no publica | PASS |
| Duván: cierra día, no ve payroll | PASS |
| Admin: override negativo efectivo, resto intacto | PASS |
| Owner: críticos protegidos | PASS |
| Owner: restringible en no críticos (`payroll.export`) | PASS |
| Plataforma: no restringible | PASS |

## Criterios de aceptación

- [x] El switch cambia al hacer clic.
- [x] El cambio no se revierte por el preview.
- [x] Existe estado "sin guardar" con contador y Descartar.
- [x] Guardar persiste vía RPC auditado; fallo revierte con error explícito.
- [x] El preview refleja el resultado efectivo (rol + overrides), solo lectura.
- [x] Los overrides son por compañía.
- [x] Admin puede restringirse granularmente.
- [x] Owner conserva permisos críticos protegidos.
- [x] Sin regresiones: el catálogo no cambió; frontend y SQL siguen en espejo;
      quien no tiene acceso total sigue evaluándose exactamente igual que antes.

## No tocado

auth, RLS, payroll, `time_entries`, `scheduled_shifts`, `shift_assignments`,
documentos, aislamiento por tenant, datos de producción, catálogo de permisos.
