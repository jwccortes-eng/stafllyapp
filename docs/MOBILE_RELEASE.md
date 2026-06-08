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

```bash
# 0. Pull latest code
git pull

# 1. Pick the app you are building
cp capacitor.parceros.release.ts capacitor.config.ts
# — or —
cp capacitor.stafly.release.ts capacitor.config.ts

# 2. Install deps and build the web bundle
npm install
npm run build

# 3. Sync the web bundle into the native projects
npx cap sync

# 4. Open the native project
npx cap open ios       # opens Xcode → Archive → Upload to App Store Connect
npx cap open android   # opens Android Studio → Generate Signed Bundle (.aab)

# 5. Restore the dev config when done so Lovable preview keeps working
git checkout -- capacitor.config.ts
```

> **Do not** commit the copied release config over `capacitor.config.ts`.
> The dev config must stay in source control or Lovable preview breaks.

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
- Add `NSLocationWhenInUseUsageDescription`, `NSCameraUsageDescription`,
  `NSPhotoLibraryUsageDescription` to `ios/App/App/Info.plist`.
- Add `ACCESS_COARSE_LOCATION`, `POST_NOTIFICATIONS`,
  `usesCleartextTraffic="false"` to `android/app/src/main/AndroidManifest.xml`
  (and the Parceros copy).
- Configure App Privacy / Data Safety forms in App Store Connect and Play
  Console.
- Decide and implement the controlled Parceros invite flow (Sprint 2,
  option 6.a in the launch plan).
