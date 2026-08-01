# STAFLY — Auditoría de Comunicación, Notificaciones Inteligentes y Experiencia Adaptativa

**Tipo:** Report-only. **Fecha:** 2026-08-01.
**Código modificado:** ninguno. **Migraciones creadas:** ninguna. **Permisos tocados:** ninguno.
**Método:** lectura de migraciones SQL, edge functions, `src/`, y consultas de solo lectura a producción (`SELECT` únicamente).

---

## 1. Resumen ejecutivo

Stafly **ya envía muchas notificaciones; no envía comunicación**. La evidencia de producción es concluyente:

| Métrica (producción, hoy) | Valor |
|---|---|
| Notificaciones totales en `notifications` | **17.216** |
| No leídas | **16.142 (93.8%)** |
| Notificaciones entregadas dentro de una ráfaga (≥2 al mismo destinatario en el mismo minuto) | **11.359 (66%)** |
| Peor ráfaga individual | **78 notificaciones a una sola persona en un minuto** (todas `shift_location_changed`) |
| Tipos de notificación distintos en uso | **32** |
| Mensajes de chat operativo (`chat_messages`) | **12** |
| Mensajes de canal (`channel_messages`) | **0** |
| Filas en `notification_preferences` | **0** |
| Filas en `notification_templates` | **0** |
| Filas en `read_receipts` | **0** |

Lectura: el 94% de lo que el sistema dice no se lee, dos tercios llega en avalancha, y las tres tablas diseñadas para hacerlo inteligente (preferencias, plantillas, acuses de lectura) están **vacías, es decir, funcionalmente muertas**. Mientras tanto la comunicación humana real (chat de turno, canales) es prácticamente inexistente: la gente no está conversando en Stafly, está siendo notificada por Stafly.

Los tres problemas estructurales:

1. **No existe una capa de decisión.** Cada trigger de base de datos inserta directamente en `notifications`. No hay un punto único que decida *quién necesita saber, qué, cuándo, por qué canal y si debe agruparse*. Por eso un cambio de ubicación produjo 78 avisos.
2. **No existe comunicación contextual.** Hay **siete sistemas de mensajería paralelos** con modelos de datos incompatibles; solo uno (`shift_chat_messages`) está atado a un `shift_id`, y su política de lectura es de compañía completa, no del equipo del turno.
3. **La UI oculta, no se adapta.** Solo existen dos cubetas de rol en el frontend (`ADMIN_LEVEL_ROLES` vs `GATED_ADMIN_ROLES`). Capitán, dispatcher, payroll y recruiter **no existen como roles**: comparten el mismo dashboard y la misma barra lateral de ~35 enlaces.

---

## 2. Estado actual

### 2.1 Canal único real: in-app
- **In-app / DB**: tabla `notifications` → `src/hooks/useNotifications.tsx` → `src/components/NotificationBell.tsx`. Único canal implementado de punta a punta.
- **Email**: pipeline separado y bien construido (`pgmq` → `supabase/functions/process-email-queue/index.ts` → Resend), con reintentos (`MAX_RETRIES=5`), DLQ, cooldown por 429 y un índice único anti-doble-envío (`email_infra.sql:72-73`). **No se usa para eventos de turno**, solo auth/payroll/invitaciones.
- **Push nativo**: **no existe**. La app está empaquetada con Capacitor (`capacitor.config.ts`) pero `@capacitor/push-notifications` no está en `package.json` y no hay uso de `PushNotifications` en `src/`. Lo que en móvil parece push es en realidad la Notification API del navegador en primer plano (`useNotifications.tsx:100-118`).
- **SMS / WhatsApp**: **no existe integración**. Los hits de grep (`src/lib/contact.ts`, `src/lib/phone.ts`) son enlaces `tel:` / `sms:` / `wa.me` para que un humano los toque, no canales de backend.

### 2.2 Canal declarado pero muerto
`notification_preferences.channel` acepta `'in_app' | 'push' | 'email'` (`20260301030253:3-12`), pero **ningún trigger, RPC ni edge function lee esa tabla antes de insertar**. La tabla tiene 0 filas. Consecuencia: **darse de baja de un tipo de notificación no tiene ningún efecto**.

`notification_templates` (0 filas) tiene UI de administración (`src/pages/admin/NotificationTemplates.tsx`) pero ningún trigger la consume: los textos están hardcodeados en SQL.

---

## 3. Mapa técnico — Smart Notifications

