## Edwin Gonzales / JKitchen Staff — Remediation plan (data-only, surgical)

Read-only audit completed. This plan ONLY targets Edwin's records and one role grant. No payroll, no time_entries, no mass changes.

---

### 1. Current state (verified)

**Auth user**: `c82849c4-a291-4c52-826b-e4b2e829f53b`

**3 employees rows for the same person:**

| # | employee_id | name | tenant | user_id | phone | email | EID | time_entries | shift_assigns | documents | invites | hist_payroll |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| A | `d5f6fdf8…` | Edwin Gonzales | Quality Staff | — | — | — | 1208 | 0 | 0 | 0 | 0 | 0 |
| B | `9d2b1cb0…` | Edwin Gonzalez | **JKitchen** | `c82849c4` | 3476783647 | jkitchenx13@gmail.com | 001 | 0 | 3 | 1 | 3 | 0 |
| C | `4c3bcf06…` | EDWIN GONZALES | Quality Staff | `c82849c4` | 3476783647 | williegonzalez17gonzalez@aol.com | — | 0 | 14 | 0 | 2 | 0 |

**Roles for `c82849c4`:**
- `user_roles` (global): `employee` ✅ correct
- `company_users`:
  - Quality Staff → `employee` ✅
  - **JKitchen → `company_owner`** ❌ wrong

**Other JKitchen owners (sanity check, NOT touching them):**
- `2bf0401f…` (Jorge / developer + founder) → `company_owner` ✅ legitimate
- `58a5f9c8…` (global admin) → `company_owner` ✅ likely legitimate (separate review)
- `c82849c4…` (Edwin) → `company_owner` ❌ the only suspicious one

**Zero payroll exposure**: 0 time_entries, 0 payroll_adjustments, 0 historical_payroll on all three records.

---

### 2. Decisions

**B (`9d2b1cb0…`, JKitchen)** = keeper. Real worker, has auth, real email, has shift_assignments (3) and 1 document and 3 invites.

**C (`4c3bcf06…`, Quality)** = keep ACTIVE but UNLINK auth. It has 14 shift_assignments — historical roster activity. We do NOT migrate it (different tenant). We just remove the wrong `user_id` link so this auth user stops resolving to a Quality employee.

