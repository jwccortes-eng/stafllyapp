# Parceros — App Store Connect Checklist (iOS)

Step-by-step checklist for the first TestFlight build and first App Store
submission of **Parceros** (`com.staflyapps.parceros`).

Companion to:
- `docs/MOBILE_RELEASE.md` — build flow
- `docs/PARCEROS_LAUNCH_ASSETS.md` — assets + copy
- `docs/PARCEROS_NATIVE_QA_MATRIX.md` — QA matrix
- `capacitor.parceros.release.ts` — release Capacitor config

> Stafly Core (`com.staflyapps.app`) is a **separate** app with its own
> checklist; do not mix the two in App Store Connect.

---

## A. Apple Developer Portal (one-time)

- [ ] Apple Developer Program membership active.
- [ ] Create App ID `com.staflyapps.parceros` (Explicit).
- [ ] Capabilities to enable now:
  - [ ] Sign in with Apple — **only if** social login is added (not v1).
  - [ ] Push Notifications — **leave OFF for v1** (Sprint 3 enables FCM/APNs).
- [ ] Create Distribution Certificate (or reuse team certificate).
- [ ] Create App Store Distribution Provisioning Profile for the new App ID.

## B. App Store Connect — create the app

- [ ] My Apps → **+** → New App
- [ ] Platform: **iOS**
- [ ] Name: `Parceros` (display name shown in the App Store)
- [ ] Primary language: **Spanish (Mexico)**
- [ ] Bundle ID: `com.staflyapps.parceros`
- [ ] SKU: `parceros-ios-001` (internal id, never shown)
- [ ] User Access: Full Access

## C. Capacitor / Xcode setup (local)

- [ ] `cp capacitor.parceros.release.ts capacitor.config.ts`
- [ ] `npm install && npm run build`
- [ ] If `ios/` folder does not exist for Parceros: `npx cap add ios`
- [ ] `npx cap sync ios`
- [ ] `npx cap open ios`
- [ ] In Xcode:
  - [ ] Signing & Capabilities → Team set, Bundle Id =
        `com.staflyapps.parceros`
  - [ ] Deployment Target: iOS 14.0 or higher
  - [ ] Devices: iPhone (iPad optional; if disabled, no iPad screenshots
        needed)
  - [ ] Display Name: `Parceros`
  - [ ] Version: `1.0.0`, Build: `1`

## D. Info.plist — required keys for v1

Add/verify in `ios/App/App/Info.plist`:

```xml
<!-- HTTPS only (no ATS exceptions) -->
<key>NSAppTransportSecurity</key>
<dict>
  <key>NSAllowsArbitraryLoads</key><false/>
</dict>

<!-- App-Bound Domains (because release config enables
     limitsNavigationsToAppBoundDomains). Max 10 entries. -->
<key>WKAppBoundDomains</key>
<array>
  <string>staflyapps.com</string>
  <string>www.staflyapps.com</string>
  <string>jplhtputzixwqarqlrth.supabase.co</string>
</array>

<!-- Launch screen background to match coral splash -->
<key>UILaunchStoryboardName</key>
<string>LaunchScreen</string>
```

**Do NOT add for v1** (kept out to simplify App Review):
- `NSCameraUsageDescription`
- `NSPhotoLibraryUsageDescription` / `NSPhotoLibraryAddUsageDescription`
- `NSLocationWhenInUseUsageDescription`
- `NSMicrophoneUsageDescription`
- `NSContactsUsageDescription`

If any of these are accidentally present, the app prompts users for
permissions it never uses → instant rejection risk. Verified that Parceros
v1 surfaces (`/parceros`, `/parceros/flash`, `/parceros/channels`,
`/parceros/channel/:id`, `/parceros/flash/:id`) only render avatars from
URLs and never invoke gallery/camera.

## E. App-Bound Domains note

The release config sets `limitsNavigationsToAppBoundDomains: true`. This is
a security/App Review hardening that restricts the webview to the listed
origins. If a new third-party origin is ever loaded (analytics widget,
embedded video, etc.), it must be added to `WKAppBoundDomains` **or** the
flag must be removed before the build will work.

