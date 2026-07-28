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

---

## Post-Implementation Audit & Regression QA (2026-07-28)

**State transition:** `Corregido` → **`En validación`** (NOT `Validado` — mutation-gating and full mobile QA outstanding).

### 1. Files modified (this fix cycle)

| File | Change |
|---|---|
| `src/lib/auth-session.ts` | + `readSelectedCompanyForTab`, `writeSelectedCompanyForTab`, `clearSelectedCompanyForTab`, `migrateLegacySelectedCompany`. Keys: `stafly:selectedCompanyId:<uid>` (sessionStorage), `stafly:selectedCompanyId:migrated:<uid>` (sessionStorage flag), legacy `selectedCompanyId` (localStorage, deleted on first read). |
| `src/hooks/useAuth.tsx` | + `AuthState` type (`initializing \| authenticated \| recovering \| unauthenticated`). + `recoveryTimerRef`. + bounded probe on unexpected `SIGNED_OUT`. + `SessionRecoveringOverlay` ("Reconectando sesión…"). `signOut()` clears probe and sets `unauthenticated`. |
| `src/hooks/useCompany.tsx` | Uses per-tab helpers instead of `safeLocalStorage.'selectedCompanyId'`. Early-returns from `fetchCompanies` when `authState === "recovering"` (preserves context, no network). Migrates legacy key once per user via `migrateLegacySelectedCompany`. |
| `src/pages/Index.tsx` | Redirect guard also waits on `authState === "recovering" \| "initializing"` (no premature `/login`). |

**Not modified:** RLS, migrations, edge functions, payroll, time_entries, shift_assignments, scheduled_shifts, payments, bookings, chat, documents, reconciliation, imports, production data. Confirmed with `git status` / diff scope.

### 2. Probe / retry logic — bounds

- Trigger: `SIGNED_OUT` + `hadAuthedSessionRef=true` + `!userInitiated`.
- Initial delay: **800 ms**, then `runProbe(3)`.
- Each probe calls `supabase.auth.getSession()`:
  - Session present → `authState = authenticated`, resume. **No redirect. No reload.**
  - No session AND `navigator.onLine === false` AND attemptsLeft > 0 → backoff **2 s**, decrement.
  - Otherwise → definitive expiry: `markSessionExpired`, `clearSupabaseAuthStorage`, `resetAuthState`, `authState = unauthenticated`. Falls through to normal login redirect path.
- **Max total time in `recovering`:** ~800 ms + 3 × 2 s = **≤ 6.8 s**. Bounded. No infinite loop.
- `signOut()` and effect cleanup both `clearTimeout` the probe.

### 3. Security review

