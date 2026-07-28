# STAFLY-CTX-001 — Verification Report (Runtime Controlled)

Fecha: 2026-07-28
Autor: Lovable agent (protocolo verificación controlada)
Rama: read-only + instrumentación temporal en Playwright (sin cambios en `src/`)
Documentos previos: `ECOSYSTEM-AUDIT-2026-07.md` (hipótesis) — este reporte la confirma parcialmente y refuta otra parte.

---

## 1. Veredicto

- La hipótesis del audit ("cambio de pestaña → Supabase Auth event → fetchCompanies transitorio → pierde selectedCompanyId") **NO se reproduce como fue enunciada.** El simple ciclo `visibilitychange`/`focus` no emite `TOKEN_REFRESHED` ni `SIGNED_IN`, no dispara `fetchCompanies` y no limpia `selectedCompanyId`.
- Sí se reproduce una **pérdida real de Company Context** cuando el ciclo de foco coincide con una **falla de refresh de token** (Supabase emite `SIGNED_OUT`, `useAuth` marca `session_expired`, `useCompany` resetea `companies=[]` y `selectedCompanyIdRaw=null`, el `AdminLayout` redirige a `/auth`).
- Existe además un **riesgo multi-tenant latente confirmado**: `localStorage.selectedCompanyId` es la única fuente de verdad y es compartida entre pestañas sin evento de sincronización. Otra pestaña puede reescribir el id sin que el runtime de la primera lo perciba hasta el próximo `fetchCompanies` — momento en que el contexto salta a otro tenant.

Clasificación: **regresión parcial** (bloqueo por token expirado, symptom = "vuelvo a la pestaña y me sacó") + **problema estructural** (localStorage como single source of truth cross-tab).

## 2. ¿Fue reproducido?

Parcialmente. Ver escenarios 1–7.

## 3. Ambiente y rol usados

- Preview: `http://localhost:8080` (bundle dev, HMR activo).
- Usuario: `2bf0401f…` (developer, Global Mode elegible, membresía en múltiples empresas).
- Rol resuelto por `useAuth`: `developer`. `canUseGlobalMode = true`.
- Sesión: la de la sandbox (`LOVABLE_BROWSER_SUPABASE_*`).
- Herramienta: Playwright headless, viewport 1280×1800, un contexto navegación.
- Datos manipulados: solo `localStorage.selectedCompanyId` en la máquina de test. Cero writes DB. Cero mutaciones payroll/turnos.

## 4. Pasos exactos (reproducción)

Scripts: `/tmp/browser/ctx001/repro.py`, `/tmp/browser/ctx001/repro2.py`.
Logs: `/tmp/browser/ctx001/console.log`, `console2.log`.
Screenshots: `/tmp/browser/ctx001/screenshots/*.png`.

Escenarios ejecutados:

1. Login + carga `/app` con `selectedCompanyId=null` (developer default).
2. Login + carga `/app` con `selectedCompanyId=<JKitchen>` prefijado.
3. `visibilitychange→hidden`/`visibilitychange→visible` inmediato.
4. Igual, pero con 30 s de "background" en medio.
5. `supabase.auth.refreshSession()` forzado.
6. 10 toggles rápidos `hidden↔visible`.
7. Multi-tab: tab1 con empresa A, tab2 escribe empresa B en localStorage.

## 5. Timeline técnico (extracto real, redactado)

Repro #2 (con selectedCompanyId prefijado a `b653f344…` JKitchen):

