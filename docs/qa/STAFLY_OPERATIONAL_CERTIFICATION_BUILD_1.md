# Stafly Operational Certification Build 1

Build de estabilización para certificación de campo (5–10 trabajadores reales).
Sin funcionalidades nuevas, sin refactors, sin cambios visuales no relacionados.

---

## 1. Identidad de la build

| Campo | Valor |
|---|---|
| Commit SHA | `92b08a789738bcaa08f3fce16dfd741ca0000cc5` |
| Branch | `edit/edt-4688d684-6948-4f66-946f-3ccb54d72b62` |
| Versión | `1.0.0` (`package.json`) |
| Build number | `1` (CFBundleVersion a fijar en Xcode) |
| Bundle id | `com.staflyapps.app` |
| Fecha/hora de compilación web | 2026-08-11 06:12 UTC |
| Nombre oficial | Stafly Operational Certification Build 1 |

El único cambio de código respecto al estado auditado es la excepción documentada
del lint VWC para `supabase-clock-sync-adapter.ts` (ver §5) y la fijación de
versión `1.0.0`. Ningún cambio funcional.

---

## 2. Resultado de compilación (web / TypeScript)

| Verificación | Resultado |
|---|---|
| TypeScript (`tsgo --noEmit`) | ✅ 0 errores |
| Build de producción (`vite build`) | ✅ `built in 32.33s`, PWA generada (299 entradas) |
| Imports rotos | ✅ ninguno (el build falla si existen) |
| Rutas rotas | ✅ ninguna (todas las rutas resuelven a módulos existentes) |
| Suite de pruebas | 1112 verdes / 7 rojas conocidas (`driver-sync-roundtrip`, deuda de mocks preexistente documentada en `docs/qa/DEBT_DRIVER_SYNC_ROUNDTRIP_TEST_FAILURE.md`) |
| Errores críticos de runtime | ninguno reportado en preview |

`driver-sync-roundtrip` falla por su doble de `supabase` anterior a VWC Fase 3D:
**falla el test, no el producto**; `src/test/driver-sync.test.ts` sigue verde.

---

## 3. Resultado del build iOS

El repositorio no contiene la carpeta `ios/` (Capacitor genera la plataforma
nativa fuera de este entorno). El binario de TestFlight debe compilarse en un Mac
con Xcode siguiendo `docs/MOBILE_RELEASE.md`:

```bash
git checkout 92b08a789738bcaa08f3fce16dfd741ca0000cc5
npm install
cp capacitor.stafly.release.ts capacitor.config.ts   # sin server.url: bundle local
npm run build
npx cap add ios        # sólo la primera vez
npx cap sync ios
npx cap open ios
# Xcode → Target App → Version 1.0.0 · Build 1 → Product > Archive → Distribute → TestFlight
```

Estado actual: **web bundle certificado y listo**; archivo iOS pendiente de
ejecución en Xcode (requiere Mac + certificados, no disponible en este entorno).
`capacitor.stafly.release.ts` ya excluye `server.url`, por lo que el bundle
enviado no carga código remoto.

---

## 4. Cambios incluidos

- Service Command Center actualizado (`src/lib/shifts/service-copilot.ts`, acciones resolutivas).
- Editor del Servicio tipo copiloto (`SmartStaffingPanel`, `service-preparation.ts`).
- Client Identity Pack (`client-truth.ts`, `client-accent.ts`).
- Operational Workspace canónico (`OperationalWorkspace`, `EntityCard`, `EntityRow`, `OperationalScreenHeader`).
- Portal corregido — caso Carlos (`src/lib/portal/portal-modules.ts`, ventana operativa `[hoy-1, ∞)`).
- Resolver canónico de identidad (`employee-identity-resolver.ts`, `creation-trace.ts`, identity guard en altas).
- Consolidación de duplicados aprobada (Fase 1: 70 duplicados; Fase 2A Sophia; Fase 2B: 7 casos).
- Clock In / Clock Out offline-first (`offline-clock-store.ts`, `clock-sync.ts`, `useOfflineClockQueue`, `clock-request-state.ts`).
- Persistencia de sesión (`persistSession` + `autoRefreshToken`, sin relock por navegación).
- Closeout con validaciones (`closeout-gate.ts`: `CLOSEOUT_SUBMITTED` / `FULLY_RECONCILED` / `PAYROLL_READY`).
- Payroll leyendo únicamente `time_entries` canónicos.
- Staffing usando únicamente empleados canónicos (`assignable-workers.ts`, `person-status.ts`).

---

## 5. Cambios explícitamente excluidos

- Justin Mora y Francisco Patino: **no consolidados** (`HUMAN_REVIEW_REQUIRED`).
- Ninguna migración de base de datos en este pase.
- Sin reescritura de históricos, sin deduplicación adicional, sin tocar QK-001592.
- Sin cambios en payroll, RLS, auth, tenants ni edge functions.
- Sin nuevas features, refactors ni ajustes visuales.
- Cambio único fuera del código de producto: excepción documentada del lint VWC
  para `src/lib/timeclock/supabase-clock-sync-adapter.ts` (cierre de la propia
  entrada con compare-and-set `.is("clock_out", null)` + idempotencia por
  `client_event_id`; misma clase A/C que `PortalClock.tsx`).

---

## 6. Checklist de certificación

| Área | Verificación | Estado |
|---|---|---|
| Portal | Módulos por fila explícita, `DEFAULT_ENABLED` si no hay fila; sin redirecciones falsas | ✅ `portal-modules.test.ts` |
| Clock | Idempotencia por `client_event_id`, cola offline durable, estados explícitos, sin éxito fingido | ✅ `reliable-time-clock.test.ts` |
| Servicios | Estado único (`useServiceState`), motor único de series, VWC en escrituras | ✅ suites de servicios verdes |
| Staffing | Sólo empleados canónicos y asignables; razones de bloqueo explicadas | ✅ `assignable-workers` / `person-status` |
| Closeout | Puerta única, tres estados separados, pendientes listados | ✅ `shift-operation-integrity.test.ts` |
| Identity | Resolver canónico + guard anti-duplicado en todas las altas | ✅ |
| Payroll | Sólo `time_entries` canónicos; tarifas inmutables tras consolidación | ✅ sin escrituras en este pase |
| Notificaciones | Feedback único vía `src/lib/feedback/notify.ts` | ✅ |
| Regresiones conocidas | Ninguna abierta; única deuda: mocks de `driver-sync-roundtrip` | ✅ |

**Veredicto:** build de estabilización **APROBADA** para congelar y enviar a
TestFlight como *Stafly Operational Certification Build 1*.

---

## 7. Congelación

Esta versión queda congelada en el commit indicado. Cualquier commit posterior
destinado a nuevas funcionalidades **no** debe mezclarse en esta build: el
archivo de TestFlight debe generarse exactamente desde
`92b08a789738bcaa08f3fce16dfd741ca0000cc5`.
