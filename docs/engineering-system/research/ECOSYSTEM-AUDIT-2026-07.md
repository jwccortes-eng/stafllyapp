# Ecosystem Audit — Stafly (2026-07-28)

> Auditoría **read-only**. No se modificó código, migraciones, RLS, providers ni datos.
> Toda afirmación se marca como **Hecho** (evidencia en archivo:línea), **Inferencia** (derivada de código) o **Hipótesis** (probable, requiere reproducción).

---

## 1. Veredicto ejecutivo

**Estado general: 🟡 Inestable en la capa de contexto de sesión / tenant. Módulos verticales aparentan estabilidad funcional, pero la fundación (Auth × Company Context × Providers) tiene condiciones de carrera reproducibles que amenazan multi-tenant y la fecha objetivo de octubre.**

- **Nivel de confianza en la fundación**: bajo-medio. Existen múltiples caminos de re-hidratación (`onAuthStateChange` + `getSession` + `fetchCompanies` con deps sobre `role` y `manuallySelected`) que se disparan al volver de otra pestaña. El bug reportado durante la comparativa Connecteam es **consistente con la lógica actual** (ver §6).
- **Nivel de confianza en verticales** (Shifts, Time Clock, PRQ, Payroll cálculo, Passport): medio-alto en código; **⚪ no validado end-to-end** por ausencia de una matriz de QA firmada y evidencia de tests de regresión multi-tenant recientes.
- **Fortalezas**: RLS presente en todas las tablas listadas, `time_entries` como fuente canónica de payroll, aislamiento por `company_id` reforzado en hooks (`useClients`, `useCompensation`, etc.), shift visibility centralizado (`src/lib/shifts/visibility.ts`).
- **Fragilidades**: `selectedCompanyId` **persistido en localStorage sin validación de membresía contra backend en cada rehidratación** (`useCompany.tsx:156-204`), `fetchCompanies` con dep en `role` que **puede reejecutarse con `role` transitoriamente nulo** durante `SIGNED_IN`/re-hidratación, ausencia de canal cross-tab para invalidar contexto tras cambio de empresa, `queryClient` global **sin `refetchOnWindowFocus` explícito** (default `true` en TanStack Query v5 salvo override — no encontrado).
- **Bloqueadores para octubre**:
  1. Regresión de Company Context al cambiar de pestaña (§6).
  2. Ausencia de matriz de QA multi-tenant automatizada.
  3. Deuda de observabilidad: no hay un dashboard de errores por tenant.
- **Áreas no verificadas** (⚪): Edge Functions (no ejecutadas), Billing/Payments end-to-end, Notifications native, Bookings, Chat, Mobile background/foreground real.
- **Recomendación general**: **congelar features nuevas** en la capa fundación hasta cerrar §6 y §9-prioridad-1. Continuar iteración en verticales en paralelo, pero **prohibir merges** que toquen `useAuth`, `useCompany`, `App.tsx` providers, sin QA de regresión firmado.

---

## 2. Estado general

| Capa | Semáforo | Racional |
|---|---|---|
| Fundación (Auth/Session/Context) | 🔴 | Regresión Company Context reproducible por lógica; ver §6 |
| Aislamiento multi-tenant (RLS + hooks) | 🟡 | RLS presente; hooks disciplinados; sin test cross-tenant automatizado reciente |
| Shift Management (admin) | 🟡 | Código maduro, visibility centralizado, ⚪ sin QA reciente firmado |
| Worker Portal / Time Clock | 🟡 | Deep-links Sprint 34-42 validados manualmente; sin regresión suite |
| Payroll (cálculo) | 🟡 | `time_entries` canónica; doble truth set con reconciliación externa (MRI-001) |
| Notifications / Chat / Bookings | ⚪ | No verificados en esta auditoría |
| Billing / Payments | ⚪ | No verificados en esta auditoría |
| Edge Functions | ⚪ | 40+ funciones registradas en `config.toml`, no ejecutadas |
| Mobile (Capacitor) | ⚪ | Capacitor configurado; sin evidencia de QA background/foreground |
| Documents / Compliance | 🟡 | Tablas y RLS presentes; workflow no re-validado |

---

