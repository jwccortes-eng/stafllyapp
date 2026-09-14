# STAFLY — PLAN ENTITLEMENTS / LIMITS AUDIT

Modo: READ-ONLY. Cero escrituras, cero migraciones, cero cambios de plan, facturación, auth, RLS o datos operativos.
Fecha: 2026-09-14.

---

## 1. EXECUTIVE SUMMARY

- Los límites internos **no son entitlements reales**: son metadatos de UI. Solo dos pantallas los consultan (crear worker, invitar admin) y **no existe ninguna validación en base de datos, RPC, trigger o edge function**.
- Los valores `10 / 999 / ∞` son **defaults heredados** del modelo Free/Pro/Enterprise, no contratos comerciales.
- Hay **dos modelos de plan conviviendo**: `companies.plan_code` (free / paid_manual / enterprise — el que manda) y la tabla `subscriptions` (free / pro / operations / scale — leída solo por paneles de diagnóstico, sin efecto en gates).
- **Riesgo real detectado (ya existente, no causado por esta auditoría):** JKitchen Staff está en `plan_code = free` con `max_employees = 10` y tiene **17 workers activos**. El botón de crear worker ya está bloqueado para esa empresa. Su fila en `subscriptions` dice `operations`.
- Subir Starter 10 → 25 **desbloquea** a JKitchen y no perjudica a nadie. Bajar Operations 999 → 75 **no afecta a nadie hoy**, porque ninguna empresa usa `plan_code = paid_manual`.
- Ninguna empresa tiene Stripe: `stripe_customer_id` es NULL en las 7 suscripciones. Facturación y entitlements son **independientes hoy**.

Veredicto al final del documento.

---

## 2. INTERNAL PLAN SOURCES

| Fuente | Tipo | ¿Manda hoy? |
|---|---|---|
| `companies.plan_code` (`free` / `paid_manual` / `enterprise`) | Columna | **Sí** — fuente única de gating |
| `companies.paid_features_enabled` | Columna bool | **Sí** — eleva a Enterprise (override) |
| `companies.max_employees`, `companies.max_admins` | Columnas int | Sí, pero solo en UI |
| `companies.plan_status`, `billing_status`, `plan_activated_at/by`, `upgrade_requested_at`, `trial_ends_at` | Columnas | Informativas; `trial_ends_at` sin uso |
| `PLAN_DEFAULTS` / `PLAN_LIMITS` en `src/hooks/useSubscription.tsx` | Constantes | Fallback cuando la columna es NULL |
| `MODULE_PLAN_MAP` en el mismo archivo | Constante | Sí — gating de módulos |
| `company_modules` (102 filas) | Tabla | Sí — override que **añade** módulos |
| `subscriptions` (7 filas) | Tabla | **No** — no la lee ningún gate |
| `upgrade_requests` (0 filas) | Tabla | Vacía |
| `billing_events` (1 fila) | Tabla | Sin efecto |
| `platform_settings.limits` (`max_employees_per_company: 500`, `max_companies: 50`, `max_admins_per_company: 10`) | JSON | **No enforced** — solo editable en PlatformSettings |
| Edge functions `billing-checkout`, `billing-webhook`, `billing-customer-portal`, `billing-subscription-status` | Stripe | Presentes pero sin `STRIPE_SECRET_KEY`; no tocan límites |

---

## 3. LIMIT DEFINITIONS

| LIMIT | PLAN | VALOR (default) | VALOR REAL EN DB |
|---|---|---|---|
| `max_employees` | free | 10 | 10 en las 5 empresas free/demo |
| `max_employees` | paid_manual | 999 | **ninguna empresa usa este plan** |
| `max_employees` | enterprise | Infinity (constante) | 9999 en 3 empresas; 10 en Stafly Demo |
| `max_admins` | free | 2 | 2 |
| `max_admins` | paid_manual | 10 | — |
| `max_admins` | enterprise | Infinity | 99 (3 empresas); 2 en Stafly Demo |
| `pro` legacy alias | — | 100 / 3 | solo constante muerta |

Nota: la columna prevalece sobre la constante (`companies.max_employees ?? PLAN_DEFAULTS[...]`). Por eso Enterprise nunca es realmente "infinito" en producción: es 9999 o, en Stafly Demo, **10**.

---

## 4. WHAT EACH LIMIT COUNTS

**`max_employees`**
- Qué cuenta: filas de `employees` del company actual **ya cargadas en el cliente**, filtradas por `e.is_active !== false` (`src/pages/admin/Employees.tsx:532`).
- Semántica: **activos**, no totales. Archivados/inactivos no cuentan.
- Query: el mismo listado de la pantalla de workers (sujeto a filtros y paginación del hook de roster). No hay `count(*)` de servidor.
- Invitados pendientes: **no cuentan** (viven en `employee_invitations`).

