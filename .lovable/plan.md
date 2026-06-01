# Plan: i18n Foundation v1 (en/es) + contentMode

## Estado actual

- No existe infraestructura de i18n (`react-i18next`, `LanguageContext`, `locales/`, `useTranslation` no aparecen en el repo).
- Strings están hardcoded mezclando ES/EN en componentes y páginas. Memoria del proyecto fija "Admin Desk es Spanish-first; portal ES; date-fns `enUS` permitido".
- Date helpers (`date-format`, `format-helpers`, etc.) ya están centralizados — buena base, no se tocan.

## Modelo

Separar dos ejes, como pediste:

- `language: 'en' | 'es'` (idioma del usuario, fallback `en`)
- `contentMode: 'app' | 'guide' | 'marketing'` (tono / tipo de contenido, NO un idioma)

Sin librería externa (cero deps, cero riesgo a runtime). Implementación basada en:

```text
src/i18n/
  index.ts            # t(key, vars?, mode?) + useT() hook + Provider
  LanguageContext.tsx # provider + localStorage('stafly.lang')
  dictionaries/
    en/app.ts
    en/guide.ts
    es/app.ts
    es/guide.ts
```

Reglas:
- `t('shifts.empty.title')` → busca `language[contentMode]` → fallback `en.app` → fallback a la key.
- Nunca lanza. Nunca rompe render.
- Solo capa de presentación. Cero acceso a DB, RLS, edge functions, enums.

## Alcance v1 (alto impacto, bajo riesgo)

Solo se convierten textos visibles en estas superficies, sin tocar lógica:

1. `AdminSidebar` (grupos + links)
2. `PortalBottomNav` + títulos de portal
3. Botones globales repetidos: Save, Cancel, Edit, Delete, Confirm, Back, Loading…
4. Empty states genéricos
5. Toasts comunes (success/error genéricos)
6. Settings → nuevo bloque "Language" con switch EN/ES (persistido en `localStorage`)

NO se tocan en v1:
- Shifts editor, Time Clock engine, Payroll Reconciliation, Documents engine, Reviews, Reports, Onboarding wizard, Auth flows. Quedan en su copy actual (ES-first) y se migran en fases posteriores.

## Boundaries de seguridad

NO se toca: auth, RLS, payroll, time_entries, scheduled_shifts, shift_assignments, payments, bookings, chat, enums, migrations, edge functions, Supabase types, nombres de status internos.

`language` y `contentMode` viven 100% en cliente (`localStorage`). No se persiste en DB en v1.

## QA

- Desktop: AdminSidebar, Settings → Language switch, toasts globales.
- Mobile 390x844: PortalBottomNav, títulos, empty states.
- Fallback: forzar key inexistente → debe renderizar `en.app` o la key cruda, nunca crashear.

## Entregables

- `src/i18n/*` (provider + dictionaries + `useT`).
- Wire `<LanguageProvider>` en `App.tsx`.
- Convertir AdminSidebar, PortalBottomNav, botones comunes a `t(...)`.
- Bloque "Language" en `/app/settings` (o equivalente existente).
- Memoria `mem://architecture/i18n-foundation-v1` documentando el modelo.

## Riesgos

- Riesgo de regresión visual: bajo — solo se reemplazan literales por `t()` con el mismo texto ES por defecto.
- Riesgo de "media traducción": mitigado limitando v1 a las 6 superficies arriba. El resto sigue mostrando ES actual.

## Fuera de scope (fases futuras)

- Migrar Shifts/Payroll/Documents copy a `t()`.
- Persistir preferencia de idioma en `profiles`.
- `contentMode='guide'` poblado (hoy solo se define la estructura).
- Pluralización avanzada / ICU.
