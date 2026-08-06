# ECC — FASE 1. CANONICAL COMMERCIAL READ MODEL

Estado: COMPLETADA (solo lectura / shadow)
Alcance: una lectura canónica y explicable por company. Cero escrituras, cero cambios de acceso,
cero Stripe, cero migraciones, cero cambios en `companies`, `subscriptions` o `company_modules`.

## 1. Contrato de lectura

`src/lib/ecc/commercial-read-model.ts` — modelo puro, sin I/O.

```ts
getCommercialContractReadModel(input: EccReadModelInput): EccReadModel
```

Devuelve: `commercialAccount`, `company`, `approvalState`, `commercialState`, `accessState`,
`effectivePlan`, `planSource`, `subscriptions`, `effectiveEntitlements`, `entitlementSources`,
`lifecycleCapabilities`, `effectiveLimits`, `limitSources`, `overrides`, `partner`,
`billingReadiness`, `contradictions`, `warnings`, `legacySources`, `legalAccessPreserved`,
`version`, `generatedAt`.

Ninguna capability es un booleano suelto. Cada una expone:

```ts
{ key, enabled, source, reason, limit, override, confidence, contradiction }
```

## 2. Fuentes usadas (todas reales, ninguna inventada)

| Dato | Fuente |
|---|---|
| Plan efectivo | `companies.plan_code` + `paid_features_enabled` vía `resolveEffectivePlan` (mismo resolver que `useSubscription`/`ModuleGate`) |
| Entitlements de módulo | `MODULE_PLAN_MAP` (plan) OR `company_modules.is_active` (override) — misma regla que `canAccessModule` |
| Límites | `companies.max_employees` / `max_admins`, o el default del plan |
| Aprobación / acceso / condición comercial | `companies.approval_state` / `access_state` / `commercial_state` vía `normalizeLifecycle` |
| Capacidades de ciclo de vida | `ACCESS_MATRIX` + `canDo` de `src/lib/company/access-state.ts` |
| Subscription | `subscriptions` (declarada legacy; no gobierna entitlements) |
| Versión | `companies.version` |
| Partner | opcional en el input; hoy `relationship: "none"` porque no existe tabla |
| Commercial account | derivado (`derived: true`) — no existe tabla; nunca se simula |

`SOURCE_LABEL` traduce cada `ValueSource` (`plan_code`, `company_modules`, `subscription_legacy`,
`access_state`, `approval_state`, `manual_override`, `default`, `unknown`).

## 3. Reglas de resolución

1. El plan efectivo se calcula con el resolver de producción; si `paid_features_enabled` eleva,
   la fuente pasa a `manual_override`.
2. Un módulo está habilitado si el plan lo concede **o** si `company_modules` lo activa
   (idéntico al gate real). Cualquiera de estas dos vías marca `contradiction: true`:
   - plan lo concede pero `company_modules` lo desactiva (la desactivación no surte efecto);
   - plan no lo concede pero el override lo habilita.
3. El ciclo de vida no cambia el entitlement de plan: se reporta aparte en
   `lifecycleCapabilities`, y las capacidades de plan añaden en su `reason` el bloqueo por falta
   de aprobación.
4. `NEVER_BLOCKED` (lectura de operaciones, payroll histórico, fichajes, documentos, facturas,
   exportación, método de pago, soporte) siempre `enabled: true` → `legalAccessPreserved`.
5. Confianza: `alta` cuando la fuente es única y coherente; `media` cuando interviene un override.

## 4. Contradicciones detectadas

| Código | Severidad |
|---|---|
| `plan_vs_subscription_plan` | media |
| `active_subscription_without_customer` | media |
| `active_without_approval` | alta |
| `access_active_commercial_cancelled` | alta |
| `module_override_<módulo>` | media |
| `limit_exceeded_max_employees` / `limit_exceeded_max_admins` | media |
| `enterprise_without_subscription` | media |
| `free_with_paid_subscription` | alta |
| `inactive_status_with_active_flag` | alta |
| `partner_data_inconsistent` | media |

Ninguna se corrige automáticamente. El bloqueo de acceso legal se vigila con
`legalAccessPreserved` y se agrega como `legalAccessBreaches` en las métricas.

## 5. Billing readiness

Estados: `not_configured`, `manual`, `legacy_partial`, `ready_for_subscription`, `inconsistent`,
`blocked`. Cada lectura lista lo que falta: aprobación, contrato, versión de plan, contacto de
facturación, mapeo de cliente, método de pago, webhook, moneda, datos fiscales. No se crean
customers ni subscriptions.