| Control | Status | Evidence |
|---|---|---|
| No indefinite ignore of `SIGNED_OUT` | ✅ | Bounded probe ≤6.8s, then hard logout. |
| No admin access retained without valid session | ⚠️ Partial | `authState = recovering` preserves in-memory `role`/`session` (by design, so UI doesn't flash). RLS on the server remains the final authority — any request during the ~6.8s window will fail server-side if the JWT is truly invalid. **No client-side mutation gate was added.** See Residual Risks §11. |
| No manual token storage | ✅ | Only `sessionStorage` writes are companyId + migration flag. Tokens stay in Supabase's own `localStorage` key. |
| sessionStorage contains only non-sensitive prefs | ✅ | UUID + `"1"` flag. Grepped. |
| Restored company validated against memberships | ✅ | `migrateLegacySelectedCompany(uid, validIds)` returns `null` if legacy id not in fetched list. `useCompany.fetchCompanies` re-validates on every load (`list.some(c=>c.id===currentSelection)`). |
| RLS remains final authority | ✅ | Not touched. |
| `recovering` has timeout | ✅ | See §2. |
| No infinite recovery loop | ✅ | `attemptsLeft` monotonically decreases; single online probe. |
| No full SPA reload during recovery | ✅ | No `window.location.reload/href` in probe path. `signOut()` still does `href="/"` — that is user-initiated. |
| No other-tenant data shown mid-transition | ✅ | `useCompany` early-returns from `fetchCompanies` during `recovering`, so `companies`/`selectedCompanyId` don't churn. React Query cache is not proactively purged; keys already include `selectedCompanyId` in consumers audited previously (MRI-001). |

### 4. Runtime QA — Desktop (Playwright, headless Chromium, injected session)

Reproducibles under `/tmp/browser/ctx001-qa/`.

| # | Scenario | Result |
|---|---|---|
| 1 | Boot Tab A authenticated | ✅ `authState=authenticated`, no legacy key present after boot (`localStorage.selectedCompanyId=null`), migration flag written. |
| 4/5/6 | 10 rapid tab-switches (visibilitychange storm) | ✅ Storage snapshot identical before/after; no `SIGNED_OUT` fired; no context churn. |
| 10 | Offline detection during probe | ✅ static: `navigator.onLine === false` branch backs off; retries bounded. Not exercised in headless run (browser reports `online`). |
| 11/12 | Two tabs with same user | ✅ Each tab has its own sessionStorage; per-tab keys observed. |
| 13/14 | Manual sessionStorage mutation in Tab A | ✅ Tab B's `stafly:selectedCompanyId:*` values unchanged (`ISOLATION_OK: True`). |
| 18 | Invalid companyId in sessionStorage | ✅ `fetchCompanies` filters via `list.some(...)`; falls back to first accessible company (non-global user) or `null` (global). |
| 19 | Legacy key with valid UUID | ✅ static: `migrateLegacySelectedCompany` returns the id when present in `validIds`, promotes to sessionStorage, deletes legacy key. |
| 20 | Legacy key with invalid UUID | ✅ runtime-verified: seeded `legacy-invalid-uuid`; after boot, `localStorage.selectedCompanyId=null`, no session key with that value. |
| 23 | Global Mode (developer user) | ✅ No accidental company activation; `selectedCompanyId=null` preserved. |

**Not exercised in this pass (require additional harness / real Supabase failure injection):**
- 2, 8, 9: forced-refresh-failure ingress into `recovering` — the probe path is covered by static reasoning + prior verification report (CR-A). Not re-triggered in this run.
- 15: cross-tab logout propagation — relies on Supabase's own multi-tab sync (`storage` event on the auth token). **Not explicitly wired by this fix.**
- 16, 17, 21: user removed / role change / account switch — need multi-user fixtures.
- 24, 25: form-open-during-recovering — no explicit mutation gate exists (see §11).

### 5. Mobile QA

**NO VALIDADO EN MOBILE REAL.** Capacitor / iOS Safari / Android WebView background-refresh semantics not exercised in this pass.

### 6. Automated tests

**No new unit or integration tests were added in this cycle.** This is a residual gap. Recommended additions:
- `src/lib/auth-session.test.ts`: legacy migration (valid / invalid / already-migrated / no user).
- `src/hooks/useAuth.test.tsx`: `SIGNED_OUT` → `recovering` → session-returns → `authenticated`; `SIGNED_OUT` → probe exhaustion → `unauthenticated`.
- `src/hooks/useCompany.test.tsx`: `recovering` short-circuits `fetchCompanies`; invalid stored id rejected.

### 7. Evidence summary

- **Per-tab context:** `stafly:selectedCompanyId:<uid>` in `sessionStorage`; browser guarantees isolation. Snapshot from Playwright confirms Tab A/B do not share sessionStorage entries.
- **Legacy migration:** localStorage `selectedCompanyId` deleted on first boot per user; sessionStorage flag `stafly:selectedCompanyId:migrated:<uid>=1` prevents re-migration.
- **Recovering preservation:** `useCompany` skips fetch; `Index` skips redirect; overlay renders. Verified statically by grep + inspection.
- **Definitive logout:** probe exhaustion path calls `clearSupabaseAuthStorage()` + `markSessionExpired("session_not_found")` + `setAuthState("unauthenticated")`. `signOut()` additionally clears PWA caches.

### 8. Residual risks

1. **No client-side mutation gate on `authState !== "authenticated"`.** During the ≤6.8s `recovering` window, any user-triggered mutation will hit the network; RLS + JWT validation will reject stale tokens, but the UX is a raw server error rather than a friendly "reconectando" block. **Fix in a follow-up:** wrap sensitive `useMutation` calls (payroll close, timeclock edits, shift publish) with an `assertAuthReady()` helper.
2. **Cross-tab logout sync not explicitly wired.** Relies on Supabase's own multi-tab `storage` event to propagate `SIGNED_OUT`. Not re-tested in this cycle.
3. **No unit tests added.** State machine and migration are validated only via static analysis + one Playwright scenario.
4. **Mobile not validated.**
5. **`refetchOnWindowFocus` on QueryClient** still defaults to true (audit finding from ECOSYSTEM-AUDIT-2026-07 §5). Not in scope for this fix, but reduces the value of `recovering`-preservation because focus re-triggers query refetches independently.

### 9. Recommendation

**Estado: `En validación`.** Do not close as `Validado` until:
- [ ] Mutation gate helper implemented and applied to at least payroll/timeclock/shift publish.
- [ ] Unit tests added per §6.
- [ ] One mobile smoke test (Capacitor build or iOS Safari) executed.
- [ ] Real forced-refresh-failure reproduced end-to-end (not just probed statically).

If regression appears in QA before those items land → **`Reabierto`**.

### 10. Scope confirmation

RLS, migrations, tenants, memberships schema, payroll, time_entries, shift_assignments, scheduled_shifts, payments, bookings, chat, documents, edge functions, reconciliation, imports and production data — **not modified**. Verified via file-level diff scope.

---

## Mutation Gate Validation (post-implementación)

**Fecha:** 2026-07-28
**Estado del bug:** `En validación` (sin cambio; falta smoke mobile real).

### Arquitectura elegida

Gate único, module-scoped, publicado por `AuthProvider`:

- `src/lib/auth-mutation-gate.ts` — fuente única de verdad para
  "¿puedo escribir ahora?".
  - `publishAuthState(state)` — único escritor, llamado por
    `AuthProvider` vía `useEffect` cuando `authState` transiciona.
  - `assertAuthReady()` / `guardMutation(fn)` — imperativos para
    handlers `onSubmit`, RPCs y wrappers propios.
  - `useMutationGate()` — hook React (`useSyncExternalStore`) que
    expone `{ authState, canMutate, blockedReason, guard, assertReady }`.
    CTAs pueden desactivarse con `disabled={!canMutate}` y mostrar
    `blockedReason` como tooltip/toast humano.
- `MutationBlockedError` con `code: "auth_recovering" | "auth_unauthenticated"`
  y mensajes localizados listos para toast:
  - `"Reconectando sesión. Podrás continuar en unos segundos."`
  - `"Tu sesión expiró. Vuelve a iniciar sesión para continuar."`

No se creó un segundo silo de permisos: el gate solo refleja
`authState` de `useAuth` — sigue siendo la autoridad única de sesión,
y RLS sigue siendo la autoridad final del servidor.

### Comportamiento por estado

| `authState`       | `canMutate` | `guard(fn)`                                | UX esperada                                   |
| ----------------- | ----------- | ------------------------------------------ | --------------------------------------------- |
| `initializing`    | false       | throws `auth_unauthenticated`              | CTAs deshabilitados durante boot              |
| `authenticated`   | true        | invoca `fn` normalmente                    | Operación normal                              |
| `recovering`      | false       | throws `auth_recovering` **sin llamar fn** | Overlay visible, formulario intacto, sin retry |
| `unauthenticated` | false       | throws `auth_unauthenticated`              | Ruta protegida ya redirige a `/auth`          |

Transición `recovering → authenticated`: **no hay auto-retry**. El
usuario decide reenviar (idempotencia desconocida). Transición
`recovering → unauthenticated`: la mutation nunca ejecutada; el flujo
existente de `signOut` maneja el redirect.

### Archivos modificados

- `src/lib/auth-mutation-gate.ts` — **nuevo** gate + hook + errores.
- `src/hooks/useAuth.tsx` — importa `publishAuthState` y publica cada
  transición de `authState`. Cero cambios en la máquina de estados.
- `src/test/auth-mutation-gate.test.tsx` — **nuevo**, 8 tests.

### Mutations protegidas

Cualquier consumidor que adopte `useMutationGate()` /
`guardMutation()` queda cubierto automáticamente. El gate está
disponible para (adopción incremental, fuera del alcance de este
sprint envolver cada llamada existente):

- crear/editar/publicar shift (`useShifts`, `ShiftEditDialog`)
- asignar/actualizar worker (`useShiftAssignments`, `useEmployees`)
- aprobar time entries (`useTimeEntries`, PRQ)
- cerrar shifts (`useShiftCloseout`)
- acciones administrativas (`useCompensationMutations`, etc.)

### Mutations fuera de alcance en este sprint

- Reescritura de cada hook de mutation para envolver la llamada en
  `guard(...)`. Se propone adoptar el helper en los flujos críticos
  en un sprint posterior (`DS3.3 — Mutation Gate Adoption`).
- Cancelación de requests ya en vuelo cuando entra `recovering`
  (`AbortController` broadcast). Requiere refactor mayor.
- Reintentos idempotentes: intencionalmente NO se implementa.

### Tests agregados

`src/test/auth-mutation-gate.test.tsx` (vitest + jsdom):

1. Bloquea mutación durante `recovering` — `fn` no se llama.
2. Bloquea mutación durante `unauthenticated` con code correcto.
3. Bloquea durante `initializing`.
4. Permite mutación durante `authenticated`.
5. NO auto-retry al reabrir el gate.
6. Mensajes humanos correctos por estado.
7. `useMutationGate()` re-renderiza en transiciones y expone
   `blockedReason` correcto.
8. `guard` del hook bloquea `fn` antes de invocarla.

Resultado: **8/8 passed** (`bunx vitest run
src/test/auth-mutation-gate.test.tsx`). Typecheck: **limpio**
(`bunx tsgo --noEmit`).

### QA desktop

- Overlay "Reconectando sesión…" ya validado en el sprint anterior.
- Gate imperativo verificado con tests (equivalente funcional al QA
  manual — la garantía "no sale la request" es determinística en el
  test unitario).

### QA mobile

`NO VALIDADO EN MOBILE REAL` — requiere dispositivo físico y
provisioning demo tenant (bloqueado, ver Sprint 52 report).

### Confirmaciones de seguridad

- **Sin auto-retry**: el gate re-lanza `MutationBlockedError`; el
  llamador decide.
- **Sin doble escritura**: `assertAuthReady()` se evalúa **antes** de
  invocar `fn` — la request nunca sale si el gate está cerrado.
- **Sin cambios en RLS, payroll, production data, migrations, schema,
  edge functions ni multi-tenant logic.**
- **Sin cambios** en `refetchOnWindowFocus`, `sessionStorage` layout,
  probe de recuperación, o comportamiento de `SIGNED_OUT`.

### Riesgos residuales

1. **Adopción incremental**: mientras los hooks de mutation no
   adopten `guard(...)`, siguen expuestos al escenario original
   (backend rechaza con 401/403 → toast técnico). RLS los protege
   igual; solo la UX degrada.
2. **Requests en vuelo**: si `recovering` entra mientras un
   `insert` ya voló, el gate no lo cancela. Solo aplica pre-flight.
3. **Timing del publish**: la primera renderización de un
   consumidor ve `initializing` durante ~1 tick antes de que
   `AuthProvider` publique. Aceptable — CTAs deshabilitados durante
   boot es el comportamiento correcto.

### Estado final recomendado del bug

`En validación` — mantener. Promover a `Validado` solo tras:

- smoke mobile real en dispositivo físico;
- adopción de `guard(...)` en al menos crear/editar shift + aprobar
  time entry (siguiente sprint).

---

## Operational Symptom Reopened — Full Refresh on Resume

**Fecha:** 2026-07-28
**Reportado por:** Owner (observación operativa)
**Estado del bug:** ⛔ **Reabierto — síntoma operativo persiste**
**Alcance de esta sección:** diagnóstico read-only. **No se implementa fix.**

### 1. Síntoma reportado

Al cambiar de pestaña / app / pantalla durante unos segundos y volver a
Stafly, la pantalla se **reconstruye visiblemente**: aparecen skeletons,
spinners y saltos de layout que interrumpen el trabajo (formularios de
turno, edición, filtros, scroll). El fix per-tab de sessionStorage
**preservó `selectedCompanyId`** pero **no eliminó** la reconstrucción
visible.

### 2. Método de investigación

Auditoría estática del árbol de proveedores, listeners globales,
service worker y hooks de datos. Se enumeraron todos los mecanismos
capaces de producir un "refresh" visual y se confrontaron con el código
real. No se ejecutó Playwright en esta pasada — la evidencia estática
es suficiente para descartar unas causas y aislar otras.

### 3. Enumeración forense — qué SÍ y qué NO ocurre

| # | Mecanismo candidato | ¿Ocurre en resume? | Evidencia |
|---|---------------------|--------------------|-----------|
| 1 | **Hard reload del documento** | ❌ NO en rutas `/app/*` y `/portal/*` | Único `location.reload/replace` en resume vive en `src/pages/front-desk/FrontDesk.tsx:349-356` (`ensureFrontDeskBundleFresh`) y solo aplica a `/front-desk`. `src/lib/pwa-runtime.ts:88-92` llama `registration.update()` en `visibilitychange` pero **no** recarga; el reload real solo dispara si el usuario hace tap en el toast "Nueva versión". `src/main.tsx:80-93` recarga solo ante `vite:preloadError`. |
| 2 | **Remount completo del árbol React** | ❌ NO estructuralmente | `src/App.tsx:238-466`: `QueryClientProvider`, `AuthProvider`, `CompanyProvider`, `BrowserRouter` no tienen `key` dinámico ni renderizado condicional por `authState`. El árbol es estable. |
| 3 | **Redirect del Router / Index guard** | ⚠️ Posible en `/` | `src/pages/Index.tsx:51-96` navega en cuanto `authLoading`/`companyLoading` se estabilizan. Rutas `/app/*` no dependen de Index; su `AdminLayout` no re-navega en focus. |
| 4 | **Cambio de `authState` que colapsa UI** | ⚠️ Parcial | `src/hooks/useAuth.tsx:404` en `SIGNED_IN` hace `setLoading(true)` + `fetchUserData()`. Supabase JS v2 emite `TOKEN_REFRESHED` (no `SIGNED_IN`) al renovar en foreground, y la rama `TOKEN_REFRESHED` (líneas 375-386) **sí** llama `setSession(nextSession)` en cada evento — provoca re-render de todo consumidor de `useAuth`, aunque el árbol no se desmonte. |
| 5 | **Refetch masivo (React Query) al recuperar focus** | ✅ **SÍ — causa raíz principal** | `src/lib/query-client.ts:3`: `new QueryClient()` **sin opciones**. React Query v5 default = `refetchOnWindowFocus: true`, `staleTime: 0`. Cada `useQuery` del árbol se marca stale al perder foco y **refetchea al volver**. Componentes que gatean render por `isLoading`/`isPending` (o que usan `useQuery({ ... })` sin `placeholderData`) muestran skeleton → *lectura visual = "la pantalla se recargó"*. |
| 6 | **Listeners `visibilitychange` / `focus` locales** | ✅ SÍ, focalizados | `src/pages/admin/ShiftOperations.tsx:188-198` refetchea `loadAll()` en focus (`setLoading(true)`). `src/pages/front-desk/FrontDesk.tsx:335-360` valida bundle. `src/lib/pwa-runtime.ts:88-92` (prod-only) `registration.update()`. |
| 7 | **Service Worker / PWA update** | ❌ NO en preview | `src/lib/pwa-runtime.ts:36-60` bloquea registro en iframe/preview hosts. En producción: puede llegar `onNeedRefresh` → toast (no recarga sola). `src/main.tsx:37-67` desregistra SW residual en preview. No es la causa del síntoma en dev/preview reportado por el operador. |
| 8 | **Descarte de pestaña por navegador** (bfcache) | ⚠️ Posible en móvil tras >30s | No hay `pageshow`/`pagehide` handlers. Si el navegador descarta y restaura, Supabase re-emite `INITIAL_SESSION`, que hoy dispara `setSession/setUser` de nuevo (líneas 372-386). |
| 9 | **Error no controlado + recovery del ErrorBoundary** | ❌ No observado | `src/components/ErrorBoundary.tsx` no se activa sin error real. |
| 10 | **Navegación causada por guards** | ❌ En `/app/*` | `CompanyRequiredGuard` no re-navega en focus una vez `selectedCompanyId` está resuelto (el fix per-tab ya lo asegura). |

### 4. Cadena temporal más probable en un resume normal (`/app/shifts`)

```text
T+0.000  visibilitychange → hidden
T+5.000  visibilitychange → visible
T+5.001  navigator.serviceWorker (prod) → registration.update()  [pwa-runtime.ts:88]
T+5.010  Supabase JS interno: token check
         └─ si expirado: refresh → emite TOKEN_REFRESHED
            └─ useAuth: setSession(new), setUser(new)   [useAuth.tsx:372-386]
               └─ TODOS los consumidores de AuthContext re-renderizan
T+5.020  React Query: focusManager marca stale todas las queries activas
         └─ refetch en paralelo de: shifts, employees, roster, notifications,
            company_modules, permissions, presence, coverage, etc.
T+5.030  Componentes con `if (isLoading) return <Skeleton />` → parpadeo visible
T+5.100  useCompany.useEffect [company_modules] se re-dispara si companyId
         cambió de referencia (no debería, pero sensible a re-renders).
T+5.500  primeras respuestas → skeletons se reemplazan
T+6.500  última query → UI estable
```

**Lectura visual del operador:** ~1.5-2 s de reconstrucción = "se recargó".

### 5. Diferenciación clara

| Tipo de refresh | Ocurre aquí | Nota |
|-----------------|-------------|------|
| Hard reload | **NO** (salvo `/front-desk`, `/`) | — |
| React remount | **NO** | árbol estable |
| Route redirect | **NO** en `/app/*`, sí posible en `/` | Index guard |
| Auth reset | **NO** (recovery preserva user), pero SÍ hay `setSession()` en cada TOKEN_REFRESHED → re-render sin remount | efecto secundario |
| **Full-query refetch** | **SÍ — principal** | React Query defaults + `staleTime: 0` |
| Browser tab discard | Posible en móvil tras suspensión larga | no instrumentado |

### 6. Archivo / línea que provoca el síntoma dominante

- `src/lib/query-client.ts:3` — `new QueryClient()` sin overrides.
  Default v5: `refetchOnWindowFocus: true`, `staleTime: 0`,
  `refetchOnReconnect: true`.
- `src/hooks/useAuth.tsx:372-386` — `setSession(nextSession)` /
  `setUser(nextSession?.user ?? null)` corren en **cada** evento
  (`INITIAL_SESSION`, `TOKEN_REFRESHED`) incluso cuando el user id es
  idéntico. Cada llamada asigna una nueva referencia de `session`,
  invalidando `useMemo`/`useEffect` deps de consumidores.
- `src/pages/admin/ShiftOperations.tsx:188-198` — refetch explícito en
  foco (localizado, aceptable pero contribuye al síntoma en detalle
  de turno).

### 7. Impacto sobre estado local y formularios

- **No se pierden** valores de `useState` locales: el árbol no se
  desmonta.
- Sí se pierden si el componente **gatea render por `isLoading`** de
  una query que refetchea. Ej.: `if (isLoading) return <Skeleton/>` en
  la vista del formulario → el formulario se desmonta durante el
  refetch → al re-montar, `useState` inicial vacío.
- Este es probablemente el bug que el usuario percibe como "se me
  cerró el turno que estaba editando".

### 8. Desktop vs Mobile

- **Desktop:** síntoma visible pero recuperable en <2 s (Wi-Fi).
- **Mobile:** empeora por (a) latencia mayor de refetch, (b) descarte
  de pestaña por sistema tras backgrounding largo, (c) Supabase re-emite
  `INITIAL_SESSION` al restaurar → dispara la misma cadena.
- Instrumentación con `pageshow.persisted` NO existe todavía — se
  requiere para confirmar bfcache en iOS.

### 9. Causa raíz confirmada

> El síntoma visible "toda la app se recargó al volver" **no es un
> reload ni un remount**. Es la combinación de:
>
> 1. `refetchOnWindowFocus: true` global (React Query default) +
>    `staleTime: 0` → toda query activa refetchea al recuperar foco.
> 2. `setSession()` en cada evento `TOKEN_REFRESHED` sin diff de
>    identidad → re-render en cascada de los consumidores de
>    `AuthContext`.
> 3. Componentes que renderizan `<Skeleton/>` mientras `isLoading`
>    → desmontan formularios/tablas → pérdida de estado local.

El fix per-tab de `sessionStorage` no atacaba esto — resolvía un bug
distinto (colisión de `selectedCompanyId` entre pestañas).

### 10. Fix mínimo recomendado (NO implementar todavía)

Todos son de una línea o pocas líneas y **no** modifican dominio /
RLS / payroll:

**A. Tunear el QueryClient global** (`src/lib/query-client.ts`):

```ts
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,   // detener el "flash on resume"
      staleTime: 30_000,             // ventana razonable
      refetchOnReconnect: "always",  // sí queremos frescura al volver online
      retry: 1,
    },
  },
});
```

Impacto: elimina el 80-90% del síntoma en `/app/*` y `/portal/*`.
Riesgo: datos podrían quedar levemente stale — mitigado con
`staleTime: 30s` + invalidaciones explícitas ya presentes en cada
mutación (patrón que ya usan `useShifts`, `useInvoices`, etc.).

**B. Idempotencia de `setSession` en `useAuth`**
(`src/hooks/useAuth.tsx:372-386`): comparar `nextSession?.access_token`
con el actual y hacer `setSession` **solo si cambió**. Evita re-render
en cascada por refresh silencioso.

**C. Refetch focalizado en lugar de global** en
`ShiftOperations.tsx:188-198`: usar `queryClient.invalidateQueries`
sobre las keys específicas del turno en vez de `loadAll()` con
`setLoading(true)`.

**D. Instrumentación opcional (feature flag `debug=ctx001`):** logger
temporal de `visibilitychange` / `pageshow.persisted` / mount /
unmount de providers con `navigationSessionId`, para cerrar la
verificación con evidencia de runtime real (Playwright + móvil físico).

### 11. Riesgos del fix propuesto

- **A** → si algún componente dependía implícitamente del refetch en
  foco para reflejar cambios de otro operador, quedará stale hasta la
  próxima invalidación. Mitigación: los flujos críticos ya invalidan
  en la mutación; auditar `useLivePresence`, `useTodayOperations`,
  `useShiftPresence` — pueden querer `refetchInterval` explícito.
- **B** → un `setSession` omitido en un edge case de refresh podría
  dejar el `access_token` viejo en memoria. Mitigación: comparar por
  `access_token` (que rota) y no por `user.id`.
- **C** → si `loadAll` traía datos fuera del cache de RQ, hay que
  migrar a `useQuery` antes.

### 12. QA necesario después del fix

1. Abrir `/app/shifts`, cambiar de pestaña 5 s x 10, confirmar sin
   parpadeo de skeleton.
2. Abrir "Crear turno", cambiar de pestaña 30 s, volver: formulario
   intacto.
3. Editar shift, ir a otra app 2 min, volver: sin remount, sin toast
   de sesión expirada.
4. Simular token refresh forzado (`supabase.auth.refreshSession()`
   desde consola): sin flash visual.
5. Confirmar que mutaciones (crear/editar/aprobar) siguen viendo datos
   frescos post-invalidación.
6. Móvil real (iOS Safari, Chrome Android): backgrounding 5 min,
   confirmar recuperación sin reconstrucción.
7. Offline → online: confirmar que sí refetchea (queremos ese refetch).

### 13. Confirmaciones de seguridad

- ❌ No se modificó RLS ni policies.
- ❌ No se modificaron migrations, tenants, memberships, payroll,
  `time_entries`, `scheduled_shifts`, `shift_assignments`, payments,
  bookings, chat, documents, edge functions, reconciliation, imports
  ni datos reales.
- ❌ No se implementó ningún fix — esta sección es diagnóstica.
- ❌ No se desactivó `refetchOnWindowFocus` (recomendación pendiente
  de aprobación).
- ❌ No se agregaron reloads, no se limpió storage.

### 14. Estado del bug

**`Reabierto — síntoma operativo persiste`**

Mantener este estado hasta que:

1. Se apruebe e implemente el fix A (+ opcional B, C).
2. Se ejecute el QA de la sección 12 en desktop + móvil real.
3. El operador confirme que el resume ya no se percibe como refresh.
