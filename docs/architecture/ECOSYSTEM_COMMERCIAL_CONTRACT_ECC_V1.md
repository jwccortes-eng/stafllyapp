# ECOSYSTEM COMMERCIAL CONTRACT (ECC) — V1

**Fecha:** 2026-08-06
**Tipo:** Arquitectura y modelo objetivo. **No implementación.**
**Estado:** Propuesta para aprobación.
**Alcance:** Stafly Core, Parceros, Quality Staff, MyStaff, JKitchen Staff, partners, white label y futuros productos del ecosistema.

> Esta fase no creó tablas, migraciones, código, contratos, pagos, subscriptions ni entitlements. No se tocó producción.

**Fuentes:**
- `docs/architecture/STAFLY_COMPANY_BILLING_SUBSCRIPTION_LIFECYCLE_FULL_AUDIT.md`
- `docs/qa/COMPANY_BILLING_TRUTH_LAYER_PHASE_0.md`
- `docs/qa/COMPANY_APPROVAL_ACCESS_STATE_PHASE_1.md`
- Arquitectura actual (`src/lib/billing/company-truth.ts`, `src/lib/company/access-state.ts`, `useSubscription`, `company_modules`, `company_lifecycle_transition`).

---

## 1. Resumen ejecutivo

Hoy la relación comercial de una empresa con el ecosistema está repartida entre al menos seis fuentes que compiten: `companies.plan_code`, `companies.paid_features_enabled`, `companies.is_active`, `company_modules`, `subscriptions` (legacy/visual) y el mapa estático `MODULE_PLAN_MAP` en el frontend. La Fase 0 hizo visible la contradicción; la Fase 1 separó aprobación, estado comercial y acceso en `companies` con transiciones versionadas. Falta el paso estructural: **una sola infraestructura comercial que sirva a todos los productos del ecosistema**.

El **Ecosystem Commercial Contract (ECC)** es esa infraestructura. Un contrato comercial por relación empresa ↔ ecosistema, con productos, plan versionado, entitlements materializados, límites explícitos, overrides auditables, suscripción, facturación, acuerdos y estados separados (approval / commercial / access). Stafly y Parceros no implementan billing propio: **consumen el mismo contrato** vía una API canónica de lectura y un carril único de escritura VWC.

La recomendación es adoptar el ECC en **modo sombra primero** (read model + detector de contradicciones), sin retirar nada, y migrar por capacidades y fases con dual-read. Sin big bang.

---

## 2. Principios fundacionales

| # | Principio | Consecuencia de diseño |
|---|---|---|
| 1 | Un solo contrato comercial por relación empresa ↔ ecosistema | `commercial_account` es la raíz; los productos cuelgan de ella |
| 2 | Plan, suscripción, pago, acceso y aprobación son conceptos distintos | Cinco máquinas de estado separadas, nunca un enum único |
| 3 | El acceso no depende de un booleano | `resolveCompanyAccess()` deriva; `is_active` deja de decidir |
| 4 | El pago no borra ni secuestra datos | Suspensión preserva lectura legal: payroll, time_entries, documentos, export |
| 5 | El signup público nunca activa | `approval_state = needs_review`, sin acceso operativo |
| 6 | Los productos comparten capacidades | Capability catalog único, namespaced, sin duplicados |
| 7 | Stafly y Parceros consumen el mismo contrato | Una sola API `getCommercialContract()` |
| 8 | Todo cambio crítico usa VWC | `expected_version` obligatorio, RPC transaccional |
| 9 | Todo evento es auditable e idempotente | `idempotency_key` + event log append-only |
| 10 | Crecer por capacidades, no por planes rígidos | Plan = paquete de entitlements; el motor razona en capacidades |
| 11 | El contrato debe ser vendible, explicable y operable | Cada entitlement tiene nombre comercial y razón de origen |
| 12 | Partners, descuentos y excepciones sin duplicar estructuras | Overrides + partner relationship, no tablas paralelas |

---

## 3. Modelo canónico objetivo

Notación: *(propuesto, no creado)*.

### A. Commercial Account
- **Propósito:** raíz de la relación comercial del ecosistema con una organización (puede agrupar varias companies en multi-company / white label).
- **Owner:** Global Owner / Billing Admin.
- **Claves:** `id`, `legal_entity_name`, `billing_country`, `currency`, `partner_relationship_id?`.
- **Relaciones:** 1..N `companies`, 1..N `product_subscriptions`, 1 `commercial_profile` vigente.
- **Versionado:** `version` (VWC). **Inmutabilidad:** no.
- **Tenant boundary:** account puede cruzar companies **solo** dentro del mismo grupo declarado; nunca cruza datos operativos.
- **Lectura:** global owner, billing admin, tenant owner (vista propia reducida). **Escritura:** global owner / billing admin.
- **NO almacena:** datos de tarjeta, secretos de pasarela, datos personales de trabajadores.

### B. Commercial Profile
- **Propósito:** configuración comercial **vigente y derivada** de la cuenta (plan actual, estados, entitlements efectivos cacheados, límites vigentes).
- **Owner:** el sistema (materializado). **Escritura:** solo por RPC del ECC.
- **Claves:** `account_id`, `effective_at`, `version`.
- **Versionado:** sí. **Inmutabilidad:** no (es proyección; el histórico vive en eventos y snapshots).
- **NO almacena:** decisiones humanas sin evento de respaldo.

### C. Commercial Contract
- **Propósito:** acuerdo marco / documento contractual aceptado.
- **Claves:** `id`, `account_id`, `document_ref`, `accepted_by`, `accepted_at`, `valid_from`, `valid_until`, `contract_version`.
- **Inmutabilidad:** **absoluta** una vez aceptado. Un cambio genera un nuevo contrato que sucede al anterior.
- **Lectura:** global owner, billing admin, tenant owner. **Escritura:** creación por RPC; jamás UPDATE.
- **NO almacena:** el PDF en sí en base de datos (referencia a storage con RLS).