**`max_admins`**
- Qué cuenta: usuarios de `company_users` con rol `admin`, `owner` o `developer` (`src/pages/admin/Users.tsx:355`).
- Semántica: miembros con acceso administrativo, no asientos de trabajador.
- Archivados: no aplica; se cuentan todas las membresías listadas.

**`platform_settings.limits.*`** — no se cuenta nada: son números editables sin lector.

---

## 5. ENFORCEMENT MAP

| ACCIÓN | ¿SE COMPRUEBA? | CLIENTE/SERVIDOR | ¿EVADIBLE? | AL LLEGAR AL LÍMITE | OVERRIDE |
|---|---|---|---|---|---|
| Crear worker (ficha completa / alta rápida) | Sí | **Cliente** | Sí (API directa, RPC, import) | Botón deshabilitado + `UpgradeBanner` | Subir `max_employees` desde Companies |
| Invitar admin | Sí | **Cliente** | Sí | Toast destructivo, invitación no se envía | Subir `max_admins` |
| Invitar worker (no admin) | **No** | — | — | Sin límite | — |
| Importar workers (ImportWizard, Connecteam, inactivos) | **No** | — | — | Sin límite | — |
| Reactivar worker | **No** | — | — | Puede superar el límite silenciosamente | — |
| Asignar worker a turno | No | — | — | — | — |
| Crear turno / ubicación / equipo | No | — | — | — | — |
| API externa (`external-api`) | No | — | — | — | — |
| Onboarding / alta de empresa | No | — | — | — | — |
| Módulos (timeclock, payroll, reports…) | Sí | Cliente (`ModuleGate`) | Sí en cuanto a UI; los datos siguen protegidos por RLS | Pantalla de upgrade | `company_modules` o Global mode |

**No existe ninguna comprobación de límite en Postgres** (ni trigger, ni CHECK, ni RPC, ni política) ni en edge functions.

---

## 6. ACTIVE COMPANY USAGE

| Empresa | plan_code | paid_features | max_emp | Workers activos | Totales | Usuarios |
|---|---|---|---|---|---|---|
| Quality Staff by Keury | enterprise | true | 9999 | **218** | 1435 | 57 |
| Parceros | enterprise | true | 9999 | **184** | 185 | 1 |
| My Staff Solution LLC | enterprise | true | 9999 | **67** | 205 | 14 |
| JKitchen Staff | free | false | **10** | **17** | 18 | 8 |
| Stafly Demo | enterprise | false | **10** | 7 | 21 | 9 |
| QA Testing | free | false | 10 | 5 | 5 | 1 |
| Sandbox | free | false | 10 | 5 | 5 | 2 |
| Llc (inactiva) | free | false | 10 | 0 | 0 | 0 |

**Ya en infracción hoy:** JKitchen Staff (17 > 10). Consecuencia actual: no puede crear workers desde la UI.

---

## 7. COMPANIES ABOVE PUBLIC THRESHOLDS

| Umbral público | Empresas por encima |
|---|---|
| Starter 25 | JKitchen (17 → **por debajo**, quedaría resuelta), ninguna free supera 25 |
| Operations 75 | Quality Staff (218), Parceros (184) — hoy Enterprise, no Operations |
| Scale 150+ | Quality Staff y Parceros están en ese rango; My Staff Solution (67) estaría por debajo del piso de Scale |

Ninguna empresa con `plan_code = paid_manual` existe, así que **nadie sufriría 999 → 75**. Pero si a futuro se mapea Enterprise→Scale y My Staff Solution (67) se coloca en Operations, encaja; Quality Staff y Parceros requieren Scale.

---

## 8. BILLING RELATIONSHIP

- `subscriptions` tiene 7 filas, **todas con `stripe_customer_id` NULL**. No hay Stripe operativo (`STRIPE_SECRET_KEY` no configurado; `billing-checkout` devuelve error 500 controlado).
- Ningún gate lee `subscriptions`; solo los paneles de diagnóstico (`company-truth`, `ecc/commercial-read-model`) la usan para detectar contradicciones.
- `upgrade_requests` vacía; `billing_events` con 1 fila sin efecto.

Respuestas:
- ¿Cambiar un límite cambia la facturación? **No.**
- ¿Cambiar la facturación cambia un límite? **No.**
- ¿Precio y entitlements son independientes hoy? **Sí, completamente.** Todo se activa a mano.

Contradicción notable: JKitchen tiene `subscriptions.plan = operations` pero `companies.plan_code = free`. La tabla que manda es la que le está bloqueando el alta de workers.