## 3. Semáforo por módulo

| Módulo | Salud | Funciones principales | Estado actual | Bugs conocidos | Posibles regresiones | Riesgos | Últ. validación | Ambiente | Evidencia | Responsable | Acción recomendada | Prioridad |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Authentication | 🟡 | login, session, token refresh | Funciona; múltiples paths hidratación | Ninguno confirmado hoy | Posible: pérdida de estado en `TOKEN_REFRESHED` | Race con providers hijos | ⚪ | Preview | `useAuth.tsx:284-460` | NO VERIFICADO | Consolidar en un sync único | P1 |
| Session Management | 🟡 | persistencia sesión, expiración | `auth-session.ts` maneja expired | — | — | Sin heartbeat backend por membresía | ⚪ | Preview | `src/lib/auth-session.ts` | NO VERIFICADO | Añadir validación membresía on-focus | P1 |
| **Company Context** | 🔴 | selección tenant, persistencia | **Bug reproducible en tab-switch** | STAFLY-CTX-001 | **POSIBLE REGRESIÓN** | Cross-tenant leak si cache mal invalidado | 2026-07 hoy | Preview | `useCompany.tsx:105-208` | NO VERIFICADO | Ver §6 y §9-P1 | P0 |
| Tenant Isolation | 🟡 | scoping queries por company_id | Hooks disciplinados; RLS a nivel DB | — | — | Cache TanStack sin key por tenant en algunos hooks (verificar) | ⚪ | — | grep `selectedCompanyId` masivo OK | NO VERIFICADO | Auditar `queryKey` completo | P1 |
| Permissions / RLS | 🟡 | user_roles, has_role, RLS policies | Presente en 190+ tablas | — | — | GRANTs no auditados exhaustivamente | ⚪ | — | tablas listadas en contexto | NO VERIFICADO | Correr `security--run_security_scan` | P2 |
| Navigation | 🟢 | React Router, guards | SPA fallback OK, `Index.tsx` redirige | — | — | Redirect prematuro en `Index.tsx` durante race auth/company | 2026-04 | Preview | `src/pages/Index.tsx:50-94` | NO VERIFICADO | Añadir guard "esperar contexto" | P2 |
| Shift Management | 🟡 | crear/editar/publicar/soft-delete | Visibility centralizado (Apr-2026 fix) | — | — | Cache invalidation checklist depende de disciplina manual | 2026-04 | Prod | `src/lib/shifts/visibility.ts` | NO VERIFICADO | QA regresión completa | P2 |
| Calendar | ⚪ | vista mensual/semana | — | — | — | — | ⚪ | — | — | NO VERIFICADO | Ejecutar QA smoke | P3 |
| Workers | 🟡 | roster, activación, invitaciones | `employees` con 84 columnas y 9 policies | — | — | Alto acoplamiento, columna sprawl | ⚪ | — | `employees` schema | NO VERIFICADO | QA smoke + refactor futuro | P2 |
| Worker Portal | 🟢 | mis turnos, claim, chat | Sprint DS3.x consolidó UI | — | — | Depende de Company Context correcto | 2026-07 | Preview | `src/components/portal/PortalShiftCard.tsx` | Lovable agent | QA post-fix P1 | P2 |
| Time Clock | 🟡 | fichaje, deep-link focus | Sprint 36 deep-link OK | — | — | Banner "sin fichaje" depende de query correcto | 2026-07 | Preview | `useTimeClockFocus.ts` | Lovable agent | QA E2E | P2 |
| Time Entries | 🟢 | fuente canónica payroll | RLS + append-only | — | — | Doble truth set con reconciliación (MRI-001) | 2026-07 | — | MRI-001 | NO VERIFICADO | Mantener regla "no tocar" | P0 (protección) |
| Shift Assignments | 🟡 | asignación, soft-delete cascade | Trigger `trg_invalidate_assignments_on_shift_soft_delete` activo | — | — | — | 2026-04 | Prod | `visibility.ts:41-48` | NO VERIFICADO | QA regresión soft-delete | P2 |
| Notifications | ⚪ | in-app, native | 2 tablas + templates + preferences | — | — | Multichannel no verificado | ⚪ | — | `docs/MULTICHANNEL_NOTIFICATIONS.md` | NO VERIFICADO | Smoke test end-to-end | P3 |
| Service Requests | 🟡 | demanda → shifts | Modelo maduro, RLS presente | — | — | Solapamiento semántico con Operations Planning Center | ⚪ | — | schema | NO VERIFICADO | Definir contract | P3 |
| Documents / Compliance | ⚪ | onboarding docs, W9, verificación | — | — | — | — | ⚪ | — | schema | NO VERIFICADO | QA workflow | P3 |
| Billing | ⚪ | subscriptions, service blocks | Edge functions `billing-*` presentes | — | — | Webhook idempotencia no verificada | ⚪ | — | `config.toml` | NO VERIFICADO | Correr smoke webhook | P3 |
| Payments | ⚪ | invoice payments | `invoice_payments` tabla | — | — | — | ⚪ | — | schema | NO VERIFICADO | QA smoke | P3 |
| Payroll (cálculo) | 🟡 | consolidación, snapshots | `payroll-consolidate` edge function | — | — | Doble truth set (MRI-001) | 2026-06 | — | MRI-001 | NO VERIFICADO | **No tocar** en este ciclo | P0 (protección) |
| Bookings | ⚪ | — | — | — | — | — | ⚪ | — | — | NO VERIFICADO | Clarificar alcance | P3 |
| Chat | ⚪ | mensajería tenant/portal | `chat_messages`, `channel_messages` | — | — | Realtime subscription no verificado | ⚪ | — | schema | NO VERIFICADO | Smoke test | P3 |
| Mobile UX | ⚪ | Capacitor iOS/Android | — | — | — | Background/foreground no probado | ⚪ | — | `capacitor.config.ts` | NO VERIFICADO | Matriz mobile §11 | P2 |
| Desktop UX | 🟡 | React responsive | — | — | — | Ver §6 tab-switch | 2026-07 | Preview | — | Lovable agent | Ver §6 | P0 |

