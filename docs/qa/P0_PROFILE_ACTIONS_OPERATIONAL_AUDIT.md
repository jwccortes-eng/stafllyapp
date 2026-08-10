# P0 — Profile Actions Operational Audit

Módulo: **Personas / Perfil** (`/app/people/:id`, alias `/app/employees/:id`)
Entrypoint: `src/pages/admin/UnifiedPersonProfile.tsx` (1.474 LoC) + `ProfileSummaryGrid`, `EmployeeProfileTabs`, `EmployeeAccessTab`, `PortalAccessCard`, `NextActionCard`, `PhotoReviewActions`, `ArchiveEmployeeDialog`, `EmployeeInviteDialog`, `IdentityResolutionDrawer`.

Criterio: **si una acción es visible, debe ejecutar una operación real**. Si no existe la funcionalidad, se oculta.

---

## 1. Causa raíz principal (no era un botón: eran todos)

El bloque de pestañas profundas (`EmployeeProfileTabs`) vivía dentro de un
`<Collapsible defaultOpen={false}>` **no controlado**.

Todas las acciones de las tarjetas (`Abrir Docs`, `Gestionar`, `Resetear PIN`,
`Ver turnos`, `Log completo`, `Editar`, y los CTA del `NextActionCard`)
resolvían con `setActiveTab(...)` sobre un panel **cerrado**: el estado
cambiaba, pero nada se veía y el `scrollIntoView` no encontraba panel activo.

Percepción del usuario: **“el botón no hace nada”**. Diagnóstico real:
handler correcto + destino invisible.

**Fix:** un único punto de entrada canónico `openDeepTab(tab, { edit })` que
(1) normaliza alias de tab, (2) abre el colapsable (`Collapsible` ahora
controlado con `open`/`onOpenChange`), (3) activa la pestaña, (4) hace scroll
al contenedor real vía `deepTabsRef`.

---

## 2. Tabla de auditoría