**A (`d5f6fdf8…`, Quality #1208)** = mark as duplicate of C and deactivate. Zero dependencies. Safe.

> Open question for the user: confirm Edwin currently works only at JKitchen (not at Quality anymore). If he still works at Quality, decision for C may change — see Risk #3.

---

### 3. Exact changes (4 statements, all reversible)

```sql
BEGIN;

-- 3.1 Revoke wrong company_owner role on JKitchen
DELETE FROM company_users
WHERE user_id = 'c82849c4-a291-4c52-826b-e4b2e829f53b'
  AND company_id = 'b653f344-b07a-44a2-ae2c-cf06bfb0645a'
  AND role = 'company_owner';

-- 3.2 Re-grant correct role: employee on JKitchen
INSERT INTO company_users (user_id, company_id, role)
VALUES ('c82849c4-a291-4c52-826b-e4b2e829f53b',
        'b653f344-b07a-44a2-ae2c-cf06bfb0645a',
        'employee')
ON CONFLICT DO NOTHING;

-- 3.3 Unlink wrong auth from Quality duplicate (keeps record + history intact)
UPDATE employees
SET user_id = NULL,
    notes = COALESCE(notes,'') ||
            E'\n[2026-05-02] user_id unlinked: same auth was duplicated in JKitchen #001 (keeper).'
WHERE id = '4c3bcf06-6a34-4fd5-bdce-826f91825be0'
  AND user_id = 'c82849c4-a291-4c52-826b-e4b2e829f53b';

-- 3.4 Deactivate orphan Quality #1208 (no auth, no history, true duplicate of C)
UPDATE employees
SET is_active = false,
    notes = COALESCE(notes,'') ||
            E'\n[2026-05-02] Deactivated: duplicate of 4c3bcf06… (same person, EID 1208 was unused).'
WHERE id = 'd5f6fdf8-006c-49fa-9dbe-c372bd06b85b'
  AND is_active = true;

-- COMMIT only after verifying counts (see §5)
COMMIT;
```

---

### 4. Tables touched (scope summary)

| Table | Rows changed | Operation |
|---|---|---|
| `company_users` | 1 deleted, 1 inserted | role re-grant |
| `employees` | 2 updated | unlink user_id, deactivate orphan |

**NOT touched**: `time_entries`, `payroll_adjustments`, `scheduled_shifts`, `shift_assignments`, `historical_payroll_entries`, `employee_documents`, `employee_invitations`, `user_roles`, `auth.users`, `pay_periods`.

---

### 5. Pre-commit verification (inside the transaction)

```sql
-- Must show: 1 (employee on JKitchen)
SELECT count(*) FROM company_users
WHERE user_id = 'c82849c4-a291-4c52-826b-e4b2e829f53b'
  AND company_id = 'b653f344-b07a-44a2-ae2c-cf06bfb0645a';

-- Must show: 1 row (only the JKitchen keeper)
SELECT id, company_id, is_active
FROM employees WHERE user_id = 'c82849c4-a291-4c52-826b-e4b2e829f53b';

-- Quality dupe still active, no auth, history preserved
SELECT id, is_active, user_id,
  (SELECT count(*) FROM shift_assignments WHERE employee_id = '4c3bcf06-6a34-4fd5-bdce-826f91825be0') AS assigns
FROM employees WHERE id = '4c3bcf06-6a34-4fd5-bdce-826f91825be0';

-- Orphan inactive
SELECT id, is_active FROM employees WHERE id = 'd5f6fdf8-006c-49fa-9dbe-c372bd06b85b';
```

If anything is off → `ROLLBACK`.

---

### 6. Rollback plan (if needed after commit)

```sql
BEGIN;
INSERT INTO company_users (user_id, company_id, role)
VALUES ('c82849c4-a291-4c52-826b-e4b2e829f53b',
        'b653f344-b07a-44a2-ae2c-cf06bfb0645a','company_owner')
ON CONFLICT DO NOTHING;

DELETE FROM company_users
WHERE user_id = 'c82849c4-a291-4c52-826b-e4b2e829f53b'
  AND company_id = 'b653f344-b07a-44a2-ae2c-cf06bfb0645a'
  AND role = 'employee';

UPDATE employees SET user_id = 'c82849c4-a291-4c52-826b-e4b2e829f53b'
WHERE id = '4c3bcf06-6a34-4fd5-bdce-826f91825be0';

UPDATE employees SET is_active = true
WHERE id = 'd5f6fdf8-006c-49fa-9dbe-c372bd06b85b';
COMMIT;
```

---

### 7. Risks

1. **Login flow**: After fix, Edwin logs in → `useAuth` finds 1 employee (JKitchen). `useEffectiveEmployee` resolves correctly. Portal works as before — possibly even better (was probably confused between 2 records).
2. **JKitchen admin UI for him**: He will lose any "Panel Admin" access in JKitchen. That is the intended fix (he is not an owner).
3. **If Edwin DOES still work at Quality**: Step 3.3 unlinks his auth but keeps the Quality record active → admins can still see him as a roster worker. He just can't access Quality's portal as himself anymore until a fresh `user_id` link is added later. Confirm with user before running 3.3 if uncertain.
4. **Other JKitchen owners** (`58a5f9c8…`): out of scope here. Flagged as a separate audit item.

---

### 8. Post-fix validations (manual / UI)

1. Login as `c82849c4` → lands in `/portal` for JKitchen by default. No "Panel Admin" button.
2. Switch tenant context to Quality → no employee resolved, no portal data leaked.
3. Admin (Jorge) opens Workers in JKitchen → Edwin still listed, profile intact, 3 shift_assignments visible.
4. Admin opens Workers in Quality → only `4c3bcf06…` shows (active), `d5f6fdf8…` hidden (inactive). No history lost.
5. No row reappears in the Workers Data Quality risk panel as "broken".

---

### 9. What this plan deliberately does NOT do

- Does NOT delete any row.
- Does NOT migrate `shift_assignments` / `documents` / `invitations` between tenants.
- Does NOT touch `auth.users`.
- Does NOT touch `58a5f9c8…` (other JKitchen owner) — separate review.
- Does NOT change Edwin's name spelling, EID, phone, or email.
- Does NOT consolidate Edwin across tenants — that requires a deeper cross-tenant identity decision.

Approve to switch to default mode and execute the 4 statements inside one transaction with the §5 verification gate.