### D. Product
- **Propósito:** unidad vendible del ecosistema.
- **Catálogo:** `stafly_core`, `parceros_marketplace`, `payroll`, `compliance`, `community`, `recruiting`, `ai`, `api`, `white_label`.
- **Inmutabilidad:** el `key` es inmutable; el catálogo es global (no por tenant).

### E. Plan
- **Propósito:** nombre comercial del paquete (`starter`, `pro`, `enterprise`, `partner_reseller`, `parceros_pro`).
- **Owner:** producto/comercial. **Sin lógica de acceso**: el plan no otorga nada por sí mismo.

### F. Plan Version
- **Propósito:** versión **inmutable** del plan tal como fue contratada (entitlements + límites + precio + moneda + ciclo).
- **Claves:** `plan_key`, `version_number`, `published_at`, `deprecated_at?`.
- **Inmutabilidad:** absoluta. Cambiar precios o capacidades = nueva `plan_version`. Los contratos históricos siguen apuntando a su versión.
- **Esto es lo que hace reconstruible "por qué esta empresa tiene esto"** (mismo patrón que `payroll_period_rate_snapshots`).

### G. Entitlement
- **Propósito:** capacidad habilitada para una cuenta/producto.
- **Claves:** `account_id`, `capability_key`, `source` (`plan_version` | `override` | `partner` | `trial` | `migration`), `granted_at`, `expires_at?`, `version`.
- **Decisión:** **materializado** (ver §22.3), derivado de plan_version + overrides por un resolver determinista.
- **Lectura:** todos los productos vía API. **Escritura:** solo resolver/RPC.

### H. Limit
- **Propósito:** límite cuantitativo o cualitativo contratado.
- **Claves:** `account_id`, `limit_key`, `value`, `mode` (`hard`|`soft`), `window`, `source`, `version`.
- **No mezclar con permisos:** un límite nunca decide *si puedes*, decide *cuánto*.

### I. Override
- **Propósito:** excepción comercial explícita y auditable.
- **Campos obligatorios:** `source`, `reason`, `approved_by`, `effective_from`, `effective_until`, `version`, `priority`, `revocable`, `scope` (capability|limit|discount|access).
- **Inmutabilidad:** append-only con revocación por evento, no por DELETE.

### J. Subscription
- **Propósito:** relación recurrente por **producto** (`product_subscription`).
- **Claves:** `account_id`, `product_key`, `plan_version_id`, `status`, `cycle`, `currency`, `current_period_start/end`, `provider_ref?`, `version`.

### K. Invoice
- Factura SaaS del ecosistema al tenant. Append-only; correcciones vía nota de crédito. `status`: `draft|open|paid|void|uncollectible|overdue`.

### L. Payment Attempt
- Intento (incluye fallidos). Inmutable. Con `idempotency_key` y `provider_event_id`.

### M. Payment
- Pago confirmado. Inmutable. Se aplica a una o varias invoices.

### N. Dunning Case
- Proceso de cobro abierto tras `payment.failed`. Tiene `stage`, `retries`, `next_action_at`, `owner`, `resolution`.

### O. Payment Agreement
- Acuerdo formal con cuotas, saldo y excepción de acceso asociada. **Nunca una nota libre.**

### P. Approval State
`draft | needs_review | approved | rejected` — ya existe en `companies` (Fase 1). El ECC lo referencia, no lo duplica.

### Q. Commercial State
`manual | trial | active | past_due | agreement | cancelled`.

### R. Access State
`active | grace | restricted | suspended | cancelled` — ya existe (Fase 1). Derivable, no editable libremente.

### S. Partner Relationship
`partner_id`, `type` (`referral|reseller|implementation|white_label`), `commission_model`, `revenue_share`, `contract_ownership`, `released_at?`.

### T. Audit Event
Log canónico append-only de todo el §18. `idempotency_key` único, `actor`, `tenant`, `version_before/after`, `payload`.

---

## 4. Diagrama de entidades

```text
                       ┌──────────────────────┐
                       │  COMMERCIAL ACCOUNT  │◄── partner_relationship
                       └──────────┬───────────┘
             ┌────────────────────┼────────────────────┐
             │                    │                    │
   ┌─────────▼────────┐  ┌────────▼─────────┐  ┌───────▼────────┐
   │ COMMERCIAL       │  │ COMMERCIAL       │  │  COMPANIES     │
   │ CONTRACT (immut) │  │ PROFILE (proj.)  │  │ (tenants 1..N) │
   └─────────┬────────┘  └────────┬─────────┘  └───────┬────────┘
             │                    │                    │
             │      ┌─────────────┴─────────────┐      │
             │      │                           │      │
   ┌─────────▼──────▼──┐              ┌─────────▼──────▼───┐
   │ PRODUCT           │              │ ENTITLEMENTS       │
   │ SUBSCRIPTIONS     │              │ + LIMITS           │
   │  → PLAN VERSION   │─────────────►│ (materializados)   │
   └─────────┬─────────┘   resolver   └─────────▲──────────┘
             │                                  │
   ┌─────────▼─────────┐              ┌─────────┴──────────┐
   │ INVOICES          │              │ OVERRIDES          │
   │ → PAYMENT ATTEMPT │              │ (append-only)      │
   │ → PAYMENT         │              └────────────────────┘
   │ → DUNNING CASE    │
   │ → AGREEMENT       │
   └─────────┬─────────┘
             │
   ┌─────────▼──────────────────────────────────────────────┐
   │ resolveCompanyAccess()  →  effectiveAccessState        │
   │  approval + commercial + access + agreement + override │
   └────────────────────────┬───────────────────────────────┘
                            │
              ┌─────────────┴─────────────┐
              │                           │
     ┌────────▼────────┐         ┌────────▼────────┐
     │  STAFLY CORE    │         │    PARCEROS     │
     │ (ModuleGate →   │         │ (mismo gate,    │
     │  canUseCapability)        │  mismas keys)   │
     └─────────────────┘         └─────────────────┘

  Transversal: AUDIT EVENTS (append-only) · VWC (expected_version) · RLS
```

