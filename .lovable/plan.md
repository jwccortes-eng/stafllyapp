# Plan: Clients OS Premium + Stafly Platform Hub Lite

> Auditoría + plan faseado. **No se implementa código todavía**, esperar aprobación.

---

## 1. Auditoría

### 1.1 Módulo actual `/app/clients`

- **Página**: `src/pages/admin/Clients.tsx` (~680 LOC, monolítica).
- **Tabla**: `public.clients` (operativos del tenant). También usa `public.client_locations` para sub-locaciones.
- **Hooks**: `useAuth` (rol/permisos), `useCompany` (tenant scoping). Sin hook propio — todas las queries son inline (`supabase.from("clients")...`).
- **Routing**: NO hay ruta de detalle. Todo vive en el listado; "editar" abre un `Dialog` modal sobre la misma página. **No existe `/app/clients/:clientId`**.
- **Multi-tenant**: ✅ filtra por `company_id = selectedCompanyId` en todos los queries (`select`, `insert`, `update`, soft-delete). Gating por `<ModuleGate moduleKey="clients">` en `App.tsx:252`. Permisos por `hasModuleAccess("clients", "edit"|"delete")`.
- **UI actual**: header + búsqueda + toggle grid/list + dialog crear/editar + soft-delete (`deleted_at`). Sin KPIs, sin filtros avanzados, sin tabs por cliente.

### 1.2 Módulo `/app/client-experience` (Fase 1 ya entregada)

- **Página**: `src/pages/admin/ClientExperience.tsx` con 3 tabs: Inbox / Requests / Contacts.
- **Componentes**: `src/components/client-experience/{Inbox,Requests,Contacts}.tsx`.
- **Hook**: `src/hooks/useClientExperience.tsx` (CRUD scoped por `selectedCompanyId`).
- **Tablas**: `client_contacts`, `client_conversation_threads`, `client_messages`, y extensión de `service_requests` (con `requested_by_contact_id`, `title`, `priority`, etc.).
- **Trigger**: `sync_thread_on_message` mantiene `last_message_at` y unread counters.
- **Reutilización en Clients OS**: el detalle de cliente puede embeber estos componentes filtrados por `clientId` (Contacts, Requests, Conversations tabs) sin duplicar lógica ni tablas.

### 1.3 Vistas globales / developer

- **`/app/companies`** (`Companies.tsx`, ~727 LOC): admin de tenants — crear, editar, sandbox sync, usuarios, módulos. Pesada.
- **`/app/global`** → `OwnerDashboard.tsx` (~675 LOC): KPIs globales cross-tenant (employees, periods, imports, movements, top earners). Más analítica que operativa.
- **Selector de company**: `useCompany` (`src/hooks/useCompany.tsx`).
  - `selectedCompanyId` persiste en `localStorage` (regla en memoria: nunca clobber en re-render).
  - `isGlobalMode = selectedCompanyId === null` y solo aplica a roles `developer | owner` (`GLOBAL_MODE_ROLES`).
  - Owners/devs aterrizan en Global Mode por defecto.
- **Roles disponibles**: `developer`, `owner`, `admin`, `manager`, `worker` (entre otros). Solo `developer | owner` califican para vistas tipo Platform.
- **Gap**: no existe una vista *operativa ligera* tipo "mis tenants Stafly activos" — `Companies` y `OwnerDashboard` son demasiado pesadas y mezclan administración con métricas.

---

## 2. Plan faseado

### FASE A — Clients OS Premium (`/app/clients`)

Objetivo: convertir el listado plano en un centro premium operativo del tenant, con perfil por cliente.

**A.1 — Listado premium** (refactor `Clients.tsx`)
- Header ejecutivo con nombre del tenant, contador total y CTA "New client".
- KPIs (`KpiCard` ya existe): Active clients, With open requests, Unread conversations, New this month.
- Búsqueda + filtros (status, has open requests, sort A-Z / recent / activity).
- Toggle Cards / Table (ya existe — pulir).
- Quick actions por card: Open profile, Call, Email, WhatsApp, New request.
- Click en card → navega a `/app/clients/:clientId`.

**A.2 — Perfil de cliente** (nuevo `src/pages/admin/ClientProfile.tsx` + ruta `clients/:clientId`)
Tabs:
1. **Overview** — KPIs por cliente, contactos primarios, último contacto, próximos shifts.
2. **Contacts** — embebe `ClientExperienceContacts` filtrado por `clientId`.
3. **Requests** — embebe `ClientExperienceRequests` filtrado por `clientId`.
4. **Conversations** — embebe `ClientExperienceInbox` filtrado por `clientId`.
5. **Locations** — gestión de `client_locations`.
6. **Services** — placeholder Fase A.2 (lectura de `service_categories` asignados, sin escritura compleja).
7. **Billing** — link de solo lectura a `billing_clients` / invoices del cliente (sin tocar lógica).
8. **Notes** — campo `clients.notes` editable.
9. **Activity** — feed de eventos recientes (requests creados, mensajes, locations agregadas).

**A.3 — Refactor a hook**
- Extraer queries inline a `src/hooks/useClients.tsx` (lista + detalle), siempre scoped por `selectedCompanyId`.
- Mantener tipos `Client`, `ClientLocation` exportados.

**Sin cambios de schema en Fase A.** Todo se construye sobre `clients`, `client_locations`, `client_contacts`, `client_conversation_threads`, `client_messages`, `service_requests` ya existentes.

### FASE B — Stafly Platform Hub Lite (`/app/platform`)

Objetivo: vista global ligera **solo para developer/owner** con los tenants activos de Stafly.