---

## 4. Bugs conocidos (registro)

| ID | Título | Módulo | Severidad | Estado | Evidencia | Causa raíz (probable) | Próximo paso |
|---|---|---|---|---|---|---|---|
| STAFLY-CTX-001 | Pérdida de Company Context al volver de otra pestaña | Company Context | 🔴 Alta | Reproducido (reporte usuario) | Comparativa Connecteam 2026-07-28 | Race entre `TOKEN_REFRESHED`/`SIGNED_IN` en `useAuth` y dep-refetch de `fetchCompanies` con `role` transitoriamente nulo → cae a rama "regular user" y elige `list[0]` o resetea a `null` | Ver §6 |
| STAFLY-CTX-002 (potencial) | "No admin access for this company" tras tab-switch | Company Context / Guards | 🔴 Alta | POSIBLE REGRESIÓN | Reporte usuario | Consumers evalúan `canAccessAdminForCompany(selectedCompanyId)` durante ventana donde `companyRoles` está vacío pero `selectedCompanyId` aún vive | Ver §6 |
| STAFLY-CACHE-003 (potencial) | TanStack Query `refetchOnWindowFocus` por defecto sin sobreescritura | Global State | 🟡 Media | Inferencia | `src/lib/query-client.ts:3` (`new QueryClient()` sin opciones) | Cada retorno a pestaña dispara refetch masivo → amplifica race con re-hidratación auth | Definir `defaultOptions` explícitas |

> **No hay bugs marcados como "Corregido" ni "Validado" en esta auditoría.** Los sprints previos (34–52) documentan cambios pero no aparecen en un registro central verificable.

---

## 5. Regresiones

