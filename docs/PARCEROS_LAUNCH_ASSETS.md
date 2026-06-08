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
