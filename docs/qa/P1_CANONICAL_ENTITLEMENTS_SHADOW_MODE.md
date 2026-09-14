# P1 — CANONICAL ENTITLEMENTS LAYER (SHADOW MODE)

Fecha: 2026-09-14 · Modo: sombra (observacional) · Sin enforcement, sin billing, sin migración.

## 1. EXISTING SOURCES FOUND

| Fuente | Qué controla HOY | Estado |
|---|---|---|
| `companies.plan_code` (`free` / `paid_manual` / `enterprise`) | Plan efectivo real. Único que manda | Autoritativo |
| `companies.paid_features_enabled` | Eleva a `enterprise` en `resolveEffectivePlan` | Autoritativo |
| `companies.max_employees` / `max_admins` | Tope mostrado en UI (`useSubscription.maxEmployees/maxAdmins`) | Autoritativo en UI |
| `PLAN_DEFAULTS` / `PLAN_LIMITS` (`useSubscription.tsx`) | Defaults 10/999/∞ y etiquetas Starter/Operations/Scale | Legacy, solo cliente |
| `subscriptions` (`free`/`pro`/`operations`/`scale`) | Nada operativo; solo paneles de diagnóstico | No autoritativo |
| `src/lib/commercial/pricing.ts` | Precios públicos ($149/$299/$599+) | Canónico público |
| `Employees.tsx:533` (`atEmployeeLimit`) | Deshabilita "Añadir trabajador" | Solo cliente |
| `Users.tsx:356` (`atAdminLimit`) | Bloquea invitar admin | Solo cliente |
| Import / reactivación / API externa / RPCs | No consultan ningún límite | Sin enforcement |
| `ModuleGate` + `company_modules` | Acceso a módulos (solo suma, nunca quita) | Cliente |

No se reemplazó ninguna de estas fuentes. La capa nueva las lee y las explica.

## 2. CANONICAL PLAN MODEL

`src/lib/commercial/entitlements.ts` — módulo puro, sin I/O.

- Identificadores canónicos: `starter`, `operations`, `scale`.
- Claves de entitlement: `active_workers`, `admin_users`.
- Catálogo:

| Plan | active_workers | admin_users |
|---|---|---|
| starter | 25 | 2 |
| operations | 75 | 10 |
| scale | `null` (capacidad contractual) | `null` |

**Decisión sobre Scale:** `null` = sin tope estandarizado. "150+" es posicionamiento comercial y NO se implementa como máximo. La capacidad real de una cuenta Scale se expresa con un override explícito cuando exista contrato. Es la opción más segura para Quality Staff (218) y Parceros (184).

## 3. PLAN RESOLUTION RULES

`resolveCanonicalPlan(company)` → `{ plan, source, legacy_source, subscription_plan, confidence, needs_review, conflicts }`.

1. `plan_code` → canónico (`free→starter`, `paid_manual|pro→operations`, `enterprise→scale`).
2. `paid_features_enabled = true` eleva a `scale` (replica el comportamiento vigente) y se registra como conflicto informativo.
3. `subscriptions.plan` es señal **secundaria**: si difiere, se reporta el conflicto y baja la confianza; nunca cambia el plan.
4. `plan_code` desconocido o señales contradictorias con confianza baja → `NEEDS_REVIEW`, sin tope aplicado. Nunca se adivina.

## 4. ACTIVE WORKER DEFINITION

`src/lib/commercial/active-worker-usage.ts`:

```
employees WHERE company_id = :company
  AND is_active = true
  AND deleted_at IS NULL
  AND merged_into_employee_id IS NULL
```

- Inactivos, archivados e históricos: no cuentan.
- Borrados lógicos: no cuentan. Duplicados fusionados: no cuentan.
- Invitados aún no activos: no cuentan (su fila no está activa).
- Admin que además es trabajador: cuenta una sola vez, como trabajador.
- Tenant-scoped por `company_id`; una persona en dos empresas cuenta una vez en cada una.

Verificación: para las 8 empresas, `is_active` puro y la definición canónica coinciden hoy (no hay filas activas con `deleted_at` o `merged_into_employee_id`), es decir el conteo no se infla con archivados.

`admin_users` = `company_users WHERE role = 'admin'` (misma fuente que la pantalla de usuarios).

## 5. ENTITLEMENT KEYS