### 3.1 Escritores hacia `notifications`

| # | Función / escritor | Disparo | Destinatarios | Dedupe |
|---|---|---|---|---|
| 1 | `notify_managers_on_shift_request` | AFTER INSERT `shift_requests` (`20260226081436:51`) | admins/owners + `shifts:edit` | ninguno |
| 2 | `notify_employees_on_shift_change` | AFTER UPDATE `scheduled_shifts` (`20260314001915:69`) | todos los asignados no rechazados | **ninguno** |
| 3 | `notify_review_on_clockout` | AFTER UPDATE `time_entries` (`20260314043107:70`) | managers con `shifts:can_view` | ✅ verifica `shift_reviews` |
| 4 | `notify_admins_new_application` | AFTER INSERT `job_applications` (`20260404151642:38`) | admin/owner/company_owner | ninguno |
| 5 | `notify_admins_invitation_status` | AFTER UPDATE `employee_invitations` | mismos admins | solo `OLD.status <> NEW.status` |
| 6 | `notify_employee_on_shift_assignment` | AFTER INSERT `shift_assignments` (`20260404171136:43`) | el empleado asignado | ninguno |
| 7 | `handle_material_shift_change` | **BEFORE** UPDATE `scheduled_shifts` (`20260410040154:12-20`) | empleados con `response_status='accepted'` | ninguno |
| 8 | `create_shift_worker_notification` | llamada desde `assign_worker_to_shift`, `set_shift_assignment_state`, `resolve_shift_request` (`20260510010208:18-79`) | un empleado | ninguno (traga excepciones, `:72-75`) |
| 9 | `broadcastOpportunity` (cliente) | `src/lib/dispatch-writers.ts:113-135` | hasta 50 empleados por compañía | ninguno |
| 10 | `assignWorker` (cliente) | `src/lib/dispatch-writers.ts:102-108` | vía trigger #6 | ninguno |
| 11 | `SendNotificationDialog` | manual admin (`:84,242-258`) | selección manual, `company_id` correcto | n/a |
| 12 | `shift-reminders` (edge fn) | cron 24h/1h/confirmación | asignados | ✅ **único** que consulta `notifications` antes de insertar (`index.ts:88-95,108-115`) |

**De 12 escritores, solo 2 hacen dedupe.**

### 3.2 Inventario real de tipos en producción (top)

| Tipo | Total | No leídas |
|---|---|---|
| `shift_claimable` | 5.678 | 4.799 |
| `invitation_reminder` | 2.313 | 2.302 |
| `shift_location_changed` | 2.105 | 2.097 |
| `invitation_expired` | 935 | 932 |
| `no_clockin_alert` | 857 | 848 |
| `shift_reminder_1h` | 824 | 811 |
| `shift_assigned` | 756 | 697 |
| `no_show_alert` | 710 | 701 |
| `shift_reminder_24h` | 684 | 677 |
| `shift_published` | 647 | 632 |
| `workforce_reactivation` | 512 | 504 |

**Taxonomía duplicada detectada en datos reales:** `shift_assigned` (756) vs `shift_assignment` (18); `shift_published` (647) vs `shift_notification` (131); `shift_reminder` (2) vs `shift_reminder_1h`/`_24h`; `shift_change` (169) vs `shift_updated_reaccept` (14) vs `shift_time_changed` (12) vs `shift_date_changed` (8). Cuatro nombres para el mismo hecho operativo.

---

## 4. Mapa técnico — Operational Communication

Siete sistemas paralelos, modelos incompatibles:

| Sistema | Tablas | ¿shift_id? | Lectura (RLS) | ¿Acuse? | Uso real |
|---|---|---|---|---|---|
| Chat IA personal | `chat_messages` | ❌ | `auth.uid()=user_id` | ❌ | 12 filas |
| DM interno | `conversations`, `internal_messages`, `conversation_members`, `read_receipts` | ❌ | membresía | ✅ (`read_receipts`) | 8 msgs, **0 receipts** |
| Chat de turno | `shift_chat_messages`, `shift_chat_config` | ✅ | **compañía completa** (`20260301075743:40-41`) | ❌ | bajo |
| Canales comunidad (Parceros) | `community_channels`, `channel_members`, `channel_messages` | ❌ | membresía | `last_read_at` nunca escrito | **0 mensajes** |
| Hilos de cliente | `client_conversation_threads`, `client_messages` | ❌ (`service_request_id`) | compañía; solo admins escriben | `read_at` agregado | 0 |
| Anuncios | `announcements`, `announcement_reactions` | ❌ | empleados si `published_at` | ❌ solo reacciones | 9 |
| Tickets | `employee_tickets`, `ticket_notes` | ❌ (polimórfico) | propios / admins | ❌ | — |
| Log de turno | `shift_notes`, `shift_timeline`, `shift_audit_log` | ✅ | **solo admins** | n/a | — |

