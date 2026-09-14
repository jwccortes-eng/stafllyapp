# P1.1 — STAFLY ENTITLEMENT CONFLICT RESOLUTION

Fecha: 2026-09-14 · Modo: SHADOW (sin enforcement) · Mutaciones de producción: **0**

---

## 1. BEFORE STATE

| Empresa | plan_code | paid_features | max_employees | max_admins | subscriptions.plan | Trabajadores activos | Admins (role='admin') | Estado sombra previo |
|---|---|---|---|---|---|---|---|---|
| My Staff Solution LLC | enterprise | true | 9999 | 99 | operations | 67 | 5 | Conflicto: suscripción ≠ clasificación |
| Sandbox | free | false | 10 | 2 | pro | 5 | 2 | Conflicto: suscripción superior al plan |
| Stafly Demo | enterprise | false | 10 | 2 | — | 7 | 1 (9 membresías totales) | Límite de admins 2 marcado como excedido |

Nota sobre "9 admins" de Stafly Demo: el informe P1 contó **9 filas de `company_users` de cualquier rol**. Bajo la definición canónica (`role = 'admin'`) hay **1 admin** + 1 `company_owner` + 7 `employee`. La corrección se documenta aquí; no se modificó ninguna cuenta.

---

## 2. DECISIÓN APLICADA POR EMPRESA

### CASO 1 — My Staff Solution LLC → **Scale**
- La clasificación de empresa (`plan_code = enterprise` + `paid_features_enabled = true`) ya resolvía a **Scale**. No se infirió nada del número de trabajadores.
- Capacidad: **contractual/custom**, sin restricción de 75. `max_employees = 9999` se lee como centinela "sin tope", no como capacidad negociada.
- **La fila de `subscriptions` NO se tocó.** Motivo: esa tabla sí es leída por funciones de facturación (`billing-webhook`, `billing-subscription-status`, `billing-customer-portal`, `trial-downgrade`, `setup-company`). Cambiar el valor podría tener significado aguas abajo, y la instrucción era no adivinar. Queda marcada como **metadato legacy/obsoleto** en la resolución del motor.
- Resultado en el motor: la discrepancia deja de contar como conflicto y pasa a `informational`, porque la suscripción indica un plan **inferior** al de la empresa y no está conectada a enforcement.

### CASO 2 — Sandbox → **contexto interno/test**
- Se reutilizaron los marcadores **ya existentes** en `companies`: `is_sandbox = true`, `is_test = true`, `is_demo = true`. No se creó ninguna clasificación de tenant nueva, ni un plan comercial "Sandbox".
- Nuevo concepto en el motor: `EntitlementContext = "commercial" | "internal"`, derivado de esos marcadores.
- Su suscripción `pro` **no** lo convierte en cliente de pago: la discrepancia se registra como informativa y no como conflicto comercial.
- Sandbox conserva su plan base (Starter) sin cambios en base de datos.

### CASO 3 — Stafly Demo → **override explícito de administradores**
- Override declarado: `admin_users = 10`, motivo `internal_demo`, origen `manual_review`, vigente desde 2026-09-14.
- Se eligió **10** (no 12): la capacidad canónica actual es 1 admin; 10 cubre con holgura el uso interno sin inventar margen.
- Los límites globales de Starter/Operations/Scale **no se tocaron**. El override afecta exclusivamente a `d3500000-0000-4000-8000-000000000001`.
- No se creó, borró ni modificó ninguna cuenta de administrador.

---

## 3. REGISTROS / CONFIGURACIÓN CAMBIADOS

Solo código. **Ninguna fila de base de datos fue modificada** (verificado: no se ejecutó ningún `UPDATE`/`INSERT`/`DELETE`).

