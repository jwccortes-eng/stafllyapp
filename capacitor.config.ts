import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Stafly Core — RELEASE Capacitor config (App Store / Play Store builds).
 *
 * This file is NOT picked up automatically. To produce a Stafly Core release
 * build, copy it over `capacitor.config.ts` locally before running
 * `npx cap sync`. See docs/MOBILE_RELEASE.md.
 *
 * Differences vs the dev `capacitor.config.ts`:
 *   - NO `server.url` block: the release bundle must ship `dist/` so Apple
 *     does not flag it for loading remote code.
 *   - Same bundle id as today (`com.staflyapps.app`) to preserve any prior
 *     TestFlight builds, certificates, and the existing Apple App ID.
 *
 * IMPORTANT: this config is for the future release pipeline. The current
 * dev `capacitor.config.ts` is intentionally untouched so the Lovable preview
 * keeps working.
 */
const config: CapacitorConfig = {
  appId: 'com.staflyapps.app',
  appName: 'Stafly',
  webDir: 'dist',
  ios: {
    scheme: 'Stafly',
    contentInset: 'always',
  },
  android: {
    path: 'android',
  },
};

export default config;
