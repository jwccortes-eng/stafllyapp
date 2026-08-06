# P0 — Auditoría completa: compañías, planes, suscripciones, facturación y continuidad del servicio

Fecha: 2026-08-06 · Tipo: **solo investigación** · Cambios aplicados: **ninguno**
Evidencia: lectura de esquema (`information_schema`, `pg_policies`, `pg_proc`), conteos de filas, código de `supabase/functions/billing-*`, `trial-downgrade`, `setup-company`, y superficies UI (`Companies.tsx`, `Pricing.tsx`, `Billing.tsx`, `UpgradeRequests.tsx`, `useSubscription.tsx`, `useBilling.tsx`, `ModuleGate.tsx`).

---

## 1. Resumen ejecutivo

Stafly **no tiene hoy un sistema de suscripciones**. Tiene tres piezas desconectadas que se parecen a uno:

1. **Un modelo comercial manual** sobre `companies` (`plan_code`, `plan_status`, `billing_status`, límites) que **sí** controla módulos vía `useSubscription` + `ModuleGate`.
2. **Un modelo Stripe residual** sobre `subscriptions` (+ webhook + checkout + portal) que **no controla nada**: ninguna pantalla de entitlements lo lee, el vocabulario de planes es distinto, y los hooks de checkout/portal están marcados `@deprecated` y devuelven un toast.
3. **Un Command Center de compañías** (`/app/companies`) que muestra estado y plan leyendo **la fuente equivocada** (`subscriptions`), por lo que puede contradecir lo que el tenant realmente puede usar.

No existe: facturación SaaS, dunning, periodo de gracia, acuerdos de pago, estados de acceso progresivos, reconciliación, ni métricas SaaS reales. La suspensión es un booleano binario (`is_active`) que apaga todo de golpe.

**Riesgo mayor:** un pago real por Stripe **no otorga acceso** y una cancelación real **no lo retira**; a la inversa, el acceso se otorga por edición manual sin auditoría ni VWC.

---

## 2. Estado actual (qué es real / qué es visual)

| Capacidad | Estado | Evidencia |
|---|---|---|
| Planes y límites por empresa | **Real** | `companies.plan_code/max_employees/max_admins`, `resolveEffectivePlan()` |
| Gating de módulos | **Real** | `MODULE_PLAN_MAP` + `ModuleGate` + `company_modules` |
| Solicitud de upgrade | **Real (manual)** | `upgrade_requests` (0 filas), `billing_status='contact_requested'` |
| Contacto ventas WhatsApp/email | **Real** | `useContactSales` |
| Checkout Stripe | **Código presente, desconectado** | `billing-checkout` existe; `useCreateCheckoutSession` `@deprecated` → toast |
| Portal de cliente Stripe | **Código presente, desconectado** | `billing-customer-portal`; `useOpenCustomerPortal` `@deprecated` |
| Webhook Stripe | **Fail-closed inoperante** | requiere `STRIPE_WEBHOOK_SECRET`; el secreto **no está configurado** → 500 |
| Estado de suscripción | **Tabla viva, semántica muerta** | `subscriptions` 7 filas, 0 con `stripe_customer_id` |
| Trial | **Parcial y huérfano** | `trial-downgrade` lee `status='trialing'`; `companies.trial_ends_at` documentado como “reservado, no en uso” |
| Facturación SaaS | **Inexistente** | `invoices/invoice_lines/invoice_payments` son facturación **tenant → cliente final**, no Stafly → tenant |
| Dunning / gracia / acuerdos | **Inexistente** | sin tablas, sin funciones, sin jobs |
| Continuidad del servicio | **Binaria** | `sync_company_active_from_status`: `is_active := (status='active')` |
| KPIs SaaS (MRR, AR, churn) | **Inexistentes** | KPIs de `Companies.tsx` cuentan filas, no dinero |

---

## 3. Inventario de datos