| Archivo | Cambio |
|---|---|
| `src/lib/commercial/entitlements.ts` | `EntitlementContext`, `resolveEntitlementContext`, `PLAN_RANK`, separación `conflicts` vs `informational`, `context` en la evaluación |
| `src/lib/commercial/entitlement-overrides.ts` (nuevo) | Registro canónico de overrides explícitos; contiene el override `internal_demo` de Stafly Demo |
| `src/hooks/useEntitlementShadow.ts` | Lee `is_demo/is_sandbox/is_test` y aplica los overrides declarados |
| `src/components/billing/EntitlementDiagnosticPanel.tsx` | Distintivo "Espacio interno de pruebas" |
| `src/lib/commercial/__tests__/entitlements.test.ts` | 4 pruebas nuevas (los tres casos + aislamiento del override) |

---

## 4. MATRIZ SOMBRA RE-EJECUTADA (todas las empresas activas)

| Empresa | Plan canónico | Contexto | Activos | Límite trabajadores | Admins | Límite admins | Overrides | Estado | Conflicto |
|---|---|---|---|---|---|---|---|---|---|
| JKitchen Staff | Operations | comercial | 17 | 75 | 0 | 10 | — | WITHIN_LIMIT | ninguno |
| My Staff Solution LLC | Scale | comercial | 67 | custom | 5 | custom | — | CUSTOM | ninguno (suscripción = metadato obsoleto) |
| Parceros | Scale | comercial | 184 | custom | 0 | custom | — | CUSTOM | ninguno |
| Quality Staff by Keury | Scale | comercial | 218 | custom | 4 | custom | — | CUSTOM | ninguno |
| QA Testing | Starter | interno | 5 | 10 | 1 | 2 | — | WITHIN_LIMIT | ninguno |
| Sandbox | Starter | interno | 5 | 10 | 2 | 2 | — | WITHIN_LIMIT / admins AT_LIMIT | ninguno (interno) |
| Stafly Demo | Scale | interno | 7 | 10 | 1 | 10 | `internal_demo` | WITHIN_LIMIT | ninguno |

**Casos `NEEDS_REVIEW` restantes: 0.**

---

## 5. CONFLICTOS NO RESUELTOS / DEUDA

1. `subscriptions` sigue sin ser autoritativa y contiene valores obsoletos (My Staff: operations; Sandbox: pro). Se conserva intacta a propósito.
2. Stafly Demo mantiene `max_employees = 10` (columna legacy) frente a su clasificación Scale: hoy 7/10, sin impacto, pero convendría decidirlo en P2.
3. Sandbox queda con 2/2 administradores: interno, sin impacto comercial.
4. Los límites siguen siendo solo de interfaz; no hay validación en servidor (sin cambios en esta fase, por diseño).

---

## 6. MUTACIONES DE PRODUCCIÓN

Ninguna. Sin cambios en auth, RLS, pagos, facturación, reservas, chat, nómina, `time_entries`, `shift_assignments`, `scheduled_shifts`, documentos, trabajadores, turnos, aislamiento de tenants, activación de empresas, campañas ni lógica de partners. Cero correos.

---

## 7. QA

- Aislamiento de tenants: el override se filtra por `company_id`; prueba dedicada verifica que JKitchen no recibe ninguno.
- My Staff → Scale, capacidad custom, sin restricción de 75. ✅
- Sandbox → contexto interno, sin conflicto comercial. ✅
- Stafly Demo → límite efectivo de admins 10 por override explícito. ✅
- Regresión JKitchen 17/75 Operations, Quality Staff y Parceros en capacidad contractual: sin cambios. ✅
- Typecheck: ✅ · Pruebas: **1.281 en 111 archivos, todas verdes** ✅

---

## 8. RECOMENDACIÓN PARA P2

1. Decidir si `subscriptions` se retira o se convierte en autoritativa; hoy es la única fuente de ruido comercial.
2. Excluir los tenants internos (`is_demo/is_sandbox/is_test`) de toda métrica comercial y de cualquier regla futura de facturación.
3. Persistir los overrides en una tabla auditable solo cuando llegue el enforcement; hasta entonces el registro en código es suficiente y más seguro.
4. Enforcement en servidor (trigger/RPC) antes de prometer topes reales: importaciones, reactivaciones y la API externa hoy los saltan.

---

🟢 ENTITLEMENT CONFLICTS RESOLVED — SHADOW MATRIX CLEAN FOR P2
