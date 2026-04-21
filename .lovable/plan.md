# Plan: Tenant Invoicing (Billing) — Stafly

> Módulo independiente de payroll para que cada empresa facture a sus propios clientes.
> **Reglas absolutas**: no romper shifts/attendance/payroll, multi-tenant estricto por `company_id`, calidad SaaS premium (Stripe + Linear + QuickBooks).

---

## Decisiones acordadas

| Decisión | Elección |
|---|---|
| Alcance MVP | Plan por fases (este documento) |
| Generación de blocks | **Híbrido**: auto cuando shift tiene `billing_client_id` + `billing_location_id` resueltos; botón manual "Generate" como fallback |
| Relación con clients | **Tabla nueva `billing_clients`** con `operational_client_id` opcional (FK nullable a `clients.id`) |
| Acceso | **Pro+ con feature flag por empresa** vía `company_modules.module = 'tenant_invoicing'` |

---

## Arquitectura

```
Shifts (operación)
  └─ approval (status=approved)
       └─ Hybrid generator (edge function)
            ├─ Auto si shift.client_id mapea a billing_client + billing_location
            └─ Manual button para shifts sin mapeo
       └─ billable_service_blocks (status=pending)
            └─ Admin review/adjust
                 └─ status=approved
                      └─ Selección en Create Invoice
                           └─ invoice_lines (source_service_block_id)
                                └─ block.source_status='invoiced' (lock)
                                     └─ invoice draft → finalized → sent → paid
                                          └─ invoice_payments + activity_log
```

**Aislamiento total**: cero cambios en `shifts`, `time_entries`, `pay_periods`, `period_base_pay`, `movements`. El módulo solo **lee** de operación; escribe únicamente en sus propias tablas.

---

## Fases

### **Fase 1 — Schema + RLS + Module gate** ✅ APROBADA / EN EJECUCIÓN

Migración con 8 tablas + enums + RLS por `company_id` + triggers seguros (`updated_at`, auto invoice_number per-company, activity_log preparado) + registro de módulo `'tenant_invoicing'` en `MODULE_PLAN_MAP` (Pro+).

**Schema pasivo**: todo listo para fases siguientes, sin automatismos que puedan afectar producción. No se crea UI, ni edge functions, ni se acopla a triggers de operación.

### **Fase 2 — Billing Clients & Locations**

Página `/app/invoicing/clients`. CRUD con drawer. Vínculo opcional a cliente operativo. ModuleGate aplicado.

### **Fase 3 — Generador de Service Blocks (híbrido)**

Edge function `billing-generate-service-blocks` (lee shifts aprobados, resuelve mapeo, calcula qty por `billable_unit`). Página `/app/invoicing/service-blocks` con tabs Pending/Approved/Invoiced y botón "Generate from operations".

### **Fase 4 — Create Invoice + Invoice Lines**

Página `/app/invoicing/invoices/new` con 5 secciones (Header, Service Blocks Selector, Lines editable, Summary, Payment info). Transacción: invoice + lines + lock blocks.

### **Fase 5 — Invoice Detail + Estados**

Detail split (metadata+activity_log | preview PDF). Lista con KPIs. Estados: draft → finalized → sent → partially_paid → paid, overdue, void. Activity log automático.

### **Fase 6 — PDF Export + Payment Tracking**

Edge function `billing-invoice-pdf`. Registro de pagos. Email opcional con PDF.

### **Fase 7+ (futuro)**

Recurrencia, statements, multi-currency real, Stripe Invoicing como cobro, tax engine, importer Zoho.

---

## Garantías de no-regresión

- ❌ Cero modificaciones a tablas/hooks de operación
- ✅ Solo se añade FK `operational_client_id` desde `billing_clients` → `clients` (lectura)
- ✅ Lectura de operación vía edge function dedicada, nunca acoplada a triggers de la operación
- ✅ ModuleGate `tenant_invoicing` aísla la UI completa
- ✅ Multi-tenant estricto: RLS por `company_id` + helper `user_company_ids`

---

## Próximo paso

Aprobar este plan → ejecutar **Fase 1** (migración del schema + RLS + módulo en gating). Sin UI, sin riesgo.