### 3.1 Tablas
| Objeto | Tipo | Scope | Filas | Fuente de verdad de | RLS | VWC | Estado |
|---|---|---|---|---|---|---|---|
| `companies` (33 cols) | tabla | tenant raíz | 8 | plan comercial + acceso | ✅ owner global / miembros | ✅ `version`, `versioned_update_company_profile` | **Activa** |
| `subscriptions` (10 cols) | tabla | `company_id` | 7 | nada consumido por entitlements | ✅ select admin, ALL owner | ❌ | **Legacy / desconectada** |
| `billing_events` (5 cols) | tabla | `company_id` | 1 (`trial_expired`) | log de webhook | ✅ | ❌ | **Semi-activa** |
| `upgrade_requests` (16 cols) | tabla | `company_id` | 0 | interés comercial | ✅ (2 policies INSERT + 2 SELECT duplicadas) | ❌ | **Activa, sin uso** |
| `company_modules` (6 cols) | tabla | `company_id` | 102 | override de entitlements | ✅ owner manage | ❌ | **Activa** |
| `module_permissions`, `employee_portal_modules` | tabla | company/empleado | — | permisos, **no** plan | ✅ | ❌ | Activa (dominio distinto) |
| `promo_codes` / `promo_redemptions` | tabla | global/company | 0 / 0 | descuentos por módulos | ✅ | ❌ | **Legacy vacía** |
| `invoices`, `invoice_lines`, `invoice_payments`, `invoice_activity_log` | tabla | `company_id` | 0 | **facturación del tenant a SU cliente** | ✅ | ❌ | Activa (otro dominio) |
| `legacy_invoices`, `legacy_invoice_line_items` | tabla | company | — | histórico importado | ✅ | ❌ | **Legacy** |
| `billing_clients`, `billing_client_locations`, `billable_service_blocks` | tabla | company | — | facturación operativa del tenant | ✅ | ❌ | Activa (otro dominio) |

> ⚠️ **Ambigüedad de vocabulario**: “billing” en Stafly significa hoy *dos cosas*: (a) el tenant factura a sus clientes, (b) Stafly cobra al tenant. Solo (a) tiene modelo de datos.

### 3.2 Columnas de ciclo de vida en `companies`
`is_active`, `status`, `source`, `archived_at`, `is_sandbox`, `is_test`, `is_demo`, `plan_code`, `plan_status`, `billing_status`, `paid_features_enabled`, `max_employees`, `max_admins`, `trial_ends_at`, `plan_activated_at`, `plan_activated_by`, `upgrade_requested_at`, `owner_user_id`, `created_by`, `version`.

Ausentes: `approved_at`, `approved_by`, `needs_review`, `contract_accepted_at`, `grace_until`, `suspended_at`, `cancellation_reason`, `access_state`, `next_invoice_date`, `balance_due`.

### 3.3 Funciones / triggers
| Nombre | Rol | Nota |
|---|---|---|
| `sync_company_active_from_status()` | trigger | `is_active := status='active'`; solo en INSERT/UPDATE → **filas antiguas quedan desincronizadas** (evidencia: 1 empresa `status='inactive'` con `is_active=true`) |
| `bump_company_version()` | trigger VWC | ✅ |
| `versioned_update_company_profile/_setting` | RPC VWC | cubre branding/config, **no** plan ni acceso |
| `has_module_permission`, `user_company_ids`, `is_global_owner`, `has_company_role` | autorización | ✅ |
| — | — | **No existe ninguna RPC de ciclo de vida**: activar / suspender / reactivar / cambiar plan |

### 3.4 Edge functions
| Función | verify_jwt | Estado | Notas |
|---|---|---|---|
| `billing-checkout` | false | Código completo, **sin consumidor** | crea Checkout Session; usa anon+JWT del caller; **no valida que el usuario sea admin de `companyId`** |
| `billing-webhook` | false | **Inoperante** | exige `STRIPE_WEBHOOK_SECRET` (no configurado) → 500; firma verificada; **sin idempotencia por `event.id`** |
| `billing-subscription-status` | false | Funciona, lee tabla desconectada | valida claims pero **no** membresía del `companyId` (RLS mitiga) |
| `billing-customer-portal` | false | Sin consumidor | |
| `trial-downgrade` | false | Gate `CRON_SECRET` ✅ fail-closed | **no hay job programado verificable**: `cron.job` no es legible con el rol actual y no hay evidencia de schedule |
| `setup-company` | false | **Activa** | crea company + módulos + settings + `subscriptions{status:'trialing'}`; requiere admin previo |

