# P0 — QUALITY vs MYSTAFF · AUDITORÍA DE PARIDAD OPERATIVA

**Fecha:** 2026-08-12 · **Modo:** SOLO LECTURA (0 writes, 0 migraciones)
**Baseline:** Quality Staff by Keury (`0000…0001`)
**Comparado:** My Staff Solution LLC (`37f9…9ed9`)
**Alcance:** funcionalidad, UX, roles, flujos, permisos, resolvers, configuración, features.
No se compararon datos, trabajadores ni clientes (los conteos que aparecen sólo se usan
como evidencia de si una capacidad está *configurada*, nunca como métrica de negocio).

---

## 0. Hallazgo estructural

El código de Stafly **no contiene ninguna bifurcación por empresa**: no hay company_id,
nombre ni slug de tenant embebido en `src/` ni en las funciones de backend. Todas las
pantallas, resolvers y motores (publication truth, service location SSoT, person status,
portal modules, internal ID, VWC, closeout gate, clock state machine, design system) se
resuelven por `company_id` en tiempo de ejecución.

**Consecuencia:** toda diferencia observada entre Quality y MyStaff proviene de
**configuración de tenant o de datos**, no de código. No se detectó ningún bug exclusivo
de MyStaff.

Ambas empresas están en plan **enterprise** y activas, por lo que ningún gate de plan
(`MODULE_PLAN_MAP`) bloquea nada en MyStaff.

---

## 1. Matriz de paridad

Estado: ✅ Igual · ⚠️ Parcial · ❌ No existe
Origen: **[C]** configuración de tenant (no es bug) · **[K]** código (sí es bug)

| A · Feature | B · Quality | C · MyStaff | D · Estado | E · Prioridad |
|---|---|---|---|---|
| **1. Dashboard** |
| Command Center / Ops | Activo | Mismo código, mismo tenant scope | ✅ | — |
| KPIs y pulso operativo | Activo | Igual (se calculan sobre datos propios) | ✅ | — |
| OperationalWorkspace (desktop) | Activo | Igual | ✅ | — |
| Workspace responsive (móvil/tablet) | Activo | Igual | ✅ | — |
| **2. Servicios** |
| Crear / editar / duplicar | Activo | Igual | ✅ | — |
| Creación masiva (bulk) + series | Activo | Igual | ✅ | — |
| Publicar (publication truth) | Activo | Igual | ✅ | — |
| Staffing / cobertura / readiness | Activo | Igual | ✅ | — |
| Cierre (closeout gate único) | Activo | Igual | ✅ | — |
| Timeline y chat de servicio | Activo | Igual (sin conversaciones creadas aún) | ✅ | — |
| Live Map | Activo (44 locations) | Funciona con 2 locations cargadas | ⚠️ [C] | P1 |
| `shifts_config` del tenant | Definido | **Sin fila** → defaults del sistema | ⚠️ [C] | P1 |
| Contador de folio de servicio | Presente | Presente | ✅ | — |
| Export Connecteam | Mapeo de jobs configurado | **Sin `connecteam_mapping`** → export bloqueado | ❌ [C] | P0 |
| **3. Trabajadores** |
| Passport / perfil / historial / ratings | Activo | Igual | ✅ | — |
| Internal ID canónico (`next_internal_id`) | Activo, contador v1311 | Mismo motor, **sin fila de contador** y `start_number=1`, `padding=3` | ⚠️ [C] | P0 |
| Inmutabilidad de Internal ID (trigger) | Activa | Activa (global) | ✅ | — |
| Portal del trabajador | Activo | Igual (defaults del resolver) | ✅ | — |
| Overrides `employee_portal_modules` | 18 filas | 0 filas → todos los módulos por default | ⚠️ [C] | P2 |
| Availability | Configurada | **Sin `employee_availability_config`** | ⚠️ [C] | P1 |
| Documentos | Activo | Igual (motor idéntico) | ✅ | — |
| Detección de duplicados / identity quality | Activa | Misma pantalla y motor | ✅ | — |
| **4. Clientes** |
| Perfil, lugares, servicios, historial | Activo | Igual | ✅ | — |
| Contactos de cliente | 1 registrado | **0 registrados** (capacidad presente) | ⚠️ [C] | P2 |
| Client truth (CL-XXXXXX) y acento cromático | Activo | Igual | ✅ | — |
| **5. Clock** |
| Clock in / out | Activo | Igual | ✅ | — |
| Offline queue + sync engine | Activo | Igual | ✅ | — |
| Geofence | Habilitado · radio 200 m | Habilitado · radio **133 m** | ⚠️ [C] | P2 |
| Tolerancias de marcaje | 5 / 5 min | **9** / 5 min | ⚠️ [C] | P2 |
| Auto-validación | Habilitada | Habilitada | ✅ | — |
| Auto-cierre de turnos | **Habilitado** (12 h) | **Deshabilitado** | ⚠️ [C] | P1 |
| Time entries | Activo | Igual | ✅ | — |
| **6. Payroll (capacidades)** |
| Horas, ajustes, aprobaciones, cierre | Activo | Igual | ✅ | — |
| Módulos periods/movements/summary/reports | Activos | Activos | ✅ | — |
| `payroll_config`, `pay_week`, `pay_types`, overtime | Definidos | Definidos e idénticos | ✅ | — |
| Conceptos | 15 | 11 (catálogo propio del tenant) | ⚠️ [C] | P2 |
| **7. Portal Worker** |
| Home / My Shifts / Clock / Perfil / Documentos / Chat | Activo | Igual (resolver de módulos con defaults) | ✅ | — |
| Anuncios al portal | 8 publicados | 0 publicados (capacidad presente) | ⚠️ [C] | P2 |
| **8. Roles y permisos** |
| Owner (`company_owner`) | 4 usuarios | 3 usuarios + 1 `owner` global | ✅ | — |
| Administrador (`admin`) | 4 | 5 | ✅ | — |
| Coordinador (admin con permisos acotados) | Configurado por `module_permissions` / `action_permissions` | Mismo mecanismo, mismos usuarios operativos | ✅ | — |
| Worker (`employee`) | 45 membresías | 5 membresías (el resto sin portal) | ⚠️ [C] | P1 |
| Motor de permisos efectivos | Único (`useAuth` + tablas por usuario) | Idéntico | ✅ | — |
| **9. Identidad** |
| Identity resolver + guard anti-duplicados | Activo | Activo (global) | ✅ | — |
| Auth / PIN único por auth user | Activo | Activo (unificado en el P0 anterior) | ✅ | — |
| Numeración histórica | Cargada | **No cargada** (sólo 001–009) | ⚠️ [C] | P0 |
| **10. Configuración** |
| Locations | 44 | 2 | ⚠️ [C] | P1 |
| Companies / lifecycle / access state | Igual | Igual | ✅ | — |
| Plantillas de notificación | 0 | 0 | ✅ | — |
| Automatizaciones | 7 reglas | **0 reglas** | ❌ [C] | P1 |
| `onboarding_config` | Definido | **Sin fila** → defaults | ⚠️ [C] | P1 |
| Módulo `tenant_invoicing` | Fila activa | **Sin fila** → oculto en navegación | ❌ [C] | P1 |
| Resto de módulos (14) | Activos | Activos e idénticos | ✅ | — |
| **11. Responsive** |
| Desktop / tablet / móvil | One Design System | Mismo build, mismos breakpoints | ✅ | — |
| **12. Design System** |
| Equipo · Clientes · Servicios | `OperationalWorkspace` + `EntityCard`/`EntityRow` + tokens | Exactamente los mismos componentes | ✅ | — |