```
t≈0     goto /app                                     sel=b653f344…
t≈100ms use-auth-state-change   userId=2bf0401f… loading=true
t≈120ms use-auth-sync-session   userId=2bf0401f… loading=true
t≈2.1s  auth-role-debug         resolvedRole=developer, globalRoles=[3]
t≈2.2s  company-provider-resolved  selected=b653f344…, companies=N   ← estable
t≈3s    STEP hide+show inmediato
t≈3.5s  CTX-PROBE blur          sel=b653f344…
t≈4s    CTX-PROBE focus         sel=b653f344…
        (SIN eventos de useAuth, SIN fetchCompanies, SIN storage.remove)
t≈4.1s  SEL-AFTER-1 = b653f344…                       ← contexto preservado
t≈4.2s  STEP wait 30s
t≈34.2s CTX-PROBE focus         sel=b653f344…         ← sigue estable
t≈34.3s SEL-AFTER-2 = b653f344…
t≈35s   STEP force refreshSession()
t≈35.1s use-auth-state-change   userId=null  event=SIGNED_OUT ← refresh_token invalid
t≈35.3s admin-layout            userId=null → Navigate /auth
t≈35.4s company-provider-no-user   companies=[], selectedIdRaw=null
        (localStorage.selectedCompanyId NO se borra — sigue en b653f344…)
```

Multi-tab:

```
t≈45s   tab2 goto /app                sel=b653f344… (compartido)
t≈48s   tab2 localStorage.setItem('selectedCompanyId','35401d7c…')  ← Llc
t≈48.2s tab1 focus                    ← storage cambió sin evento en tab1
t≈48.4s CTX-PROBE focus tab1  sel=35401d7c…   ← id "contaminado" para la próxima ejecución
```

## 6. Primer estado incorrecto de la cadena

En el flujo de token expirado, el primer estado incorrecto es:

- `useAuth.tsx` línea 382–390 (rama `SIGNED_OUT`): `resetAuthState()` + `setUser(null)` + `hydratedUserIdRef.current=null` **sin distinguir "no-user" de "sesión expirada silenciosa mientras la pestaña estaba oculta"**.
- Consecuencia inmediata: `useCompany.tsx` línea 111–117 ejecuta la rama `!user`, deja `companies=[]` y `setSelectedCompanyIdRaw(null)`. La `localStorage` **no** se limpia, pero el estado en memoria sí.
- `AdminLayout` (guard) evalúa `!user && !authLoading` → `Navigate to /auth`. Ese es el "salto" percibido.

En el flujo multi-tab, el primer estado incorrecto es:

- `useCompany.tsx` línea 156 (`safeLocalStorage.getItem("selectedCompanyId")`): al re-ejecutarse `fetchCompanies` toma como verdad lo que otra pestaña escribió, sin validar contra el estado en memoria previo ni pedir confirmación.

## 7. Causa raíz confirmada

Son **dos causas independientes** que el reporte anterior había fusionado:

- **CR-A (regresión visible reportada):** `SIGNED_OUT` desencadenado por refresh de token fallido durante la reanudación de la pestaña. `GoTrueClient` de Supabase engancha `visibilitychange` y llama `_recoverAndRefresh`; si el refresh falla (token rotado por otra pestaña, red intermitente, expiración) → `SIGNED_OUT`. `useAuth` trata el evento como cierre de sesión y descarta el contexto.
- **CR-B (problema estructural latente):** el modelo "localStorage como fuente única" no incluye:
  - listener de `storage` events para invalidar el estado en memoria cuando otra pestaña escribe;
  - namespacing por `user.id` (una re-login con otro usuario hereda `selectedCompanyId` del anterior si pertenece a ambos);
  - guard on-focus que revalide membresía activa sin remontar todo.

La hipótesis original ("tab focus solo dispara TOKEN_REFRESHED y transitorios") queda **REFUTADA** para el caso happy-path.

## 8. Factores amplificadores

- `queryClient = new QueryClient()` sin defaults (`src/lib/query-client.ts`). React Query 5 tiene `refetchOnWindowFocus: true` por defecto — cualquier query montada refetcheará al volver a la pestaña. No causa pérdida de contexto por sí sola, pero **amplifica el parpadeo visual** y ejecuta lecturas con `company_id` transitorio si el fix de CR-B no se hace.
- `AdminLayout` no espera un flag `contextReady = !authLoading && !companyLoading && (user? selectedCompanyId!=null || canUseGlobalMode : true)` — evalúa acceso con estados parciales.
- `useCompany` depende de `manuallySelected` como state; se pierde en cualquier remount de `CompanyProvider` (cambio de árbol, HMR, error boundary reset).

## 9. Hipótesis descartadas

