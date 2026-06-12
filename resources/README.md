# App Icons & Native Assets

Source icon for iOS / Android builds (Capacitor).

## Files
- `icon.png` — 1024x1024 master app icon (Stafly Core Workforce)
- `icon-only.png` — same master, used by `@capacitor/assets`
- `icon-foreground.png` — Android adaptive foreground (1024x1024)
- `icon-background.png` — Android adaptive background (1024x1024)

## Generate iOS / Android assets

After `git pull` on your local machine:

```bash
npm install
npx cap add ios          # only the first time
npm i -D @capacitor/assets
npx capacitor-assets generate --ios
npx cap sync ios
npx cap open ios
```

This regenerates `ios/App/App/Assets.xcassets/AppIcon.appiconset/` with all
required iOS sizes (20–1024pt @1x/@2x/@3x) from `resources/icon.png`.

Then archive and upload to App Store Connect / TestFlight — the placeholder
gray icon will be replaced by the Stafly Core Workforce icon.