---

## 9. PUBLIC VS INTERNAL PLAN MATRIX

**STARTER**
- Público: hasta 25 workers activos, $149/mes.
- Interno: `free`, `max_employees = 10`, `max_admins = 2`.
- Enforcement real: bloqueo en cliente al crear worker y al invitar admin. Import y reactivación lo saltan.
- Riesgo: el límite publicado (25) es **más generoso** que el interno (10). Hoy hay una empresa perjudicada.

**OPERATIONS**
- Público: hasta 75 workers activos, $299/mes.
- Interno: `paid_manual`, `max_employees = 999`, `max_admins = 10`. **Cero empresas asignadas.**
- Enforcement real: mismo cliente, prácticamente inalcanzable con 999.
- Riesgo: nulo hoy; alto a futuro si se migra Enterprise→Operations sin revisar el conteo.

**SCALE**
- Público: 150+ workers, $599+ o custom.
- Interno: `enterprise`; la constante es `Infinity`, pero la columna real es **9999** (y 10 en Stafly Demo, que es una incoherencia de datos de demo).
- Enforcement real: ninguno en la práctica.
- Riesgo: bajo. "150+" hoy significa **posicionamiento mínimo, sin tope duro**, con cap técnico 9999 por empresa.

---

## 10. LEGACY PLAN FINDINGS

- Códigos legacy vivos en producción: `free`, `paid_manual`, `enterprise` (son los únicos que existen en `companies`).
- `PLAN_LIMITS.pro` (100 / 3) es una constante muerta, sin consumidores fuera de un lookup de etiqueta en `Users.tsx`.
- `subscriptions.plan` mezcla generaciones: `free`, `pro`, `operations`, `scale`.
- `trial_ends_at` existe pero `isTrial` está fijado a `false`. No hay trial en ningún lado.
- No existe rastro de plan de $29 ni de "free forever" en superficies activas (se eliminaron en la limpieza comercial previa).
- **Ninguna empresa depende de un plan legacy para acceder a funciones**: los tres Enterprise reales tienen además `paid_features_enabled = true`, que por sí solo eleva el plan.

---

## 11. FEATURE ENTITLEMENTS

| FEATURE | ACCESO POR PLAN | DÓNDE SE APLICA | ¿REAL O MARKETING? | RIESGO DE ALINEAR |
|---|---|---|---|---|
| Workers, conceptos, turnos, comunicados, aplicaciones, directorio | Todos | `MODULE_PLAN_MAP` = free | Real (abierto) | Ninguno |
| Reloj, periodos, import, movimientos, resumen, reportes | paid_manual+ | `ModuleGate` (cliente) | Real en UI | Medio — free perdería pantallas si se endurece |
| Clientes, ubicaciones, automatizaciones, chat, monetización | paid_manual+ | `ModuleGate` | Real en UI | Medio |
| Payroll, reconciliación, command-center, tenant_invoicing | paid_manual+ | `ModuleGate` | Real en UI | Alto si se toca a Quality Staff |
| API / webhooks (`api-access`) | paid_manual+ | `ModuleGate` (solo la pantalla) | **Parcial** — la edge function `external-api` no comprueba plan | Alto si se pretende cobrar por ello |
| Soporte prioritario, migración, revisión operativa | — | No existe | **Marketing-only** | Ninguno |
| Multi-equipo / multi-ubicación | Vía módulo `locations` | `ModuleGate` | Real en UI | Medio |

`company_modules` (102 filas) concede módulos por encima del plan y **no puede retirarlos**: el gate hace OR entre plan y override.

---

## 12. RISK OF 10 → 25 (Starter)

**Riesgo: muy bajo. Efecto neto positivo.**
- Empresas afectadas: JKitchen Staff (17 activos) pasaría de bloqueada a operativa; QA Testing y Sandbox (5) sin cambio.
- No desbloquea módulos ni datos: solo afecta a dos botones.
- No hay facturación conectada, así que no genera cargos.
- Precaución: cambiar la constante no cambia las columnas ya escritas en `companies`. Si se quiere efecto real hay que decidir explícitamente si se actualiza `companies.max_employees` (eso sí sería escritura sobre empresas activas y requiere autorización aparte).

## 13. RISK OF 999 → 75 (Operations)

**Riesgo hoy: nulo. Riesgo latente: alto.**
- Cero empresas con `plan_code = paid_manual`, así que el cambio de constante no afecta a nadie.
- El peligro no es el número, es la **migración de plan**: si Quality Staff (218) o Parceros (184) se reclasificaran a Operations, quedarían inmediatamente por encima del tope y perderían el alta de workers.
- Además, esas empresas tienen `max_employees = 9999` escrito en columna, que prevalece sobre la constante. Bajar la constante sin tocar columnas **no las afecta**; bajar las columnas sí.

