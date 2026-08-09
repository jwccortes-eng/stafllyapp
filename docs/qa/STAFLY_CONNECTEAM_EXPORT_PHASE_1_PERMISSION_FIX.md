# STAFLY → CONNECTEAM · FASE 1 — Permiso canónico y desbloqueo del exportador

Fecha: 2026-08-09 · Alcance: UI/autorización · Sin cambios en CSV, payroll ni datos.

## 1. Causa raíz confirmada

`src/pages/admin/Shifts.tsx:429` calculaba el permiso de exportación con el rol
**global** de `useAuth`:

```ts
const isAdminForCompany = role === "owner" || role === "admin";
```

Ese valor se propagaba como `isAdmin` al validador
(`validateShiftForExport`), que devolvía por cada fila el bloqueo
`no_admin` → "Solo administradores pueden exportar" y por tanto
**0 exportables**, aun con permisos operativos válidos sobre la compañía.

Existían tres criterios distintos para la misma acción:

| Entry point | Criterio anterior |
|---|---|
| Bulk (Shifts desktop) | `role === "owner" \|\| role === "admin"` (rol global) |
| Detalle (`ShiftDetailDialog`) | `canAccessAdminForCompany(companyId)` |
| Mobile (`MobileShiftOperationsSheet`) | `canManageShifts(...)` |

## 2. Política canónica única

Se añadió un enlace fino (no un cuarto helper) que ata la política canónica
existente `canManageShifts()` al contexto de auth + compañía:

`src/lib/integrations/connecteam-export-permission.ts`
- `useCanExportConnecteam()` → `canManageShifts({ allRoles, canAccessAdminForCompany, companyId: selectedCompanyId })`
- Fail-closed: sin compañía seleccionada → `false`.
- Cobertura: developer / owner / founder (global) + admin / manager / supervisor
  por tenant vía `canAccessAdminForCompany`.
- `EXPORT_PERMISSION_DENIED_COPY` centraliza el copy de denegación.

## 3. Superficies migradas

- `ExportConnecteamBulkDialog` — resuelve el permiso internamente con el hook;
  se eliminó la prop `isAdmin`.
- `ExportConnecteamPreviewDialog` — idem.
- `Shifts.tsx` — se eliminó `isAdminForCompany` (rol global) y su prop.
- `ShiftDetailDialog` — deja de pasar `isAdminForTenant` al exportador.
- `MobileShiftOperationsSheet` — deja de pasar `canValidate` al exportador.

Resultado: la misma persona en la misma compañía obtiene el mismo resultado
desde bulk, detalle y móvil.

## 4. Permiso ≠ readiness

- **Permiso** (global de la acción): si `useCanExportConnecteam()` es `false`,
  ambos diálogos muestran un banner único "Sin permiso para exportar" y el
  botón de descarga queda deshabilitado con el mismo motivo. `handleDownload`
  también corta con toast (fail-closed en el handler).
- **Readiness** (por servicio): los bloqueos de fila siguen siendo los de
  siempre (borrador, falta fecha/hora, tenant mismatch…). Un usuario autorizado
  ya nunca ve `no_admin` como razón de fila.

## 5. Drafts

Sin cambios: `publication_status !== "published"` sigue bloqueando el servicio
con su copy actual ("El turno está en estado \"draft\". Publica antes de
exportar."). La política de drafts se resolverá en una fase posterior.

## 6. QA

| Caso | Resultado |
|---|---|
| A. Owner tenant | Autorizado (`canAccessAdminForCompany`) |
| B. Admin tenant | Autorizado |
| C. Manager/supervisor | Autorizado por la política canónica; idéntico en desktop/mobile/detalle |
| D. Founder/developer/global owner | Autorizado por `SHIFT_MANAGER_GLOBAL`, sin role strings hard-coded en la UI |
| E. Sin permiso | Fail-closed: banner, botón deshabilitado, cero descarga |
| F. Otra compañía | Fail-closed: sigue el bloqueo `tenant_mismatch` + política por tenant |
| G. Tres entry points | Mismo hook, mismo resultado |
| H. Servicio published y completo | Ya no se bloquea por permiso |
| I. Servicio draft | Sigue bloqueado por draft |
| J. CSV | Sin cambios (no se tocó `connecteam-export.ts`) |

Verificaciones: `tsgo --noEmit` limpio. `vitest run` → 788 pasan; los 7 fallos
restantes son la deuda preexistente documentada en
`docs/qa/DEBT_DRIVER_SYNC_ROUNDTRIP_TEST_FAILURE.md` (driver-sync roundtrip),
ajena a este cambio.

## 7. Evidencia autenticada

Sesión real (usuario Desarrollador, compañía "My Staff Solution LLC"),
`/app/shifts` → Más acciones → Exportar Servicios → Connecteam (.csv):

- Antes: el modal mostraba filas bloqueadas con "Solo administradores pueden
  exportar" y 0 exportables por autorización.
- Después: el modal abre sin banner de permiso y sin ninguna razón `no_admin`;
  el contador de exportables refleja únicamente readiness real (en la semana
  capturada no hay servicios en el rango, por eso 0/0/0).

Captura: `/tmp/browser/ct/export.png` (run Playwright autenticado).

## 8. Qué no se tocó

`connecteam-export.ts` (headers, quoting, BOM, formatos, Job/Sub item, Users,
Number of users), payroll, `time_entries`, `scheduled_shifts`,
`shift_assignments`, tenants, RLS y datos de producción.

## Confirmación

El exportador Connecteam usa una única política tenant-aware de autorización;
los usuarios válidos ya no quedan bloqueados por roles globales y el formato
CSV permanece sin cambios.
