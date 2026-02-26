# Módulo de Billing / Suscripciones

## Arquitectura

```
src/
  hooks/useSubscription.tsx       → Hook de estado de suscripción (React Query)
  hooks/useBilling.tsx            → Hooks: useCreateCheckoutSession, useOpenCustomerPortal
  components/billing/
    UpgradeBanner.tsx             → Banner de upgrade (feature gating)
  pages/admin/
    Pricing.tsx                   → Página de planes (/admin/pricing)
    Billing.tsx                   → Estado de suscripción (/admin/billing)

supabase/
  functions/
    billing-checkout/index.ts           → Stub: crear Stripe Checkout session
    billing-webhook/index.ts            → Stub: recibir webhooks de Stripe
    billing-subscription-status/index.ts → GET: leer estado de suscripción
    billing-customer-portal/index.ts    → Stub: abrir Stripe Customer Portal
```

## Tablas

### `subscriptions`

| Campo                    | Tipo        | Descripción                          |
|--------------------------|-------------|--------------------------------------|
| id                       | UUID        | Primary key                          |
| company_id               | UUID        | FK → companies (unique)              |
| plan                     | TEXT        | free, pro, enterprise                |
| status                   | TEXT        | active, trialing, past_due, canceled |
| stripe_customer_id       | TEXT        | Stripe Customer ID                   |
| stripe_subscription_id   | TEXT        | Stripe Subscription ID               |
| current_period_end       | TIMESTAMPTZ | Fecha de próxima renovación          |
| cancel_at_period_end     | BOOLEAN     | Si se cancela al final del periodo   |

### `billing_events`

| Campo          | Tipo        | Descripción                    |
|----------------|-------------|--------------------------------|
| id             | UUID        | Primary key                    |
| company_id     | UUID        | FK → companies                 |
| type           | TEXT        | Tipo de evento Stripe          |
| payload_json   | JSONB       | Payload completo del evento    |
| created_at     | TIMESTAMPTZ | Timestamp del evento           |

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
2. Añade endpoint: `https://<project-ref>.supabase.co/functions/v1/billing-webhook`
3. Suscribe los eventos:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`
4. Copia el signing secret y agrégalo como `STRIPE_WEBHOOK_SECRET`

### 4. Descomentar lógica real

En `billing-checkout/index.ts`, `billing-webhook/index.ts` y `billing-customer-portal/index.ts`, descomenta las líneas marcadas con `// TODO` para activar la integración real.

### 5. Feature Gating

Usa el hook `useSubscription()` en cualquier componente:

```tsx
const { isPremium, canAccessFeature } = useSubscription();

if (!canAccessFeature("automations")) {
  return <UpgradeBanner feature="Automatizaciones" />;
}
```

Features premium configuradas: `automations`, `monetization`, `advanced-reports`, `api-access`.

### 6. Variables de entorno esperadas (placeholders)

| Variable              | Descripción                    | Ejemplo          |
|-----------------------|--------------------------------|------------------|
| STRIPE_SECRET_KEY     | Clave secreta de Stripe        | `sk_live_...`    |
| STRIPE_WEBHOOK_SECRET | Signing secret del webhook     | `whsec_...`      |

Los Price IDs se configuran directamente en `Pricing.tsx`:
- `PRICE_PRO_MONTHLY` → Price ID de Stripe para plan Pro
- `PRICE_ENTERPRISE_MONTHLY` → Price ID de Stripe para plan Enterprise