## 6. Shadow comparison

`compareWithLegacy(model, input)` compara plan efectivo, cada capability y ambos límites contra la
resolución legacy (`plan OR company_modules`). Hoy la comparación es idéntica por diseño: el ECC
reproduce el gate real y sólo añade explicación. Cualquier divergencia futura se reporta como
`ShadowDifference` y se agrega en `summarizeEcc` (`capabilitiesDiffering`, `limitsDiffering`).
El ECC no controla ningún gate: `ModuleGate` y `useSubscription` siguen intactos.

## 7. Observabilidad

`summarizeEcc(entries)` produce métricas de adopción y deuda, no métricas comerciales:
`companiesAnalyzed`, `contradictionsByCode`, `contradictionsHigh`, `capabilitiesDiffering`,
`limitsDiffering`, `billingReadiness` por estado, `unknownSources`, `legacyDependencies`,
`legalAccessBreaches`.

## 8. Command Center

`src/components/billing/EccContractPanel.tsx`, montado en la pestaña *Billing* de
`/app/companies` junto a `CompanyLifecyclePanel` (Fase 1) y `CompanyTruthPanel` (Fase 0), que se
reutilizan sin duplicarse. El panel es 100 % solo lectura: plan efectivo con fuente, aprobación,
acceso, condición comercial, billing readiness y faltantes, límites con fuente, entitlements con
fuente/razón/confianza (filtrables a sólo overrides), contradicciones con sus fuentes, resultado
del shadow comparison, dependencias legacy y estado del acceso legal. No hay ningún control de
edición en esta fase.

## 9. Multi-company y seguridad

- El read model se construye por `company_id`; no hay propagación de capacidades entre compañías.
  `commercialAccount.scope` distingue `account` de `company`, y con dos compañías en la misma
  cuenta el override de una no aparece en la otra (QA7).
- La vista vive en `/app/companies`, protegida por el rol global existente; las acciones de
  decisión siguen limitadas a `owner`. Un tenant admin no accede a esta ruta y sólo ve su propia
  compañía por RLS.
- No se exponen secretos ni métodos de pago: sólo se indica si existe mapeo de cliente.
- No se tocó auth, RLS, grants, tenants, contratos ni production data.

## 10. QA

| # | Caso | Resultado |
|---|---|---|
| 1 | Enterprise sin subscription | VERIFICADO (`enterprise_without_subscription`) |
| 2 | Free con subscription pro | VERIFICADO (contradicción alta + readiness `inconsistent`) |
| 3 | Override de `company_modules` | VERIFICADO (fuente `company_modules`, `contradiction: true`) |
| 4 | Company activa sin aprobación | VERIFICADO (contradicción alta, falta `approval`) |
| 5 | Access restricted | VERIFICADO (operación nueva bloqueada, histórico intacto) |
| 6 | Subscription legacy sin customer | VERIFICADO (`legacy_partial`) |
| 7 | Dos compañías en un mismo account | VERIFICADO (sin propagación) |
| 8 | Tenant admin | VERIFICADO por diseño: ruta y datos limitados por rol/RLS existentes |
| 9 | Global owner | VERIFICADO (vista multi-tenant en Command Center) |
| 10 | Usuario sin permiso | VERIFICADO por diseño: sin acceso a la ruta ni a los datos |
| 11 | Mobile y desktop | VERIFICADO (grid responsive 2/4 columnas) |
| 12 | Cero writes | VERIFICADO (modelo puro; el panel no expone mutaciones) |

Tests: `src/test/ecc-commercial-read-model.test.ts` (10/10). Suites relacionadas
(`company-truth`, `company-access-state`) siguen en verde. Typecheck sin errores.

## 11. Dependencias legacy declaradas

`subscriptions`, `company_modules`, `companies.plan_code`, `companies.paid_features_enabled`,
`useSubscription`/`ModuleGate`. Todas siguen siendo la verdad operativa; el ECC sólo las explica.

## 12. Riesgos pendientes

- No existen `commercial_accounts`, contratos ni versiones de plan: la agrupación es derivada.
- `partner` no tiene persistencia: se acepta por input y se valida su consistencia.
- Billing readiness nunca alcanzará `ready_for_subscription` completo sin contrato, moneda y
  datos fiscales.
- El shadow comparison sólo cubre plan, módulos y límites; capacidades de ciclo de vida no tienen
  contraparte legacy que comparar.

## Confirmación

El ECC puede leer y explicar el contrato comercial efectivo de cada compañía sin modificar
accesos, planes, suscripciones ni datos reales.
