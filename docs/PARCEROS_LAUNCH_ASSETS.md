# Parceros & Stafly Core — Launch Assets Checklist

Exact files, sizes, and listing metadata required to publish both apps to
the App Store and Google Play. Companion to `docs/MOBILE_RELEASE.md`.

Each app needs its **own** set of assets. Do not reuse Stafly Core icons /
screenshots for Parceros — the two products have different brands and
different user audiences.

---

## 1. Source assets (per app)

Provide these 5 PNGs and `@capacitor/assets` will generate every iOS and
Android variant.

| File | Size | Format | Notes |
|---|---|---|---|
| `icon.png` | 1024 × 1024 | PNG, **no alpha**, no rounded corners, no text smaller than ~60 px | Marketing icon. Apple App Store rejects icons with an alpha channel. |
| `icon-foreground.png` | 1024 × 1024 | PNG, transparency OK | Android adaptive icon foreground. Logo centered with ~25% safe padding on all sides — Android applies its own mask. |
| `icon-background.png` | 1024 × 1024 | PNG, solid color | Android adaptive icon background. Use the app's primary brand color (Parceros: coral; Stafly: brand blue). |
| `splash.png` | 2732 × 2732 | PNG | Universal launch image. Logo centered, plenty of negative space, light background. |
| `splash-dark.png` | 2732 × 2732 | PNG | Dark-mode launch image. |

Recommended folder layout:

```
assets-source/
  parceros/
    icon.png
    icon-foreground.png
    icon-background.png
    splash.png
    splash-dark.png
  stafly/
    icon.png
    icon-foreground.png
    icon-background.png
    splash.png
    splash-dark.png
```

Generation (local, one-time per app):

```bash
npm i -D @capacitor/assets

# Parceros build:
cp capacitor.parceros.release.ts capacitor.config.ts
npx capacitor-assets generate --assetPath assets-source/parceros

# Stafly Core build:
cp capacitor.stafly.release.ts capacitor.config.ts
npx capacitor-assets generate --assetPath assets-source/stafly
```

---

## 2. App Store Connect — iOS submission

### Required per app

- **App icon (marketing)**: 1024 × 1024 (uploaded via App Store Connect, not
  in the bundle).
- **iPhone 6.7" screenshots**: 1290 × 2796, 3–10 images. **Required.**
- **iPhone 6.5" screenshots**: 1284 × 2778 or 1242 × 2688, 3–10 images.
  **Required if the app supports devices older than iPhone 14 Pro.**
- **iPad screenshots**: only if the app is offered for iPad.

### Listing metadata

| Field | Limit | Parceros suggested copy |
|---|---|---|
| App name | 30 chars | `Parceros — Trabajo cerca` |
| Subtitle | 30 chars | `Comunidad de trabajadores` |
| Promotional text | 170 chars | `Encuentra trabajo en tu zona, conecta con tu comunidad y aplica a flash jobs en segundos.` |
| Description | 4000 chars | (full long description, EN + ES) |
| Keywords | 100 chars | `trabajo,turnos,empleo,gig,comunidad,nyc,latino,flash job,oportunidades` |
| Support URL | URL | `https://staflyapps.com/support` |
| Marketing URL | URL | `https://staflyapps.com/parceros` |
| Privacy Policy URL | URL | `https://staflyapps.com/privacy` |
| Category (Primary) | choose | `Business` (or `Social Networking`) |

### App Privacy ("Nutrition Label")
Apple requires you to declare each data type the app collects. For Parceros,
declare at minimum:

- **Contact Info**: Name, Phone Number, Email Address — *linked to user*,
  used for *App Functionality* and *Account Authentication*.
- **User Content**: Other User Content (messages in channels) — *linked
  to user*, used for *App Functionality*.
- **Identifiers**: User ID — *linked to user*, used for *App Functionality*.
- **Location**: Coarse Location (zone only) — *linked to user*, used for
  *App Functionality*. Do **not** declare precise/GPS unless you actually
  ship continuous tracking.
- **Diagnostics**: Crash Data, Performance Data — *not linked to user*.

### Apple-specific files
- `PrivacyInfo.xcprivacy` — required by Apple since May 2024. Generated
  next to `ios/App/App/`. List every Required Reason API used by your
  dependencies (UserDefaults, file timestamp, system boot time, etc.).
- `Info.plist` usage descriptions (add only what the app actually uses):
  - `NSLocationWhenInUseUsageDescription`
  - `NSCameraUsageDescription`
  - `NSPhotoLibraryUsageDescription`
  - `NSUserTrackingUsageDescription` (only if ATT prompt is shown)