---

## 5. Fuente única de verdad

| Dato | Dueño canónico | Fuente hoy (a retirar) |
|---|---|---|
| Identidad de la empresa | `companies` / passport organizacional | `companies` ✅ se mantiene |
| Plan vigente | `product_subscription.plan_version_id` | `companies.plan_code`, `subscriptions.plan` |
| Módulos / capacidades | `entitlements` | `company_modules`, `MODULE_PLAN_MAP`, `paid_features_enabled` |
| Límites | `limits` | `companies.max_employees`, `max_admins`, `PLAN_DEFAULTS` |
| Excepciones | `overrides` | `company_modules` usado como override, notas |
| Facturación | `product_subscription` + `invoices` | `subscriptions` legacy |
| Acceso | `resolveCompanyAccess()` (derivado) | `companies.is_active`, `plan_status` |
| Aprobación | `companies.approval_state` (Fase 1) | inexistente antes |
| Estado comercial | `commercial_state` | `billing_status` |
| Pago | `payments` / `payment_attempts` | ninguno real |
| Acuerdo | `payment_agreements` | notas manuales |
| Partner | `partner_relationships` | inexistente |

**Regla:** ninguna de estas columnas puede volver a ser leída para decidir acceso una vez completada la fase J: `companies.plan_code`, `subscriptions.plan`, `company_modules`, feature flags ad-hoc, `is_active`, `status`, `plan_status`.

**Estrategia de compatibilidad y retiro:**
1. **Congelar** semántica legacy (documentada, no ampliada).
2. **Shadow**: el ECC calcula en paralelo y registra divergencias (sin decidir).
3. **Dual-read**: la UI lee ECC pero cae a legacy si el ECC no resuelve; se mide la tasa de fallback.
4. **Cutover por capacidad** (no por pantalla): cuando la divergencia de una capability = 0 durante N días, ECC pasa a ser autoridad para esa capability.
5. **Retiro**: columnas legacy quedan `read-only` con trigger de bloqueo (mismo patrón que Fase 1) y luego se documentan como deprecadas.

---

## 6. API canónica del ECC

Contratos conceptuales. **No implementados.**

### `getCommercialContract(companyId): CommercialContractView`
```ts
{
  company: { id, name, accountId },
  approvalState: 'draft'|'needs_review'|'approved'|'rejected',
  commercialState: 'manual'|'trial'|'active'|'past_due'|'agreement'|'cancelled',
  accessState:     'active'|'grace'|'restricted'|'suspended'|'cancelled',
  products:  ProductSubscriptionView[],
  plan:        { key, label },
  planVersion: { id, versionNumber, publishedAt, price, currency, cycle },
  entitlements: Entitlement[],        // efectivos, con source y reason
  limits:       LimitView[],          // value, used, mode, window
  overrides:    OverrideView[],       // activos y programados
  subscription: { status, currentPeriodEnd, provider, cycle } | null,
  invoicesSummary: { open, overdue, totalDue, currency, lastPaidAt },
  paymentStatus: 'none'|'ok'|'failed'|'pending',
  dunning:   DunningCaseView | null,
  agreement: PaymentAgreementView | null,
  partner:   PartnerRelationshipView | null,
  lifecycle: { lastTransition, lastActor, at },
  auditSummary: { events30d, lastEventAt },
  warnings:       Warning[],          // p.ej. "billing no conectado"
  contradictions: Contradiction[],    // p.ej. "plan pro sin subscription"
  effectiveAt: ISODate,
  version: number                     // VWC del profile
}
```
**Responsabilidad:** lectura pura, fail-closed en tenant boundary, nunca lanza por dato faltante (lo reporta como `warning`).

| Función | Entrada | Salida | Notas |
|---|---|---|---|
| `getEffectiveEntitlements(companyId)` | companyId | `Entitlement[]` con `source`, `reason`, `expiresAt` | Determinista; cacheable |
| `canUseCapability(companyId, capability)` | key | `{ allowed, reason, requiredPlan?, blockedBy }` | Nunca boolean pelado: siempre razón |
| `getLimit(companyId, limitKey)` | key | `{ value, used, remaining, mode, window, exceeded }` | Consumo desde fuente declarada |
| `resolveAccessState(companyId)` | — | ver §8 | Derivado, no leído |
| `resolveCommercialState(companyId)` | — | `{ state, reason, since }` | Deriva de subscription + invoices + agreement |
| `transitionCompanyLifecycle(companyId, action, expectedVersion, reason, idempotencyKey)` | — | `{ status: applied\|noop\|conflict\|denied, version }` | Ya existe en Fase 1; se extiende |
| `applyCommercialOverride(accountId, override, expectedVersion, idempotencyKey)` | — | `{ overrideId, version }` | Exige `reason` y `approved_by` |
| `revokeCommercialOverride(overrideId, expectedVersion, reason)` | — | `{ version }` | Nunca DELETE |
| `reconcileSubscription(accountId, providerSnapshot, idempotencyKey)` | — | `{ diffs[], applied[] }` | Idempotente y replay-safe |
| `recordPaymentEvent(accountId, event, idempotencyKey)` | — | `{ eventId, effects[] }` | Único punto de entrada de webhooks |

Todas las de escritura: RPC transaccional + `expected_version` + evento de auditoría en la misma transacción.

---

## 7. Capability catalog

Formato de cada capacidad: `key`, `descripción`, `producto`, `dependencias`, `permiso mínimo`, `límite asociado`, `estado` (`ga|beta|experimental`), `versión`, `tipo` (`core|addon|experimental`), `requiere aprobación`, `requiere configuración`.