## 14. SCALE / UNLIMITED SEMANTICS

Hoy "Scale" internamente significa:
- Constante: `Infinity` (sin tope).
- Realidad en datos: `max_employees = 9999`, `max_admins = 99`.
- Excepción: Stafly Demo es `enterprise` con `max_employees = 10` — la columna gana y la deja topada en 10, incoherente con su plan. Es dato de demo, no cliente.

Conclusión: **"150+" es posicionamiento comercial, no un cap.** Internamente no hay límite efectivo ni entitlement personalizado por contrato.

---

## 15. RECOMMENDED CANONICAL ENTITLEMENT MODEL (conceptual, NO implementar)

```
PLAN  →  ENTITLEMENTS  →  DERIVED USAGE  →  ENFORCEMENT
```

1. **Un solo catálogo declarativo** (por ejemplo `src/lib/commercial/entitlements.ts`, junto a `pricing.ts`):
   ```
   starter:    { active_workers_limit: 25,  admin_limit: 3,  modules: [...] }
   operations: { active_workers_limit: 75,  admin_limit: 10, modules: [...] }
   scale:      { active_workers_limit: null /* custom */, admin_limit: null, modules: [...] }
   ```
2. **Uso derivado, no contado en el cliente**: una vista o RPC `company_usage(company_id)` que devuelva `active_workers`, `admins`, `pending_invites` con la definición escrita una sola vez.
3. **Override explícito por empresa** en lugar de sobreescribir el default: `companies.entitlement_overrides jsonb` con procedencia y motivo, en vez de `max_employees` sin contexto.
4. **Enforcement en servidor**, no en botones: la comprobación debe vivir donde se crea el worker (RPC/trigger), para que import, reactivación y API no la salten.
5. **Retirar la doble fuente**: decidir si `subscriptions` es la verdad futura o si se elimina; hoy mentir en esa tabla no tiene efecto, lo cual es peor que un error visible.
6. **Separar cap de aviso**: superar el límite debería avisar y escalar a revisión comercial, no romper la operación de un cliente en producción.

## 16. GRANDFATHER / OVERRIDE RECOMMENDATION

- **Grandfathering por defecto** para las 3 empresas Enterprise reales: conservan su entitlement actual con un `grandfathered_until` explícito y motivo registrado.
- **Nunca aplicar un tope más bajo de forma retroactiva** a una empresa ya por encima; el modo correcto es bloquear crecimiento nuevo, no la operación existente.
- **JKitchen Staff requiere revisión manual**: su plan comercial (`operations` en `subscriptions`) y su plan efectivo (`free`) se contradicen y hoy la están limitando. Es una decisión comercial, no técnica.
- **Periodo de transición**: primero medir en sombra (registrar cuántas veces se habría bloqueado), luego avisar, y solo después aplicar.
- **Stafly Demo**: corregir su `max_employees = 10` con plan enterprise cuando se toque el modelo; es ruido de datos de demostración.

## 17. WHAT NOT TO CHANGE

No debe verse afectado por ningún trabajo de entitlements:
payroll, `time_entries`, `scheduled_shifts`, `shift_assignments`, documentos, auth, RLS, aislamiento por empresa, pagos, bookings, chat, acceso de empresas activas, registros de workers en producción, Parceros, campañas, lógica de partners.

Tampoco tocar en esta fase: `companies.max_employees` / `max_admins` de empresas activas, `subscriptions`, `company_modules`, `platform_settings`, ni los identificadores técnicos de plan (`free` / `paid_manual` / `enterprise`), que están cableados en `MODULE_PLAN_MAP` y en el panel de empresas.

## 18. RECOMMENDED NEXT STEP

Orden sugerido, cada paso con autorización explícita:

1. **Decisión comercial sobre JKitchen Staff** (única empresa hoy limitada por una contradicción de datos).
2. **Alinear solo las constantes** `PLAN_DEFAULTS` / `PLAN_LIMITS` a 25 / 75 / custom, sin tocar ninguna columna de empresa. Impacto: nulo para las empresas con columna escrita; positivo para nuevas empresas.
3. **Publicar el catálogo canónico de entitlements** junto a `pricing.ts`, en modo lectura, sin enforcement.
4. **Medición en sombra** del uso real por empresa contra el catálogo, durante un periodo acordado.
5. Solo entonces, evaluar enforcement en servidor y grandfathering.

---

## FINAL VERDICT

🟡 ALIGNMENT POSSIBLE — GRANDFATHER / OVERRIDES REQUIRED