Secrets presentes: `STRIPE_SECRET_KEY` ✅, `CRON_SECRET` ✅, `STRIPE_WEBHOOK_SECRET` ❌ ausente.

---

## 4. Ciclo de vida actual vs. requerido

| Etapa | ¿Existe? | Cómo ocurre hoy |
|---|---|---|
| signup público | Parcial | no hay auto-provisioning público de tenant; `setup-company` exige admin autenticado |
| `needs_review` | ❌ | no existe columna ni cola |
| revisión humana | ❌ | inexistente |
| aprobación | ❌ | inexistente (`plan_activated_by` es lo más cercano) |
| contrato / aceptación | ❌ | inexistente |
| selección de plan | Manual | edición en `/app/companies` o solicitud vía `upgrade_requests` |
| método de pago | ❌ | ninguno almacenado |
| primer pago | ❌ | fuera de Stafly |
| activación | Manual e inmediata | `companies.update({is_active})` directo desde UI |
| operación | ✅ | |
| renovación | ❌ | |
| pago fallido | Parcial muerto | webhook escribiría `subscriptions.status='past_due'`; nadie lo lee |
| gracia | ❌ | |
| restricción | ❌ | |
| suspensión | Binaria | `is_active=false` / `status='suspended'` |
| acuerdo | ❌ | fuera del sistema |
| reactivación | Manual | toggle |
| cancelación | Parcial | `subscriptions.status='canceled'` sin efecto de acceso |

**Regla exigida (signup no activa):** hoy **no se cumple formalmente**. No hay `needs_review` ni aprobación; `Companies.tsx` inserta empresas con `is_active: true` por defecto. Mitigación actual: la creación requiere ya ser admin global.

---

## 5. Planes y entitlements

**Dos vocabularios incompatibles conviviendo:**

| Fuente | Valores | ¿Controla capacidades? |
|---|---|---|
| `companies.plan_code` | `free`, `paid_manual`, `enterprise` | ✅ sí (`useSubscription` → `ModuleGate`) |
| `subscriptions.plan` | `pro`, `scale`, `operations`, `free` | ❌ no |
| `billing-webhook` `PLAN_MAP` | `pro`, `enterprise` (2 price IDs **hardcodeados**) | ❌ escribe en `subscriptions` |

Datos reales observados (anonimizados, 8 empresas):

| # | `status` | `is_active` | `plan_code` | `subscriptions.plan/status` | Inconsistencia |
|---|---|---|---|---|---|
| 1 | active | true | free | pro / active | plan pagado sin entitlements |
| 2 | **inactive** | **true** | enterprise | scale / active | estado contradictorio + trigger no retroactivo |
| 3 | active | true | free | free / active | ok |
| 4 | active | true | free | operations / active | vocabulario inexistente |
| 5 | suspended | false | free | free / canceled | ok |
| 6 | active | true | enterprise | **sin suscripción** | acceso enterprise sin registro comercial |
| 7 | active | true | enterprise | scale / active | ok-ish |
| 8 | active | true | enterprise | operations / active | ok-ish |

Respuestas al cuestionario:
1. ¿El plan controla capacidades? **Sí, pero solo `companies.plan_code`.**
2. ¿Solo etiqueta? `subscriptions.plan` **sí, es solo etiqueta**.
3. ¿Fuente única de entitlements? **Parcialmente**: `MODULE_PLAN_MAP` es única, pero convive con `company_modules` (override) y `module_permissions`.
4. ¿Las pantallas verifican entitlements? Mayormente sí vía `ModuleGate`; hay bypass explícito en global mode.
5. ¿Puede un tenant usar módulos no pagados? **Sí**: `company_modules` concede acceso saltando el tier, sin auditoría ni expiración (102 filas activas).
6. ¿Qué ocurre al cambiar de plan? Un `UPDATE` directo. Sin evento, sin historia.
7. ¿Prorrateo? **No.**
8. ¿Historia? **No** (solo `plan_activated_at` sobrescribible).
9. ¿Versionado del plan contratado? **No.**
10. ¿Una modificación antigua puede sobrescribir el plan actual? **Sí** — el plan no está cubierto por VWC (`versioned_update_company_profile` no incluye campos de plan/acceso).

