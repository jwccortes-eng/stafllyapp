import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Parceros — RELEASE Capacitor config (App Store / Play Store builds).
 *
 * This file is NOT picked up automatically. To produce a Parceros release
 * build, copy it over `capacitor.config.ts` locally before running
 * `npx cap sync`. See docs/MOBILE_RELEASE.md.
 *
 * Differences vs the dev `capacitor.config.ts`:
 *   - Unique bundle id (`com.staflyapps.parceros`) so Parceros and Stafly Core
 *     can coexist on a device and be published as separate apps.
 *   - `appName: "Parceros"` — what the user sees under the home-screen icon.
 *   - NO `server.url` block: Apple rejects builds that load remote code from
 *     a non-app-bundle URL. Release ships the bundled `dist/` only.
 *   - NO `cleartext`: HTTPS only.
 *   - Separate native folders so iOS scheme + Android module are isolated
 *     from Stafly Core.
 *   - SplashScreen tuned to Parceros coral brand (#FF6B5A).
 *   - iOS `limitsNavigationsToAppBoundDomains: true` — App Review hardening.
 *     Requires `WKAppBoundDomains` in Info.plist listing every origin the
 *     webview is allowed to navigate to (staflyapps.com + Supabase). See
 *     docs/PARCEROS_APP_STORE_CHECKLIST.md §"App-Bound Domains".
 *
 * IMPORTANT: this config is for the future release pipeline. Do not commit
 * the copy step into CI yet — the user manages Apple/Play accounts manually.
 */
const config: CapacitorConfig = {
  appId: 'com.staflyapps.parceros',
  appName: 'Parceros',
  webDir: 'dist',
  bundledWebRuntime: false,
  ios: {
    scheme: 'Parceros',
    contentInset: 'always',
    limitsNavigationsToAppBoundDomains: true,
  },
  android: {
    path: 'android-parceros',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: true,
      backgroundColor: '#FF6B5A',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: false,
    },
  },
};

export default config;
