# PRE-TESTFLIGHT BUILD 17 — AUDITORÍA DE PIPELINE iOS

**Modo:** AUDIT ONLY · ZERO WRITES a producción, backend, signing o bundle id.
**Fecha:** 18 Ago 2026 · **App:** Stafly Core Workforce · **Objetivo:** Version 1.0 / Build 17.

---

## 1. ¿La app móvil usa Capacitor?

Sí. Capacitor 8.x, instalado como dependencia del proyecto web:

- `@capacitor/core` ^8.1.0
- `@capacitor/cli` ^8.1.0
- `@capacitor/ios` ^8.1.0
- `@capacitor/android` ^8.1.0

No hay React Native, Expo ni proyecto nativo escrito a mano. El shell nativo
carga el bundle web (`dist/`) generado por Vite.

## 2. Directorio / proyecto iOS real

**No existe `ios/` en este repositorio.** Tampoco `android/`.

Consecuencia: el proyecto Xcode (`ios/App/App.xcodeproj`, `Info.plist`,
`Assets.xcassets`) vive **únicamente en la máquina local del desarrollador**,
creado con `npx cap add ios`. El repo sólo contiene las *recetas* de
configuración:

| Archivo | Rol |
|---|---|
| `capacitor.config.ts` | Config **dev** (Lovable preview). Tiene `server.url` + `cleartext: true`. **No apta para App Store.** |
| `capacitor.stafly.release.ts` | Receta **release Stafly Core** (`com.staflyapps.app`, sin `server.url`, `ios.scheme: "Stafly"`). |
| `capacitor.parceros.release.ts` | Receta release de la app hermana Parceros (`com.staflyapps.parceros`). No aplica a Build 17. |
| `scripts/ensure-ios-privacy-permissions.cjs` | Hook `capacitor:sync:after`: inyecta claves de privacidad en `Info.plist`. |
| `resources/` | Iconos maestros 1024×1024 para `@capacitor/assets`. |

## 3. Repo / branch / commit del estado actual

- Branch activo: `edit/edt-c6e26153-0d48-4f10-aef1-a8c6729c2bff`
- Commit HEAD: `f31c0b49f` — "Auditoría y unificación de path"
- Working tree: limpio (sin cambios sin commitear)
- Remoto: repositorio del proyecto Lovable (Stafly). El build iOS se hace tras
  `git pull` en la máquina local.

## 4. ¿El proyecto iOS está sincronizado con el código web actual?

**No verificable desde aquí, y con alta probabilidad NO.** Razones:

- No hay `ios/` en el repo → no hay `dist/` sincronizado versionado.
- El bundle web se regenera en cada build; el `ios/App/App/public/` local
  contiene el `dist/` del **último `npx cap sync` ejecutado localmente**, que
  corresponde a Build 16.
- Todos los P0 posteriores a Build 16 (ver §11) están en el código web pero
  **no** en el shell iOS hasta ejecutar un nuevo `build` + `cap sync`.

## 5. Proceso probable de Build 16

Reconstrucción a partir de `docs/MOBILE_RELEASE.md` y `resources/README.md`:

```bash
git pull && npm install
cp capacitor.stafly.release.ts capacitor.config.ts
VITE_APP_FLAVOR=stafly npm run build
npx cap sync ios                 # dispara ensure-ios-privacy-permissions.cjs
npx cap open ios
# Xcode: seleccionar target App → General → Version 1.0 / Build 16
# Product → Archive → Distribute App → App Store Connect → Upload
git checkout -- capacitor.config.ts
```

El número de build (16) se fijó **manualmente en Xcode**, no desde este repo.

## 6. Comandos exactos para Build 17

```bash
# 0. Estado limpio y dependencias
git pull
npm install

# 1. Config de release Stafly Core (NO commitear esta copia)
cp capacitor.stafly.release.ts capacitor.config.ts

# 2. Build web con flavor Stafly
VITE_APP_FLAVOR=stafly npm run build

# 3. Sync Capacitor → copia dist/ al proyecto iOS + plugins + Info.plist
npx cap sync ios

# 4. Abrir Xcode
npx cap open ios

# 5. En Xcode (target "App"):
#    - MARKETING_VERSION      = 1.0     (sin cambio)
#    - CURRENT_PROJECT_VERSION = 17     (16 → 17)
#    - Product → Archive → Distribute → App Store Connect

# 6. Restaurar la config dev para no romper el preview
git checkout -- capacitor.config.ts
```

> Si `ios/` no existe en la máquina local: `npx cap add ios` y luego
> `npm i -D @capacitor/assets && npx capacitor-assets generate --ios`.