- ❌ `TOKEN_REFRESHED` fire on-focus limpia el contexto — **NO observado**. En 70 s de test con dos ciclos de foco y 10 toggles rápidos, no se emitió `TOKEN_REFRESHED` (solo se emite cuando el token está cerca de expirar).
- ❌ `role` entra en estado transitorio `null` durante fetchUserData — **NO observado**. `setRole` se llama una sola vez al final del try; no hay reset intermedio.
- ❌ `SIGNED_IN` se re-emite al recuperar foco — **NO observado**. Supabase no emite `SIGNED_IN` en visibility resume salvo login real.
- ❌ TanStack Query es causa raíz — **REFUTADO**. No participa del context; solo amplifica.

## 10. Riesgo multi-tenant

**Confirmado. Severidad Alta.**

Escenarios confirmados:

- Dos pestañas del mismo browser profile: cambiar empresa en tab2 → tab1 lee empresa B en la próxima `fetchCompanies`. Si el usuario tiene rol distinto en A y B (p.ej. `admin` en A, `manager` en B), la UI puede pintar botones/rutas de A pero enviar mutaciones con `company_id = B` cuando alguna query lee de `useCompany` directamente después del cambio.
- Re-login de otro usuario en la misma máquina: `selectedCompanyId` sobrevive; si el nuevo usuario también tiene acceso a esa empresa, se le manda al mismo tenant sin selección explícita (no es una fuga, pero es sorpresa operativa).

Mitigado por: RLS del servidor. Pero cualquier feature que use `selectedCompanyId` como filtro client-side sin re-check de membresía queda vulnerable a leakage visual y cache poisoning (TanStack Query keys sin `company_id` compartirían resultados entre tenants).

## 11. Archivos y líneas involucradas

- `src/hooks/useAuth.tsx` L323–393: handler `onAuthStateChange`. Falta distinguir `SIGNED_OUT` real vs. refresh fallido, y falta cross-tab BroadcastChannel para el mismo evento.
- `src/hooks/useCompany.tsx` L105–208: `fetchCompanies`. `localStorage.getItem` como única fuente de verdad; sin namespace por `user.id`; sin listener `storage` event.
- `src/hooks/useCompany.tsx` L111–117: rama `!user` deja el runtime en cero pero preserva `localStorage`, generando el efecto "vuelvo y me sacó".
- `src/lib/query-client.ts` L1–3: `QueryClient` sin defaults → `refetchOnWindowFocus:true` global.
- `src/pages/Index.tsx` L50–94: guard usa `authLoading || companyLoading` pero navega a `/login` en cuanto `!user` — correcto para logout real, precipitado para `SIGNED_OUT` por refresh.
- `src/components/CompanyRequiredGuard.tsx` L15: sólo detecta `isGlobalMode`; no detecta "usuario no-global, sin selección, sin empresas" (que es exactamente lo que pasa por 1 tick tras `SIGNED_OUT` transitorio).
- `src/lib/auth-session.ts` L94–127: `watchTabPresence` existe (BroadcastChannel) pero no lo usa `useCompany`.

## 12. Comportamiento actual entre pestañas

- `localStorage` compartido; no hay `window.addEventListener('storage', …)` en `useCompany`.
- Cambio de empresa en tab2: tab1 NO reacciona en el momento, PERO en su próxima `fetchCompanies` (auth event, remount, o navegación) toma la nueva empresa.
- Cambio de empresa en tab2 mientras tab1 está creando/editando: mutaciones en vuelo pueden completarse con la empresa vieja y refetches subsiguientes con la nueva, mezclando la vista.
- No hay lock ni indicador visual de "otra pestaña cambió de empresa".

## 13. Decisión humana requerida

Elegir modelo cross-tab **antes** de implementar el fix:

- **Opción A — contexto global sincronizado.** `BroadcastChannel('stafly-company-ctx')` propaga el cambio; ambas pestañas siempre viven en la misma empresa. Ventaja: cero ambigüedad, cero riesgo de leakage. Desventaja: usuarios avanzados no pueden trabajar en dos tenants a la vez.
- **Opción B — contexto independiente por pestaña.** Migrar `selectedCompanyId` a `sessionStorage` (o keying por `tabId` en localStorage). Ventaja: soporte natural para "una pestaña por tenant". Desventaja: pierde continuidad al reabrir la pestaña; requiere UX explícita al abrir tab nuevo.