### STAFLY (`stafly.*`)
| key | tipo | dep. | límite | permiso | aprob. | config. |
|---|---|---|---|---|---|---|
| `stafly.scheduling` | core | `shared.identity` | `max_active_services` | manager | no | no |
| `stafly.services` | core | scheduling | `max_active_services` | manager | no | no |
| `stafly.team_hub` | core | identity | `max_workers` | manager | no | no |
| `stafly.time_clock` | core | services | — | manager | no | sí (geofence) |
| `stafly.payroll_review` | addon | time_clock | `max_payroll_periods` | admin | no | no |
| `stafly.payroll_processing` | addon | payroll_review | `max_payroll_periods` | admin | **sí** | sí (tarifas) |
| `stafly.documents` | core | `shared.documents` | `max_documents`,`max_storage_gb` | admin | no | no |
| `stafly.compliance` | addon | documents | — | admin | no | sí |
| `stafly.validation_center` | core | payroll_review | — | admin | no | no |
| `stafly.recruiting` | addon | identity | — | admin | no | no |
| `stafly.worker_portal` | core | identity | `max_workers` | worker | no | no |
| `stafly.captain_room` | addon | team_hub | — | manager | no | no |
| `stafly.mobile` | core | — | — | worker | no | no |
| `stafly.analytics` | addon | `shared.analytics` | — | admin | no | no |
| `stafly.api` | addon | `shared.api` | `max_api_calls` | owner | **sí** | sí (keys) |
| `stafly.white_label` | addon | `shared.admin` | `max_white_label_brands` | owner | **sí** | sí (branding) |
| `stafly.multi_company` | addon | identity | `max_companies` | owner | **sí** | no |
| `stafly.integrations` | addon | api | `max_integrations` | owner | no | sí |
| `stafly.ai_dispatch` | experimental | scheduling | — | manager | **sí** | no |
| `stafly.operational_signals` | beta | scheduling | — | manager | no | no |

### PARCEROS (`parceros.*`)
`marketplace` (core), `provider_profiles` (core, dep `shared.passport`), `community` (core), `groups` (core), `campaigns` (addon, `max_campaigns`), `opportunities` (core), `referrals` (addon), `bookings` (core, `max_bookings`), `chat` (core, dep `shared.messaging`), `ratings` (core), `passport` (core, dep `shared.passport`), `partner_portal` (addon, requiere aprobación), `payments` (addon, dep `shared.billing`, requiere aprobación + config), `reputation` (core), `verification` (addon, dep `shared.documents`, requiere aprobación), `ai_matching` (experimental).

### SHARED (`shared.*`)
`identity`, `passport`, `documents`, `notifications`, `messaging`, `billing`, `analytics`, `admin`, `audit`, `api`, `partner_logic`.

**Regla anti-duplicado:** si Stafly y Parceros necesitan lo mismo (chat, documentos, pagos, analytics, identidad, API), la capacidad vive en `shared.*` y cada producto la **depende**, no la reimplementa. `stafly.documents` y `parceros.verification` ambos dependen de `shared.documents`.

---

## 8. Limits model

Cada límite: `key`, `mode` (`hard|soft`), `value`, `warning_threshold` (% ), `window` (`instant|monthly|billing_cycle|rolling_30d`), `overage_policy` (`block|allow_billed|allow_flagged`), `grace`, `measurement_source`, `owner`.

| limit_key | window | modo típico | fuente de consumo |
|---|---|---|---|
| `max_workers` | instant | hard | count `employees` activos |
| `max_admins` | instant | hard | count `company_users` rol admin+ |
| `max_companies` | instant | hard | count companies del account |
| `max_active_services` | instant | soft | count `scheduled_shifts` no cerrados |
| `max_documents` | instant | soft | count `employee_documents` |
| `max_storage_gb` | instant | soft | storage usage |
| `max_api_calls` | monthly | soft + overage | contador edge function |
| `max_messages` | monthly | soft | `internal_messages` |
| `max_campaigns` | billing_cycle | hard | Parceros |
| `max_bookings` | monthly | soft | Parceros |
| `max_payroll_periods` | billing_cycle | hard | `pay_periods` consolidados |
| `max_integrations` | instant | hard | integraciones activas |
| `max_white_label_brands` | instant | hard | marcas configuradas |

Reglas:
- **Soft limit**: permite superar, emite `limit.changed`/warning y aparece en Command Center.
- **Hard limit**: bloquea la creación **nueva**; nunca borra ni oculta lo existente.
- **Warning threshold** por defecto 80%.
- **Grace de límite**: 7 días tras superar un hard limit por cambio de plan a la baja.
- Toda medición declara su query fuente; sin fuente declarada, el límite no se aplica (fail-open en medición, fail-closed en permiso).
- **Un límite jamás sustituye a un permiso.**

---

## 9. Overrides

Tipos soportados: capacidad adicional, límite ampliado, excepción comercial, descuento, trial extendido, acceso temporal, acuerdo de pago, feature preview, white label, partner benefit, migration support.

Campos obligatorios: `source` (`sales|support|partner|migration|legal|system`), `reason` (texto obligatorio ≥ 20 chars), `approved_by`, `effective_from`, `effective_until` (nullable solo si `source=partner|legal`), `version`, `priority` (int), `revocable` (bool), `scope`, `target_key`, `value`.

**Precedencia de resolución de entitlements** (mayor gana):
1. `override` con `priority` alto y vigente
2. `partner` entitlement
3. `plan_version`
4. `trial`
5. default del producto

Reglas: sin notas libres como sustituto; expiración automática emite `override.expired`; revocación es evento, no DELETE; todo override aparece en el Command Center con días restantes; overrides nunca cruzan tenants.

---

## 10. Access resolution

### `resolveCompanyAccess(companyId)`
Entradas: approval state, commercial state, access state persistido, subscription, agreement, grace window, overrides, obligaciones legales, entitlements, limits, security flags, tenant status.

Salida:
```ts
{
  effectiveAccessState, capabilities[], blockedCapabilities[],
  requiredActions[], reason, graceUntil, restoreConditions[],
  legalAccessPreserved: true, version
}
```

Orden de decisión (fail-closed):
1. `tenant_status != ok` → `suspended` (seguridad manda).
2. `approval_state != approved` → sin acceso operativo (`restricted` mínimo de onboarding).
3. `access_state` persistido (Fase 1) es el piso.
4. Override de acceso vigente puede **elevar** temporalmente, nunca por encima de una suspensión de seguridad.
5. `commercial_state = agreement` con acuerdo al día → mínimo `grace`.
6. Se aplican entitlements y límites sobre el estado resultante.
7. **Siempre** se garantiza el conjunto legal (§11) sea cual sea el resultado.