**Tipado de mensaje (mensaje / instrucción / alerta / incidencia):** no existe de forma forzada en ninguna parte. `channel_messages.message_type` existe pero el frontend siempre envía `"text"` (`ChannelView.tsx:136`). `shift_notes.note_type` documenta `incident` en un comentario pero es TEXT libre sin CHECK, y es admin-only.

**Exclusión de workers removidos:** existe **solo en el INSERT** de `shift_chat_messages` (`20260301075743:49-59`, `status NOT IN ('rejected','removed')`). La política de SELECT no tiene esa condición → **un worker removido o reemplazado sigue leyendo el chat del turno del que fue sacado**.

---

## 5. Mapa técnico — Experiencia adaptativa

### 5.1 Modelo de rol
- `app_role`: `admin, employee, developer, owner, manager, supervisor, founder`.
- `company_users.role` es **TEXT libre, sin enum ni FK** (`20260225015055:21-28`). Valores reales en producción: `employee` (61), `company_owner` (10), `admin` (10), `supervisor` (2), `owner` (1), `manager` (1).
- **No existe `captain`, `dispatcher`, `payroll` ni `recruiter`** — ni en el enum, ni en los datos, ni en el código de navegación.
- `role_templates` (4 bundles: Supervisor de Turnos, Supervisor de Reloj, Gestor de Nómina, Administrador de Empresa) son **paquetes de permisos aplicables a un `manager`**, no roles con UI propia.
- ⚠️ `has_action_permission` (`20260226034405:37-58`): owners/admins → `true`; `manager` → consulta `action_permissions`; **cualquier otro rol, incluido `supervisor`, → `false` hardcodeado**. Es decir: los dos supervisores reales en producción no pueden obtener permisos finos, pese a que los templates se llaman "Supervisor de…".

### 5.2 Frontend
- `src/lib/roles.ts:18-44`: toda la taxonomía UI es binaria — `ADMIN_LEVEL_ROLES` (ve todo) vs `GATED_ADMIN_ROLES` (`manager`, `supervisor`; ve lo mismo menos módulos apagados).
- `AdminSidebar.tsx:101-172`: un único array `COMPANY_LINKS` con ~35 enlaces para todos. `isLinkVisible` (`:234-246`) solo oculta. **Nada se reordena, renombra ni prioriza por rol.**
- `AdminLayout.tsx:247-259`: la nav móvil replica la misma lógica binaria.
- Portal: `PortalBottomNav.tsx:19-24` fija `Home / Shifts / Clock / More` para **todo** empleado; `employee_portal_modules` solo apaga entradas del sheet "More" (7 destinos escondidos tras un tap).
- "Capitán" no es rol: es una tarjeta condicional (`PortalCaptainEntryCard`) + `ShiftCaptainRoom.tsx:277`, decidido por `assignment_role` del turno.

---

## 6. Flujos actuales por usuario

| Usuario | Landing | Nav | Qué le sobra | Qué le falta |
|---|---|---|---|---|
| **Worker** | `/portal` → `EmployeeDashboard` | 3 tabs + More | avisos `shift_claimable` masivos (5.678 filas, 85% sin leer) | contexto del turno unificado: meeting point, supervisor, uniforme, cómo llegar |
| **Capitán** | `/portal` (idéntico al worker) | idéntica | — | rol inexistente; entra por una tarjeta; sin canal de equipo propio |
| **Supervisor** | `/app` → `AdminDashboard` | ~35 enlaces | casi todo (payroll, facturación, imports) | `has_action_permission` le devuelve `false` siempre |
| **Dispatcher** | no existe | — | — | rol inexistente; usa el shell admin completo |
| **Payroll** | `/app` → `AdminDashboard` | ~35 enlaces | operaciones, reclutamiento, dispatch | dashboard propio "qué falta para cerrar" |
| **Recruiter** | no existe | — | — | rol inexistente |
| **Admin / Owner** | `/app` → `AdminDashboard` | todo | — | ninguna vista de riesgo consolidada |

---

