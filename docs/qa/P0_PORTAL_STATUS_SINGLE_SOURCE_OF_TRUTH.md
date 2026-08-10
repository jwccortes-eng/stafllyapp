# P0 — PORTAL STATUS: SINGLE SOURCE OF TRUTH

Fecha: 2026-08-10 · Alcance: UI + helper canónico. Sin cambios de esquema, auth, RLS ni datos.

## 1. Caso real reproducido

Sophia Contreras aparecía simultáneamente como "Cuenta activada — ya tiene acceso al portal"
(diálogo de invitación) y "Sin portal" (pestaña Equipo del Servicio).

Lectura de datos (solo consulta):

| employee_id | is_active | user_id | invitación |
|---|---|---|---|
| b21476e3… | true | 27a62131… | accepted (2026-04-27) |
| 511ba843… | true | — | — |
| ef96e166… | true | — | — |
| f5a6230d… | false | — | — |

Diagnóstico: **cuatro registros de la misma persona**. El registro con portal es uno solo.
Además, dos superficies usaban criterios distintos:

- Diálogo de invitación: `invitation.status === "accepted"` → decía "Cuenta activada".
- Servicio / Equipo / Postulaciones / Identidad: `employees.user_id` → decía "Sin portal".

No había lectura incorrecta de auth ni de RLS: había **dos definiciones de verdad**.

## 2. Regla canónica

Una persona tiene acceso real al portal **si y solo si** su fila de `employees` está
vinculada a una cuenta (`employees.user_id`). Ninguna otra señal (invitación aceptada,
PIN, teléfono, estado del turno) implica acceso.

Estados canónicos (`src/lib/portal/portal-status.ts`):

| estado | condición | etiqueta |
|---|---|---|
| `active` | `user_id` presente | Portal activo |
| `invited` | invitación viva, sin `user_id` | Invitado |
| `invite_failed` | último intento falló/rebotó | Invitación fallida |
| `activation_unlinked` | invitación `accepted` pero sin `user_id` | Activación sin vincular |
| `ready_to_invite` | sin portal, con teléfono + PIN | Sin portal |
| `incomplete` | sin portal, faltan datos | Sin portal |
| `inactive` | trabajador desactivado y sin cuenta | Inactivo |

El estado del turno (`pending`/`confirmed`/`rejected`) **no entra** al resolver.

## 3. Cambios

Nuevo: `src/lib/portal/portal-status.ts` — `resolvePortalStatus`, `hasPortalAccess`,
`portalStatusLabel`. No se crearon campos ni tablas.

Migrados al resolver:

- `src/components/employee/PortalAccessBadge.tsx` — `getPortalAccessState` ahora es
  una proyección 1:1 del resolver; copy unificado a español; nuevo estado `unlinked`.
- `src/components/employee/PortalAccessCard.tsx` — icono y descripción del nuevo estado.
- `src/components/employee/EmployeeInviteDialog.tsx` — "Cuenta activada" exige `user_id`;
  invitación aceptada sin vínculo muestra "Activación sin vincular" con guía a Calidad de identidad.
- `src/components/shifts/ShiftDetailDialog.tsx` — pestaña Equipo y contador "N sin portal"
  usan `hasPortalAccess`; tooltip aclara que no depende del estado del turno.
- `src/pages/admin/Applications.tsx` y `src/components/identity/IdentityGroupReviewDialog.tsx`
  — etiquetas vía `portalStatusLabel`.

Consumidores indirectos ya cubiertos: Equipo (`/app/employees`), Perfil (PortalAccessCard),
Invitaciones y selectores, todos vía `PortalAccessBadge`.

## 4. QA

`src/test/portal-status.test.ts` — 8 casos en verde:

1. Portal activo → "Portal activo", `hasPortalAccess = true`.
2. Invitada sin activar → "Invitado", sin acceso.
3. Sin portal (listo para invitar / incompleto) → "Sin portal" en ambos.
4. Portal activo + turno pendiente → sigue "Portal activo".
5. Portal activo + turno aceptado → sigue "Portal activo".
6. Caso Sophia (invitación aceptada sin `user_id`) → "Activación sin vincular", nunca "Cuenta activada".
7. Invitación fallida distinta de "Sin portal".
8. Acceso real gana sobre desactivación operativa.

Typecheck limpio.

## 5. Pendiente de negocio (no es bug de UI)

Los 4 registros de Sophia son duplicados de identidad. La corrección de datos se hace
desde Calidad de identidad (`/app/identity-quality`) con el plan de consolidación existente;
este pase no toca datos.
