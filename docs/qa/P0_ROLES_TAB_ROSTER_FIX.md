# P0 — Roles Tab Roster Fix

## Problema
La pestaña Roles filtraba el roster por `company_users.role` (nivel de membresía técnico: `admin` / `worker`), compartido por varios roles canónicos. Los cambios de rol operativo se guardan como overrides, por lo que la lista nunca cambiaba.

## Corrección aplicada (mínima)
Archivo: `src/pages/admin/AccessConsole.tsx`

1. El roster de cada Role Card ahora filtra por rol efectivo:
   `resolvePrimaryRole(m.role, m.overrides).role?.key === canonical.key`.
2. Se retira el filtro `m.role === canonical.membershipRole`.
3. Etiqueta renombrada: “Ver personas con este rol (N)” → **“Responsables actuales (N)”** (y “Ocultar responsables”).
4. Bajo cada persona se muestra la misión canónica del rol (`RESPONSIBILITIES[key].mission`).
5. El filtro sigue limitado a `members` de la empresa activa (sin cambios en la carga de datos).

## No modificado
`company_users.role`, memberships, overrides, auth, RLS, esquema y datos reales. Cambio exclusivamente de presentación/resolución en el cliente.

## Consistencia
Usuarios, Roles y Modelo Operativo consumen ahora la misma fuente única (`resolvePrimaryRole`), por lo que un cambio guardado en Usuarios se refleja de inmediato en las otras dos vistas.

## QA esperado (MyStaff)
- Shift Administrator → Sebastián
- Time & Closeout Administrator → Duván
- Payroll Administrator → María
- Company Owner → según modelo efectivo (Jorge / Keury)
- Payroll Approver → solo quien resuelva `resolvePrimaryRole`

Veredicto: 🟢 GO
