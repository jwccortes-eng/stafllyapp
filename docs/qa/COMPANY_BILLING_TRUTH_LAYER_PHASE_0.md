# FASE 0 — COMPANY BILLING TRUTH LAYER

Estado: COMPLETADA
Alcance: solo verdad y presentación. Sin Stripe, sin facturas, sin suspensiones, sin cambios de plan de datos reales.

## 1. Problema corregido

El Command Center de compañías presentaba la tabla `subscriptions` como si gobernara el servicio:
MRR, "suscripciones activas", plan y vencimiento salían de ahí. En la práctica el acceso
real lo gobiernan otros campos:

| Dimensión | Fuente real | Se mostraba antes |
|---|---|---|
| Plan efectivo | `companies.plan_code` (+ overrides manuales) | `subscriptions.plan` |
| Entitlements | plan base + `company_modules` | conteo plano de módulos |
| Acceso al producto | `companies.is_active` | `subscriptions.status` |
| Aprobación comercial | no implementada | insinuada por `status` |
| Cobro | inexistente (Stripe inoperante) | MRR calculado |

Resultado: KPIs falsos (ingreso que nadie cobra, suscripciones "activas" que no dan acceso).

## 2. Modelo de verdad

`src/lib/billing/company-truth.ts` — modelo puro, sin I/O, sin efectos.

- `buildCompanyTruth(input)` resuelve:
  - **plan efectivo** reutilizando `resolveEffectivePlan` de `useSubscription` (misma
    función que gobierna el gate real; se exportó en vez de duplicarse).
  - **entitlements**: heredados del plan, añadidos por `company_modules`, y removidos
    (plan los da, la empresa los tiene apagados).
  - **estado comercial**: `not_configured | manual | legacy_subscription | inconsistent`.
  - **acceso**: `is_active` con razón textual, no un badge decorativo.
  - **aprobación**: siempre `no_implementado` — se declara explícitamente en vez de simularse.
  - **contradicciones** con severidad (`warning` / `critical`).
- `summarizeTruth(list)` produce los KPIs agregados honestos.

Contradicciones detectadas:
1. `status = inactive` pero `is_active = true` (acceso sin respaldo comercial) — crítica.
2. `subscriptions.plan` ≠ `companies.plan_code` (subscription legacy engañosa) — warning.
3. `subscriptions.status = active` sin `stripe_subscription_id` — warning.
4. `paid_features_enabled` sin plan de pago efectivo — warning.
5. Límite de empleados/admins excedido respecto al plan efectivo — warning.
6. Empresa sin `plan_code` (billing no configurado) — informativa.

## 3. Cambios de UI

`src/pages/admin/Companies.tsx`

Eliminado:
- KPI de MRR y "ingreso mensual".
- KPI de "suscripciones activas".
- Columna de plan basada en `subscriptions`.
- Filtros por plan comercial inexistente.

Añadido:
- KPIs operativos: **Requiere revisión**, **Billing no conectado**, **Subscription legacy**,
  **Acceso restringido**.
- `InsightCard` "Configuración comercial inconsistente" cuando hay contradicciones críticas.
- Columnas: *Plan efectivo*, *Subscription registrada* (etiquetada legacy), *Estado comercial*,
  *Acceso*, *Revisión* (conteo de contradicciones).
- Filtros por realidad operativa (`review`, `no_billing`, `legacy`, `restricted`).
- `CompanyTruthPanel` reemplaza la pestaña de billing simulado: muestra plan efectivo y su
  origen, entitlements heredados/añadidos/removidos, acceso con razón, aprobación no
  implementada y la lista de contradicciones.

Todo el panel es **solo lectura**. No hay acción que cambie plan, acceso ni cobro.

## 4. Seguridad

### 4.1 `billing_events` — WITH CHECK explícito
La policy `FOR ALL` de owners globales declaraba solo `USING`. Postgres reutiliza `USING`
como `WITH CHECK` implícito, pero la ausencia explícita es deriva peligrosa ante cualquier
edición futura. Migración idempotente aplicada:

```sql
DROP POLICY IF EXISTS "Owners can manage all billing_events" ON public.billing_events;
CREATE POLICY "Owners can manage all billing_events"
ON public.billing_events FOR ALL
USING (is_global_owner(auth.uid()))
WITH CHECK (is_global_owner(auth.uid()));
```

Sin cambio de comportamiento efectivo. No se tocaron grants, owner ni datos.

### 4.2 `billing-checkout` — validación de pertenencia
La función aceptaba `companyId` del body sin verificar que el usuario autenticado
perteneciera a esa empresa: cualquier usuario podía abrir un checkout atribuido a un tenant
ajeno vía metadata. Se añadió verificación contra `company_users` (con RLS del usuario) y
respuesta `403 Forbidden` cuando no hay membresía.

## 5. QA

Modelo (`src/test/company-truth.test.ts`, 10/10 en verde):

| # | Caso | Resultado |
|---|---|---|
| 1 | Empresa sin `plan_code` | plan efectivo `free`, estado `not_configured` |
| 2 | Plan manual elevado sin Stripe | estado `manual`, sin MRR simulado |
| 3 | `subscriptions.plan` ≠ `plan_code` | contradicción legacy, plan efectivo manda |
| 4 | `status inactive` + `is_active true` | contradicción crítica |
| 5 | Subscription `active` sin `stripe_subscription_id` | contradicción warning |
| 6 | Módulo añadido sobre el plan | aparece como entitlement añadido |
| 7 | Módulo del plan apagado | aparece como entitlement removido |
| 8 | `paid_features_enabled` sin plan de pago | contradicción warning |
| 9 | Exceso de empleados sobre el límite | contradicción warning |
| 10 | Agregado `summarizeTruth` | conteos coherentes con la lista |

Datos reales observados (solo lectura): `Parceros` con `status inactive` e `is_active true`;
`Sandbox` y `Stafly Demo` con planes legacy en `subscriptions` que la capa de verdad
resuelve correctamente como plan efectivo real.

Typecheck del proyecto: sin errores.

## 6. No hecho (deliberadamente)

- No se conectó Stripe ni se creó `STRIPE_WEBHOOK_SECRET`.
- No se generaron facturas ni cobros.
- No se suspendió ni activó ninguna empresa.
- No se corrigieron los datos contradictorios: la Fase 0 los **muestra**, no los repara.
- No se implementó aprobación, dunning ni periodo de gracia.

## Confirmación

El Command Center de compañías muestra la realidad operativa y comercial actual, sin simular
suscripciones, vencimientos o facturación que todavía no gobiernan el acceso.