## 7. Duplicaciones confirmadas

### D1 — Cambio de turno dispara dos triggers (P0)
Un mismo `UPDATE scheduled_shifts` ejecuta:
- `notify_employees_on_shift_change` (AFTER UPDATE, `20260314001915:17-22`) → `shift_time_changed` / `shift_date_changed` / `shift_location_changed`
- `handle_material_shift_change` (BEFORE UPDATE, `20260410040154:12-20`) → `shift_updated_reaccept`

El trabajador con turno aceptado recibe **dos notificaciones contradictorias** ("Cambio de horario" + "Acepta nuevamente"), cada una con su toast, sonido y notificación de sistema (`useNotifications.tsx:161-199`).

### D2 — Asignar worker dispara dos notificaciones (P0)
`assign_worker_to_shift` (`20260731234336:77-93`) inserta en `shift_assignments` → dispara `trg_notify_on_shift_assignment` ("📋 Nuevo turno asignado") y **luego** llama explícitamente a `create_shift_worker_notification(...,'shift_assignment',...)`. Confirmado en datos: `shift_assigned` (756) y `shift_assignment` (18) coexisten.

### D3 — Ráfagas por edición masiva (P0)
2.634 eventos de ráfaga, 11.359 notificaciones dentro de ráfagas, máximo **78 al mismo destinatario en un minuto**, todas `shift_location_changed`. Origen: `notify_employees_on_shift_change` corre por fila y sin agrupación, así que una edición de ubicación aplicada a N turnos de la misma persona genera N avisos idénticos.

### D4 — Taxonomía duplicada
4 nombres para "cambio de turno", 2 para "asignación", 3 para "recordatorio", 2 para "publicado". Impide agrupar, filtrar y medir.

### D5 — Siete sistemas de mensajería
Ver §4. Ninguna capa común de identidad de conversación, tipado ni acuse.

---

## 8. Riesgos

| ID | Riesgo | Evidencia | Sev |
|---|---|---|---|
| R1 | **Mezcla de tenants en la campana** | `useNotifications.tsx:51-56` consulta `recipient_id=user.id` **sin `company_id`**. La rama de empleado (`:76-83`) tampoco filtra. **10 usuarios reales pertenecen a ≥2 compañías** (uno a 6). Ven notificaciones de la compañía B mientras operan la A. | **P0** |
| R2 | **Worker removido lee el chat del turno** | SELECT de `shift_chat_messages` (`20260301075743:40-41`) filtra por compañía, no por asignación activa | **P0** |
| R3 | **Chat de turno visible a toda la compañía** | misma política; cualquier empleado lee cualquier turno | **P0** |
| R4 | **Cambio crítico se pierde en el ruido** | 93.8% sin leer; una alerta real (`no_show_alert`, 710) queda enterrada entre 5.678 `shift_claimable` | **P0** |
| R5 | **Notificaciones contradictorias** | D1 | **P0** |
| R6 | **Opt-out sin efecto** | `notification_preferences` con 0 filas y sin lector | P1 |
| R7 | **Sin push real en móvil** | no hay `@capacitor/push-notifications` | P1 |
| R8 | **Supervisores sin permisos finos** | `has_action_permission` retorna `false` para `supervisor` | P1 |
| R9 | **Sin trazabilidad de lectura operativa** | `read_receipts` = 0 filas; anuncios sin acuse | P1 |
| R10 | **Sin notificación de cambio de supervisor** | ningún trigger cubre ese campo | P1 |
| R11 | **`company_users.role` sin enum** | TEXT libre; un typo crea un rol fantasma sin permisos | P2 |

---

## 9. Problemas de UX móvil

| Hallazgo | Evidencia | Prioridad |
|---|---|---|
| Switcher de compañía ~40px de área táctil (bajo el mínimo 44px iOS), dentro de un header de 48px, pegado a la campana | `CompanySwitcher.tsx:185-188` (`p-1.5`) + `company-logo.tsx:21` (`h-7 w-7`) + `AdminLayout.tsx:285-292` | P1 |
| Tablas de escritorio en móvil: columnas se ocultan (`hidden md:table-cell`) en vez de reestructurarse a tarjetas | `TimesheetView.tsx:692,730,877` | P1 |
| 20+ destinos escondidos tras "More" en admin y 7 en portal | `AdminBottomNav.tsx:44-63`, `PortalBottomNav.tsx:27-33` | P1 |
| Sidebar colapsado depende de tooltips para todas las etiquetas | `AdminSidebar.tsx:356-370` | P2 |
| Cada notificación en ráfaga dispara toast + sonido + notificación de SO | `useNotifications.tsx:161-199` | P0 (con D3) |

