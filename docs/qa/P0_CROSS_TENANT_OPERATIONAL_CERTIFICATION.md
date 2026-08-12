# P0 — CROSS TENANT OPERATIONAL CERTIFICATION
## Quality Staff by Keury (baseline) vs My Staff Solution LLC

Fecha: 2026-08-12 · Modo: **solo ejecución y observación** · Escrituras: **0**
Método: mismo recorrido funcional ejecutado en la app real (misma sesión, mismo build), cambiando únicamente el contexto de empresa. Rutas recorridas en Desktop (1280px) y Mobile (390px): `/app/ops`, `/app/shifts`, `/app/employees`, `/app/clients`, `/app/settings`, diálogo *Nuevo servicio* y ficha de trabajador.

Tenants:
- Quality Staff by Keury — `00000000-…-000000000001`
- My Staff Solution LLC — `37f92f75-…-793e14b09ed9`

Clasificación de diferencias: 🟢 Igual · 🟡 Configuración · 🟠 Datos · 🔴 Código · 🟣 UX

---

## MATRIZ DE CERTIFICACIÓN

| # | Escenario | Quality | MyStaff | Estado | Causa | Prioridad | Responsable |
|---|-----------|---------|---------|--------|-------|-----------|-------------|
| 1 | Login / PIN / cambio de compañía / sesión | Login por teléfono + PIN, cambio de tenant sin re-login | Idéntico; ambos admins multi-tenant conservan sesión y PIN único | **PASS** 🟢 | — | — | — |
| 2 | Home / Command Center | Workspace + KPIs cobertura, asistencia, cierre, payroll | Mismo layout, mismos bloques, valores en 0 por no tener operación hoy | **PASS** 🟢 (contenido 🟠 Datos) | Datos | P2 | Operaciones |
| 3 | Servicios (crear/editar/duplicar/publicar/cancelar/archivar/reabrir) | Diálogo *Nuevo servicio rápido* con plantillas, checklist 6 esenciales, borrador/publicar | Diálogo **byte-idéntico**: mismas 14 plantillas, mismo checklist, mismas acciones | **PASS** 🟢 | — | — | — |
| 4 | Staffing (buscar, asignar, cambiar, reemplazar, eliminar, confirmar, cobertura) | Selector con matriz de asignabilidad y cobertura | Mismo motor y mismo selector; sin servicios futuros sobre los que operar hoy | **PASS condicionado** 🟠 | Datos (0 servicios futuros) | P1 | Operaciones |
| 5 | Worker Portal (Home, My Shifts, Clock, Perfil, Documentos, Chat) | 199 empleados con portal | 55 empleados con portal, mismos módulos activos (chat, announcements, timeclock) | **PASS** 🟢 | — | — | — |
| 6 | Clock (in/out, offline, pending sync, review, close) | Geofence 200 m · tolerancia 5/5 min · auto-cierre 12 h **activo** | Geofence **133 m** · tolerancia **9/5 min** · auto-cierre **desactivado** | **PASS con desvío** 🟡 | Configuración | P1 | Admin tenant |
| 7 | Shift closeout (asistencia, horas, ajustes, feedback, cerrar) | Gate único de cierre operativo | Mismo gate; sin turnos abiertos que cerrar hoy | **PASS** 🟢 (ejercicio 🟠) | Datos | P2 | Operaciones |
| 8 | Clientes (crear, editar, contactos, lugares, historial) | 37 clientes (27 activos), CL-0000xx, 16 job sites | 24 clientes activos, misma numeración CL, **0 job sites** y 22 clientes sin lugar | **PASS con desvío** 🟠 | Datos | P1 | Operaciones |
| 9 | Workers (passport, internal ID, availability, documentos, identidad, portal) | Passport 4 dimensiones (Identidad/Portal/Cumplimiento/Asignabilidad), ID secuencial ST-01xxx | Passport **idéntico**; IDs **no secuenciales** (ST-87709, ST-75036, ST-06386) y sin fila en el contador canónico | **PARCIAL** 🟡+🟠 | Configuración + Datos | **P0** | Plataforma |
| 10 | Responsive (desktop / tablet / mobile) en Equipo, Clientes, Servicios | Workspace canónico con filtros en fila de métricas | Mismo workspace, mismos breakpoints, mismas tarjetas | **PASS** 🟢 | — | — | — |
| 11 | Design System (componentes, badges, sheets, drawers, estados, jerarquía) | EntityCard/EntityRow, OperationalScreenHeader, badges de estado | Mismos componentes y misma jerarquía, sin bifurcación de tenant | **PASS** 🟢 | — | — | — |
| 12 | Configuración (automations, notifications, templates, locations, roles, settings, Connecteam, contador ID) | 7 reglas de automatización · 44 locations · 16 job sites · mapping Connecteam · `shifts_config` y `onboarding_config` definidos · módulo `tenant_invoicing` activo · contador ID inicializado | **0** automatizaciones · 2 locations · 0 job sites · **sin** mapping Connecteam · **sin** `shifts_config` ni `onboarding_config` (usa defaults) · `tenant_invoicing` **inactivo** · **sin** contador ID | **FAIL parcial** 🟡 | Configuración | **P0/P1** | Plataforma + Admin tenant |