| ID | Funcionalidad | Estado | Evidencia previa | Causa probable | Confianza | Prueba de regresión que falta |
|---|---|---|---|---|---|---|
| REG-CTX-001 | Company Context persiste tras tab-switch | **POSIBLE REGRESIÓN — PENDIENTE DE CONFIRMACIÓN** | Comentario en `useCompany.tsx:154-156` ("CRITICAL: read fresh values from storage… so a recent company switch is NOT overwritten") indica corrección previa | Cambio posterior en `useAuth` re-emite eventos que re-disparan `fetchCompanies` con `role` transitorio, o cambio en TanStack Query defaults | Media | E2E Playwright: login → seleccionar empresa B (no la primera) → abrir nueva pestaña → volver → assert `selectedCompanyId === B` |
| REG-CTX-002 | Guard "No admin access" no aparece falsamente | POSIBLE REGRESIÓN | `CompanyRequiredGuard.tsx` protege contra empty state pero no contra ventana transitoria de `companyRoles={}` | Redirect prematuro en `Index.tsx` o guard admin evaluando durante `loading=true` | Media | E2E que verifica ausencia del toast/redirect durante 3 tab-switches consecutivos |

**Por qué las pruebas existentes no lo detectan**: `tests/e2e/*` cubre deep-links y permisos cross-company pero **no simula pérdida y recuperación de focus del tab**. Playwright soporta `page.evaluate("document.hidden")` + eventos `visibilitychange` sintéticos; no encontrado en la suite actual.

---

## 6. Investigación del Company Context (caso Connecteam)

### Pasos de reproducción (derivados del código)

1. Usuario con múltiples empresas (developer u owner idealmente) loggeado en Stafly.
2. Selecciona manualmente la empresa **B** (no la primera alfabéticamente).
3. Abre otra pestaña del navegador (Gmail, Connecteam, etc.).
4. Espera ≥ 5 s (o suficiente para que Supabase emita `TOKEN_REFRESHED` en algún tab, o para que TanStack Query considere queries stale).
5. Regresa a la pestaña de Stafly.
6. **Observado**: aplicación pierde contexto → cae a Global Mode o muestra "No admin access for this company".

### Diagnóstico técnico

**Quién establece el contexto**: `useCompany.tsx` → `setSelectedCompanyIdRaw` + `safeLocalStorage.setItem("selectedCompanyId", id)` (líneas 95-103).

**Dónde vive**:
- Memoria: `useState` en `CompanyProvider`.
- Persistencia: `localStorage["selectedCompanyId"]` (string plano, **sin firmar, sin scope por user_id, sin timestamp**).

**Cómo se restaura**: `fetchCompanies` lee `safeLocalStorage.getItem("selectedCompanyId")` y valida que exista en la lista devuelta (líneas 156-204). **No revalida contra `company_users` ni contra RLS** más allá de que la lista de companies llegue.

**Qué dispara la pérdida**:
- Al volver al tab, el navegador dispara `visibilitychange` → Supabase JS puede emitir `TOKEN_REFRESHED` (o `SIGNED_IN` en algunas versiones/casos).
- En `useAuth.tsx:348-360`: `TOKEN_REFRESHED` **no re-fetchea** userData si `hydratedUserIdRef.current === nextSession.user.id`. **OK**, no debería resetear.
- Pero en `useAuth.tsx:366-377`: si el evento llega como `SIGNED_IN` (caso frontera cuando localStorage se reescribe cross-tab o cuando `TOKEN_REFRESHED` viene con user id distinto por fracción), llama `setLoading(true)` + `fetchUserData` → **durante ese lapso `role` puede volverse `null` momentáneamente** al ejecutar `resetAuthState` en error paths (línea 280) o mientras `setRole(resolvedRole)` aún no corre.
- `useCompany.tsx:208` tiene `role` en las dependencias de `fetchCompanies`. Cuando `role` cambia, se re-ejecuta.
- Si `role` es transitoriamente `null` (o transitoriamente distinto), `canUseGlobalMode = false` → cae a rama "regular user" (líneas 180-204) → **si `manuallySelected===true` y el usuario seleccionó una empresa que NO está en la lista transitoriamente vacía** (lista aún no repoblada), setea `selectedCompanyIdRaw(null)` o pica `list[0]`.
- Para developer/owner: si `role` momentáneamente cae a `null`, la rama `canUseGlobalMode` cambia; con `manuallySelected=true` puede quedar en `validStored` OK, pero si el fetch de `companies` falla transitoriamente (401 durante refresh de token), `list=[]` → `validStored=null` → resetea contexto.
- Además, `refetchOnWindowFocus` default de TanStack Query v5 = `true` (no encontrada override en `src/lib/query-client.ts:1-3` que instancia `new QueryClient()` sin opciones). Cada tab-return dispara refetch de todos los queries, incluidos los que dependen de `selectedCompanyId` → si durante ese instante el contexto se resetea, las queries corren con `null` y devuelven datos vacíos o de otro tenant si el consumer no está bien key-scoped.