---

## 6. Pasarela de pagos

| Ítem | Estado |
|---|---|
| Proveedor | Stripe (único) |
| Entorno | indeterminado; `STRIPE_SECRET_KEY` presente, sin distinción test/live en código |
| Price IDs | **hardcodeados** en el webhook, no en config ni DB |
| Webhook firma | ✅ `constructEvent` |
| Webhook operativo | ❌ falta `STRIPE_WEBHOOK_SECRET` → 500 en todo evento |
| Idempotencia | ❌ ningún registro de `event.id`; `billing_events` no tiene unique |
| Eventos escuchados | `checkout.session.completed`, `customer.subscription.created/updated/deleted`, `invoice.paid`, `invoice.payment_failed` |
| Mapeo customer/subscription | `subscriptions.stripe_*` (0 filas pobladas) |
| Mapeo invoice | ❌ inexistente |
| Retry / DLQ | ❌ |
| Reconciliación | ❌ |
| Tenant isolation | Débil: depende de `metadata.companyId` y una validación de existencia; **no** verifica que el pagador sea admin de esa empresa |
| Error handling | Devuelve 400 genérico → Stripe reintentaría indefinidamente sin idempotencia |
| Customer portal | Código presente, sin consumidor |

**Conclusión:** no existe pasarela operativa. Existe un esqueleto funcional que, si se activara hoy, escribiría en una tabla que nadie consulta.

---

## 7. Facturación (Stafly → tenant)

**No existe.** Nada de lo siguiente está implementado para el cobro del SaaS: invoice number, line items, impuestos, descuentos, créditos, due date, términos, PDF, envío por email, historial, estados `paid/open/overdue/void`, notas, datos legales de la empresa, contacto de facturación, tax ID.

`Billing.tsx` muestra explícitamente un `EmptyState` “Sin registros aún” — es honesto, pero es un placeholder permanente.

Las tablas `invoices*` que sí existen (28 cols, numeración por empresa, `invoice_activity_log`, pagos parciales) pertenecen al dominio **tenant → cliente final** y son un buen modelo de referencia, pero **no deben reutilizarse** para el SaaS sin separación explícita.

---

## 8. Pagos fallidos y dunning

| Flujo | Estado |
|---|---|
| Tarjeta rechazada | solo `subscriptions.status='past_due'` (si el webhook funcionara) |
| ACH fallido / método vencido / insufficient funds | ❌ no diferenciados |
| Webhook perdido | ❌ sin reconciliación ni backfill |
| Retry automático | delegado a Stripe, invisible en Stafly |
| Aviso al cliente | ❌ |
| Aviso interno | ❌ (solo `console.log`) |
| Cambio de método | ❌ |
| Gracia | ❌ |
| Suspensión progresiva | ❌ |
| Reactivación automática | ❌ |

`past_due` es un string sin consumidores. **No hay dunning.**

---

## 9. Continuidad del servicio

Hoy: `is_active=false` → el tenant desaparece. No hay estado intermedio, no hay lectura garantizada, no hay acceso a payroll ya generado ni exportación.

### Matriz propuesta (no implementada)

| Estado | Crear operaciones | Editar | Lectura operativa | Payroll histórico | Exportar | Facturas/pagar | Soporte |
|---|---|---|---|---|---|---|---|
| **A. Activa** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **B. Pago pendiente** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ (banner) | ✅ |
| **C. Gracia (X días)** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ (banner persistente) | ✅ |
| **D. Restringida** | ❌ nuevas operaciones sensibles (crear servicios, consolidar payroll, invitar) | ✅ limitado | ✅ | ✅ | ✅ | ✅ | ✅ |
| **E. Suspendida** | ❌ | ❌ | ✅ solo lectura | ✅ | ✅ | ✅ | ✅ |
| **F. Cancelada** | ❌ | ❌ | ✅ ventana de retención | ✅ | ✅ | ✅ | ✅ |
| **G. Reactivada** | ✅ tras verificación | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