`is_active` nunca es la única decisión; en el modelo objetivo es solo un espejo de `effectiveAccessState ∈ {active, grace}`.

---

## 11. Continuidad del servicio

| Estado | Crear/editar operaciones | Payroll nuevo | Lectura histórica | Export | Pagar / facturas | Soporte |
|---|---|---|---|---|---|---|
| **active** | sí | sí | sí | sí | sí | sí |
| **grace** | sí (con avisos persistentes) | sí | sí | sí | sí | sí |
| **restricted** | **no** crea servicios, no consolida payroll, no invita usuarios | no | sí | sí | sí | sí |
| **suspended** | no | no | sí | sí | sí | sí |
| **cancelled** | no | no | sí (ventana de retención) | sí | sí | sí |
| **reactivated** | restauración idempotente al estado previo | sí | sí | sí | sí | sí |

**Conjunto legal inviolable en todos los estados:** payroll histórico, `time_entries`, documentos propios, facturas, exportación de datos, contacto con soporte, cambio de método de pago. Ningún estado comercial puede eliminar u ocultar datos del tenant.

Reactivación: idempotente (`reactivate` dos veces = un solo evento aplicado), restaura entitlements desde `plan_version` vigente (no desde caché), y audita `company.reactivated`.

---

## 12. Approval flow

```text
signup público
   └─► approval_state = needs_review, access_state = restricted, is_active = false
        └─► revisión humana (global owner / billing admin)
             ├─► rejected (motivo obligatorio, auditado, reapplication permitida)
             └─► approved
                  └─► contract accepted (contrato inmutable)
                       └─► plan + plan_version asignados
                            └─► billing contact + payment method
                                 └─► pago confirmado  |  excepción/override comercial
                                      └─► access_state = active  (evento company.reactivated/approved)
```

| Paso | Actor | Requisitos | Auditoría |
|---|---|---|---|
| signup | público | email, empresa, contacto | `company.approval_submitted` |
| revisión | global owner | verificación de identidad/empresa | evento con actor |
| aprobación | global owner | contrato listo | `company.approved` |
| rechazo | global owner | **motivo obligatorio** | `company.rejected` |
| contrato | tenant owner | aceptación explícita | `contract.accepted` |
| plan | billing admin | plan_version publicada | `plan.assigned` |
| método de pago | tenant owner | pasarela o excepción | `subscription.created` |
| activación | sistema | pago o override aprobado | `company.reactivated` |

Tenant creation ocurre en `needs_review` (para poder configurar), pero **sin acceso operativo**. Invitaciones bloqueadas hasta `approved`.

---

## 13. Subscription y billing (diseño, sin implementar)

- **Lifecycle:** `pending → trialing → active → past_due → cancelled | expired`, con `paused` opcional para agreements.
- **Ciclos:** mensual y anual; `currency` por account; `billing_cycle_anchor` explícito.
- **Trial:** duración por plan_version; nunca auto-cobra sin método de pago; su fin emite `grace.started` si no hay pago.
- **Renovación:** genera invoice `draft → open`; el cobro es asincrónico.
- **Prorrateos, descuentos, créditos, reembolsos, impuestos:** modelados como líneas de invoice, nunca como mutación del plan.
- **Métodos de pago:** solo referencia del proveedor; **nunca PAN, CVV ni tokens completos en la base**.
- **Checkout / customer portal:** delegados al proveedor; el ECC guarda solo `provider_ref`.
- **Webhooks:** firma verificada obligatoria, entrada única `recordPaymentEvent()`, idempotente por `provider_event_id`.
- **Reconciliation:** job periódico `reconcileSubscription()` que compara proveedor vs ECC y reporta diffs; nunca corrige acceso silenciosamente.

**Separación estricta:** `subscription.status ≠ invoice.status ≠ payment.status ≠ access_state ≠ approval_state`. Ninguna pantalla puede colapsarlos en un solo badge.

---

## 14. Dunning

```text
payment.failed
 → retry #1 (+1d) → retry #2 (+3d) → retry #3 (+7d)
 → notice (email + in-app, día 0/3/7)
 → grace (hasta día 14, operación completa con aviso persistente)
 → restricted (día 15–29)
 → suspended (día 30+)
 → agreement o pago
 → reactivated (inmediato, idempotente)
```

| Etapa | Ventana | Canal | Owner | Escalamiento |
|---|---|---|---|---|
| retry | 1/3/7 días | sistema | sistema | — |
| notice | 0/3/7 | email + in-app | billing admin | — |
| grace | ≤14 días | email + banner | billing admin | soporte al día 10 |
| restricted | 15–29 | email + banner crítico | billing admin | account owner interno |
| suspended | ≥30 | email + pantalla dedicada | global owner | dirección |

Todo el proceso vive en un `dunning_case` con `idempotency_key` por etapa; reintentos duplicados no crean etapas nuevas. Nunca se suspende inmediatamente. La recuperación (pago o agreement) cierra el caso y reactiva en la misma transacción.

---

## 15. Payment agreements

Entidad con: `amount_total`, `currency`, `installments[]` (fecha, monto, estado), `balance`, `committed_by`, `approved_by`, `grace_extension_until`, `access_exception` (override vinculado), `breach_policy`, `status` (`proposed|active|fulfilled|breached|cancelled`), `version`.

Reglas: un agreement **siempre** genera un override de acceso explícito con vigencia; el incumplimiento de una cuota emite `agreement.breached` y devuelve el acceso al estado dunning correspondiente; requiere aprobación de billing admin; auditoría completa. Un acuerdo nunca es una nota en un campo de texto.

---

## 16. Partners y resellers

Tipos: `referral` (comisión por firma), `reseller` (posee el contrato y factura al cliente final), `implementation` (sin propiedad comercial), `white_label` (marca propia sobre el mismo ECC).