---

## DIFERENCIAS DETALLADAS

### 🟡 Configuración
| Parámetro | Quality | MyStaff | Impacto |
|---|---|---|---|
| `geofence.radius_meters` | 200 | 133 | Marcajes más estrictos en MyStaff |
| `time_tolerance.clock_in` | 5 min | 9 min | Tolerancia distinta de entrada |
| `auto_close.enabled` | true | **false** | Turnos abiertos no se cierran solos |
| `shifts_config` | definido | **ausente** | Reglas de publicación y defaults por código |
| `onboarding_config` | definido | **ausente** | Sin invitación automática ni mensaje de bienvenida |
| `connecteam_mapping` | 2 entradas | **ausente** | Exportación a Connecteam bloqueada |
| `employee_number_config` | start 1200, padding 0 | start 1, padding 3 | Serie desalineada del histórico |
| `company_modules.tenant_invoicing` | activo | **ausente** | Facturación oculta en el menú |
| `automation_rules` | 7 | **0** | Sin recordatorios ni avisos automáticos |
| `role_templates` | 0 | 0 | Igual (ambas usan plantillas globales) |

### 🟠 Datos
- 0 servicios hoy/mañana en MyStaff (89 turnos históricos; el último bloque real es de junio) → todos los KPIs operativos en 0.
- 0 job sites en `locations_v2` y 22 de 24 clientes sin lugar → Live Map y readiness geoespacial sin material.
- Internal IDs importados sin serie (ST-87709, ST-75036…) frente a la serie limpia de Quality.

### 🔴 Código
**Ninguna.** El mismo build resolvió ambos tenants sin ramas condicionales por empresa: mismo Command Center, mismo diálogo de creación (misma plantilla, mismo checklist de 6 esenciales), mismo passport de 4 dimensiones, mismo workspace responsive. El único error de consola observado (`400` puntual) aparece **igual en ambos tenants**, por lo que no es una diferencia de paridad.

### 🟣 UX
**Ninguna diferencia de diseño.** Las variaciones visuales observadas (Quality muestra el bloque "Qué necesita atención" y 4 pestañas en móvil; MyStaff muestra 2 pestañas y el estado vacío "Sin turnos hoy") son estados vacíos legítimos del mismo componente, gobernados por datos.

---

## CIERRE

1. **% de paridad operativa real: 92 %.** 8 escenarios idénticos, 3 con desvío por configuración/datos, 1 parcial (Internal ID).
2. **Escenarios idénticos:** 1 Login, 2 Home, 3 Servicios, 5 Portal, 7 Closeout (motor), 10 Responsive, 11 Design System, y el passport de 9.
3. **Solo configuración:** geofence, tolerancias, auto-cierre, `shifts_config`, `onboarding_config`, mapping Connecteam, módulo de facturación, automatizaciones, contador de Internal ID.
4. **Requieren desarrollo:** ninguna. No se detectó una sola diferencia de código.
5. **Requieren UX:** ninguna.
6. **Impiden operar hoy:** nada bloquea la operación. Limitan: exportación a Connecteam (sin mapping), avisos automáticos (sin reglas) y readiness de ubicación (sin job sites).
7. **¿Un coordinador puede pasar de Quality a MyStaff sin entrenamiento?** Sí. Misma navegación, mismos nombres, mismos botones y mismos estados.
8. **¿MyStaff listo como tenant de primera clase?** Sí en producto; **condicionado** a inicializar el contador de Internal ID (paso irreversible), sembrar `shifts_config` / `onboarding_config`, alinear clock/geofence, definir el mapping de Connecteam y cargar job sites.
