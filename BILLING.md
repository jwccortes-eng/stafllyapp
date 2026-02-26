# Módulo de Billing / Suscripciones

## Arquitectura

```
src/
  hooks/useSubscription.tsx     → Hook de estado de suscripción
  components/billing/
    UpgradeBanner.tsx           → Banner de upgrade (feature gating)
  pages/admin/
    Pricing.tsx                 → Página de planes (/admin/pricing)
    Billing.tsx                 → Estado de suscripción (/admin/billing)

supabase/
  functions/
    billing-checkout/index.ts   → Stub: crear Stripe Checkout session
    billing-webhook/index.ts    → Stub: recibir webhooks de Stripe
```

## Tabla `subscriptions`

| Campo                    | Tipo        | Descripción                          |
|--------------------------|-------------|--------------------------------------|
| id                       | UUID        | Primary key                          |
| company_id               | UUID        | FK → companies (unique)              |
| plan                     | TEXT        | free, pro, enterprise                |
| status                   | TEXT        | active, trialing, past_due, canceled |
| stripe_customer_id       | TEXT        | Stripe Customer ID                   |
| stripe_subscription_id   | TEXT        | Stripe Subscription ID               |
| current_period_end       | TIMESTAMPTZ | Fecha de próxima renovación          |

## Activar Stripe en producción

### 1. Agregar secrets

Agrega los siguientes secrets en Lovable Cloud → Settings → Secrets:

- `STRIPE_SECRET_KEY` → Tu clave secreta de Stripe (`sk_live_...`)
- `STRIPE_WEBHOOK_SECRET` → El signing secret del webhook (`whsec_...`)

### 2. Crear productos y precios en Stripe

1. Ve a [Stripe Dashboard → Products](https://dashboard.stripe.com/products)
2. Crea los productos: **Pro** y **Enterprise**
3. Asigna precios recurrentes mensuales
4. Copia los Price IDs (`price_...`)
5. Reemplaza `PRICE_PRO_MONTHLY` y `PRICE_ENTERPRISE_MONTHLY` en `src/pages/admin/Pricing.tsx`

### 3. Configurar webhook

1. Ve a [Stripe Dashboard → Webhooks](https://dashboard.stripe.com/webhooks)
2. Añade endpoint: `https://<project-id>.supabase.co/functions/v1/billing-webhook`
3. Suscribe los eventos:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`
4. Copia el signing secret y agrégalo como `STRIPE_WEBHOOK_SECRET`

### 4. Descomentar lógica real

En `billing-checkout/index.ts` y `billing-webhook/index.ts`, descomenta las líneas marcadas con `// TODO` para activar la integración real.

### 5. Feature Gating

Usa el hook `useSubscription()` en cualquier componente:

```tsx
const { isPremium, canAccessFeature } = useSubscription();

if (!canAccessFeature("automations")) {
  return <UpgradeBanner feature="Automatizaciones" />;
}
```

Features premium configuradas: `automations`, `monetization`, `advanced-reports`, `api-access`.