---

## 10. Propuesta de arquitectura futura

**Principio rector:** un solo punto de decisión, cero silos nuevos, reutilizar tablas existentes.

### 10.1 Notification Decision Layer (una función, no una tabla nueva)

Todos los escritores dejan de insertar en `notifications` y pasan por un único `SECURITY DEFINER`:

```
notify_operational_event(
  company_id, shift_id, event_type, actor_id, changed_fields jsonb
)
```
Responsabilidades, en orden:
1. **Audiencia** — deriva destinatarios del contexto (asignaciones activas del turno, no la compañía entera).
2. **Relevancia** — descarta si el receptor no puede actuar.
3. **Coalescencia** — clave de deduplicación `(recipient_id, shift_id, event_family)` con ventana de 60–120 s: los 78 avisos de ubicación se convierten en **uno** ("3 de tus turnos cambiaron de punto de encuentro").
4. **Prioridad** → `silent | informative | actionable | urgent | critical`.
5. **Canal** — lee `notification_preferences` (hoy ignorada). `critical` ignora el opt-out.
6. **Confirmación** — solo `actionable`/`critical` piden acuse.

Cambios de esquema mínimos y justificados: en `notifications` agregar `priority`, `dedupe_key` (único parcial por ventana), `group_id`, `requires_ack`, `acked_at`. **No se requieren tablas nuevas.**

### 10.2 Clasificación objetivo de los tipos actuales

| Clase | Tipos actuales | Comportamiento |
|---|---|---|
| **Crítica** | `no_show_alert`, `no_clockin_alert`, `shift_cancelled` | push + in-app, ignora opt-out, pide acuse |
| **Accionable** | `shift_assigned`, `shift_updated_reaccept`, `shift_request_new` | in-app + push, con acuse |
| **Informativa** | `shift_confirmed`, `shift_published`, `invitation_accepted` | in-app, sin sonido |
| **Agrupable** | `shift_location_changed`, `shift_time_changed`, `shift_date_changed`, `shift_change` → **un solo `shift_updated`** | digest por turno |
| **Silenciosa** | `employee_profile_updated`, `workforce_reactivation` | solo log/feed |
| **Prescindible** | `shift_notification` (duplica `shift_published`), `shift_assignment` (duplica `shift_assigned`), `shift_reminder` (duplica `_1h`) | eliminar |
| **Digest diario** | `invitation_reminder`, `invitation_expired` (3.248 filas, 99% sin leer) | un resumen diario al admin |

### 10.3 Operational Communication — hilo de turno como espina dorsal

Consolidar sobre lo que ya existe (`shift_chat_messages` + `shift_notes`), sin tablas nuevas:
- **Alcance = equipo del turno.** Corregir la política SELECT a "asignación activa OR puede administrar el turno".
- **Tipado de mensaje**: `message | instruction | alert | incident`, con CHECK real (hoy `note_type` es TEXT libre).
- **Los cambios operativos publican en el hilo**, no solo notifican: "Punto de encuentro cambiado por María, 14:02" queda en el mismo lugar donde el equipo conversa.
- **Acuse**: reutilizar `read_receipts` (ya tiene RLS correcta y 0 uso) en vez de crear otra tabla.
- Retirar `community_channels` (0 mensajes) y `chat_messages` del discurso de "comunicación operativa": el primero es marketplace, el segundo es historial de IA.

### 10.4 Adaptive Experience — una app, encuadres distintos

No apps por rol. Introducir un **encuadre operativo (operational stance)** derivado de permisos ya existentes:

| Encuadre | Derivado de | Landing | Pregunta que responde |
|---|---|---|---|
| Worker | sin acceso admin | turno de hoy | ¿dónde, cuándo, con quién? |
| Captain | `assignment_role='captain'` (ya existe) | Captain Room de su turno | ¿quién llegó, quién falta? |
| Dispatch | template "Supervisor de Turnos" | turnos incompletos | ¿qué posición cubro ahora? |
| Payroll | template "Gestor de Nómina" | cola de validación | ¿qué falta para cerrar? |
| Admin/Owner | `ADMIN_LEVEL_ROLES` | vista de riesgo | ¿dónde está el problema? |