Modelo: `partner_relationship` cuelga del `commercial_account`, define `commission_model`, `revenue_share`, `contract_ownership` (`ecosystem|partner`), `partner_entitlements` (capacidades que el partner puede otorgar), `partner_plan_versions` (planes exclusivos), y `released_at` para la liberación del tenant (el tenant pasa a contrato directo sin perder datos).

Reglas: **partner logic nunca se mezcla con company owner**; un partner admin no es admin del tenant; el partner ve datos comerciales agregados, nunca datos operativos ni personales del tenant sin consentimiento explícito. White label consume el mismo ECC (solo cambia branding y `plan_version`).

---

## 17. Multi-producto

Una empresa contrata Stafly Core + Parceros + Payroll + Documents + Community + API + White Label **bajo un solo `commercial_account`**:

- **Account-level contract:** un contrato marco; los productos son anexos (`product_subscription`), no contratos aislados.
- **Product subscriptions:** una por producto, cada una con su `plan_version`, ciclo y precio.
- **Shared entitlements:** `shared.*` se otorga una vez y sirve a todos los productos (identidad, documentos, mensajería, analytics, audit).
- **Product-specific limits:** `max_campaigns` es de Parceros, `max_payroll_periods` es de Payroll; conviven sin colisionar por namespace.
- **Shared identity:** una sola identidad/passport; el trabajador no se duplica entre productos.
- **Billing consolidation:** una invoice con líneas por producto; un solo estado de cobranza; un solo dunning case.
- **Audit:** un solo event log con `product_key` en el payload.

---

## 18. Integración Stafly (§19 del entregable)

- `useSubscription()` se convierte en un adaptador delgado sobre `getCommercialContract()`; deja de contener `MODULE_PLAN_MAP`.
- `ModuleGate` pasa a `canUseCapability(companyId, 'stafly.x')` y muestra la **razón** devuelta (plan requerido, límite excedido, override expirado, estado de acceso), no un genérico "actualiza tu plan".
- `src/lib/company/access-state.ts` (matriz Fase 1) se conserva como **implementación de referencia** y pasa a alimentarse de `resolveCompanyAccess()`.
- `src/lib/billing/company-truth.ts` (Fase 0) se convierte en el **detector de contradicciones** del modo sombra.
- `company_modules` pasa de fuente a **override migrado** (fase E).

## 19. Integración Parceros (§20 del entregable)

- Parceros **no** crea su propio entitlement engine ni su propio billing: consume `getCommercialContract()` y `canUseCapability('parceros.*')`.
- Los pagos del marketplace (proveedor ↔ cliente) son un dominio **distinto** del SaaS billing y no entran al ECC; el ECC solo gobierna `parceros.payments` como capacidad habilitada.
- Passport e identidad son `shared.*`: un mismo trabajador aparece en Stafly y Parceros sin duplicar registros ni contratos.
- Un partner de Parceros y un reseller de Stafly usan la misma `partner_relationship`.

---

## 20. Seguridad y privacidad

| Rol | Lectura comercial | Lectura financiera | Gestión acceso | Gestión plan | Override | Billing | Partner |
|---|---|---|---|---|---|---|---|
| global owner | total | total | sí | sí | sí | sí | sí |
| billing admin | total | total | sí | sí | sí | sí | lectura |
| support | resumen | no | no | no | propuesta | no | no |
| partner admin | solo sus tenants (agregado) | comisiones propias | no | planes partner | no | no | propios |
| tenant owner | propio | propio | no | solicitud | no | método de pago | no |
| tenant admin | propio (resumen) | no | no | no | no | no | no |
| manager | capacidades efectivas | no | no | no | no | no | no |
| worker | nada comercial | no | no | no | no | no | no |
| system/webhook | escritura vía RPC firmada | sí | derivada | no | no | sí | no |

Protecciones: métodos de pago solo por referencia; invoices y contratos con RLS por account + rol; datos personales fuera del ECC; tenant boundary fail-closed en toda consulta; secretos únicamente en el gestor de secretos; firma de webhook verificada antes de cualquier efecto; RLS con `USING` **y** `WITH CHECK` en todas las tablas (lección de Fase 0 con `billing_events`); GRANT explícito por tabla.

---

## 21. VWC y concurrencia

Todo cambio entra por: PATCH versionado, RPC transaccional, creación idempotente, transición de estado o delta monetario atómico. Nada de UPDATE directo — trigger de bloqueo como en Fase 1.

| Entidad | `expected_version` | Mecanismo |
|---|---|---|
| commercial_account / profile | sí | PATCH versionado |
| commercial_contract | n/a | creación idempotente (inmutable) |
| plan_version | n/a | inmutable, publicación versionada |
| entitlements | sí (versión del profile) | RPC resolver transaccional |
| limits | sí | PATCH versionado |
| overrides | sí | creación idempotente + revocación por evento |
| subscription | sí | RPC de transición |
| invoice / payment | n/a | append-only idempotente por `provider_event_id` |
| agreement | sí | RPC de transición + delta atómico de saldo |
| access state | sí | `company_lifecycle_transition` (ya existe) |

Conflicto → respuesta `conflict` con la versión actual y UI de conflicto única (`VersionConflictDialog`), reusando el carril de `src/lib/data/versioned-write.ts`.

---

## 22. Eventos del ECC

Catálogo: `company.approval_submitted`, `company.approved`, `company.rejected`, `contract.accepted`, `plan.assigned`, `entitlement.granted`, `entitlement.revoked`, `limit.changed`, `override.created`, `override.expired`, `subscription.created`, `subscription.renewed`, `subscription.cancelled`, `invoice.created`, `invoice.overdue`, `payment.succeeded`, `payment.failed`, `grace.started`, `company.restricted`, `company.suspended`, `agreement.created`, `agreement.breached`, `company.reactivated`.

