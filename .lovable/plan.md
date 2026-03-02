
# StaflyApps — Roadmap de Implementación v2

## Visión
Construir la versión completa (all-features) usando Quality Staff como empresa piloto, luego definir restricciones por tier para comercializar.

**Orden de ejecución**: Fase 1 → Fase 2 → Fase 3 → Fase 4

---

## FASE 1: Nómina End-to-End — ✅ ~90% construido

### 1.1 Importación de horas — ✅ CONSTRUIDO
- [x] ImportTimeClock.tsx — subir Excel → mapear → match empleados → guardar
- [x] Soporte Connecteam + Excel genérico
- [ ] **PENDIENTE**: Validar flujo completo con datos reales

### 1.2 Consolidación de base pay — ✅ CONSTRUIDO
- [x] Función DB `consolidate_period_base_pay`
- [ ] **PENDIENTE**: Probar con datos reales completos

### 1.3 Novedades (Movements) — ✅ CONSTRUIDO
- [x] CRUD completo + importación masiva + KPIs

### 1.4 Resumen de periodo — ✅ CONSTRUIDO
- [x] base pay + earnings - deductions = net pay + exportación + email

### 1.5 Reportes de nómina — ✅ CONSTRUIDO
- [x] Individual, comparativo, discrepancias

### 1.6 Portal del empleado — Pagos — ✅ CONSTRUIDO
- [x] PayStub, MyPayments, Accumulated

---

## FASE 2: Turnos y Reloj — ✅ ~85% construido

### 2.1 Gestión de turnos — ✅ CONSTRUIDO
- [x] Vistas día/semana/mes, asignación, solicitudes, notificaciones

### 2.2 Reloj — ✅ CONSTRUIDO
- [x] Admin + Portal, validación solapamiento, estados
- [ ] **PENDIENTE**: Geocerca, fichaje con foto

### 2.3 Vista "Hoy" — ✅ CONSTRUIDO
- [x] Dashboard operativo + timeline + forzar salida

---

## FASE 3: Feature Gating + Billing — ✅ IMPLEMENTADO

### 3.1 Mapeo de módulos por plan — ✅ DONE
- [x] MODULE_PLAN_MAP en useSubscription: Free (empleados, conceptos, turnos, anuncios), Pro (reloj, nómina, reportes, clientes, ubicaciones), Enterprise (automatizaciones, chat, API)
- [x] `canAccessModule()` y `requiredPlanForModule()` helpers
- [x] Sidebar muestra módulos bloqueados con 🔒 + badge del plan requerido
- [x] Click en módulo bloqueado → redirige a /app/pricing
- [x] Trial banner en sidebar (días restantes)

### 3.2 Stripe real — ✅ DONE
- [x] Productos creados: Staffly Pro (prod_U3IluoBcH0iTV3), Enterprise (prod_U3IlChjEUzg2pj)
- [x] Price IDs: price_1T5C9xK7PYTRtWks5cRmmPtJ (Pro), price_1T5CAJK7PYTRtWksY7nUGqB5 (Enterprise)
- [x] billing-checkout: funcional con Stripe real
- [x] billing-webhook: procesa eventos y actualiza subscriptions
- [x] billing-customer-portal: portal de gestión Stripe

### 3.3 Trial 14 días — ✅ DONE
- [x] setup-company crea suscripción "trialing" con plan "pro" por 14 días
- [x] UI muestra días restantes en sidebar y Pricing

### 3.4 Planes manuales — ✅ EXISTENTE
- [x] Asignación manual desde panel admin de empresas

### 3.5 Pendiente
- [ ] Configurar webhook en Stripe Dashboard (endpoint + eventos)
- [ ] Implementar downgrade automático post-trial (cron o webhook)
- [ ] Bloquear acceso real a páginas gated (no solo sidebar)

---

## FASE 4: Onboarding Self-Service — ✅ PARCIAL

- [x] Landing page con CTA → registro
- [x] Wizard: nombre empresa → slug → admin principal (setup-company edge function)
- [x] Provisionar empresa con configuración por defecto + módulos + trial Pro 14d
- [ ] Setup wizard post-registro: importar empleados, configurar nómina
- [ ] Mejorar flujo de bienvenida post-registro

---

## Estado actual
- **Empresa piloto**: Quality Staff
- **Fase activa**: Fase 3 completada, validación pendiente
- **Última actualización**: 2026-03-02
