# P0 — Adopción del Operational Workspace en el Critical Path administrativo

Alcance: **sólo presentación y lenguaje visible**. No se tocaron consultas,
permisos, RLS, payroll, escrituras VWC ni reglas de negocio.

## Estándar aplicado

1. Cabecera compacta sticky (`OperationalWorkspace`): empresa → título →
   contexto → una acción protagonista.
2. Buscador único (`WorkspaceSearch`) en el slot de cabecera.
3. Pestañas canónicas (`WorkspaceTabs`) con subrayado y contador.
4. Métricas como chips (`metrics`), nunca cards grandes de KPI.
5. Panel administrativo colapsable (`admin`) para exportación, QR, auditoría
   y avisos de alcance.
6. Entidades con `EntityCard` / `EntityRow`; prohibido crear tarjetas nuevas.
7. Copy en español operativo, sin mezcla con inglés.

## Pantallas migradas

| Pantalla | Antes | Ahora |
|---|---|---|
| Invitaciones (`/app/invite`) | `PageHeader` + cards de KPI | Workspace, 3 chips, link/QR en panel admin |
| Postulaciones (`/app/applications`) | `PageHeader` + Radix Tabs | Workspace, `WorkspaceTabs`, filtro de tipo en `filters` |
| Referidos (`/app/referrals`) | Header artesanal, copy en inglés | Workspace, `EntityCard` por candidato, copy en español |
| Solicitudes (`/app/requests`) | `PageHeader` + 5 cards de KPI | Workspace con chips clicables, agrupación por urgencia |
| Ubicaciones (`/app/locations`) | `PageHeader` + barra de exportación | Workspace, filtro de estado, exportación y auditoría en panel admin |
| Documentos (`/app/documents`) | `PremiumPageHeader` + Tabs + pills mobile | Workspace, chips + `WorkspaceTabs` única, tabla en español |
| Bandeja de documentos (`/app/document-intake`) | Header artesanal + botones de filtro | Workspace, pestañas canónicas, aviso desktop en panel admin |
| Cumplimiento (`/app/compliance-center`) | Header artesanal + aviso fijo | Workspace, aviso de alcance en panel admin |

## Lenguaje unificado

- `DOC_STATUS_LABEL` y `DOC_SOURCE_LABEL` (`src/lib/documents-signals.ts`)
  pasan a español.
- `EXPIRATION_POLICY_LABEL` y `EXPIRATION_STATE_LABEL`
  (`src/lib/onboarding/document-expiration-policy.ts`) pasan a español.
- Referidos: estados, acciones y textos del panel lateral en español.

## Verificación

- `tsgo --noEmit` sin errores.
- Playwright 1280×1800 en las 8 rutas: render correcto, sin errores nuevos de
  consola (sólo advertencias preexistentes de `forwardRef`).
- Ningún handler, filtro o pestaña eliminado; sólo reubicados.