Invariantes: **nunca** se borra payroll, `time_entries`, documentos, historial, auditoría, chats ni assignments por impago. La suspensión es reversible y no destructiva.

---

## 10. Acuerdos de pago

**Inexistentes en Stafly.** No hay tabla, estado, vencimiento, cuotas, saldo, aprobador ni historial. Hoy se gestiona por WhatsApp/email (`useContactSales`) y se materializa como una edición manual de plan — sin traza.

Modelo propuesto (no implementado): `payment_agreement` (company_id, caso de dunning, monto total, saldo, moneda, cuotas `agreement_installment[]` con fecha compromiso y estado, `approved_by`, `approved_at`, `grace_extension_until`, `status ∈ {proposed, active, fulfilled, breached, cancelled}`, versión VWC, auditoría append-only). Prohibido: acuerdo como nota libre.

---

## 11–13. Activación, suspensión, reactivación

**Superficies que pueden cambiar acceso hoy:**

| Lugar | Qué escribe | Protección |
|---|---|---|
| `Companies.tsx` → `toggleActive` | `companies.is_active` (UPDATE directo desde el cliente) | solo RLS `is_global_owner` |
| `Companies.tsx` → crear empresa | `is_active: true` | idem |
| `Companies.tsx` → asignar plan | `subscriptions.plan/status` (UPDATE/INSERT directo) | idem |
| `Companies.tsx` → clonar empresa | copia `company_modules` y `subscriptions` | idem |
| `useBilling.useRequestUpgrade` | `companies.billing_status`, `upgrade_requested_at` | RLS admin de la empresa |
| `setup-company` | crea company + `subscriptions{trialing}` | admin global |
| `billing-webhook` | `subscriptions.*` | firma (inoperante) |
| `trial-downgrade` | `subscriptions.plan/status` | `CRON_SECRET` |
| trigger `sync_company_active_from_status` | `is_active` | — |

Hallazgos:
- **Ninguna** de estas rutas usa VWC, RPC dedicada ni auditoría específica de ciclo de vida (`activity_log` solo cubre `setup-company` y `trial-downgrade`).
- **No hay doble aprobación** en ningún punto.
- **No hay idempotencia** en el webhook.
- Cross-tenant: contenido por `is_global_owner` en RLS (correcto), pero `billing-checkout` **no** valida pertenencia del `companyId` antes de crear la sesión de pago.

---

## 14. UX del Command Center de compañías

`Companies.tsx` (778 líneas) lee `companies` + `company_modules` + `subscriptions` y deriva el badge de plan/estado de **`subscriptions`**, no de `plan_code`. Consecuencia directa: la pantalla puede decir “pro / Activa” mientras el tenant opera como `free` con módulos de Starter.

| Elemento | Veredicto |
|---|---|
| KPIs | **Conteos, no negocio**: total de empresas y suscripciones “active/trialing”. Sin MRR, sin AR, sin riesgo |
| Plan | **Fuente equivocada** (`subscriptions.plan`) |
| Estado | Dos badges simultáneos e independientes (`plan_status` y `is_active`) que pueden contradecirse |
| “Vence” | `current_period_end` de `subscriptions`, poblado a mano; **no hay pagos detrás** |
| Módulos | Refleja `company_modules`, no el plan → confirma el bypass de entitlements |
| Acciones | Activar/desactivar, editar, clonar, asignar plan — todas escrituras directas sin confirmación de impacto |
| Historial | ❌ |
| Señales de riesgo | ❌ |
| Próxima factura / saldo / pagos fallidos | ❌ |
| Owner | ❌ no se muestra (`owner_user_id` existe) |
| Acuerdo / notas auditadas / actividad | ❌ |

**Por qué se siente como lista y no como administración SaaS:** no hay dinero, no hay tiempo (vencimientos reales, próxima acción), no hay riesgo, no hay historia y las acciones son mutaciones sueltas en vez de transiciones de ciclo de vida.

---

## 15. Seguridad y roles

