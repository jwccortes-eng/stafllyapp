# Parceros — Native Build QA Matrix

Run **every** test below on **both** iOS (TestFlight build) and Android
(Closed Testing `.aab`) before promoting to App Store / Play production.

Tester guidance:
- Use the seeded **Stafly Demo** tenant account (PIN 123456) — never real
  worker data. See [`Stafly Demo Environment`](mem://features/stafly-demo-environment).
- Run on at least 1 simulator/emulator **and** 1 physical device per
  platform.
- Capture screenshots of any FAIL with device + iOS/Android version.
- A single FAIL on a P0 item blocks store submission.

Legend: ☐ pending · ✅ pass · ❌ fail · N/A not applicable

---

## P0 — Launch blockers (must all pass)

### Boot & shell

| # | Test | iOS sim | iPhone real | Android emu | Pixel real |
|---|---|---|---|---|---|
| 1 | App launches without white screen | ☐ | ☐ | ☐ | ☐ |
| 2 | Splash shows coral background (`#FF6B5A`) ~1.5s | ☐ | ☐ | ☐ | ☐ |
| 3 | App icon renders correctly on home screen | ☐ | ☐ | ☐ | ☐ |
| 4 | App name on home screen is `Parceros` | ☐ | ☐ | ☐ | ☐ |
| 5 | No "Stafly" branding visible anywhere | ☐ | ☐ | ☐ | ☐ |
| 6 | Status bar / notch padding correct | ☐ | ☐ | ☐ | ☐ |
| 7 | No `localhost` / sandbox / `lovableproject.com` requests in network log | ☐ | ☐ | ☐ | ☐ |

### Auth & routing

| # | Test | iOS sim | iPhone real | Android emu | Pixel real |
|---|---|---|---|---|---|
| 8 | Cold open with no session → lands on `/auth?from=parceros` | ☐ | ☐ | ☐ | ☐ |
| 9 | `/auth?from=parceros` shows Parceros coral branding + ES copy | ☐ | ☐ | ☐ | ☐ |
| 10 | No copy mentions payroll, clock in/out or admin | ☐ | ☐ | ☐ | ☐ |
| 11 | Phone OTP login completes end-to-end | ☐ | ☐ | ☐ | ☐ |
| 12 | After login, lands on `/parceros` (not `/app`, not `/portal`) | ☐ | ☐ | ☐ | ☐ |
| 13 | Logout returns to `/auth?from=parceros` and clears session | ☐ | ☐ | ☐ | ☐ |
| 14 | Public signup is blocked (no signup CTA visible) | ☐ | ☐ | ☐ | ☐ |

### Parceros surfaces

| # | Test | iOS sim | iPhone real | Android emu | Pixel real |
|---|---|---|---|---|---|
| 15 | `/parceros` Radar renders | ☐ | ☐ | ☐ | ☐ |
| 16 | `/parceros/channels` renders list | ☐ | ☐ | ☐ | ☐ |
| 17 | `/parceros/flash` renders flash jobs list | ☐ | ☐ | ☐ | ☐ |
| 18 | Channel detail (`/parceros/channel/:id`) opens and back works | ☐ | ☐ | ☐ | ☐ |
| 19 | Flash detail (`/parceros/flash/:id`) opens and back works | ☐ | ☐ | ☐ | ☐ |
| 20 | Bottom tabs navigate without full reload | ☐ | ☐ | ☐ | ☐ |
| 21 | No admin / Stafly Core nav entries visible | ☐ | ☐ | ☐ | ☐ |
| 22 | No payroll / clock / shifts entries visible | ☐ | ☐ | ☐ | ☐ |

### Permissions hygiene (v1 = minimal)

| # | Test | iOS sim | iPhone real | Android emu | Pixel real |
|---|---|---|---|---|---|
| 23 | No location permission prompt anywhere | ☐ | ☐ | ☐ | ☐ |
| 24 | No camera permission prompt anywhere | ☐ | ☐ | ☐ | ☐ |
| 25 | No photo library permission prompt anywhere | ☐ | ☐ | ☐ | ☐ |
| 26 | No notifications permission prompt anywhere | ☐ | ☐ | ☐ | ☐ |
| 27 | No microphone / contacts / calendar prompt | ☐ | ☐ | ☐ | ☐ |

### Legal & metadata

| # | Test | iOS sim | iPhone real | Android emu | Pixel real |
|---|---|---|---|---|---|
| 28 | `/privacy` opens, no horizontal overflow, mentions Parceros | ☐ | ☐ | ☐ | ☐ |
| 29 | `/terms` opens, no horizontal overflow, mentions Parceros | ☐ | ☐ | ☐ | ☐ |
| 30 | `/cookies` opens, no horizontal overflow | ☐ | ☐ | ☐ | ☐ |
| 31 | Support email `info@staflyapps.com` visible in legal pages | ☐ | ☐ | ☐ | ☐ |

---

## P1 — Strongly recommended before public release

| # | Test | iOS | Android |
|---|---|---|---|
| 32 | Background → foreground keeps current route + session | ☐ | ☐ |
| 33 | Airplane mode → friendly error, no crash | ☐ | ☐ |
| 34 | Slow 3G throttling → UI degrades gracefully | ☐ | ☐ |
| 35 | Dark mode (system) does not break readability | ☐ | ☐ |
| 36 | Dynamic Type / font-scale 130% does not clip critical text | ☐ | ☐ |
| 37 | Hardware back button (Android) navigates within app | N/A | ☐ |
| 38 | Swipe back gesture (iOS) works on detail screens | ☐ | N/A |
| 39 | Deep link `https://staflyapps.com/parceros/flash/:id` opens app (if Universal/App Links configured — optional v1) | ☐ | ☐ |
| 40 | Rotating to landscape doesn't break layout (or is locked to portrait) | ☐ | ☐ |
| 41 | Memory after 5 min navigation < 250 MB | ☐ | ☐ |
| 42 | No console errors in Xcode/Logcat during full flow | ☐ | ☐ |

---

## P2 — Nice to have

| # | Test | iOS | Android |
|---|---|---|---|
| 43 | App responds to system locale change (ES↔EN) | ☐ | ☐ |
| 44 | Pull-to-refresh works on Radar / Channels / Flash | ☐ | ☐ |
| 45 | Haptic feedback on flash-job apply (iOS) | ☐ | N/A |
| 46 | App removes itself cleanly on uninstall (no leftover data) | ☐ | ☐ |

---

## Sign-off

| Role | Name | Date | Build | Verdict |
|---|---|---|---|---|
| QA | | | iOS `1.0.0 (1)` | ☐ PASS / ☐ FAIL |
| QA | | | Android `1.0.0 (1)` | ☐ PASS / ☐ FAIL |
| Product owner | | | | ☐ APPROVED for TestFlight / Closed Testing |
| Product owner | | | | ☐ APPROVED for App Store / Play production |

Attach failing-test screenshots and device specs in the sprint thread
before re-running the matrix.
