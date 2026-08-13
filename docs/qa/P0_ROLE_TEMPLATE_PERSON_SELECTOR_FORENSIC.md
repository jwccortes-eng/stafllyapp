# P0 — Role Template Person Selector (forense)

Sin cambios de código. Evidencia: `src/pages/admin/AccessConsole.tsx`.

## Hallazgo central
"Selecciona una persona" **no es un selector**. Es la etiqueta del botón
*Aplicar plantilla* cuando no hay nadie seleccionado, y ese botón está
deshabilitado (`disabled={!selectedUser}`, línea 557). Un botón deshabilitado
no dispara eventos: por eso el clic no hace nada. No hay error, no hay bug de
datos, no hay bloqueo de permisos.

```tsx
<Button size="sm" variant="outline" disabled={!selectedUser}
        onClick={() => applyTemplate(tpl)}>
  {selectedUser ? "Aplicar a la persona seleccionada" : "Selecciona una persona"}
</Button>
```

## Respuestas al checklist

1. **¿Tiene onClick/trigger real?** Sí (`applyTemplate(tpl)`), pero inerte
   mientras `selectedUser` sea `null`.
2. **¿Existe componente selector/combobox?** No en la pestaña Roles. La
   selección de persona vive solo en la pestaña **Usuarios** (lista de
   botones, línea 336-354). No hay Popover/Command asociado a las tarjetas de rol.
3. **Dataset que debería cargar:** `company_users` (user_id, role) +
   `profiles` (full_name, email) + última fecha de `action_permissions`. Ya se
   carga completo al abrir la consola (líneas 103-133); está disponible en memoria.
4. **¿Filtra por compañía activa?** Sí: `.eq("company_id", selectedCompanyId)`.
   Las plantillas traen sistema + propias de la compañía.
5. **¿Solo memberships válidos?** Sí: la fuente es exclusivamente
   `company_users` de la compañía activa. No lista empleados sin usuario.
6. **¿La plantilla se puede aplicar hoy desde la UI?** Sí, pero solo por el
   camino Usuarios → seleccionar persona → Roles → Aplicar. Desde la pestaña
   Roles en frío es imposible.
7. **¿Existe mutación/RPC?** Sí: `admin_set_user_access(_user_id, _company_id,
   _actions, _modules, _reason)`. La plantilla no persiste `role_template_id`:
   se expande a permisos concretos (`applyTemplateToDraft`) y se guarda como
   overrides company-scoped. Es un punto de partida, no una asignación de rol.
   Cambiar el `role` de membership en `company_users` **no** está expuesto en
   esta pantalla.
8. **¿Bloqueado por permisos del Owner?** No. La consola entera exige
   `roles.manage`; si falta, no se ve la pantalla. Dentro no hay gate adicional.
9. **¿PermissionGate envolviendo el selector?** No. Solo el guard de pantalla.
10. **¿Error silencioso?** No. Sin excepciones, sin fetch fallido, sin catch
    mudo. Es estado deshabilitado por diseño incompleto.
11. **¿La pestaña Roles es informativa u operativa?** Hoy es **semi-informativa**:
    describe la plantilla (alcance, alias, nº de permisos) y solo actúa si ya
    hay contexto de persona traído de otra pestaña. El caso esperado
    (Quality → Roles → Shift Administrator → buscar Sebastián → aplicar) **no
    se puede completar** empezando en Roles.

## Respuestas directas

1. **¿Debería ser clickeable hoy?** No: está deshabilitado a propósito hasta
   que exista una persona seleccionada.
2. **¿Por qué no abre?** Porque no existe nada que abrir. No hay selector de
   persona en la pestaña Roles; el texto es un placeholder de estado, no un trigger.
3. **¿La asignación de roles desde UI ya existe?** Existe la **aplicación de
   plantilla como permisos** (expandida a overrides, company-scoped, guardada
   por `admin_set_user_access` y auditada). No existe cambio del rol de
   membership ni persistencia de `role_template_id` desde la UI.
4. **¿Qué falta exactamente?**
   - Un selector de persona real (buscador tipo Command) dentro de la tarjeta
     de rol, alimentado por `members` (ya en memoria, ya filtrado por compañía).
   - Que al elegir persona se haga `setSelectedUser` y se cargue su perfil.
   - Preview de permisos de la plantilla antes de aplicar, en el propio flujo
     de Roles.
   - Guardado que reutilice `admin_set_user_access` sin tocar la otra compañía
     (ya es company-scoped: MyStaff no se ve afectado).
   - Decisión de producto: si "aplicar plantilla" debe además cambiar el `role`
     en `company_users`; hoy no lo hace y el rol sigue siendo el heredado.

## Veredicto
🔴 Flujo incompleto, no roto. Cero riesgo de datos, cero fallo de permisos.
El trabajo pendiente es de interfaz: añadir el selector y cerrar el ciclo
dentro de la pestaña Roles.