| Rol | Existe | Alcance |
|---|---|---|
| Global owner (`is_global_owner`) | ✅ | ALL sobre companies, subscriptions, billing_events, company_modules |
| Billing admin | ❌ | no existe rol separado |
| Support admin | ❌ | no existe |
| Company admin (`has_role(admin)`) | ✅ | SELECT de su suscripción y billing_events, INSERT de upgrade_requests |
| Manager / tenant user | ✅ | sin acceso a billing |

Verificado: un admin de compañía **no puede** activar, ver facturas, cambiar plan ni suspender otra empresa (RLS por `user_company_ids` + `is_global_owner`). ✅

Debilidades:
- `billing_events` tiene una policy **INSERT sin `WITH CHECK`** (`qual` vacío) — permite insertar eventos de facturación de cualquier empresa a cualquier usuario que pase la policy. **Riesgo real de contaminación de log.**
- `upgrade_requests` tiene **policies duplicadas** (2 INSERT, 2 SELECT) con INSERT sin restricción de `company_id`.
- Policies definidas para el rol `{public}` en vez de `{authenticated}` en `subscriptions`, `billing_events`, `company_modules`.
- Ninguna tabla de billing tiene `version`/VWC.

---

## 16. Automatizaciones

| Automatización | Frecuencia | Idempotente | Auditada | Retry/DLQ | Alertas | Estado |
|---|---|---|---|---|---|---|
| `trial-downgrade` | “cada hora” documentada; **schedule no verificable** | parcial (filtra `trialing` vencido) | ✅ `billing_events` + `activity_log` | ❌ | ❌ | Sin evidencia de ejecución (1 sola fila `trial_expired`) |
| `billing-webhook` | por evento | ❌ | parcial | ❌ | ❌ | Inoperante |
| Generación de facturas SaaS | — | — | — | — | — | ❌ inexistente |
| Renovación / suspensión / reactivación / dunning / reconciliación / cleanup | — | — | — | — | — | ❌ inexistentes |

**No existe un motor de lifecycle.** Existen dos scripts sueltos.

---

## 17. Observabilidad

| Pregunta | ¿Responde Stafly hoy? |
|---|---|
| MRR | ❌ (no hay precios en DB) |
| Compañías activas | Parcial (dos definiciones contradictorias) |
| En trial | Parcial (`subscriptions.status='trialing'`, poblado por `setup-company` a toda empresa nueva) |
| Past due | ❌ (campo existe, sin datos ni consumidor) |
| Monto vencido / AR aging | ❌ |
| Pagos fallidos | ❌ |
| Suspendidas | Parcial (`companies.status`) |
| Churn / reactivaciones | ❌ |
| Métodos vencidos | ❌ |
| Próxima renovación | ❌ (`current_period_end` manual) |

Los KPIs del Command Center **no son placeholders visuales** — son reales, pero miden filas, no negocio.

---

## 18. Duplicaciones y legacy — matriz de inconsistencias

| # | Inconsistencia | Evidencia | Severidad |
|---|---|---|---|
| D1 | Plan en dos tablas con vocabularios distintos | `plan_code` vs `subscriptions.plan` | **Crítico** |
| D2 | Estado de acceso en tres campos | `is_active`, `status`, `plan_status` | **Crítico** |
| D3 | Empresa con `status='inactive'` e `is_active=true` | fila #2 | Alto |
| D4 | Empresa con `plan_code='enterprise'` sin suscripción | fila #6 | Alto |
| D5 | Empresa `free` con suscripción `pro/active` | fila #1 | Alto |
| D6 | Planes fantasma `operations`/`scale` sin definición | filas #2,4,7,8 | Alto |
| D7 | `paid_features_enabled` como segundo canal de upgrade a enterprise | `resolveEffectivePlan` | Alto |
| D8 | `company_modules` como tercer canal de entitlements | 102 filas | Alto |
| D9 | Price IDs hardcodeados en el webhook | `PLAN_MAP` | Medio |
| D10 | Policies duplicadas en `upgrade_requests` | `pg_policies` | Medio |
| D11 | Dos dominios llamados “billing” | `invoices` vs SaaS billing | Medio |
| D12 | `promo_codes`/`promo_redemptions` vacías y sin consumidor | 0 filas | Bajo |
| D13 | `PLAN_LIMITS` con alias legacy `pro` | `useSubscription.tsx` | Bajo |

