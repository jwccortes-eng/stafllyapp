# P0 — Permission Console Toggle Forensic (`/app/permissions`)

Auditoría de solo lectura. No se modificó código ni datos.

Superficie: `src/pages/admin/AccessConsole.tsx` (líneas 165-213, 393-411).

## Causa raíz (una sola)

El switch **no está enlazado al estado editable**. Está enlazado al **resultado evaluado**:

```tsx
<Switch
  checked={!!preview[spec.permission]}          // ← estado DERIVADO, no editable
  onCheckedChange={(v) => togglePermission(spec, v)}
/>
```

`preview` sale de `evaluateAccessPreview(...)` alimentado con
`companyRoles: { [selectedCompanyId]: target.role }`.

Dentro del resolver (`src/lib/auth/permission-resolver.ts`):

```ts
const full = isFullAccess(input, companyId);   // company_owner | admin ⇒ true
if (!spec.legacyAction && !spec.legacyModule) return full;
if (full) return true;                          // ← corta antes de mirar actions/modules
```

Cuando la persona seleccionada es `company_owner`, `admin` (o global `owner`/`developer`),
`evaluatePermission` devuelve `true` para **todos** los permisos sin mirar `actions` ni
`modules`. Entonces:

1. El clic sí ejecuta `onCheckedChange` → `togglePermission`.
2. El estado React sí cambia (`setActions` / `setModules` se aplican).
3. `preview` se recalcula, pero el atajo de acceso total lo devuelve a `true`.
4. React re-renderiza el `Switch` con `checked = true` otra vez.

Resultado visible: el switch "rebota" a ON y parece que el clic no hace nada.
No es un fallo de eventos, ni de RLS, ni de mutación: es un **bucle de renderizado con
estado derivado que ignora la edición**.

Población afectada: quien administra suele abrir precisamente estas fichas.
Actualmente son de acceso total 4 `company_owner` + 4 `admin` en Quality Staff by Keury,
3 + 5 en My Staff Solution LLC, entre otras.

## Respuestas punto por punto

| # | Pregunta | Hallazgo |
|---|---|---|
| 1 | ¿Se ejecuta `onChange`? | Sí. `onCheckedChange` → `togglePermission` (línea 196). |
| 2 | ¿Cambia el estado React? | Sí. `setActions` y `setModules` se aplican correctamente, incluidas las implicaciones ver/editar/eliminar. |
| 3 | ¿Hay estado editable separado del leído? | Sí existe (`actions`, `modules`), **pero el switch no lo lee**. Lee `preview`. Ese es el defecto. |
| 4 | ¿Están `disabled`? | No. Ningún `Switch` recibe `disabled`. |
| 5 | ¿Un `PermissionGate` bloquea la edición? | No. La pantalla solo hace un chequeo de entrada (`can("roles.manage")`, línea 279). Si pasa, no hay más guardas. |
| 6 | ¿El botón recibe cambios? | Sí. "Guardar cambios" envía `actions` y `modules` reales; con acceso total esos valores nunca reflejan lo que el usuario intentó marcar, porque la UI nunca confirmó el cambio visualmente. |
| 7 | ¿Existe mutación real? | Sí: RPC `admin_set_user_access(_user_id, _company_id, _actions, _modules, _reason)` con auditoría (línea 247). |
| 8 | ¿Errores silenciosos? | No relacionados. Solo un warning de React (`Function components cannot be given refs` en `CompanyLogo` / `AuthorizationLoading`) que es cosmético y no afecta los switches. |
| 9 | ¿Lee bien la empresa activa? | Sí. `selectedCompanyId` de `useCompany` filtra miembros, `action_permissions` y el scope de `module_permissions`. |
| 10 | ¿Qué impide ON→OFF? | El atajo `isFullAccess` del resolver aplicado a la vista de edición: para roles de acceso total el resultado evaluado siempre es `true` y sobrescribe la intención del clic en cada render. |

## Observación secundaria (no es la causa)

Para roles acotados (`employee`, `manager`) los switches sí responden: el resolver
consulta `actionPermissions`/`modulePermissions` y `preview` sigue al estado editable.
Esto confirma el diagnóstico por contraste: el fallo aparece exactamente donde
`isFullAccess` devuelve `true`.

## Naturaleza del defecto

Mezcla de dos conceptos en un solo valor:

- **Permiso concedido** (lo que se edita y se guarda).
- **Acceso efectivo** (lo que la persona realmente puede hacer, incluido lo que hereda del rol).

La consola muestra el segundo en un control que pretende editar el primero.

No se aplicó corrección, según lo solicitado.
