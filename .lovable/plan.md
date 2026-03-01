
# StaflyApps — Roadmap de Implementación v2

## Visión
Construir la versión completa (all-features) usando Quality Staff como empresa piloto, luego definir restricciones por tier para comercializar.

---

## FASE 1: Nómina End-to-End (Prioridad Alta)

### 1.1 Importación de horas
- [ ] Validar flujo completo: subir archivo → mapear columnas → match empleados → guardar
- [ ] Soporte para múltiples formatos (Connecteam, Excel genérico)
- [ ] Manejo de errores claros y log de importación

### 1.2 Consolidación de base pay
- [ ] Verificar consolidación desde time_entries (reloj) y shifts
- [ ] Consolidación de turnos daily-pay (auto-movements)
- [ ] Validaciones pre-consolidación (entradas abiertas, rechazadas)

### 1.3 Novedades (Movements)
- [ ] CRUD completo de novedades manuales por empleado/periodo
- [ ] Conceptos con tasas por empleado vs tasa por defecto
- [ ] Importación masiva de novedades (PayrollExtras)

### 1.4 Resumen de periodo (PeriodSummary)
- [ ] Vista consolidada: base pay + earnings - deductions = net pay
- [ ] Exportación a Excel con formato profesional
- [ ] Flujo de estados: Abierto → Cerrado → Publicado → Pagado
- [ ] Envío de recibos por email

### 1.5 Reportes de nómina
- [ ] Reporte por empleado (EmployeeReport)
- [ ] Reporte comparativo entre periodos (ComparisonReport)
- [ ] Reporte de discrepancias reloj vs schedule (DiscrepancyReport)

### 1.6 Portal del empleado — Pagos
- [ ] PayStub: recibo detallado por periodo
- [ ] MyPayments: historial de pagos con filtros
- [ ] Accumulated: acumulado YTD

---

## FASE 2: Turnos y Reloj (Prioridad Alta)

### 2.1 Gestión de turnos (Shifts)
- [ ] Crear/editar/eliminar turnos programados
- [ ] Asignación de empleados (drag & drop o combobox)
- [ ] Vistas: día, semana, mes, por empleado, por cliente
- [ ] Solicitudes de turno (empleados piden turnos disponibles)
- [ ] Notificaciones automáticas de asignación

### 2.2 Reloj de entrada/salida (TimeClock)
- [ ] Fichaje desde portal del empleado (clock in/out)
- [ ] Validación de solapamiento de fichajes
- [ ] Vista mensual para admin con estados (aprobado/pendiente/rechazado)
- [ ] Consolidación automática al cerrar periodo
- [ ] Geocerca (geofence) para fichaje por ubicación

### 2.3 Vista "Hoy" (TodayView)
- [ ] Dashboard operativo: quién está trabajando, quién falta, alertas
- [ ] Detalle por empleado con timeline del día

---

## FASE 3: Definición de Tiers y Feature Gating (Prioridad Alta)

### 3.1 Mapeo de módulos por plan
| Módulo | Free | Pro ($49) | Enterprise ($149) |
|--------|------|-----------|-------------------|
| Directorio empleados | ✅ | ✅ | ✅ |
| Turnos (básico) | ✅ | ✅ | ✅ |
| Reloj entrada/salida | ❌ | ✅ | ✅ |
| Nómina completa | ❌ | ✅ | ✅ |
| Reportes avanzados | ❌ | ✅ | ✅ |
| Anuncios | ❌ | ✅ | ✅ |
| Clientes y ubicaciones | ❌ | ✅ | ✅ |
| Automatizaciones | ❌ | ❌ | ✅ |
| API externa | ❌ | ❌ | ✅ |
| Multi-marca | ❌ | ❌ | ✅ |
| Onboarding asistido | ❌ | ❌ | ✅ |

### 3.2 Implementación técnica
- [ ] Ampliar `useSubscription` para mapear módulos a plan
- [ ] Bloquear navegación a módulos no incluidos (redirect + upgrade banner)
- [ ] Limitar acciones (crear empleado si límite alcanzado)
- [ ] Banners de upgrade contextuales en cada módulo bloqueado

### 3.3 Stripe — Planes de producción
- [ ] Crear productos/precios en Stripe (Free, Pro, Enterprise)
- [ ] Verificar webhook de billing funciona en producción
- [ ] Customer portal para que clientes gestionen su suscripción

---

## FASE 4: Onboarding Self-Service (Prioridad Media)

### 4.1 Registro de nueva empresa
- [ ] Landing page con CTA → registro
- [ ] Wizard: nombre empresa → slug → admin principal → módulos
- [ ] Provisionar empresa con configuración por defecto
- [ ] Trial period (14 días Pro gratis)

### 4.2 Configuración inicial guiada
- [ ] Setup wizard post-registro: importar empleados, configurar nómina, crear primer periodo
- [ ] Empresa sandbox para demos

---

## FASE 5: Pulido y Producción (Prioridad Media)

### 5.1 UX/UI
- [ ] Responsive completo en todas las vistas admin
- [ ] Portal móvil optimizado
- [ ] Emails transaccionales con branding

### 5.2 Seguridad y auditoría
- [x] Audit trail en páginas críticas (PeriodSummary, Employees, Shifts, TimeClock)
- [ ] Expandir audit trail a todas las páginas admin
- [ ] Revisión de RLS policies

### 5.3 Rendimiento
- [ ] Paginación server-side en listados grandes
- [ ] Caché de consultas frecuentes con React Query
- [ ] Optimización de queries pesadas

---

## Estado actual
- **Empresa piloto**: Quality Staff (company_id activo)
- **Fase activa**: 1 + 2 + 3 (en paralelo)
- **Última actualización**: 2026-03-01