Contrato común de cada evento:
```ts
{ event_id, type, occurred_at, account_id, company_id, product_key?,
  actor: { kind: 'user'|'system'|'webhook'|'partner', id },
  idempotency_key, version_before, version_after,
  payload, replay_safe: true }
```
Propiedades exigidas: idempotente (misma key = un solo efecto), versionado, auditable, tenant-safe, replay-safe (reprocesar no altera estado), observable (métricas por tipo).

---

## 23. Observabilidad

| KPI | Fuente | Owner | Actualización |
|---|---|---|---|
| MRR / ARR | product_subscriptions + plan_version price | billing admin | diaria |
| Active contracts | commercial_contract vigentes | billing admin | diaria |
| Trial | subscriptions `trialing` | growth | diaria |
| Past due / overdue | invoices `open` vencidas | billing admin | horaria |
| Dunning abiertos | dunning_cases | soporte | horaria |
| Agreements activos | payment_agreements | billing admin | diaria |
| Churn / reactivation | eventos `cancelled` / `reactivated` | growth | mensual |
| Expansion / contraction | deltas de plan_version | growth | mensual |
| Capability adoption | uso vs entitlements | producto | diaria |
| Limit usage | medición de límites | producto | horaria |
| Override count | overrides vigentes | billing admin | diaria |
| Tenant health | access_state + contradictions | ops | continua |
| Billing failures | payment_attempts fallidos | billing admin | continua |

**Regla honesta (herencia Fase 0):** ningún KPI monetario se muestra si su fuente no gobierna realmente el acceso; mientras el billing no esté conectado, MRR/ARR aparecen como *no disponible*, no como cero.

---

## 24. Command Center futuro (diseño, sin implementar)

Secciones: compañías en revisión · contratos incompletos · billing no conectado · pagos fallidos · grace · restricted · suspended · agreements · renovaciones próximas · entitlements · límites al 80%+ · inconsistencias · riesgos · actividad · auditoría.

**Mobile:** cards apiladas, listas, KPIs compactos, cero gráficas salvo autorización explícita, **una sola acción principal por card**, cabecera canónica `OperationalScreenHeader`.
**Desktop:** mayor densidad (tabla con columnas de verdad), sin perder lenguaje humano, deep-links directos a la compañía, al contrato, a la factura o al caso de dunning.

Toda acción destructiva o comercial pasa por confirmación con motivo y consume el carril VWC.

---

## 25. Migración desde el estado actual

Sin big bang. Cada fase es reversible.

| Fase | Objetivo | Riesgo | Rollback | Dual-read | Dual-write | Cutover | QA | Métrica | No tocar |
|---|---|---|---|---|---|---|---|---|---|
| **A. Read model canónico** | Vista de solo lectura que agrega legacy en forma ECC | bajo | borrar la vista | n/a | no | ninguno | snapshot vs legacy | cobertura de companies | nada de escritura |
| **B. Shadow resolution** | Resolver entitlements en paralelo sin decidir | bajo | apagar flag | sí | no | ninguno | divergencia por capability | % divergencia | acceso real |
| **C. Contradiction detector** | Listar contradicciones (extiende `company-truth.ts`) | bajo | apagar panel | sí | no | ninguno | casos conocidos | nº contradicciones | datos |
| **D. ECC read-only** | UI lee ECC con fallback a legacy | medio | volver a legacy | sí | no | por pantalla | QA por rol | tasa de fallback | escritura legacy |
| **E. Migración de entitlements** | `company_modules` → overrides + entitlements | medio | tabla legacy intacta | sí | **sí** | por capability | paridad 1:1 | divergencia 0 N días | plan_code |
| **F. Plan versions** | Publicar versiones inmutables y mapear tenants | medio | mapping reversible | sí | sí | por plan | reconstrucción histórica | tenants mapeados | precios reales |
| **G. Subscription canónica** | `product_subscription` como fuente | alto | legacy sigue leíble | sí | sí | por account | estados coherentes | contradicciones 0 | invoices |
| **H. Billing** | Stripe + invoices + webhooks | alto | desactivar pasarela | n/a | no | por account piloto | webhook replay | fallos de pago | payroll |
| **I. Access resolution** | ECC gobierna el acceso | **crítico** | flag a Fase 1 | sí | sí | por tenant | matriz completa §11 | accesos legales preservados | obligaciones legales |
| **J. Retiro de legacy** | Bloquear escritura de columnas legacy | medio | quitar trigger | no | no | global | regresión completa | lecturas legacy = 0 | histórico |

Regla transversal: en toda fase, **nunca** se degrada el acceso de un tenant por un cambio de infraestructura; ante duda, el resolver conserva el acceso previo y levanta una contradicción.

---

## 26. Anti-silos

| Riesgo de silo | Cómo lo evita el ECC |
|---|---|
| Stafly con billing propio | `shared.billing` y un solo `commercial_account`; Stafly solo consume |
| Parceros con entitlement engine propio | mismo `getEffectiveEntitlements()`, mismas keys namespaced |
| Partners con modelo comercial paralelo | `partner_relationship` dentro del mismo account, planes partner como `plan_version` |
| White label como producto aparte | capacidad `stafly.white_label` + branding, mismo ECC |
| Identidad duplicada | `shared.identity` / `shared.passport` únicos |
| Auditoría fragmentada | un solo event log + VWC transversal |
| Company vs tenant duplicados | `company` es el tenant; `account` agrupa, no reemplaza |
| Pay rate mezclado con SaaS billing | dominios separados por diseño: pay rate vive en payroll snapshots, SaaS billing en invoices; **cero cruce de tablas** |

---

## 27. Riesgos

**CRÍTICO** — acceso cross-tenant; cobro duplicado; activación sin aprobación; suspensión que bloquea datos legales; entitlements inconsistentes entre productos; webhook inseguro; pérdida de contrato histórico.
*Mitigación:* fail-closed en tenant boundary, idempotencia obligatoria, approval humano, conjunto legal inviolable, resolver único determinista, verificación de firma, inmutabilidad de contract y plan_version.