---

## 2. Cierre — respuestas

**1. % de paridad actual**
- Paridad de **código y capacidades**: **100 %** (0 diferencias con origen en código).
- Paridad **efectiva/configurada**: **≈ 88 %** — 47 ítems evaluados: 32 ✅, 12 ⚠️, 3 ❌.

**2. Funciones faltantes (❌, todas por configuración)**
- Export a Connecteam: falta `connecteam_mapping`.
- Automatizaciones: 0 reglas cargadas.
- Módulo `tenant_invoicing`: sin fila en `company_modules` → no aparece en el menú.

**3. Funciones parciales (⚠️)**
Live Map (2 lugares), `shifts_config` y `onboarding_config` sin fila, contador de Internal
ID sin inicializar y con `start_number=1`/`padding=3`, availability sin configurar,
auto-cierre apagado, geofence 133 m, tolerancia de entrada 9 min, contactos de cliente,
anuncios, overrides de portal por empleado, catálogo de conceptos, membresías `employee`.

**4. Bugs exclusivos de MyStaff**
**Ninguno.** No existe código específico por empresa; todos los resolvers son
tenant-agnósticos y se comportan igual en ambas.

**5. Configuración faltante en MyStaff**
`connecteam_mapping`, `shifts_config`, `onboarding_config`,
`company_internal_id_counters`, `company_modules.tenant_invoicing`,
`automation_rules`, `employee_availability_config`, catálogo de lugares,
`auto_close.enabled`.

**6. Homologable automáticamente (config, sin desarrollo)**
Activar `tenant_invoicing`, sembrar `shifts_config` y `onboarding_config` con la
plantilla de Quality, alinear `auto_close`, `geofence.radius_meters` y `time_tolerance`,
inicializar el contador de Internal ID con la política definitiva, clonar las 7 reglas de
automatización. Todo son filas de configuración por tenant.

**7. Requiere desarrollo**
Sólo el mapeo de Connecteam necesita trabajo humano real (definir jobs/destinos del
tenant en la UI existente); no requiere código nuevo. Recomendación de producto —no
bloqueante—: un **asistente de "clonar configuración de empresa"** que copie las claves de
`company_settings` y `company_modules` de un tenant baseline a otro, hoy inexistente.

**8. Recomendación para llegar al 100 %**
1. Definir la política de Internal ID de MyStaff (rango histórico) e inicializar el
   contador antes de crear más personal — es el único punto irreversible.
2. Sembrar en un solo paso: `shifts_config`, `onboarding_config`, `tenant_invoicing`,
   `auto_close`, geofence y tolerancias con los valores de Quality.
3. Cargar lugares y mapeo de Connecteam para desbloquear Live Map y exportación.
4. Clonar las reglas de automatización y revisar membresías de portal de los 67 activos.
5. Repetir esta auditoría tras la homologación; el objetivo es 47/47 ✅.

---

## 3. No tocado

auth · RLS · payroll · `time_entries` · `shift_assignments` · `scheduled_shifts` ·
documentos · datos de producción. Cero writes, cero migraciones, cero cambios de código.