`active_workers` y `admin_users` son independientes: distinto catálogo, distinto uso, distinta evaluación. No se asume paridad entre ambas.

## 6. OVERRIDE / GRANDFATHER MODEL

`EntitlementOverrideRecord`: `{ company_id, key, limit (número o null), reason, source, effective_from, effective_until? }` con `source ∈ negotiated_contract | grandfathered | migration | legacy_column | manual_review`.

- No se creó ningún override persistido; no hay tabla nueva ni columna nueva.
- `deriveLegacyOverrides()` traduce **en lectura** `companies.max_employees/max_admins` a overrides implícitos, para que el motor sombra no contradiga a producción.
- Centinelas legacy (`max_employees ≥ 999`, `max_admins ≥ 99`) se leen como "sin tope", no como capacidad negociada.
- Los overrides explícitos pesan más que los derivados legacy y son auditables (motivo obligatorio en el tipo).

## 7. SHADOW EVALUATOR

- `evaluateEntitlement(company, key)` → plan, plan_source, base_limit, override_limit, effective_limit, current_usage, remaining_capacity, status, reason, conflicts.
- `checkEntitlementShadow(company, key, delta)` → `{ allowed_under_future_rules, enforced: false, projected_usage, status, ... }`.
- Estados: `WITHIN_LIMIT`, `NEAR_LIMIT` (≥90%), `AT_LIMIT`, `WOULD_EXCEED`, `UNLIMITED`, `CUSTOM`, `NEEDS_REVIEW`.
- `enforced` es literalmente `false` en el tipo: ninguna ruta de producción consume estas decisiones.

## 8. COMPANY-BY-COMPANY MATRIX

| Empresa | Legacy | Subscription | Canónico | Activos | Base | Override | Efectivo | Shadow | Conflicto |
|---|---|---|---|---|---|---|---|---|---|
| JKitchen Staff | paid_manual | operations | operations | 17 | 75 | — | 75 | WITHIN_LIMIT | No |
| Quality Staff by Keury | enterprise | scale | scale | 218 | null | — | sin tope | CUSTOM | No |
| Parceros | enterprise | scale | scale | 184 | null | — | sin tope | CUSTOM | No |
| My Staff Solution LLC | enterprise | operations | scale | 67 | null | — | sin tope | CUSTOM | Sí (sub ≠ plan) |
| Stafly Demo | enterprise | — | scale | 7 | null | 10 (legacy) | 10 | WITHIN_LIMIT | Columna legacy baja |
| Sandbox | free | pro | starter | 5 | 25 | 10 (legacy) | 10 | WITHIN_LIMIT | Sí (sub ≠ plan) |
| QA Testing | free | free | starter | 5 | 25 | 10 (legacy) | 10 | WITHIN_LIMIT | No |
| Llc (suspendida) | free | free | starter | 0 | 25 | 10 (legacy) | 10 | WITHIN_LIMIT | No |

Admins: Stafly Demo 9/2 → `WOULD_EXCEED` en sombra (su columna legacy `max_admins=2` ya es incoherente hoy); Sandbox 2/2 → `AT_LIMIT`. Ninguna de las dos se bloquea por esta capa.

## 9. JKITCHEN RESULT

Plan canónico Operations, 17 activos, límite efectivo 75, 58 disponibles, `WITHIN_LIMIT`, confianza alta, sin conflictos, sin override. Coincide exactamente con el estado alineado en P0.1. Configuración no modificada.

## 10. QUALITY STAFF RESULT

Scale, 218 activos, límite `null` (capacidad contractual), `CUSTOM`, confianza alta. No se le aplica el umbral de Operations. No restringida, no mutada. Recomendación: formalizar su capacidad con un override `negotiated_contract` antes de cualquier enforcement.

## 11. PARCEROS RESULT

Scale, 184 activos, límite `null`, `CUSTOM`, confianza alta. No restringida, no mutada. Misma recomendación de override contractual. No se tocó nada de campañas ni lógica de partners.

## 12. MYSTAFF RESULT

My Staff Solution LLC: plan canónico Scale (por `plan_code=enterprise` + `paid_features_enabled`), 67 activos, sin tope, `CUSTOM`, confianza media por conflicto: su suscripción dice `operations`. Decisión comercial pendiente: si realmente es Operations, 67/75 quedaría en `NEAR_LIMIT`. No se mutó.