**ALTO** — planes duplicados entre productos; overrides invisibles; billing manual sin trazabilidad; estados contradictorios; ausencia de reconciliation.
*Mitigación:* catálogo único de planes, panel de overrides con vigencia, todo movimiento manual como evento, detector de contradicciones permanente, job de reconciliación.

**MEDIO** — UX confusa entre estados; copy que mezcla suscripción y acceso; reporting engañoso.
**BAJO** — presentación y densidad visual.

---

## 28. Roadmap

| Fase | Objetivo | Alcance | Dependencias | Riesgo | QA | Rollback | Cierre |
|---|---|---|---|---|---|---|---|
| 0 | Arquitectura ECC | este documento | — | bajo | revisión | n/a | aprobado |
| 1 | Read model unificado | vista + API de lectura | 0 | bajo | paridad con legacy | borrar vista | 100% companies resueltas |
| 2 | Plan Version + Entitlements | catálogo, versiones, resolver | 1 | medio | reconstrucción histórica | mapping reversible | divergencia 0 |
| 3 | Migration shadow mode | resolución paralela + contradicciones | 2 | bajo | N días sin divergencia | flag off | métrica estable |
| 4 | Subscription canónica | product_subscription | 3 | alto | estados coherentes | legacy leíble | contradicciones 0 |
| 5 | Stripe | checkout, portal, webhooks | 4 | alto | replay de webhooks | desactivar | piloto cobrado |
| 6 | Invoices SaaS | emisión y estados | 5 | medio | cuadre contable | void | ciclo completo |
| 7 | Dunning | retries, avisos, etapas | 6 | medio | simulación de fallo | pausar cases | recuperación probada |
| 8 | Agreements | acuerdos y cuotas | 7 | medio | breach y saldo | cancelar acuerdo | acuerdo cumplido |
| 9 | Access automation | ECC gobierna acceso | 3,7 | **crítico** | matriz §11 completa | flag a Fase 1 | cero pérdidas legales |
| 10 | Revenue Command Center | vista comercial seria | 6-9 | bajo | QA por rol | ocultar vista | KPIs con fuente real |
| 11 | Parceros adoption | Parceros consume ECC | 2,9 | medio | paridad de capacidades | gate local | cero engine propio |
| 12 | Legacy retirement | bloqueo de fuentes legacy | 9,11 | medio | regresión completa | quitar trigger | lecturas legacy = 0 |

---

## 29. Decisiones que toma este documento

1. **¿Commercial Profile y Commercial Contract son entidades separadas?** **Sí.** El contrato es jurídico e inmutable; el profile es la proyección operativa vigente y mutable. Confundirlos impide reconstruir el pasado.
2. **¿Una company puede tener varios product subscriptions?** **Sí**, una por producto bajo un único `commercial_account`, con facturación consolidada.
3. **¿Los entitlements derivan del plan o se materializan?** **Se materializan** desde un resolver determinista (plan_version + overrides + partner). Motivo: rendimiento, auditabilidad y capacidad de explicar el origen de cada capacidad. El resolver siempre puede recomputar desde cero.
4. **¿Cómo se manejan overrides?** Append-only, con motivo, aprobador, vigencia, prioridad y revocación por evento. Nunca notas libres, nunca DELETE.
5. **¿Cómo se calcula el acceso?** `resolveCompanyAccess()` deriva de approval + commercial + access + agreement + override + seguridad, con conjunto legal siempre preservado. `is_active` deja de decidir.
6. **¿Qué estado es editable y cuál derivado?** Editables por transición: `approval_state`, `access_state` (piso), `commercial_state` (por eventos de pago). Derivado: `effectiveAccessState`, entitlements, límites efectivos.
7. **¿Cómo se preservan contratos históricos?** `commercial_contract` y `plan_version` inmutables + event log append-only (mismo patrón probado en `payroll_period_rate_snapshots`).
8. **¿Cómo se facturan múltiples productos?** Una invoice por ciclo con líneas por producto; un solo dunning y un solo estado de cobranza por account.
9. **¿Cómo comparten Stafly y Parceros el mismo ECC?** Misma API, mismas keys namespaced, capacidades comunes en `shared.*`, identidad y passport únicos.
10. **¿Cómo se evita otro silo?** Prohibición explícita: ningún producto puede leer `plan_code`, `company_modules` ni crear su propio gate. El único carril es `canUseCapability()`.

---

## 30. Preguntas abiertas

1. ¿El `commercial_account` agrupa varias companies desde V1 o se difiere a la fase de multi-company/white label?
2. ¿Los pagos del marketplace de Parceros (proveedor ↔ cliente) quedan definitivamente fuera del ECC? (propuesta: **sí**, dominio separado).
3. Moneda: ¿multi-moneda por account desde V1 o USD único inicialmente?
4. Reseller: ¿el partner factura al cliente final o el ecosistema factura y paga comisión? Impacta `contract_ownership`.
5. Política de retención en `cancelled`: ¿cuántos meses de acceso de lectura antes del archivado?
6. ¿Existe obligación fiscal de emisión de facturas locales que condicione el proveedor de pagos?
7. ¿Qué rol interno aprueba overrides por encima de cierto valor económico?
8. ¿Los planes de partner pueden crear capacidades que el catálogo global no tiene? (propuesta: **no**).

---

## 31. Recomendación final

Aprobar el ECC como arquitectura objetivo y ejecutar **solo las fases 1 a 3 (read model, plan versions/entitlements y shadow mode)** antes de tocar cualquier cosa que gobierne acceso o dinero. Ese bloque es de riesgo bajo, no cambia comportamiento y produce la evidencia (divergencia por capacidad, contradicciones por tenant) que hace segura la fase 9. Conectar Stripe antes de tener el read model canónico repetiría el error histórico: otra fuente de verdad compitiendo.

Prioridad inmediata sugerida: **Fase 1 + Fase 3**, reutilizando `src/lib/billing/company-truth.ts` como detector, sin crear tablas todavía.

---

**No se crearon tablas, migraciones, código, contratos, pagos, subscriptions, entitlements ni modificaciones de producción durante esta fase.**
