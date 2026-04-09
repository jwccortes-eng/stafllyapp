# Módulo de Billing / Suscripciones — StaflyApps

## Principios

| Principio | Detalle |
|-----------|---------|
| **Billing es PER COMPANY** | Cada empresa tiene su propio plan, límites y estado de facturación |
| **Roles ≠ Billing** | Los roles controlan acceso/gobernanza; el plan controla módulos/límites |
| **Dual mode compatible** | Global mode (developer/owner) nunca es bloqueado por plan de empresa |

---

## Arquitectura actual (estable)

### Fuente de verdad: tabla `companies`

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `plan_code` | TEXT | `free` \| `paid_manual` \| `enterprise` |
| `plan_status` | TEXT | `active` \| `suspended` \| `pending` |
| `billing_status` | TEXT | `none` \| `contact_requested` \| `invoiced` \| `paid` |
| `max_employees` | INT | Límite de empleados activos |
| `max_admins` | INT | Límite de administradores |
| `paid_features_enabled` | BOOL | Señal de override Enterprise (si `true`, plan se eleva a Enterprise independientemente de `plan_code`) |
| `trial_ends_at` | TIMESTAMPTZ | (reservado, no en uso) |
| `plan_activated_at` | TIMESTAMPTZ | Fecha de activación del plan |
| `plan_activated_by` | UUID | Quién activó el plan |
| `upgrade_requested_at` | TIMESTAMPTZ | Fecha de solicitud de upgrade |

### Plan resolution (unified)

```
resolveEffectivePlan(plan_code, paid_features_enabled):
  if plan_code == "enterprise" → enterprise
  if paid_features_enabled == true → enterprise (override)
  if plan_code == "paid_manual" → paid_manual (Pro)
  else → free (Starter)
```

This means there are TWO ways to activate Enterprise:
1. Set `plan_code = 'enterprise'` (explicit)
2. Set `paid_features_enabled = true` on any plan (override signal)

### Plan hierarchy

```
enterprise (2) > paid_manual (1) > free (0)
```

### Planes disponibles

| Plan Code | Label | Max Employees | Max Admins | Módulos |
|-----------|-------|---------------|------------|---------|
| `free` | Starter | 10 | 2 | employees, concepts, shifts, announcements, applications, directory |
| `paid_manual` | Pro | 999 (configurable) | 10 | Todo lo anterior + timeclock, periods, import, movements, summary, reports, clients, locations, automations, chat, monetization, api-access, reconciliation, command-center, payroll |
| `enterprise` | Enterprise | ∞ | ∞ | Todo (≥ Pro, sin restricciones) |

### Module access resolution

```
canAccessModule(moduleKey):
  1. Plan hierarchy: tierIndex(effectivePlan) >= tierIndex(requiredPlan) → ALLOW
  2. company_modules override: if module is explicitly enabled in company_modules → ALLOW
  3. Otherwise → BLOCK
```

This dual check means:
- Plan controls the baseline (free/pro/enterprise)
- `company_modules` can grant additional access (admin manual override)
- Both are respected, neither is ignored

### Module gating

- `MODULE_PLAN_MAP` en `useSubscription.tsx` define qué plan mínimo requiere cada módulo
- `ModuleGate` component bloquea acceso y muestra upgrade prompt
- **Global mode bypass**: ModuleGate no aplica cuando `isGlobalMode === true`
- **Enterprise bypass**: Enterprise tier pasa todos los checks de Pro y Free

---

## Flujo comercial actual (Free + Paid Manual + Enterprise)

1. Empresa se registra → `plan_code: free`, `plan_status: active`
2. Admin solicita upgrade → `upgrade_requests` table, `billing_status: contact_requested`
3. Equipo interno contacta y activa manualmente → `plan_code: paid_manual` o `enterprise`
4. Alternativa: set `paid_features_enabled: true` para override Enterprise
5. Gestión en `/app/upgrade-requests` (panel interno)

---

## Dual mode y billing

| Modo | Pricing page | Module gating |
|------|-------------|---------------|
| **Company mode** | Muestra plan de la empresa seleccionada con CTAs de upgrade | Aplica según effectivePlan de la empresa |
| **Global mode** | Muestra tabla resumen de todas las empresas y sus planes | **No aplica** — developer/owner accede a todo |

---

## Archivos clave

```
src/
  hooks/useSubscription.tsx       → Hook de estado de plan (React Query, lee companies + resolveEffectivePlan)
  hooks/useBilling.tsx            → Hooks: useContactSales, useRequestUpgrade
  components/ModuleGate.tsx       → Gate de módulos (bypass global + enterprise + company_modules)
  components/billing/
    UpgradeBanner.tsx             → Banner de upgrade
    UpgradeRequestDialog.tsx      → Diálogo de solicitud de upgrade
  pages/admin/
    Pricing.tsx                   → Dual: overview global / plan de empresa (3 tiers)
    Billing.tsx                   → Estado de suscripción (company mode)

supabase/
  functions/
    billing-checkout/index.ts           → Stub para futuro Stripe Checkout
    billing-webhook/index.ts            → Stub para futuro Stripe webhook
    billing-subscription-status/index.ts → GET estado de suscripción
    billing-customer-portal/index.ts    → Stub para futuro Stripe Portal
```

---

## Tablas de soporte

### `upgrade_requests`

Registra interés de upgrade para seguimiento comercial.

### `billing_events`

Reservada para eventos de facturación futuros (webhooks Stripe, etc.).

### `company_modules`

Overrides manuales de módulos por empresa. Usado como señal adicional por `canAccessModule`.

---

## Modelo futuro (migration-safe)

Cuando se necesite automatizar pagos o llevar historial:

### 1. Crear tabla `company_subscriptions`

```sql
CREATE TABLE company_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  plan_code TEXT NOT NULL DEFAULT 'free',
  status TEXT NOT NULL DEFAULT 'active',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN DEFAULT false,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### 2. Migrar datos

- Copiar `plan_code`, `plan_status` de `companies` a `company_subscriptions`
- Mantener `companies.plan_code` como cache/read para performance

### 3. Conectar Stripe

- Activar `billing-checkout`, `billing-webhook`, `billing-customer-portal`
- Secrets: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`

### 4. No romper lo actual

- `useSubscription` sigue leyendo de `companies` como cache
- Agregar fallback a `company_subscriptions` cuando exista
- Transición gradual, empresa por empresa

---

## Variables de entorno (futuras)

| Variable | Descripción |
|----------|-------------|
| `STRIPE_SECRET_KEY` | Clave secreta de Stripe |
| `STRIPE_WEBHOOK_SECRET` | Signing secret del webhook |

No son necesarias en el modelo actual (manual).