---

## 3. Google Play Console — Android submission

### Required per app

- **App icon**: 512 × 512, PNG, 32-bit with alpha.
- **Feature graphic**: 1024 × 500, PNG/JPEG, no transparency. **Required.**
- **Phone screenshots**: 1080 × 1920 or 1080 × 2400, 2–8 images.
  **Required.**
- **7" tablet screenshots**: optional.
- **10" tablet screenshots**: optional.

### Listing metadata

| Field | Limit | Parceros suggested copy |
|---|---|---|
| App name | 30 chars | `Parceros — Trabajo cerca` |
| Short description | 80 chars | `Comunidad de trabajadores: canales, flash jobs y oportunidades cerca de ti.` |
| Full description | 4000 chars | (full long description) |
| Category | choose | `Business` or `Social` |
| Contact email | required | `info@staflyapps.com` |
| Privacy Policy URL | required | `https://staflyapps.com/privacy` |

### Data Safety form
Declare data collection, sharing, and security practices. Mirror the Apple
Privacy Nutrition Label above.

### AndroidManifest.xml essentials
- Set `android:usesCleartextTraffic="false"`.
- Declare permissions actually used:
  - `<uses-permission android:name="android.permission.INTERNET" />`
  - `<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />`
    (only if Parceros needs zone via GPS; otherwise omit)
  - `<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />`
    (API 33+, for push)

---

## 4. Screenshot script — Parceros (5 shots, 390 × 844 base)

Capture in a clean state with seeded demo data, not production data.

1. **Radar / Home** — overlay caption: *"Encuentra trabajo en tu zona, ahora."*
2. **Flash Jobs list** — *"Aplica a turnos urgentes en segundos."*
3. **Channel detail with messages** — *"Conecta con tu comunidad por zona."*
4. **Flash Job detail screen** — *"Información clara antes de aceptar."*
5. **Worker profile / passport** — *"Tu reputación viaja contigo."*

Scale each capture up to the required store sizes (Apple 6.7" =
1290 × 2796) using a screenshot composer or `imagegen` + manual layout.

## 5. Screenshot script — Stafly Core (5 shots)

1. **Admin mobile home** — *"Toda tu operación en una pantalla."*
2. **Shifts mobile view** — *"Crea, asigna y publica turnos en segundos."*
3. **Time Clock command center** — *"Fichajes reales con GPS y evidencia."*
4. **Payroll review / Centro de Validación** — *"Cierra payroll con confianza."*
5. **Worker portal (parallel)** — *"Tu equipo, sin WhatsApp caótico."*

---

## 6. Pre-submission checklist

- [ ] `capacitor.config.ts` (release) has **no** `server` block.
- [ ] App icon has **no alpha** for iOS.
- [ ] All 5 source assets exist for the app being built.
- [ ] Privacy URL responds with the up-to-date `PrivacyPolicy.tsx` content.
- [ ] Terms URL responds with the up-to-date `TermsOfService.tsx` content.
- [ ] Support URL responds (placeholder page acceptable for first review).
- [ ] App Privacy / Data Safety forms filled.
- [ ] `Info.plist` / `AndroidManifest.xml` declare every permission the app
      actually prompts for — no extras, no missing ones.
- [ ] Build is signed with the correct distribution certificate /
      upload key.
- [ ] Test on a real device (TestFlight internal / Play Internal Testing)
      before submitting for external review.

---

## 7. English store copy (parallel to Spanish in §2 and §3)

### iOS — App Store Connect (EN)

| Field | Limit | EN copy |
|---|---|---|
| App name | 30 | `Parceros — Work Nearby` |
| Subtitle | 30 | `Worker community & gigs` |
| Promotional text | 170 | `Find work in your area, connect with your community and apply to flash jobs in seconds. Your reputation travels with you.` |
| Keywords | 100 | `work,shifts,jobs,gig,community,latino,flash job,opportunities,parceros,staffing` |
| Description (4000) | — | See long description below |

**EN long description (App Store + Play Store):**

> Parceros is the worker community already trusted by Stafly teams.
> Connect with coworkers in your area, get real opportunities, and apply
> to urgent flash jobs in seconds. Your verified identity and work
> history travel with you on every shift.
>
> • Radar of opportunities near you
> • Local and industry channels
> • Flash Jobs: urgent shifts that fill fast
> • Passport: verified identity and work history
> • No spam, no recruiter middlemen

### Android — Google Play Console (EN)