**Cross-tab**: `stafly-auth-tabs` BroadcastChannel existe (`src/lib/auth-session.ts:94-127`) pero **solo detecta presencia**, no coordina el `selectedCompanyId`. Dos pestañas en empresas distintas comparten `localStorage["selectedCompanyId"]` → una sobreescribe a la otra sin aviso.

**Redirect prematuro**: `src/pages/Index.tsx:50-94` navega antes de que `companyLoading` termine si `authLoading` ya terminó pero `companyLoading` sigue → puede aterrizar en `/app` con `selectedCompanyId=null` → guards evaluan false → banner de "no access".

### Clasificación

- **POSIBLE REGRESIÓN CONFIRMADA** (nivel de confianza: **medio-alto**). Los comentarios "CRITICAL: read fresh values from storage" en `useCompany.tsx:154` sugieren que este exacto vector se corrigió antes; la corrección **no cubre el caso donde `role` cambia transitoriamente**, ni el caso donde `fetchCompanies` corre con `list=[]` por error de red durante refresh.
- **Riesgo de seguridad**: **medio**. Si dos pestañas comparten `localStorage` y una escribe empresa A y la otra empresa B, la última en escribir gana. Combinado con `refetchOnWindowFocus` puede provocar que queries scoped a A devuelvan datos de B en la pestaña equivocada **si el hook consumer no incluye `selectedCompanyId` en `queryKey`**. Auditoría rápida de `useCompensation`, `useClients`, `useClientExperience` muestra `selectedCompanyId` **presente en queryKey** → mitigado en esos hooks. **No exhaustivo** — se debe auditar el 100% de hooks. **NO VERIFICADO** para todos.

### Recomendación (no implementar aún)

1. **Namespace del storage por user_id**: `sb-selectedCompanyId:<user_id>` para evitar contaminación cross-account en el mismo navegador.
2. **Revalidar membresía on-focus** contra `company_users` antes de aceptar el `selectedCompanyId` restaurado.
3. **Sincronizar cross-tab** vía BroadcastChannel: cuando una pestaña cambia empresa, otras deben preguntar antes de aceptar.
4. **Set `refetchOnWindowFocus: false`** para queries scoped a company_id o al menos gate hasta que el context termine de re-hidratar.
5. **Un único sync path**: eliminar la doble entrada (`onAuthStateChange` + `getSession().then(syncSession)`), o coordinar con un flag.
6. **Estado unificado de "context ready"**: `authLoading || companyLoading` combinado como `contextLoading`; ningún guard admin debe evaluar `canAccessAdminForCompany` cuando `contextLoading===true`.

### Plan de QA requerido para cerrar

- E2E Playwright: tab-switch × 10 con empresa distinta a la primera → assert selección estable.
- Dos pestañas simultáneas con empresas distintas → cada una mantiene su vista sin cross-contamination.
- Token refresh forzado (`supabase.auth.refreshSession()`) durante navegación → contexto sobrevive.
- Pérdida de red simulada durante return-to-tab → contexto sobrevive y guards no falsean.
- Repetir en mobile Capacitor (background/foreground) — actualmente ⚪.

---

## 7. Riesgos para octubre

