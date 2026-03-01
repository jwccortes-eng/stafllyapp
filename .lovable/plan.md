
# StaflyApps — Roadmap de Implementación v2

## Visión
Construir la versión completa (all-features) usando Quality Staff como empresa piloto, luego definir restricciones por tier para comercializar.

**Orden de ejecución**: Fase 1 → Fase 2 → Fase 4

---

## FASE 1: Nómina End-to-End (ACTIVA)

### 1.1 Importación de horas — ✅ CONSTRUIDO
- [x] ImportTimeClock.tsx (796 líneas) — subir Excel → mapear → match empleados → guardar
- [x] Soporte Connecteam + Excel genérico (connecteam-parser.ts)
- [x] ImportConnecteam.tsx — parser dedicado
- [x] Log de importación con estados
- [ ] **PENDIENTE**: Validar flujo completo con datos reales de Quality Staff
- [ ] **PENDIENTE**: UX de errores — mensajes más claros para el usuario

### 1.2 Consolidación de base pay — ✅ CONSTRUIDO
- [x] Función DB `consolidate_period_base_pay` — consolida desde time_entries y shifts
- [x] Consolidación de turnos daily-pay (auto-movements con concepto "Daily Pay")
- [x] Validaciones pre-consolidación (entradas abiertas, rechazadas)
- [x] Botón de consolidar en PeriodSummary
- [ ] **PENDIENTE**: Probar consolidación con datos reales completos

### 1.3 Novedades (Movements) — ✅ CONSTRUIDO
- [x] Movements.tsx (593 líneas) — CRUD completo por empleado/periodo
- [x] Conceptos con tasas por empleado vs tasa por defecto (concept_employee_rates)
- [x] ImportPayrollExtras.tsx (708 líneas) — importación masiva
- [x] KPIs: total extras, deducciones, empleados afectados
- [ ] **PENDIENTE**: Validar que los cálculos de calc_mode (qty_x_rate, manual_value) sean correctos

### 1.4 Resumen de periodo (PeriodSummary) — ✅ CONSTRUIDO
- [x] PeriodSummary.tsx (652 líneas) — base pay + earnings - deductions = net pay
- [x] Exportación Excel
- [x] Flujo de estados: Abierto → Cerrado → Publicado → Pagado
- [x] Envío de recibos por email (send-payroll-email edge function)
- [x] Audit trail integrado
- [ ] **PENDIENTE**: Mejorar formato de exportación Excel (más profesional)
- [ ] **PENDIENTE**: Probar flujo de email end-to-end

### 1.5 Reportes de nómina — ✅ CONSTRUIDO
- [x] EmployeeReport.tsx (636 líneas) — reporte individual con desglose
- [x] ComparisonReport.tsx (367 líneas) — comparativo turnos vs cobertura
- [x] DiscrepancyReport.tsx (466 líneas) — discrepancias reloj vs schedule
- [ ] **PENDIENTE**: Reporte comparativo entre periodos (periodo A vs B)

### 1.6 Portal del empleado — Pagos — ✅ CONSTRUIDO
- [x] PayStub.tsx (209 líneas) — recibo detallado por periodo
- [x] MyPayments.tsx (412 líneas) — historial con expandir detalles
- [x] Accumulated.tsx (203 líneas) — acumulado con tabla y totales
- [ ] **PENDIENTE**: Gráfico de tendencia en MyPayments

### 📋 RESUMEN FASE 1: ~90% construido. Falta validación con datos reales y pulido.

---

## FASE 2: Turnos y Reloj (SIGUIENTE)

### 2.1 Gestión de turnos (Shifts) — ✅ CONSTRUIDO
- [x] Shifts.tsx + componentes (DayView, WeekView, MonthView, etc.)
- [x] Asignación de empleados (EmployeeCombobox)
- [x] Vistas: día, semana, mes, por empleado, por cliente
- [x] Solicitudes de turno (ShiftRequests.tsx)
- [x] Notificaciones automáticas (trigger DB notify_managers_on_shift_request)
- [x] Códigos incrementales #0001
- [x] Import de horarios (ImportSchedule.tsx)
- [ ] **PENDIENTE**: Drag & drop para reasignar turnos
- [ ] **PENDIENTE**: Copiar semana anterior

### 2.2 Reloj de entrada/salida (TimeClock) — ✅ CONSTRUIDO
- [x] TimeClock.tsx — vista mensual admin
- [x] PortalClock.tsx — fichaje empleado
- [x] Validación solapamiento (trigger DB prevent_overlapping_time_entries)
- [x] Estados: pendiente/aprobado/rechazado
- [x] Consolidación automática vía función DB
- [ ] **PENDIENTE**: Geocerca (geofence) — estructura DB existe, falta implementar en portal
- [ ] **PENDIENTE**: Fichaje con foto (opcional)

### 2.3 Vista "Hoy" (TodayView) — ✅ CONSTRUIDO
- [x] TodayView.tsx — dashboard operativo
- [x] EmployeeDayDetailDrawer — timeline del día por empleado
- [x] Forzar salida de fichajes abiertos
- [ ] **PENDIENTE**: Alertas de empleados que no han fichado

### 📋 RESUMEN FASE 2: ~85% construido. Falta geocerca, drag&drop turnos, alertas.

---

## FASE 3: Definición de Tiers y Feature Gating (DESPUÉS)

### 3.1 Estado actual del feature gating
- [x] useSubscription.tsx — lee plan de tabla `subscriptions`
- [x] PLAN_LIMITS definidos (Free: 25 emp/1 admin, Pro: 100/3, Enterprise: ilimitado)
- [x] PREMIUM_FEATURES: automations, monetization, advanced-reports, api-access
- [x] UpgradeBanner componente
- [x] Billing con Stripe (checkout, webhook, portal)

### 3.2 Pendiente
- [ ] Mapear TODOS los módulos a planes (no solo features premium)
- [ ] Bloquear navegación sidebar para módulos no incluidos
- [ ] Crear productos/precios en Stripe producción
- [ ] Trial de 14 días
- [ ] Upgrade flow in-app más fluido

### 3.1 Mapeo propuesto de módulos por plan
| Módulo | Free | Pro ($49) | Enterprise ($149) |
|--------|------|-----------|-------------------|
| Directorio empleados | ✅ | ✅ | ✅ |
| Turnos (básico, sin reloj) | ✅ | ✅ | ✅ |
| Anuncios | ✅ | ✅ | ✅ |
| Reloj entrada/salida | ❌ | ✅ | ✅ |
| Nómina completa | ❌ | ✅ | ✅ |
| Reportes avanzados | ❌ | ✅ | ✅ |
| Clientes y ubicaciones | ❌ | ✅ | ✅ |
| Novedades / Extras | ❌ | ✅ | ✅ |
| Automatizaciones | ❌ | ❌ | ✅ |
| API externa | ❌ | ❌ | ✅ |
| Multi-marca | ❌ | ❌ | ✅ |
| Chat interno | ❌ | ❌ | ✅ |

---

## FASE 4: Onboarding Self-Service (POSTERIOR)

- [ ] Landing page con CTA → registro
- [ ] Wizard: nombre empresa → slug → admin principal
- [ ] Provisionar empresa con configuración por defecto + módulos del plan
- [ ] Trial period (14 días Pro gratis)
- [ ] Setup wizard post-registro: importar empleados, configurar nómina

---

## Estado actual
- **Empresa piloto**: Quality Staff
- **Fase activa**: Fase 1 — validación con datos reales
- **Última actualización**: 2026-03-01