---

## 19. Casos reales — qué hace hoy el sistema

| Caso | Comportamiento actual |
|---|---|
| A. Nueva empresa aprobada y pagada | No hay “aprobada” ni “pagada”: un owner global crea la empresa activa y edita el plan a mano |
| B. Nueva empresa sin pago | Idéntico a A. Nada la distingue |
| C. Trial vencido | `trial-downgrade` marcaría `subscriptions.plan='free'`; **el acceso no cambia** porque `plan_code` no se toca |
| D. Pago fallido | Webhook inoperante; si funcionara, `past_due` sin consumidor → **acceso intacto** |
| E. Factura vencida | No existen facturas SaaS |
| F. Acuerdo de pago | Fuera del sistema, sin traza |
| G. Pago parcial | No modelado |
| H. Empresa suspendida | `is_active=false` → pérdida total de acceso, incluido payroll histórico y exportación |
| I. Pago tras suspensión | Reactivación manual; ninguna automatización |
| J. Cambio de plan | UPDATE directo, sin prorrateo, sin historia, sin versión |
| K. Cancelación | `subscriptions.status='canceled'` sin efecto sobre acceso |
| L. Reactivación | Toggle manual sin verificación de pago |
| M. Webhook duplicado | **Duplicaría filas en `billing_events`** y reprocesaría el upsert (no destructivo, pero no idempotente) |
| N. Webhook perdido | Estado divergente permanente; sin reconciliación |
| O. Empresa activa sin suscripción | Ocurre hoy (fila #6) y **es indistinguible de una pagada** |

---

## 20. Riesgos

### CRÍTICO
- **R1** Acceso desacoplado del pago: pagar no otorga y cancelar no retira (D1).
- **R2** Suspensión destructiva de acceso: `is_active=false` bloquea payroll generado, horas reales y exportación → riesgo **legal y laboral**.
- **R3** Webhook no idempotente y sin registro de `event.id`.
- **R4** Cambios de plan y acceso sin VWC, sin RPC y sin auditoría → un UPDATE viejo puede sobrescribir el plan actual.
- **R5** `billing_events` con INSERT policy sin `WITH CHECK`.
- **R6** No existe estado `needs_review`: nada impide que una empresa quede activa sin aprobación ni contrato.
- **R7** `billing-checkout` no valida que el usuario administre el `companyId` recibido.

### ALTO
- **R8** Planes visuales (`subscriptions`) no conectados; el Command Center muestra la fuente equivocada.
- **R9** Facturación SaaS 100% manual y fuera del producto.
- **R10** Estados contradictorios en datos reales (D3–D6).
- **R11** Sin periodo de gracia → binario pago/apagado.
- **R12** Sin reactivación automática ni reconciliación.
- **R13** Tres canales de entitlements (`plan_code`, `paid_features_enabled`, `company_modules`).

### MEDIO
- **R14** KPIs sin valor de negocio; sin señales de riesgo.
- **R15** Price IDs hardcodeados; sin separación test/live.
- **R16** Sin alertas internas ante fallo de pago o de cron.
- **R17** Policies duplicadas y con rol `public`.

### BAJO
- **R18** Copy “Billing / Facturación” ambiguo entre dos dominios.
- **R19** Alias legacy en `PLAN_LIMITS`.
- **R20** Orden visual del listado sin priorización por riesgo.

---

## 21. Arquitectura canónica propuesta (sin implementar)

```
Company (identidad legal, owner, datos fiscales)
  └─ Approval (needs_review → approved_by/at, contract_accepted_at)
      └─ Tenant (espacio operativo; existe solo si Approval válida)
          └─ Subscription (una activa; historia append-only)
              └─ PlanVersion (código, precio, moneda, periodicidad, límites — inmutable)
                  └─ Entitlements (derivados de PlanVersion + Grants explícitos con expiración)
              └─ Invoice (numeración por empresa, líneas, impuestos, due date, estado)
                  └─ PaymentAttempt (idempotency_key, proveedor, resultado)
                      └─ Payment (conciliado)
              └─ DunningCase (abierto por invoice.overdue; estados y escalado)
                  └─ Agreement (cuotas, saldo, aprobador, incumplimiento)
          └─ AccessState (A..G) ← derivado, nunca editado a mano
          └─ AuditEvent (append-only, actor, motivo, referencia)
```

Separación obligatoria de cuatro campos hoy confundidos:

| Campo | Significado | Quién lo escribe |
|---|---|---|
| `company.lifecycle_status` | draft / needs_review / approved / archived | humano aprobador |
| `subscription.status` | trialing / active / past_due / canceled | pasarela + cron |
| `invoice.status` | open / paid / overdue / void | motor de facturación |
| `tenant.access_state` | A..G | **motor derivado**, jamás UI directa |

Todas las transiciones vía RPC versionada (VWC), idempotente y auditada — reutilizando el carril existente `src/lib/data/versioned-write.ts`, no un sistema paralelo.

---

## 22. Eventos propuestos

`company.approved` · `subscription.created` · `payment.succeeded` · `payment.failed` · `invoice.issued` · `invoice.overdue` · `grace.started` · `grace.expired` · `company.restricted` · `company.suspended` · `agreement.created` · `agreement.breached` · `subscription.cancelled` · `company.reactivated`

Contrato por evento: `event_id` único (idempotencia), `company_id` (aislamiento), actor, payload sanitizado, resultado, reversibilidad declarada, y proyección a `AccessState` como única vía de cambio de acceso.

---

## 23. Roadmap propuesto

| Fase | Objetivo | Entregable |
|---|---|---|
| **0 — Mostrar la verdad** | El Command Center lee `plan_code` (fuente real), muestra ambas fuentes cuando divergen y marca las 8 inconsistencias detectadas | UI-only, cero migraciones |
| **1 — Estados canónicos** | `lifecycle_status` + `access_state` derivado; RPC VWC de transición; prohibir UPDATE directo de `is_active` desde cliente | Migración + guardas |
| **2 — Pasarela** | `STRIPE_WEBHOOK_SECRET`, idempotencia por `event.id`, price IDs en DB, validación de membresía en checkout, reconciliación | |
| **3 — Facturación SaaS** | Modelo propio separado de `invoices` (tenant→cliente) | |
| **4 — Dunning y gracia** | `DunningCase`, grace window, avisos cliente/interno | |
| **5 — Acuerdos** | `Agreement` + cuotas auditables | |
| **6 — Suspensión/reactivación** | Matriz A–G con protección de payroll y exportación | |
| **7 — Command Center serio** | Riesgo, saldo, próxima factura, owner, historial, acciones como transiciones | |
| **8 — Métricas SaaS** | MRR, AR aging, churn, reactivaciones | |

---

## 24. Quick wins (bajo riesgo, alto valor)

1. Corregir la fuente del Command Center: mostrar `plan_code` como plan efectivo (Fase 0, UI-only).
2. Añadir `WITH CHECK` a la policy INSERT de `billing_events` y eliminar las policies duplicadas de `upgrade_requests`.
3. Configurar `STRIPE_WEBHOOK_SECRET` **o** retirar/deshabilitar explícitamente las cuatro edge functions de Stripe para eliminar la ambigüedad.
4. Marcar `subscriptions` como legacy en código y documentación hasta la Fase 2.
5. Banner de divergencia en las 4 empresas con estado contradictorio.
6. Validar membresía de `companyId` en `billing-checkout`.
7. Mostrar `owner_user_id` y fecha de última transición en el listado.

---

## 25. Qué no tocar (hasta autorización explícita por fase)

auth · RLS · tenants · `is_active` · planes · billing · payments · subscriptions · payroll · `time_entries` · `companies` · datos productivos · secrets · webhooks · edge functions · VWC.

---

**No se modificaron compañías, planes, suscripciones, pagos, facturas, RLS, tenants, activaciones, webhooks ni datos reales durante esta auditoría.**