## 7. Bundle Identifier actual

`com.staflyapps.app` — definido en `capacitor.stafly.release.ts` (y también en
`capacitor.config.ts` dev). **No cambia en Build 17.**

## 8. MARKETING_VERSION / CURRENT_PROJECT_VERSION

| Clave | Valor en repo | Valor real (Xcode local) |
|---|---|---|
| `MARKETING_VERSION` | no versionado | `1.0` (TestFlight) |
| `CURRENT_PROJECT_VERSION` | no versionado | `16` → debe pasar a `17` |
| `package.json.version` | `1.0.0` | usado sólo por `__APP_VERSION__` del badge web |

**Ninguno de los dos valores de Xcode está bajo control de este repositorio.**

## 9. Archivos que controlan version / build number

1. `ios/App/App.xcodeproj/project.pbxproj` — **autoridad real** de
   `MARKETING_VERSION` y `CURRENT_PROJECT_VERSION` (local, no versionado aquí).
2. `ios/App/App/Info.plist` — `CFBundleShortVersionString` / `CFBundleVersion`
   (normalmente referencian las build settings anteriores).
3. `package.json` `version` — sólo alimenta `__APP_VERSION__` / `__APP_BUILD_TIME__`
   en `vite.config.ts` para el badge de build web. **No afecta a TestFlight.**

Riesgo derivado: el número de build es un paso manual, sin verificación
automática. Un olvido produce el rechazo "build number already used".

## 10. Cambios sin sincronizar que NO entrarían a Build 17

- Working tree limpio → no hay cambios locales huérfanos.
- Todo lo commiteado hasta `f31c0b49f` **sí** entra, siempre que se ejecute
  `npm run build` + `npx cap sync ios` antes de archivar.
- **Sí queda fuera** cualquier cambio de backend que no esté aplicado en el
  proyecto Cloud (ver §12) — el shell iOS apunta al mismo backend de producción.
- Queda fuera cualquier asset nativo no regenerado (iconos/splash) si no se
  corre `capacitor-assets generate --ios`.

## 11. Fixes confirmados presentes en el código que iría a Build 17

| Fix | Evidencia en repo | Estado |
|---|---|---|
| Worker membership / portal recovery | `src/lib/portal/portal-modules.ts`, `usePortalModules.tsx`, membresías Quality restauradas | ✅ |
| My Shifts timeout remediation | `src/pages/portal/MyShifts.tsx` (`HISTORY_WINDOW_DAYS = 90`), `src/lib/data/query-error.ts` | ✅ |
| Consolidación accepted/confirmed | `src/lib/shifts/assignment-status-truth.ts` (`COMMITTED_ASSIGNMENT_STATUS_LIST`) | ✅ |
| Draft → Publish remediation | `src/pages/admin/Shifts.tsx` (`readPublishResult`, RPC única) | ✅ |
| Publish Readiness SSOT Phase 1 | `src/lib/shifts/publish-readiness.ts` (`selectPublishableDrafts`) | ✅ |
| Publish Readiness SSOT Phase 2 | `publish-readiness.ts` como espejo de `public.service_publish_readiness`; `PrePublishDialog` sincronizado | ✅ |
| Claim / Open Staffing | Soporte `claimable` con 0 asignaciones en RPC + adapter | ✅ |
| Claim/Request canonical path | `src/lib/shifts/claim-resolution.ts`, `team-actions.ts` → `resolve_shift_request` → `assign_worker_to_shift`; bypass eliminado en `ShiftRequests.tsx` y `ShiftDetailDialog.tsx` | ✅ |
| Authorization hardening certificado | `src/lib/auth/permission-catalog.ts`, `role-model.ts`, `PermissionGate` en rutas | ✅ |

## 12. Dependencias de backend / migraciones para que Build 17 funcione

El bundle iOS consume el **mismo backend de producción** que la web. No requiere
migraciones nuevas, pero **exige** que estas ya estén aplicadas (todas lo están,
últimas del 18 Ago 2026):

| Objeto backend | Requerido por |
|---|---|
| `public.service_publish_readiness(_shift_id)` | Publish Readiness SSOT Phase 2 |
| `public.publish_shift_draft(_shift_id)` (versión con `date`, `claimable`, terminal-block) | Draft → Publish + Phase 1 |
| `public.resolve_shift_request(...)` (delegación a `assign_worker_to_shift`) | Claim/Request integrity |
| `public.assign_worker_to_shift(...)` | Ruta canónica de asignación |
| `public.has_permission` + `permission_catalog()` | Authorization hardening |
| `public.user_module_company_ids` + índices `idx_employees_user_id`, `idx_employees_user_company` | My Shifts timeout fix |
| `public.user_identity_employee_ids(_user_id)` | Worker visible shifts |
| Tipos regenerados en `src/integrations/supabase/types.ts` | Firma de las RPC anteriores |