## 13. AMBIGUOUS PLAN CASES

1. **My Staff Solution LLC** — enterprise vs subscription operations.
2. **Sandbox** — free vs subscription pro.
3. **Stafly Demo** — enterprise con `max_employees=10` y `max_admins=2`: columnas legacy por debajo de su plan; los admins ya superan el tope legacy.
4. **Llc** — suspendida (`is_active=false`, `status=suspended`) con plan starter; sin uso.

Ninguna se resolvió adivinando: los conflictos se exponen en la evaluación.

## 14. ADMIN USER ENTITLEMENT FINDINGS

- `admin_users` se evalúa aparte, contra `company_users.role='admin'`.
- Catálogo: starter 2, operations 10, scale sin tope.
- Hallazgo: Stafly Demo tiene 9 admins con tope legacy 2 → hoy la pantalla de usuarios ya bloquea invitar; el motor sombra lo reporta como `WOULD_EXCEED`.
- No se cambió ningún rol ni permiso.

## 15. UI OBSERVABILITY

`EntitlementDiagnosticPanel` (nuevo, pequeño) dentro de la pantalla existente de Facturación (`/app/billing`), que ya es de acceso administrativo. Muestra plan, uso, límite efectivo, capacidad restante, ajuste vigente y estado sombra, con la advertencia "Todavía no limita ninguna acción". Si el plan es ambiguo muestra "El plan requiere revisión". No se creó módulo nuevo ni se expone nada a trabajadores.

## 16. BILLING CONFIRMATION

Sin conexión a Stripe, facturas, checkout, estado de pago, upgrades ni downgrades automáticos. No se leyó ni escribió ninguna tabla de facturación más allá de `subscriptions.plan/status` en modo lectura como señal secundaria.

## 17. PRODUCTION MUTATIONS

Ninguna. Cero migraciones, cero UPDATE/INSERT/DELETE, cero cambios de plan, cero overrides persistidos, cero correos. Solo lecturas y archivos nuevos de código.

Archivos: `src/lib/commercial/entitlements.ts` (nuevo), `src/lib/commercial/active-worker-usage.ts` (nuevo), `src/hooks/useEntitlementShadow.ts` (nuevo), `src/components/billing/EntitlementDiagnosticPanel.tsx` (nuevo), `src/lib/commercial/__tests__/entitlements.test.ts` (nuevo), `src/pages/admin/Billing.tsx` (2 líneas: import + render).

## 18. TEST RESULTS

- 10 pruebas nuevas del evaluador canónico: verdes.
- Suite completa y typecheck: ver sección final de ejecución (verdes).
- Verificación de aislamiento: toda consulta de uso filtra por `company_id`; la matriz se calculó por empresa sin agregación cruzada.
- Ninguna acción de producción quedó bloqueada: el gating sigue en `useSubscription`.

## 19. RISKS BEFORE ENFORCEMENT

1. El enforcement real no existe en servidor: import, reactivación y API externa saltarían cualquier tope.
2. Quality Staff (218) y Parceros (184) dependen de que Scale siga sin tope; un cap de 150 las rompería de inmediato.
3. Stafly Demo quedaría bloqueada por admins (9 vs 2) si se activara enforcement sin corregir su columna legacy.
4. `subscriptions` sigue sin ser autoritativa y contradice a tres empresas.
5. Los topes legacy 10 (Sandbox, QA Testing, Llc, Stafly Demo) son más estrictos que Starter 25: al activar enforcement habría que decidir si el plan gana a la columna.

## 20. RECOMMENDED P2

1. Decidir comercialmente los tres conflictos (My Staff, Sandbox, Stafly Demo).
2. Persistir overrides explícitos para Quality Staff y Parceros (`negotiated_contract`), antes de tocar enforcement.
3. Medición en sombra durante un periodo, revisando el panel de capacidad.
4. Elevar el uso canónico a una función de servidor (`company_usage`) y evaluar el enforcement primero en avisos, después en bloqueo, empezando por la creación individual de trabajadores.
5. Solo al final: alinear o retirar las columnas legacy `max_employees/max_admins`.

---

🟡 SHADOW MODE WORKING — PLAN CONFLICTS REQUIRE HUMAN RESOLUTION