| Acción | Estado (antes) | Causa | Archivo | Prioridad | Tiempo est. |
|---|---|---|---|---|---|
| **Header** |
| Editar | 3 · Handler roto (efecto invisible) | `setIsEditing(true)` pero los campos editables viven en el tab `info`, dentro del colapsable cerrado | `UnifiedPersonProfile.tsx:784` | P0 | 15 min |
| Guardar / Cancelar (modo edición) | 1 · Funciona | `handleSave` hace diff + `update` en `employees` | `UnifiedPersonProfile.tsx:740` | — | — |
| Aprobar foto | 1 · Funciona | `persist("approved")` → update real | `PhotoReviewActions.tsx:151` | — | — |
| Rechazar foto | 1 · Funciona | Diálogo de motivo + update | `PhotoReviewActions.tsx:164` | — | — |
| Reenviar invitación / Invitar / Reintentar | 1 · Funciona | Abre `EmployeeInviteDialog` con token y `onInviteSent` | `UnifiedPersonProfile.tsx:807` | — | — |
| Copiar link / Abrir activación | 1 · Funciona | `clipboard` + `window.open(inviteUrl)` | `UnifiedPersonProfile.tsx:834/851` | — | — |
| WhatsApp | 3 · Handler frágil | Construía `wa.me/<solo dígitos>` sin código de país → chat inválido para números de 10 dígitos | `UnifiedPersonProfile.tsx:892` | P1 | 10 min |
| Archivar / Activar | 1 · Funciona | `toggleActive()` o `ArchiveEmployeeDialog` (inserta archivo + audit + navega) | `UnifiedPersonProfile.tsx:882` | — | — |
| Resolver identidad | 1 · Funciona | Carga roster y abre `IdentityResolutionDrawer` | `UnifiedPersonProfile.tsx:772` | — | — |
| Volver a Equipo (breadcrumb) | 1 · Funciona | `/app/employees` existe | `UnifiedPersonProfile.tsx:597` | — | — |
| **Cards** |
| Datos principales → Editar | 3 · Handler roto (efecto invisible) | `onEdit` → misma causa raíz | `ProfileSummaryGrid.tsx:260` | P0 | — |
| Cumplimiento → Abrir Docs | 3 · Handler roto (efecto invisible) | `onOpenTab("docs")` sobre panel cerrado | `ProfileSummaryGrid.tsx:328` | P0 | — |
| Acceso → Gestionar | 3 · Handler roto (efecto invisible) | `onOpenTab("access")` sobre panel cerrado | `ProfileSummaryGrid.tsx:481` | P0 | — |
| Acceso → Resetear/Generar PIN | 3 · Etiqueta engañosa | Solo navegaba al tab; no abre un flujo de reset | `ProfileSummaryGrid.tsx:542` | P1 | 5 min |
| Acceso → Reenviar invitación | 1 · Funciona | `onInvite` encadenado desde el padre | `ProfileSummaryGrid.tsx:534` | — | — |
| Operación → Ver turnos | 3 · Handler roto (efecto invisible) | `onOpenTab("shifts")` sobre panel cerrado | `ProfileSummaryGrid.tsx:559` | P0 | — |
| Actividad → Log completo | 4 · Ruta/tab incorrecto | `onOpenTab("log")`; el tab real es `activity` → ninguna pestaña coincidía | `ProfileSummaryGrid.tsx:612` | P0 | 5 min |
| **Otros** |
| NextActionCard (CTA dinámico) | 3 · Handler roto (efecto invisible) | Mapeo correcto, panel cerrado | `UnifiedPersonProfile.tsx:988` | P0 | — |
| Revisar documentos pendientes | 1 · Funciona | `/app/documents?status=pending&employee=` | `UnifiedPersonProfile.tsx:1209` | — | — |
| Abrir en Servicios (turnos recientes) | 1 · Funciona | `/app/shifts?employee=` | `UnifiedPersonProfile.tsx:1277` | — | — |
| Abrir Front Desk | 1 · Funciona | `/app/front-desk` existe | `UnifiedPersonProfile.tsx:1315` | — | — |
| Acceso: PIN (generar / guardar / copiar) | 1 · Funciona | `resetEmployeePin`, `setEmployeePin`, edge `admin-reset-password` | `EmployeeAccessTab.tsx:198-232` | — | — |
| Acceso: toggles de módulos del portal | 1 · Funciona | upsert en `employee_portal_modules` | `EmployeeAccessTab.tsx:264` | — | — |
| PortalAccessCard: copiar link / WhatsApp / invitar | 1 · Funciona | `buildWhatsAppTargets` con validación real | `PortalAccessCard.tsx:202-227` | — | — |
| Documentos: subir / ver / aprobar / rechazar / reemplazo / eliminar | 1 · Funciona | Mutations reales + `VersionConflictDialog` (VWC) | `EmployeeProfileTabs.tsx:594-661` | — | — |

**Rutas verificadas contra `src/App.tsx`:** `/app/employees`, `/app/documents`,
`/app/shifts`, `/app/front-desk` — todas existen. **Cero rutas muertas.**

---

## 3. Correcciones aplicadas (UI-only, sin lógica de negocio, sin RLS)

1. `openDeepTab()` canónico + `Collapsible` controlado (`detailsOpen`) +
   `deepTabsRef` para scroll real — `UnifiedPersonProfile.tsx`.
2. Todos los CTA de tarjetas y del `NextActionCard` pasan por `openDeepTab`.
3. Header “Edit” → “Editar”: abre el panel, activa `info` y entra en modo edición.
4. `onOpenTab("log")` → `onOpenTab("activity")` (+ alias defensivo `log → activity`).
5. WhatsApp del header usa `buildWhatsAppTargets`; **si el teléfono no produce
   un destino válido, el botón no se renderiza** (no hay botón muerto).
6. “Resetear PIN” → “Gestionar PIN” (la etiqueta ahora describe lo que hace:
   llevar al panel de acceso donde se resetea/regenera).

## 4. Deuda detectada (no bloqueante, no tocada)

- `PhotoReviewActions`: TODO explícito de audit log (`activity_log`) pendiente.
- `ProfileSummaryGrid`: fila “Módulos: 8/8 activos” está **hardcodeada**; es
  texto, no acción, pero es un dato falso. Debe leer `employee_portal_modules`.
- `EmployeeProfileTabs`: `TabsContent` `pay`, `advances`, `time` sin
  `TabsTrigger` visible → contenido inalcanzable desde la UI.
- `WorkerDocumentsCompliance` no se usa en este módulo (solo en `Employees.tsx`).
- Borrado de documento usa `window.confirm` en vez del diálogo canónico.