Current allowed origins for Parceros v1:
- `staflyapps.com` (and `www.`) — production frontend
- `jplhtputzixwqarqlrth.supabase.co` — Lovable Cloud backend

## F. App Store Connect — App Information

- [ ] Subtitle (30 chars): `Comunidad de trabajadores`
- [ ] Category Primary: **Business**
- [ ] Category Secondary: **Social Networking** (optional)
- [ ] Content Rights: ☐ Contains third-party content → **No**
- [ ] Age Rating: **4+** (no objectionable content)
- [ ] Privacy Policy URL: `https://staflyapps.com/privacy`
- [ ] License Agreement: Apple's Standard EULA (default)

## G. Pricing & Availability

- [ ] Price: **Free**
- [ ] Availability: All territories where Stafly operates (default: all).

## H. App Privacy ("Nutrition Label")

Declare exactly what the app collects in v1:

| Data type | Linked to user | Used for | Tracking? |
|---|---|---|---|
| Name | Yes | App Functionality, Account Auth | No |
| Phone Number | Yes | App Functionality, Account Auth | No |
| Email Address | Yes | App Functionality, Account Auth | No |
| User ID (Supabase) | Yes | App Functionality | No |
| Other User Content (channel messages) | Yes | App Functionality | No |
| Coarse Location | **Not collected in v1** | — | — |
| Precise Location | **Not collected in v1** | — | — |
| Photos | **Not collected in v1** | — | — |

- [ ] Data is **not** used for tracking across apps/sites.
- [ ] Data is encrypted in transit (TLS).
- [ ] Confirm form saved.

## I. Version 1.0.0 page

- [ ] Promotional text (170): see `docs/PARCEROS_LAUNCH_ASSETS.md`
- [ ] Description (4000): see `docs/PARCEROS_LAUNCH_ASSETS.md` (full ES + EN)
- [ ] Keywords (100): see `docs/PARCEROS_LAUNCH_ASSETS.md`
- [ ] Support URL: `https://staflyapps.com/support` (placeholder OK)
- [ ] Marketing URL: `https://staflyapps.com/parceros`
- [ ] Copyright: `© 2026 Stafly Apps`
- [ ] Sign-in info for review: provide a demo phone + OTP bypass note (or
      a TestFlight tester account). **Do not** use a real worker's phone.
- [ ] Contact Info for review: `info@staflyapps.com`
- [ ] Notes for reviewer:
      > "Parceros is a community app for workers. Sign in with the demo
      > number provided. Public signup is disabled by design; testers
      > should use the seeded account."

## J. Build upload (TestFlight)

- [ ] Xcode → Product → Archive
- [ ] Organizer → Distribute App → App Store Connect → Upload
- [ ] Wait for "Processing" → "Ready to Test"
- [ ] Run full `docs/PARCEROS_NATIVE_QA_MATRIX.md` on TestFlight build
      (internal testers).

## K. Screenshots (upload before submit)

- [ ] iPhone 6.7" (1290 × 2796) — 3 to 10 images
- [ ] iPhone 6.5" (1284 × 2778 or 1242 × 2688) — 3 to 10 images
- [ ] iPad — **only if** the app is offered for iPad (default v1: no)

See `docs/PARCEROS_LAUNCH_ASSETS.md` §4 for the screenshot script.

## L. Submit for review

- [ ] All sections show ✅ in App Store Connect
- [ ] Export Compliance: uses only standard encryption (HTTPS) →
      eligible for the ITSAppUsesNonExemptEncryption=false exemption.
- [ ] Submit for Review.

## M. Common rejection guardrails (read before submit)

- ❌ Login required without a demo account → provide test credentials.
- ❌ Mentioning Beta/TestFlight in copy → remove.
- ❌ Mentioning Android/Google Play in copy → remove.
- ❌ Permissions requested but unused → unused strings removed in §D.
- ❌ Webview that loads a remote URL not under your control → release
      config has no `server.url`, this is satisfied.
- ❌ Links to alternative payment systems → none in v1.
- ❌ Placeholder text or Lorem ipsum on any screen → QA matrix covers.
