# Mobile Release Guide — Stafly Core & Parceros

This guide describes how to produce **App Store / Play Store release builds**
for the two independent apps in the ecosystem:

- **Stafly Core** — `com.staflyapps.app`
- **Parceros** — `com.staflyapps.parceros`

Both apps share the same web codebase (`src/`) and the same Lovable Cloud
backend. They differ only in:

1. **Bundle id / app name** (Capacitor config)
2. **App icon + splash + screenshots** (per-app marketing assets)
3. **`/parceros/*` vs `/app|/portal/*` entry surfaces** (already handled by
   React Router; Parceros redirects unauthenticated users to
   `/auth?from=parceros`)

The everyday `capacitor.config.ts` at the repo root is the **dev** config used
by Lovable preview. It points at the sandbox URL with `cleartext: true` and
**must not** be shipped to App Store / Play Store (Apple rejects builds that
load remote code).

---

## Files

- `capacitor.config.ts` — Lovable dev preview (do not edit).
- `capacitor.stafly.release.ts` — Stafly Core release recipe.
- `capacitor.parceros.release.ts` — Parceros release recipe.
- `docs/PARCEROS_LAUNCH_ASSETS.md` — exact icon, splash, screenshot, listing
  metadata checklist for both apps.

---

## Release build flow (local, manual)

These steps are run **locally on your machine**, not inside Lovable. You will
need Node, the Capacitor CLI, Xcode (for iOS), and Android Studio (for
Android).

> **Critical:** the web bundle is shared by both apps, so the build flavor
> (`VITE_APP_FLAVOR`) decides which experience the native shell boots into.
> Without this env var, the Parceros native app would boot into the Stafly
> landing because `/` defaults to PublicLanding.

```bash
# 0. Pull latest code
git pull
npm install

# ──────────────────────────────────────────────────────────────────────────
# PARCEROS native build
# ──────────────────────────────────────────────────────────────────────────
cp capacitor.parceros.release.ts capacitor.config.ts
VITE_APP_FLAVOR=parceros npm run build     # `/` → /parceros, post-login → /parceros
npx cap sync
npx cap open ios       # Xcode → Archive → Upload to App Store Connect
# or
npx cap open android   # Android Studio → Generate Signed Bundle (.aab)

# ──────────────────────────────────────────────────────────────────────────
# STAFLY CORE native build
# ──────────────────────────────────────────────────────────────────────────
cp capacitor.stafly.release.ts capacitor.config.ts
VITE_APP_FLAVOR=stafly npm run build       # `/` → PublicLanding, post-login → /app or /portal
npx cap sync
npx cap open ios
# or
npx cap open android

# Restore dev config when done so Lovable preview keeps working
git checkout -- capacitor.config.ts
```

> **Do not** commit the copied release config over `capacitor.config.ts`.
> The dev config must stay in source control or Lovable preview breaks.
> The `VITE_APP_FLAVOR` env var is read at build time only — never bake it
> into a committed `.env`. The default (no flavor) = Stafly.


---

## First-time setup per app

### Stafly Core (existing bundle id)
1. The Apple App ID `com.staflyapps.app` already exists — reuse it.
2. Run steps 1–4 with `capacitor.stafly.release.ts`.
3. Add native folder: `npx cap add ios` and `npx cap add android` if not
   present.

### Parceros (new bundle id)
1. In Apple Developer Console, create a new App ID:
   `com.staflyapps.parceros` with capabilities: Push Notifications (future),
   Sign in with Apple (if used).
2. In Google Play Console, create a new app with applicationId
   `com.staflyapps.parceros`.
3. Run steps 1–4 with `capacitor.parceros.release.ts`. The `android.path`
   override creates `android-parceros/` next to `android/`, so both apps can
   coexist locally.

---

## Hard rules (security / store compliance)

- Release configs **must not** include a `server.url`. Apple App Review
  rejects apps that load primary content from a remote URL.
- `cleartext: true` is allowed only in the dev preview, never in release.
- Bundle ids are unique per app and **never reused** — changing `appId` on an
  already-published app breaks updates and forces users to reinstall.
- Both apps use the **same** Supabase backend and the **same** auth. There
  is no "Parceros DB" or "Stafly DB". RLS, tenants, payroll, time entries,
  shifts, payments, documents — none of that changes between builds.
- Do not modify `capacitor.config.ts` (dev) when preparing a release.

---

## What still needs to happen (out of scope for Sprint 1)

- Generate icons and splash with `@capacitor/assets`
  (see `docs/PARCEROS_LAUNCH_ASSETS.md`).
- The `capacitor:sync:after` hook adds these required iOS privacy keys to
  `ios/App/App/Info.plist` when the native iOS project exists:
  `NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription`, and
  `NSPhotoLibraryAddUsageDescription`. Confirm they are present before
  archiving. `NSLocationWhenInUseUsageDescription` still needs native review
  when location features are enabled in the store build.
- Add `ACCESS_COARSE_LOCATION`, `POST_NOTIFICATIONS`,
  `usesCleartextTraffic="false"` to `android/app/src/main/AndroidManifest.xml`
  (and the Parceros copy).
- Configure App Privacy / Data Safety forms in App Store Connect and Play
  Console.
- Decide and implement the controlled Parceros invite flow (Sprint 2,
  option 6.a in the launch plan).
