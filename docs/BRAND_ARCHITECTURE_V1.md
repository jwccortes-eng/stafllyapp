# Brand Architecture v1

## Hierarchy

- **Stafly** — Ecosystem / parent brand.
- **Stafly Core** — Customer-facing name for the B2B workforce operations platform
  (workers, shifts, attendance, payroll, documents, clients, kiosk, worker portal,
  admin command center). Internally still referred to as "StaflyApps".
- **Parceros** — Marketplace / community product (channels, opportunities, flash
  jobs, ambassadors, campaigns).

## Core message

ES: *Stafly Core organiza la operación. Parceros crea las oportunidades. Stafly conecta el ecosistema.*

EN: *Stafly Core powers the operation. Parceros powers the opportunity. Stafly connects the ecosystem.*

## What changed in v1

Visual / customer-facing rebrand only. The wordmark in `StaflyBrand` now reads
**Stafly Core · by Stafly**, and visible labels across login, landing, legal,
help, kiosk, PDFs (manual / passport / shift), migration tooling and admin
copy were updated from "StaflyApps" → "Stafly Core".

## What did NOT change (intentional)

These remain as `StaflyApps` / `staflyapps` because they are technical
identifiers, not customer copy:

- Capacitor `appId` (`com.staflyapps.app`)
- Production domain (`staflyapps.com`) and email addresses (`*@staflyapps.com`)
- Supabase project ref / database tables / RLS policies / routes
- Env vars, package names, internal code variables
- `src/lib/export-chatgpt-prompt-pdf.ts` (internal documentation generator)
- Header comments in `src/components/brand/StaflyBrand.tsx`

## Hard rules (still in force)

- No DB / RLS / auth / payroll / time_entries / scheduled_shifts / attendance /
  period_base_pay / documents / portal / kiosk / tenant-isolation changes as
  part of this rebrand.
- Payroll continues to use **real `time_entries` / clocked hours only** —
  never scheduled hours.
- Renaming of DB schema / routes / project requires a separate, explicitly
  approved technical migration.