Recomendación técnica: **A por defecto + toggle "abrir tenant en nueva pestaña independiente"** como escape hatch para power users. No implementar hasta decisión.

## 14. Fix mínimo recomendado (NO implementado)

1. **CR-A — SIGNED_OUT silencioso:** en `useAuth.onAuthStateChange`, distinguir `SIGNED_OUT` originado en foreground (usuario) vs. background (refresh fail). Marcar `session_expired` como hoy, pero **no** navegar hasta que el usuario interactúe; mostrar un toast/banner "sesión expirada, reconecta" y ofrecer re-login sin perder la ruta actual (`saveIntendedRoute` ya existe).
2. **CR-B parte 1 — namespace de storage:** clave `stafly:ctx:selectedCompanyId:${user.id}` para evitar herencia cross-user.
3. **CR-B parte 2 — validación on-focus:** al recibir `visibilitychange→visible`, ejecutar `refetch()` de `useCompany` y **validar** que `selectedCompanyId` sigue en la lista de `companies` accesibles; si no, degradar a Global Mode (developer) o forzar picker (usuarios regulares) — sin redirigir a `/auth`.
4. **CR-B parte 3 — cross-tab sync (según decisión §13):** `BroadcastChannel` o `sessionStorage`.
5. **Query cache hardening:** cambiar `queryClient` a defaults con `refetchOnWindowFocus: 'always'` desactivado o con `structuralSharing` + queryKey que incluya `company_id` como prefijo estándar (auditoría separada).
6. **Guard `AdminLayout`:** introducir `contextReady` explícito (`authReady && companyReady && (canUseGlobalMode || selectedCompanyId != null)`) antes de decidir redirecciones.

## 15. Qué NO tocar

- `auth.users`, RLS, `user_roles`, `company_users`, `companies` schema — nada de esto.
- `payroll`, `time_entries`, `shift_assignments`, `scheduled_shifts`, `payments`, `bookings`, `chat`, `documents`, `reconciliation`, `imports`, `campaigns`, `partner_*` — fuera de scope.
- `src/integrations/supabase/client.ts` (auto-generado).
- No cambiar el modelo de roles ni tocar `has_role` server-side.

## 16. QA requerido para el futuro fix

- Matriz manual: 1 empresa / N empresas / rol dev / rol company_owner / rol admin / rol manager / rol employee.
- Multi-tab: 2 pestañas misma empresa, 2 pestañas empresas distintas (validar decisión §13).
- Simulación de refresh_token inválido (tal como hicimos con `refreshSession()`).
- Simulación de red offline al volver a la pestaña (bloqueo + reintentos).
- Test E2E: cambio de empresa mientras hay un fetch en vuelo → asegurar que no se cruzan `company_id` en la respuesta.
- QueryKey audit: enumerar todas las queries que leen `useCompany`; asegurar que su key incluye `selectedCompanyId`.
- Regression: verificar que `stafly-active-mode` (admin/employee) sigue respetándose tras el fix.
- Smoke: developer sin selección explícita entra a `/app` y ve Global Mode (no una empresa aleatoria).

## 17. Instrumentación temporal a retirar

Ninguna en `src/`. Toda la instrumentación de esta verificación vivió en:

- `/tmp/browser/ctx001/repro.py`
- `/tmp/browser/ctx001/repro2.py`
- `/tmp/browser/ctx001/console.log`, `console2.log`
- `/tmp/browser/ctx001/screenshots/*.png`

Los `console.info('[post-login-debug]')` y `console.info('[auth-role-debug]')` **ya existen en el código productivo** (`useAuth.tsx`, `useCompany.tsx`, `Index.tsx`) y se usaron como fuente de verdad. No se agregaron ni se removerán aquí; su limpieza (si se decide) es una tarea aparte.

---

Fin del reporte. No se implementó fix. No se declaró "corregido". No se cambió estado del tablero.
