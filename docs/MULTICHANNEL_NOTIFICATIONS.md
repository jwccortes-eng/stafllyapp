# Multichannel Notifications — Architecture & Next Steps

## Current State (v1 — In-App Only)

Notifications are fully operational via:
- **Database trigger** `trg_notify_on_shift_assignment` on `shift_assignments` table
- **Realtime subscription** in `useNotifications` hook (Supabase `postgres_changes`)
- **UI**: Toast (sonner), sound (Web Audio API 3-tone), badge counter, native `Notification` API
- **Content**: Rich body with shift title, code, date, time, client, location, meeting point
- **Metadata**: JSON with `shift_id`, `date`, `start_time`, `end_time`, `client`, `location`

Additional triggers exist for:
- `trg_notify_managers_on_shift_request` — new shift requests
- `trg_notify_shift_change` — shift updates
- `trg_notify_new_application` — new job applications
- `trg_notify_invitation_status` — invitation accepted/expired
- `trg_review_on_clockout` — review prompt after clock-out

## Phase 2 — Email Notifications

### Architecture
1. Use Lovable Cloud's built-in transactional email infrastructure
2. Create edge function `send-shift-notification-email` or use `send-transactional-email`
3. Templates needed:
   - `shift-assigned` — "You've been assigned to shift #0175 on Apr 5"
   - `shift-updated` — "Shift #0175 has been updated"
   - `shift-reminder` — "Reminder: your shift starts in 2 hours"
   - `shift-cancelled` — "Shift #0175 has been cancelled"

### Trigger Points
- After `trg_notify_on_shift_assignment` fires → enqueue email
- Option A: Add email dispatch inside the trigger function (PL/pgSQL → `net.http_post`)
- Option B: Edge function polling `notifications` table for unsent emails (batch)
- Option C: Client-side `supabase.functions.invoke('send-transactional-email')` after assignment

### Data Available in Trigger
All fields already captured in `notifications.metadata`:
```json
{
  "shift_id": "uuid",
  "date": "2026-04-05",
  "start_time": "08:00",
  "end_time": "16:00",
  "client": "EMMINENCE HALL",
  "location": "Emminence"
}
```

### Employee Email Resolution
- `employees.user_id` → `auth.users.email`
- Or store email directly on `employees` table (already has `email` field in some cases)

## Phase 3 — SMS / WhatsApp

### Architecture
1. Connect Twilio connector via `standard_connectors--connect`
2. Create edge function `send-shift-sms` that calls Twilio gateway
3. WhatsApp uses same Twilio API with `whatsapp:` prefix on phone numbers

### SMS Template
```
📋 Nuevo turno asignado
"Evento VIP" (#0175) — 05 Abr
08:00 a 16:00
📍 EMMINENCE HALL @ 4315 16ab Brooklyn
```

### WhatsApp Template
Same content, sent via Twilio WhatsApp Business API.
Requires pre-approved message template in Twilio console.

### Trigger Integration
- Add `notification_channels` column to `company_settings` (email, sms, whatsapp, push)
- Per-employee channel preferences in `employee_notification_preferences` table
- Edge function checks preferences before dispatching

## Database Schema (Future)

```sql
-- Company-level channel configuration
-- Key: 'notification_channels'
-- Value: { "email": true, "sms": false, "whatsapp": true }

-- Employee-level preferences
CREATE TABLE employee_notification_preferences (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  channel TEXT NOT NULL, -- 'email', 'sms', 'whatsapp', 'push'
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

## Priority Order for Implementation
1. ✅ In-app (done)
2. 🔜 Email via Lovable Cloud transactional emails
3. 🔜 SMS via Twilio connector
4. 🔮 WhatsApp via Twilio WhatsApp Business
5. 🔮 Push notifications via service worker / Capacitor