- Nueva ruta `/app/platform` → nueva página `src/pages/admin/PlatformHub.tsx`.
- **Gating duro**: si `role !== "developer" && role !== "owner"` → `<Navigate to="/app" replace />`.
- Por ahora muestra solo **Quality Staff by Keury** y **JKitchen Staff** (filtrado por nombre/slug en query a `companies`, no hardcoded — usar lista configurable en constante `STAFLY_ACTIVE_TENANTS`).
- Cards premium por tenant con métricas básicas (queries paralelas por tenant):
  - Workers activos (`employees` count).
  - Pending activations (`employee_invitations` status `pending|opened`).
  - Applications pending (`applications` status `new|reviewing`).
  - Clients (`clients` count).
  - Open requests (`service_requests` status abierta).
  - Upcoming shifts (próximos 7 días).
- Quick actions por tenant:
  - **Open tenant** → `setSelectedCompanyId(tenant.id)` + navega a `/app`.
  - Workers → `/app/employees`, Applications → `/app/applications`, Clients OS → `/app/clients`, Client Experience → `/app/client-experience`, Shifts → `/app/shifts`.
  - (Cada quick action setea `selectedCompanyId` antes de navegar.)
- Entrada en sidebar **solo visible** para `developer | owner` (sección nueva "Stafly Platform").

**Sin tocar `/app/companies` ni `/app/global`** — Platform Hub Lite es un complemento operativo, no un reemplazo.

---

## 3. Archivos a tocar

### Fase A
- ✏️ `src/pages/admin/Clients.tsx` — refactor a listado premium + KPIs + filtros + navegación a perfil.
- 🆕 `src/pages/admin/ClientProfile.tsx` — perfil tabs.
- 🆕 `src/hooks/useClients.tsx` — queries scoped multi-tenant.
- 🆕 `src/components/clients/ClientKpis.tsx`, `ClientFiltersBar.tsx`, `ClientCard.tsx` (extraer del monolito).
- ✏️ `src/components/client-experience/ClientExperienceContacts.tsx` — aceptar prop opcional `clientId` para filtrar.
- ✏️ `src/components/client-experience/ClientExperienceRequests.tsx` — idem.
- ✏️ `src/components/client-experience/ClientExperienceInbox.tsx` — idem.
- ✏️ `src/App.tsx` — agregar ruta `clients/:clientId`.

### Fase B
- 🆕 `src/pages/admin/PlatformHub.tsx`.
- 🆕 `src/hooks/usePlatformTenants.tsx` — métricas por tenant (developer/owner only).
- ✏️ `src/App.tsx` — registrar ruta `/app/platform` con guard de rol.
- ✏️ `src/components/AdminSidebar.tsx` y `src/components/navigation/nav-items.ts` — entry "Platform" visible solo para `developer | owner`.

**No se tocan:** payroll, attendance, clock-in/out, shifts core, billing/invoices core, RLS, portal cliente público, login cliente.

---

## 4. Riesgos detectados

1. **Reutilización de componentes Client Experience**: hoy esperan filtrar por `selectedCompanyId` global. Hay que hacerlos polimórficos (`clientId` opcional) sin romper la página `/app/client-experience` actual. **Mitigación**: prop opcional con default a comportamiento actual.
2. **Métricas en Platform Hub**: ejecutar 6 queries × N tenants puede pesar. **Mitigación**: una sola RPC `platform_tenant_stats` o queries en paralelo con `Promise.all` cacheadas con React Query (staleTime 60s). Empezar con queries directas, migrar a RPC si hace falta.
3. **Switch de tenant desde Platform Hub**: setear `selectedCompanyId` y navegar puede chocar con la regla "trust localStorage" en `useCompany`. **Mitigación**: usar `setSelectedCompanyId(id)` (que ya persiste en localStorage) antes de `navigate()`, y NO durante render.
4. **Gating de rol Platform**: si un admin entra por URL directa, debe redirigir. **Mitigación**: guard en el componente (no solo en sidebar).
5. **Sin ruta de detalle hoy**: cualquier link externo o legacy a `/app/clients/:id` no existe — es feature nueva, no regresión.
6. **TypeScript**: extraer hook `useClients` requiere mover tipos sin romper imports actuales en `Clients.tsx`. **Mitigación**: re-exportar tipos desde el hook.

---

## 5. Recomendación de orden

**Implementar primero Fase A.1 + A.2 (Clients OS Premium con perfil)**, porque:
- Resuelve la falta crítica de perfil de cliente (hoy todo es modal).
- Cierra el ciclo con Client Experience (Fase 1 ya entregada) sin duplicar tablas.
- Es 100% dentro del tenant actual → cero riesgo cross-tenant.
- Platform Hub Lite (Fase B) se puede entregar en un segundo PR pequeño porque su superficie es menor y solo para 2 roles.

**Sub-orden sugerido dentro de Fase A:**
1. Hook `useClients` + tipos.
2. Hacer polimórficos los 3 componentes de Client Experience (prop `clientId?`).
3. Página `ClientProfile` con tabs Overview / Contacts / Requests / Conversations / Locations / Notes (las "ligeras" primero).
4. Ruta `/app/clients/:clientId` + navegación desde el listado.
5. Refactor del listado: KPIs, filtros, quick actions, sort.
6. Tabs Services / Billing / Activity (solo lectura, livianos).

Después: **Fase B** en una segunda iteración.

---

## 6. Pendiente de aprobación

- ¿Aprobar este plan tal cual?
- ¿Empezar por A.1 + A.2 como se recomienda, o prefieres que arranque por Platform Hub Lite (B) primero?
- ¿Qué métrica falta o sobra en las cards de tenant del Platform Hub?