Migraciones más recientes: `20260818184937_*.sql` (última aplicada). No se
requiere ninguna migración adicional para Build 17.

**Regla de despliegue:** el backend debe publicarse **antes o a la vez** que el
build iOS. Los usuarios de Build 16 seguirán funcionando porque todos los
cambios de RPC son retro-compatibles en firma.

---

## Riesgos antes de Build 17

| # | Riesgo | Severidad | Mitigación |
|---|---|---|---|
| R1 | `ios/` no está versionado: el estado nativo (Info.plist, entitlements, iconos, build number) sólo existe en una máquina. Pérdida del equipo = pérdida del proyecto. | 🔴 Alta | Respaldar/versionar `ios/` o documentar su reconstrucción completa. |
| R2 | Olvidar `cp capacitor.stafly.release.ts capacitor.config.ts` → el build iría con `server.url` remoto y `cleartext: true`. **Rechazo garantizado de App Review.** | 🔴 Alta | Verificar en Xcode que `App/public/` contiene el bundle y que `capacitor.config.json` sincronizado NO tiene `server`. |
| R3 | Olvidar subir `CURRENT_PROJECT_VERSION` a 17 → App Store Connect rechaza el upload. | 🟠 Media | Paso explícito en el checklist. |
| R4 | Olvidar `VITE_APP_FLAVOR=stafly` → `/` podría bootear a la experiencia equivocada. | 🟠 Media | Comando fijado en §6. |
| R5 | Claves de privacidad iOS (`NSCameraUsageDescription`, `NSPhotoLibrary*`) dependen del hook post-sync; si el proyecto iOS no existe al correr sync, no se inyectan. | 🟠 Media | Verificar `Info.plist` antes de archivar. |
| R6 | Service Worker PWA: el bundle nativo incluye el SW; una caché vieja podría servir un shell anterior. La config actual usa NetworkFirst para navegaciones y no precachea HTML → riesgo controlado. | 🟡 Baja | Sin acción. |
| R7 | Restaurar `capacitor.config.ts` tras el build; si se commitea la copia release, el preview Lovable deja de funcionar. | 🟡 Baja | `git checkout -- capacitor.config.ts`. |
| R8 | Iconos/splash: si Build 16 salió con placeholder, regenerar con `@capacitor/assets`. | 🟡 Baja | `npx capacitor-assets generate --ios`. |

---

## Checklist READY / NOT READY

### Código web
- [x] Working tree limpio en `f31c0b49f`
- [x] Los 9 fixes de §11 están en el código
- [x] Sin cambios experimentales pendientes
- [x] Migraciones de backend aplicadas y retro-compatibles

### Pipeline nativo
- [ ] `ios/` presente en la máquina local (**no verificable desde el repo**)
- [ ] `capacitor.stafly.release.ts` copiado sobre `capacitor.config.ts`
- [ ] `VITE_APP_FLAVOR=stafly npm run build` ejecutado
- [ ] `npx cap sync ios` ejecutado tras el build
- [ ] `capacitor.config.json` sincronizado SIN `server.url` ni `cleartext`
- [ ] `Info.plist` con claves de privacidad presentes
- [ ] `MARKETING_VERSION = 1.0`
- [ ] `CURRENT_PROJECT_VERSION = 17`
- [ ] Bundle id `com.staflyapps.app` sin cambios
- [ ] Signing / certificados sin cambios
- [ ] `git checkout -- capacitor.config.ts` tras archivar

---

## VEREDICTO

🟡 **READY FOR BUILD 17 — CON CONDICIONES**

El **código web está listo**: todos los fixes P0 solicitados están presentes,
el árbol está limpio y el backend no requiere migraciones adicionales.

La condición es que **el pipeline nativo no es reproducible desde este
repositorio**: no hay `ios/`, y el número de build, el signing y el
`Info.plist` viven exclusivamente en la máquina local. Build 17 sólo puede
producirse allí, ejecutando literalmente los comandos de §6 y validando R2
(config release) y R3 (build number) antes de archivar.

Si esas dos verificaciones se cumplen → **READY FOR BUILD 17**.
Si no se puede confirmar el estado del proyecto Xcode local → **NOT READY**
hasta inspeccionarlo.

**Confirmación: cero escrituras. No se tocó auth, RLS, payroll, time_entries,
payments, bookings, chat, scheduled_shifts, shift_assignments, tenants ni datos
de producción. No se subió nada a Apple.**