| Riesgo | Área | Prob | Impacto | Sev | Mitigación | Estado |
|---|---|---|---|---|---|---|
| Regresión Company Context bloquea demos | Fundación | Alta | Alto | 🔴 P0 | §9-P1 | Abierto |
| Cross-tenant data leak vía cache mal keyed | Multi-tenant | Media | Muy alto | 🔴 P0 | Auditoría exhaustiva de `queryKey` | Abierto |
| Ausencia de matriz de QA firmada | Todos | Alta | Alto | 🔴 P0 | §9-P2 | Abierto |
| Payroll doble truth set (nativo vs reconciliación) | Payroll | Media | Alto | 🟡 P1 | MRI-001, congelar cambios | Documentado |
| Mobile background/foreground no validado | Mobile | Alta | Medio | 🟡 P1 | Matriz mobile §11 | Abierto |
| Edge Functions sin health-check | Backend | Media | Medio | 🟡 P2 | Smoke tests periódicos | Abierto |
| `refetchOnWindowFocus` default amplifica races | Global | Alta | Medio | 🟡 P1 | Override en `queryClient` | Abierto |
| Sin observabilidad por tenant | Ops | Alta | Alto | 🟡 P1 | Sentry + tenant tag | Abierto |
| SW/PWA stale cache (arreglado Abr 2026) recurrencia | Runtime | Baja | Alto | 🟡 P2 | Mantener guardas en `main.tsx` | Mitigado |
| Cambio de rol / remoción de membresía no propagado en vivo | Permissions | Media | Alto | 🟡 P1 | Revalidar on-focus | Abierto |

---

## 8. Deuda técnica

| Deuda | Impacto | Urgencia | Módulos | Esfuerzo | Recomendación |
|---|---|---|---|---|---|
| `QueryClient` sin `defaultOptions` explícitas | Alto | Alta | Global | XS | Definir `staleTime`, `refetchOnWindowFocus:false` para tenant-scoped |
| `fetchCompanies` con `role` en deps → race | Alto | Alta | Company Context | S | Refactor a máquina de estados |
| `selectedCompanyId` en localStorage sin scope user | Alto | Alta | Multi-tenant | S | Namespace + revalidación |
| Doble sync auth (`getSession` + `onAuthStateChange`) | Medio | Media | Auth | S | Consolidar |
| Cross-tab coordination limitada a presencia | Medio | Media | Auth | M | Extender BroadcastChannel |
| `employees` con 84 columnas | Medio | Baja | Workers | XL | Partir en subdominios |
| Falta test E2E tab-switch multi-tenant | Alto | Alta | QA | S | Añadir en `tests/e2e/` |
| Falta observabilidad (Sentry/Logtail) por tenant | Alto | Media | Ops | M | Wire tag `company_id` en errores |
| Registro central de bugs inexistente | Alto | Alta | Proceso | S | §10 tablero |
| Doble truth set payroll (MRI-001) | Alto | Baja (documentado) | Payroll | XL | Fuera de ciclo |
| Solapamiento Service Requests vs Operations Planning Center | Medio | Baja | Producto | XL | Decisión de producto |
| `Index.tsx` redirect antes de `companyLoading` | Medio | Alta | Navigation | XS | Esperar contexto |

---

## 9. Cinco prioridades de estabilización para octubre

### P1 — Company Context Hardening (fundación multi-tenant)
- **Problema**: pérdida de contexto en tab-switch y potencial contaminación cross-tab.
- **Por qué prioritario**: riesgo multi-tenant + bloqueo demo.
- **Módulos afectados**: `useAuth`, `useCompany`, `Index.tsx`, `queryClient`.
- **Riesgo reducido**: cross-tenant leak, pérdida de operación, fricción demo.
- **Esfuerzo**: S-M.
- **Dependencias**: ninguna.
- **Responsable sugerido**: dueño del dominio Auth (NO VERIFICADO).
- **Aceptación**: E2E tab-switch × 10 estable; dos pestañas distintas empresa sin cross; guard "no access" no aparece durante re-hidratación.
- **No tocar**: RLS, `time_entries`, payroll, providers de datos ajenos.

### P2 — Matriz de QA multi-tenant firmada + suite E2E de regresión
- **Problema**: no hay evidencia de que módulos declarados estables sigan estables tras cambios.
- **Módulos**: todos verticales.
- **Esfuerzo**: M.
- **Aceptación**: matriz §11 ejecutada semanalmente; suite E2E cubre tab-switch, deep-links, roles.
- **No tocar**: código productivo (solo agregar tests).

### P3 — Observabilidad por tenant
- **Problema**: bugs de producción sin trazabilidad tenant-scoped.
- **Esfuerzo**: M.
- **Aceptación**: cada error client-side tiene `company_id` y `user_role`; dashboard visible por owner.
- **No tocar**: contenido de logs de payroll/PII.

