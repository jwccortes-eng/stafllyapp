---
name: Parceros Launch Foundation Sprint 1
description: 2026-06-08 launch readiness for Parceros mobile (App Store / Play). Legal copy, Auth ?from=parceros variant, Helmet on /parceros/*, Capacitor release configs, assets checklist.
type: feature
---

CLOSED 2026-06-08. Launch foundation sprint for Parceros mobile, no Stafly Core impact.

## Decisions fijadas
- Parceros se publica como app independiente: `appId: com.staflyapps.parceros`, `appName: "Parceros"`.
- Stafly Core mantiene `com.staflyapps.app` / `appName: "Stafly"`.
- Mismo codebase, mismo Lovable Cloud backend; difieren solo en Capacitor config + assets + entry surface (/parceros vs /app|/portal).
- Signup público global sigue cerrado (`disable_signup=true`). Flujo de alta controlado (opción 6.a invite token) DIFERIDO a Sprint 2.

## Archivos cambiados
- `src/pages/legal/PrivacyPolicy.tsx` — sección 0 "Servicios cubiertos", subsección Parceros en datos recolectados, párrafo Parceros en compartición con empleadores, contacto → `info@staflyapps.com`.
- `src/pages/legal/TermsOfService.tsx` — sección 1+2 cubren Stafly Core + Parceros, nueva sección 2.1 "Normas de comunidad (Parceros)", contacto → `info@staflyapps.com`.
- `src/pages/legal/CookiePolicy.tsx` — nueva sección 4 "Aplicabilidad a Parceros", contacto → `info@staflyapps.com`.
- `src/pages/Auth.tsx` — `useSearchParams` + `fromParceros` flag; redirect priority `/parceros` cuando `?from=parceros` y user tiene admin O portal access; left branding panel + form heading + footer condicional (es-ES Parceros vs en-US Stafly).
- `src/layouts/ParcerosLayout.tsx` — redirect a `/auth?from=parceros` (antes `/auth`); `<Helmet>` con title/description/theme-color/og:* solo para rutas bajo `/parceros/*`.
- `src/main.tsx` — wrap App con `HelmetProvider` de `react-helmet-async`.
- `capacitor.parceros.release.ts` (nuevo) — release config Parceros sin `server.url`, separate `android-parceros/` path.
- `capacitor.stafly.release.ts` (nuevo) — release config Stafly Core sin `server.url`.
- `docs/MOBILE_RELEASE.md` (nuevo) — manual flow para builds locales.
- `docs/PARCEROS_LAUNCH_ASSETS.md` (nuevo) — checklist exacto de iconos/splash/screenshots/listings/Privacy Nutrition Label.
- `package.json` — `react-helmet-async@3.0.0`.

## Lo que NO se tocó
- `capacitor.config.ts` raíz (dev preview) — intacto para no romper Lovable preview.
- `index.html` — intacto (instrucción explícita: no tocar `apple-mobile-web-app-title` para no invalidar PWA Stafly ya instalada).
- `auth backend`, `signInWithPassword`, `useAuth`, `disable_signup`, signup global, edge functions, RLS, migraciones, payroll, time_entries, shift_assignments, scheduled_shifts, tenants/company_id, payments, bookings, chat, documents, edge functions, production data.
- Rutas `/app/*`, `/portal/*`, `/kiosk/*` — sin cambios visibles ni de metadata. Helmet solo monta bajo `ParcerosLayout`.

## Reglas de regresión
- `react-helmet-async` requiere `<HelmetProvider>` arriba del árbol. Está en `main.tsx`. Si alguien añade `<Helmet>` en otra ruta sin querer, sobrescribe meta tags pero NO rompe runtime.
- El flag `fromParceros` en Auth.tsx es derivado de URL params; sobrevive solo mientras la query persista. Si en el futuro se agrega OAuth con redirect round-trip, persistir el flag en sessionStorage (no implementado todavía).
- Capacitor release configs son archivos de plantilla; nunca deben commitearse encima del dev `capacitor.config.ts`.

## Pendiente para Sprint 2
- Implementar flujo de alta controlado (opción 6.a invite token reusando `job_applications` + `referral-submit` edge fn existente).
- Generar iconos/splash/screenshots reales con `@capacitor/assets`.
- Llenar Apple App Privacy + Google Data Safety forms.
- `Info.plist` + `AndroidManifest.xml` permissions per-app.
- Decidir si Parceros usa Sign in with Apple (recomendado para App Store).
- Landing pública `https://staflyapps.com/parceros` (Marketing URL para stores).