El encuadre define **landing + 3 acciones principales + orden de la nav**, no un conjunto distinto de rutas. Todo el resto sigue accesible.

---

## 11. Quick wins (bajo riesgo, alto impacto)

1. **Filtrar `company_id` en `useNotifications.tsx:51-56` y `:76-83`.** Una línea; elimina R1 (mezcla de tenants) para 10 usuarios reales.
2. **Desactivar uno de los dos triggers de cambio de turno** (D1). Elimina las notificaciones contradictorias.
3. **Quitar la llamada redundante a `create_shift_worker_notification` en `assign_worker_to_shift`** (D2). El trigger ya cubre el caso.
4. **Coalescer toast + sonido en el cliente**: si llegan ≥3 notificaciones en 10 s, un solo toast agrupado. Mitiga la ráfaga de 78 sin tocar backend.
5. **Añadir la condición de asignación activa al SELECT de `shift_chat_messages`.** Cierra R2 y R3.

---

## 12. Priorización

### P0 — Corrección (llega a quien no debe / no llega lo crítico)
- P0.1 Fuga entre tenants en la campana (`useNotifications.tsx:51-56`) — R1
- P0.2 Chat de turno legible por toda la compañía y por removidos — R2, R3
- P0.3 Doble notificación contradictoria en cambio de turno — D1
- P0.4 Doble notificación en asignación — D2
- P0.5 Coalescencia de ráfagas (78→1) — D3

### P1 — Fatiga, contexto y acceso
- P1.1 Unificar taxonomía de tipos (32 → ~12) — D4
- P1.2 Hacer que `notification_preferences` se lea de verdad — R6
- P1.3 Prioridad + acuse en `notifications` — R9
- P1.4 Digest diario para invitaciones (3.248 filas) —
- P1.5 `has_action_permission` para `supervisor` — R8
- P1.6 Switcher de compañía a 44px + posición móvil — UX
- P1.7 Tablas de timesheet → tarjetas en móvil — UX
- P1.8 Notificación de cambio de supervisor — R10

### P2 — Pulido
- P2.1 Push nativo Capacitor — R7
- P2.2 Encuadres operativos (landing + 3 acciones por stance)
- P2.3 Tono humano en los textos (hoy hardcodeados en SQL; usar `notification_templates`, ya existente y vacía)
- P2.4 Enum real para `company_users.role` — R11
- P2.5 Retirar `community_channels` / `chat_messages` del modelo operativo

---

## 13. Qué NO debe tocarse

Confirmado como fuera de alcance de cualquier fase: `auth`, RLS existente salvo las dos políticas de `shift_chat_messages` explícitamente listadas en P0.2, payroll y sus cálculos, `time_entries`, `shift_assignments`, `scheduled_shifts`, la política de compliance de asignación, `get_employee_assignment_status`, documentos, pagos, bookings, tenants, lógica de partners, edge functions de email en producción, campañas activas y datos reales. Ninguna tabla nueva se propone: toda la arquitectura de §10 se apoya en columnas añadidas a `notifications` y en tablas ya existentes pero sin uso (`notification_preferences`, `notification_templates`, `read_receipts`).

---

## 14. Plan de implementación por fases

| Fase | Contenido | Riesgo | Verificación |
|---|---|---|---|
| **F0** — Contención (1 sprint) | Quick wins 1–5. Solo frontend + desactivar un trigger + 1 política SELECT | Bajo | La ráfaga de 78 no se reproduce; usuario multi-compañía ve solo su tenant |
| **F1** — Capa de decisión | `notify_operational_event` + `dedupe_key`/`group_id`/`priority` en `notifications`. Los escritores migran uno a uno, en modo sombra primero | Medio | Volumen diario baja; 0 duplicados por evento |
| **F2** — Taxonomía y preferencias | 32 tipos → ~12 familias; `notification_preferences` se lee; digest de invitaciones | Medio | % no leídas baja de 93.8% |
| **F3** — Hilo de turno | Tipado `message/instruction/alert/incident`; los cambios operativos publican en el hilo; acuses en `read_receipts` | Medio | El equipo del turno ve un solo lugar; removidos excluidos |
| **F4** — Encuadres operativos | Landing + 3 acciones + orden de nav por stance; UX móvil (44px, tarjetas) | Medio | Capitán y payroll llegan a su tarea en ≤1 tap |
| **F5** — Push nativo | Capacitor push solo para clase `critical` | Alto (store) | Alertas críticas llegan con app cerrada |