### P4 — Registro central de bugs y regresiones (§10)
- **Problema**: sprints avanzan sin memoria compartida de bugs.
- **Esfuerzo**: S (proceso + doc, no código).
- **Aceptación**: cada bug tiene ID, dueño, estado, evidencia; regresiones separadas con test asociado.

### P5 — Auditoría exhaustiva de `queryKey` por tenant
- **Problema**: no todos los hooks confirmados incluyen `selectedCompanyId` en key.
- **Esfuerzo**: S.
- **Aceptación**: lint/rule custom o script que verifique que cualquier query que filtre por `company_id` tenga `selectedCompanyId` en `queryKey`.
- **No tocar**: RLS.

---

## 10. Tablero vivo — "Estado del Ecosistema — Stafly"

**Propuesta de vivir dentro de `/app` como página admin-only** (`/app/system-health`) reutilizando componentes existentes (badges, semáforos), con fuente de verdad en un archivo Markdown versionado `docs/engineering-system/STATUS.md` + una tabla en Supabase `system_health_signals` (append-only) alimentada por triggers de CI y reportes manuales.

**Secciones**:
1. **Semáforo global** (5 tarjetas: 🟢🟡🔴⚪🔁).
2. **Estado por módulo** (columnas: módulo, salud, últ. validación, responsable, evidencia, próxima acción).
3. **Bugs abiertos** (filtro por severidad, módulo, estado).
4. **Regresiones** (con test de regresión asociado).
5. **Mejoras de la semana**.
6. **Validaciones ejecutadas** (con link a screenshot/CI run).
7. **Requiere atención inmediata** (bugs P0/P1 sin dueño).

**Estados**: `Reportado → Reproducido → Causa raíz → Corregido → Code review → Validado test → Regression test added → Liberado → Validado prod → Monitoreado → Cerrado`.

**Reglas para declarar módulo estable**:
- Sin bugs abiertos P0/P1.
- Validado end-to-end en último release.
- Cobertura de test de regresión ≥ 1 por bug histórico.
- Responsable nombrado.
- Última validación ≤ 14 días.

**Reglas para cerrar bug**: evidencia (screenshot/log/CI) + test de regresión merged + validado en prod + monitoreado ≥ 48h sin recurrencia.

**Frecuencia de actualización**: semanal mínima; diaria para P0.

**Responsable**: rol "Owner de Calidad" (NO ASIGNADO — pregunta humana).

---

## 11. Matriz de QA

### Desktop
| Escenario | Módulo | Aceptación |
|---|---|---|
| Login → seleccionar empresa B → cambiar tab → volver | Company Context | Selección estable |
| Dos pestañas empresas distintas | Multi-tenant | Cada pestaña independiente, sin cross |
| Refresh en `/app/shifts` | Navigation | Ruta persiste, contexto persiste |
| Cierre y reapertura navegador | Session | Restauración correcta o pantalla auth limpia |
| Token refresh forzado durante navegación | Auth | Sin logout falso |
| Expiración de sesión real | Auth | Toast "sesión expirada" + redirect `/login` |
| Global Mode ↔ Company Mode (developer) | Company Context | Sin data leak |
| Intento acceso empresa no autorizada | Permissions | 403 amable, no crash |
| Pérdida y reconexión de red durante mutación | Global | Retry o error claro, no doble escritura |
| Crear/editar shift, workers, permisos, notificaciones | Verticales | Smoke por módulo |

### Mobile (Capacitor)
| Escenario | Aceptación |
|---|---|
| App a background 30s, foreground | Contexto persiste |
| Bloqueo/desbloqueo teléfono | Sesión persiste |
| Switch entre apps | Sin re-login forzado |
| Pérdida y reconexión de red | Reintentos automáticos |
| Sesión prolongada (24h) | Refresh transparente |
| Navegación tabs internos | Sin pérdida contexto |