| Field | Limit | EN copy |
|---|---|---|
| App name | 30 | `Parceros — Work Nearby` |
| Short description | 80 | `Worker community: channels, flash jobs and opportunities near you.` |
| Full description | 4000 | Same body as iOS EN description above |

Shared across both stores (EN + ES):
- Support email: `info@staflyapps.com`
- Privacy URL: `https://staflyapps.com/privacy`
- Terms URL: `https://staflyapps.com/terms`
- Marketing URL: `https://staflyapps.com/parceros`
- Primary category: **Business**
- Content rating: 4+ (iOS) / Everyone (Android)

---

## 8. Android icon densities (generated by `@capacitor/assets`)

After running `npx capacitor-assets generate --assetPath assets-source/parceros`,
the tool writes the following files into `android-parceros/app/src/main/res/`:

| Density | Folder | Launcher icon | Adaptive foreground | Adaptive background |
|---|---|---|---|---|
| mdpi (160 dpi) | `mipmap-mdpi/` | 48 × 48 | 108 × 108 | 108 × 108 |
| hdpi (240 dpi) | `mipmap-hdpi/` | 72 × 72 | 162 × 162 | 162 × 162 |
| xhdpi (320 dpi) | `mipmap-xhdpi/` | 96 × 96 | 216 × 216 | 216 × 216 |
| xxhdpi (480 dpi) | `mipmap-xxhdpi/` | 144 × 144 | 324 × 324 | 324 × 324 |
| xxxhdpi (640 dpi) | `mipmap-xxxhdpi/` | 192 × 192 | 432 × 432 | 432 × 432 |
| Play Store listing | uploaded in Console | 512 × 512 | — | — |

Splash screen drawables (light + dark) are written to
`drawable-*/splash.png` at matching densities; native splash background
color is read from `capacitor.parceros.release.ts → plugins.SplashScreen.backgroundColor`
(`#FF6B5A`).

**Verification step after generate:**
- [ ] `mipmap-anydpi-v26/ic_launcher.xml` references `@mipmap/ic_launcher_foreground`
      and `@mipmap/ic_launcher_background`.
- [ ] Adaptive icon previews correctly in Android Studio's **Resource
      Manager → Mipmap** tab (no clipped logo, ~25% safe padding visible).

---

## 9. Native QA summary (full matrix lives in PARCEROS_NATIVE_QA_MATRIX.md)

Before promoting any native build to TestFlight or Play Closed Testing,
the team must pass all P0 items in
`docs/PARCEROS_NATIVE_QA_MATRIX.md`. Quick summary of the P0 surface:

- **Boot & shell** (7 tests): launch, coral splash, icon, name `Parceros`,
  no Stafly branding, safe-area padding, no sandbox URLs.
- **Auth & routing** (7 tests): cold open → `/auth?from=parceros`, OTP
  login, post-login lands on `/parceros`, logout, signup blocked.
- **Parceros surfaces** (8 tests): Radar / Channels / Flash list + detail
  routes, bottom tabs, no admin/payroll/clock entries.
- **Permissions hygiene** (5 tests): v1 must not prompt for location,
  camera, photo library, notifications, microphone/contacts/calendar.
- **Legal & metadata** (4 tests): `/privacy`, `/terms`, `/cookies` open
  with no horizontal overflow; support email visible.

Each test runs on iOS sim + iPhone real + Android emu + Pixel real.
A single P0 fail blocks store submission.

---

## 10. Sprint 1 verified — `?from=parceros` redirect flow

Verified during Sprint 1 QA (closed 2026-06-08):

- `/parceros/*` requires session; unauthenticated users are redirected
  to `/auth?from=parceros` by `src/layouts/ParcerosLayout.tsx`.
- `/auth?from=parceros` swaps `Auth.tsx` to the Parceros variant (coral
  theme, Spanish copy, no payroll/clock language).
- After successful OTP, post-login redirect prefers `/parceros` (not
  `/app` or `/portal`) when `?from=parceros` is present.
- `/auth` with **no** params is unchanged for Stafly Core users.
- `document.title` for `/parceros/*` is overridden to
  `Parceros · Tu comunidad de trabajo` via `react-helmet-async` mounted
  in `src/layouts/ParcerosLayout.tsx`; other routes keep the Stafly
  PWA title from `index.html`.

This redirect contract is the basis of the QA matrix items §8–§14 in
`docs/PARCEROS_NATIVE_QA_MATRIX.md`. Any change to it requires
re-running the auth + routing block of the matrix.
