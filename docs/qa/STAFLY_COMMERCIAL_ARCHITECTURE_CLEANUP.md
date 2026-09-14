# STAFLY COMMERCIAL ARCHITECTURE CLEANUP

Fecha: 2026-09-14 · Modo: UI / copy / configuración comercial. Cero migraciones, cero mutaciones de producción.

## 1. Legacy surfaces found

| Superficie | Hallazgo | Estado |
|---|---|---|
| `src/pages/Landing.tsx` | Página huérfana (no referenciada en `App.tsx` ni en ningún import). Contenía Free `$0`, Pro `$29`, Enterprise, "Start free", "Free plan available", "No credit card", "Active in 5 min" en ES y EN. | **Eliminada** |
| `src/pages/PublicLanding.tsx` (`/`) | "StaflyApps is built for…", footer `© StaflyApps`, "scale with Enterprise modules", "Guided setup starts at $299". | Corregida |
| `src/pages/PublicPricing.tsx` (`/pricing`) | Ya canónica ($149/$299/$599+), pero con precios hard-coded locales. | Migrada a configuración única |
| `src/components/public/PublicContactStrip.tsx` | "StaflyApps inquiry", "Guided setup starts at $299". | Corregida |
| `src/lib/contact.ts` | 7 mensajes de WhatsApp con marca "StaflyApps". | Corregidos a "Stafly Core" |
| `src/pages/admin/Pricing.tsx` (`/app/pricing`, interno) | Starter `$0` "Incluido gratis", Pro "Personalizado", Enterprise "A medida". Contradecía el modelo público. | Alineada a Starter $149 / Operations $299 / Scale $599+ |
| `src/hooks/useSubscription.tsx` | Etiquetas `Starter (Gratis)` / `Pro` / `Enterprise`. | Etiquetas → Starter / Operations / Scale (códigos internos intactos) |
| `src/components/billing/UpgradeBanner.tsx` | Fallback de plan "Pro". | → "Operations" |

No se encontró ninguna otra ruta pública con precios: `/terms`, `/privacy`, `/cookies`, `/help`, `/manual` no publican planes.

## 2. Routes affected

- `/` (PublicLanding) — copy de marca y de implementación guiada.
- `/pricing` (PublicPricing) — ahora lee la configuración canónica.
- `/app/pricing` (interno, admins) — etiquetas y precios alineados.
- Ruta eliminada: ninguna. `Landing.tsx` no estaba enrutada.

## 3. Components affected / files changed

- **Nuevo**: `src/lib/commercial/pricing.ts` (`PUBLIC_PLANS`, `GUIDED_IMPLEMENTATION`, `PRICING_SUMMARY_LINE`).
- **Eliminado**: `src/pages/Landing.tsx`.
- **Modificados**: `src/pages/PublicPricing.tsx`, `src/pages/PublicLanding.tsx`, `src/components/public/PublicContactStrip.tsx`, `src/lib/contact.ts`, `src/pages/admin/Pricing.tsx`, `src/hooks/useSubscription.tsx`, `src/components/billing/UpgradeBanner.tsx`.

## 4. Pricing sources found

Antes: 3 fuentes hard-coded (Landing huérfana, PublicPricing, admin/Pricing).
Ahora: **una** fuente pública canónica en `src/lib/commercial/pricing.ts`, consumida por `/pricing`. La pantalla interna `/app/pricing` mantiene sus `PlanCode` internos (`free` / `paid_manual` / `enterprise`) pero muestra las etiquetas y precios canónicos. No se creó ninguna tabla nueva.

## 5. Brand inconsistencies found

"StaflyApps" quedaba como marca de producto en portada, footer, strip de contacto y mensajes de WhatsApp. Todo el copy visible usa ahora **Stafly** (marca) y **Stafly Core** (plataforma).

**Intencionalmente NO cambiados** (identificadores técnicos, según Phase 4):
`com.staflyapps.app` (Capacitor), dominio `staflyapps.com`, correos `*@staflyapps.com`, ref/tablas/RLS del backend, variables de entorno, comentarios internos de código (`gender.ts`, `phone-format.ts`, `StaflyBrand.tsx`, `export-chatgpt-prompt-pdf.ts`).

## 6. CTAs replaced

Eliminados con `Landing.tsx`: "Start free", "Start free now", "Free plan available", "No credit card", "Active in 5 min", "Gratis para empezar".
CTAs vigentes: **Talk to us** (Starter, Operations), **Contact sales** (Scale), **Start guided setup** (primario), **Book a demo** (secundario).

## 7. Signup / activation behavior verified

- No existe ninguna llamada a `supabase.auth.signUp()` en todo el frontend. `/auth` solo ofrece inicio de sesión.
- La única inserción en `companies` está en `src/pages/admin/Companies.tsx`, ruta autenticada bajo `/app` protegida por RLS y permisos de administrador. No es accesible públicamente.
- `/join/:inviteCode` crea un **empleado** a partir de un código de invitación existente; no crea ni activa empresas.
- Los formularios públicos (`demo_requests`, referidos, aplicaciones) solo registran interés; no otorgan acceso.

**¿Existió alguna ruta de auto-activación pública? NO.** La regla "public company creation must not auto-activate" ya se cumple por construcción; no se modificó auth, RLS ni arquitectura de permisos.

## 8. Mobile QA (390 px)

`/` y `/pricing`: sin desbordamiento horizontal, tarjetas legibles, Starter / Operations / Scale visibles, "Recommended" en Operations, sección de implementación guiada legible, jerarquía de CTA clara, sin rastros de prueba gratuita ni gráficos.

## 9. Desktop QA (1280 px)

`/` y `/pricing`: portada, precios, nav, footer, CTAs y enlaces internos consistentes; sin desbordamiento; marca uniforme Stafly / Stafly Core; la portada enlaza a `/pricing` desde nav, CTA final y footer. Única coincidencia de "$29" detectada es la subcadena de "$299".

## 10. Build / typecheck / tests

- Typecheck: OK (0 errores).
- Tests: **1.267 pruebas, 110 archivos, todas en verde**.

## 11. Production data mutations

**Ninguna.** Cero UPDATE / INSERT / DELETE / migraciones / correos. Nómina, turnos, asistencia, documentos, permisos y empresas intactos.

## 12. Remaining commercial inconsistencies

- Los códigos de plan internos siguen siendo `free` / `paid_manual` / `enterprise`; solo se renombraron las etiquetas visibles. Un renombrado de códigos requeriría migración de datos y autorización aparte.
- `PLAN_DEFAULTS` interno mantiene límites 10 / 999 / ∞, que no coinciden con los límites comerciales publicados (25 / 75 / 150+). Cambiarlos afecta gates de funcionalidad de empresas activas: **no se tocó**.
- `docs/BRAND_ARCHITECTURE_V1.md` sigue describiendo la nomenclatura previa; conviene actualizarlo en una pasada de documentación.

🟡 COMMERCIAL UI CLEANED — ACTIVATION / ROUTE REVIEW STILL REQUIRED