### Multi-tenant
| Escenario | Aceptación |
|---|---|
| Usuario 1 empresa | UX simple, sin selector inútil |
| Usuario n empresas | Selector funcional, cambio invalida cache |
| Global admin | Puede entrar y salir de Global Mode |
| Company admin / manager / worker | Cada rol ve solo lo permitido |
| Usuario removido de empresa | Al próximo focus, contexto se limpia |
| Cambio de rol mientras loggeado | Refresca permisos en máx. 60s |
| Tenant inválido en storage | Se descarta silenciosamente |
| Dos pestañas empresas distintas | Sin mezcla de datos ni caches |

---

## 12. Información no disponible

- Historial de commits / PRs (git state manejado internamente, no consultable).
- Responsables por módulo — **no existe registro central**.
- Fechas exactas de última validación de módulos verticales.
- Resultados de tests recientes en CI.
- Logs de producción por tenant.
- Ejecución real de Edge Functions.
- QA real en Capacitor iOS/Android.
- Estado de Billing/Payments contra Stripe/Paddle real.
- Métricas de errores en producción (Sentry o equivalente).
- Contract firmado entre Service Requests y Operations Planning Center.

---

## 13. Preguntas que requieren respuesta humana

1. ¿Existe un backlog/tracker de bugs actual fuera de este repo? (Linear/Jira/Notion). Si sí, ¿URL?
2. ¿Quién es el dueño de calidad? ¿Quién de Auth? ¿Quién de Payroll?
3. ¿Cuál es la definición actual de "release" (preview vs `.lovable.app` vs custom domain)?
4. ¿Se ha reproducido STAFLY-CTX-001 en producción real (staflyapps.com) o solo en preview?
5. ¿Hay usuarios reales operando en producción hoy? Si sí, ¿cuántos tenants activos?
6. ¿Existe una fecha de octubre concreta y qué se compromete entregar?
7. ¿Se acepta bajar features nuevas para estabilizar 4-6 semanas?
8. ¿Hay budget para observabilidad (Sentry, Logtail, similar)?
9. ¿Mobile Capacitor está en TestFlight/Play Console interno hoy?
10. ¿Se puede acceder a logs de Supabase por más de 24h?

---

## 14. Próximo paso recomendado

**Antes de escribir una línea de código**: humano confirma prioridades §9 y responde §13. Luego iniciar **Sprint de Fundación** enfocado exclusivamente en P1 (Company Context Hardening) con criterios de aceptación §6-QA. **Congelar** merges en `useAuth`/`useCompany`/`App.tsx` providers para cualquier otro sprint hasta cerrar P1.

---

## 15. Archivos, hooks y rutas inspeccionadas

**Inspeccionados directamente en esta auditoría**:
- `src/hooks/useCompany.tsx` (completo)
- `src/hooks/useAuth.tsx` (líneas 100-460)
- `src/hooks/useEffectiveEmployee.tsx`
- `src/lib/auth-session.ts`
- `src/lib/query-client.ts`
- `src/lib/shifts/visibility.ts`
- `src/lib/shifts/shift-permissions.ts`
- `src/lib/supabase-helpers.ts`
- `src/components/CompanyRequiredGuard.tsx`
- `src/pages/Index.tsx`
- `src/main.tsx`
- `src/integrations/supabase/client.ts`
- `supabase/config.toml`
- Búsquedas globales: `visibilitychange`, `onAuthStateChange`, `refetchOnWindowFocus`, `window.location.reload`, `selectedCompanyId` (60+ ocurrencias).

**Referenciados por contexto pero no re-abiertos**:
- Todos los `docs/engineering-system/*` previos (EIP-001A/B, CAP-001, VS-001, MRI-001, OES-001, ECOSYSTEM-DISCOVERY, ECOSYSTEM-DISCOVERY-VERIFICATION).
- Sprints Shift Ops 34–52.

**No accesibles / limitaciones**:
- Historial git.
- Logs de producción largos.
- Ejecución real de Edge Functions.
- QA mobile real.
- Tests CI recientes.
- Ningún dashboard de errores.

**Tests encontrados** (no ejecutados en esta auditoría):
- `src/test/*` (unit).
- `tests/e2e/root-cause-*` (Playwright, cobertura parcial de deep-links y permisos cross-company).
- `.github/workflows/root-cause-e2e.yml` (existencia, no ejecución verificada).

**Ninguna modificación de código, migraciones, RLS, providers ni datos fue realizada durante esta auditoría.**
