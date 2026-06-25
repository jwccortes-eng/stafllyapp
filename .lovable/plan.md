
# Ecosystem Identity Checkpoint (EIC) — Plan técnico

> Objetivo: dejar de parchar caso por caso. Un único **checkpoint reutilizable** que toda creación/activación de worker debe atravesar, en cualquier company, hoy y futura. Tenant-safe, sin tocar payroll, sin copiar documentos.

---

## 1. Root cause real

**Por qué MSS no pasó por identity checkpoint:**
- Smart Identity Resolution **existe pero solo vive dentro de un edge function**: `supabase/functions/resolve-applicant-identity/index.ts`. Está cableado únicamente al flujo `/apply/:slug` (applications públicas).
- Los **demás flujos de creación** llaman directo a `supabase.from("employees").insert(...)` o a importadores bulk sin invocar ese resolver.
- Los helpers existentes (`findExistingEmployeeInCompany` en `src/lib/employee-duplicates.ts`, `computeDuplicateHints` en `src/lib/employee-duplicate-hints.ts`) son **intra-company únicamente** (filtran `.eq("company_id", X)`). No miran ecosistema.
- MSS fue cargado vía import bulk → bypass total.

**Flujos que SÍ usan algún identity matching hoy:**
| Flujo | Qué usa | Scope |
|---|---|---|
| `/apply/:slug` (public application) | `resolve-applicant-identity` edge fn | Intra-company (filtra por `company_id`) |
| Quick Add en EmployeeCombobox | `findExistingEmployeeInCompany` | Intra-company |
| Assignment selector | `computeDuplicateHints` | Intra-company, solo hint visual |
| Onboarding wizard | `resolve-applicant-identity` | Intra-company |

**Flujos que NO lo usan:**
- Full form de creación de employee (`/app/employees` → "Add worker")
- Bulk imports (`import-inactive-employees`, `bulk-import-shifts`, MSS roster load)
- `invite-admin`, `send-employee-credentials`
- Referrals (`referral-submit`)
- Migration sync (`migration-employee-sync`)
- Cualquier `INSERT INTO employees` directo desde UI admin

**Gap exacto:**
1. **Scope:** todo lookup es company-local. Nadie consulta cross-tenant.
2. **Cobertura:** solo 1 de ~8 entry points pasa por el resolver.
3. **Modelo:** `employees` se trata como "persona", no como "membership de persona en company". No hay un identificador estable ecosistema → la única vía de unión hoy es `auth.users.id` vía `employees.user_id`, y solo está poblado en ~9 humanos.

---

## 2. Diseño de solución ecosistema

### 2.1 Dónde vive el checkpoint

**Cliente:** un único hook + componente UI.
- `src/lib/identity/ecosystem-lookup.ts` — funciones puras de normalización y scoring (testeable).
- `src/hooks/useEcosystemIdentityCheck.tsx` — React Query hook que ejecuta el lookup y devuelve `{ matches, recommendation, auditPayload }`.
- `src/components/identity/EcosystemIdentityCheckpoint.tsx` — UI compartida: drawer/modal con HIGH/MEDIUM/LOW matches y acciones permitidas.

**Servidor (P0, sin nueva tabla):** un RPC SECURITY DEFINER **read-only y tenant-safe**:
- `public.ecosystem_identity_lookup(p_phone text, p_email text, p_first_name text, p_last_name text)` →
  - Busca en `employees` cross-company por phone normalizado / email lower / nombre normalizado.
  - Devuelve **payload mínimo y enmascarado**: `{ employee_id, company_id, company_name, has_user_id, is_active, masked_name, masked_phone, masked_email, match_strength, match_reasons[] }`.
  - **Nunca** expone SSN, documentos, payroll, compensación, notas, dirección, ni nombre completo si el caller no es admin de esa company.
  - `GRANT EXECUTE TO authenticated`. Internamente verifica que el caller tenga rol admin/owner en **al menos una company activa** (gate básico anti-scraping); developer/owner global ven todo sin enmascarar.

**Servidor (P0):** RPC de attach:
- `public.identity_attach_to_company(p_source_employee_id uuid, p_target_company_id uuid, p_confirmation_token text)` →
  - Solo permite si el caller es admin de `p_target_company_id`.
  - Solo crea **un nuevo `employees` row en la target company** con `user_id` heredado (si existe y `match_strength='HIGH'`).
  - **No copia**: documentos, compensación, rates, financial, payroll, shifts, time_entries, assignments, ratings.
  - Escribe `activity_log` (audit obligatorio) con `action='identity_attach'`, `metadata={source_employee_id, source_company_id, match_reasons}`.
  - Devuelve el nuevo `employees.id` en la target company.

### 2.2 Reutilización por flujo

Todos los flujos consumen **el mismo hook + UI**:

| Flujo | Punto de integración | Comportamiento |
|---|---|---|
| Quick Add (`EmployeeCombobox`) | Antes de crear → llama checkpoint | HIGH match → ofrece "Activar para esta company" |
| Full Form (`/app/employees` create) | Step inicial obligatorio | HIGH/MEDIUM bloquea "Crear nuevo" hasta confirmar |
| `/apply/:slug` | Reemplaza interno de `resolve-applicant-identity` con el mismo RPC | Mantiene scenarios actuales + extiende a cross-tenant suggestion |
| Bulk Import (CSV/Connecteam) | P0: dry-run report. P1: blocking review queue | Genera CSV de matches HIGH/MEDIUM antes de insertar |
| Invitations (`invite-admin`, `send-employee-credentials`) | Llama checkpoint antes de generar invite | Si HIGH existe → "Reactivar / Asignar" |
| Referrals (`referral-submit`) | Hoy ya hace dedupe por phone → extender a checkpoint | Marca referral con `existing_ecosystem_match=true` |
| Campaigns / Parceros futuros | Mismo hook | Vía consent layer (P2) |

**Patrón obligatorio (lint rule en P1):** ningún `from("employees").insert(...)` directo en código nuevo. Centralizar en `createEmployeeViaCheckpoint()`.

---

## 3. Flujo UX (3–4 clicks)

```text
[Admin tipea nombre/teléfono]
        │
        ▼  (1) Search/create worker  — onBlur dispara lookup ecosistema
[Checkpoint Drawer]
  ┌─────────────────────────────────────────────┐
  │ Posible coincidencia encontrada             │
  │ • Maria L. — Quality Staff (HIGH · phone)   │
  │ • Maria L. — JKitchen (MEDIUM · name)       │
  │                                             │
  │ [Es la misma persona]  [Crear nueva]        │
  └─────────────────────────────────────────────┘
        │
        ▼  (2) Confirm identity  — admin selecciona HIGH match
[Confirmación tenant-safe]
  ┌─────────────────────────────────────────────┐
  │ Activarás a Maria L. para MSS               │
  │ Reutiliza acceso portal: SÍ                 │
  │ No se copian documentos, payroll, ratings.  │
  │                                             │
  │ [Cancelar]   [Activar para MSS]             │
  └─────────────────────────────────────────────┘
        │
        ▼  (3) Activate for company  — RPC identity_attach_to_company
[Done]
        │
        ▼  (4) Optional: Send portal invite / open profile
```

**Mobile:** mismo flujo en bottom sheet (`MobileQueueDrawer` reutilizado). Máx 4 taps.

---

## 4. Reglas de match

Implementadas en `src/lib/identity/ecosystem-lookup.ts`:

| Strength | Regla | Acción permitida |
|---|---|---|
| **HIGH** | (phone normalizado + nombre normalizado coinciden) **o** (email lower + nombre) **o** mismo `user_id` ya vinculado en otra company | Attach directo con confirmación humana 1-click |
| **MEDIUM** | phone solo **o** email solo **o** nombre+apellido normalizado con fuzzy score ≥ 0.9 | Requiere revisión manual; UI muestra pero no permite 1-click attach |
| **LOW** | nombre similar fonético / Levenshtein bajo | Solo mostrar como hint; **prohibido attach** |

Normalización reutiliza helpers ya probados: `normalizePhone`, `normalizeEmployeeEmail`, `normalizeText` + `phoneticKey` de `employee-search.ts`. **Sin reimplementar**.

---

## 5. Data model

### P0 (sin tocar passport)
- **Sin nuevas tablas.** Reusamos `employees` + `auth.users.id` como puente.
- Convención: si dos `employees` rows comparten `user_id`, son **la misma persona** en companies distintas. Si no hay `user_id`, el RPC retorna candidatos pero el link humano lo confirma el admin.
- Una columna opcional **no destructiva** en `employees`: `linked_via_checkpoint_at timestamptz NULL`, `linked_from_employee_id uuid NULL` (audit forense). No cambia RLS ni queries existentes.

### P1 (review queue + bulk)
- Tabla `identity_review_queue` para imports/bulk: filas `pending|approved|rejected` con `proposed_action`, `match_payload`, `reviewer_id`. Tenant-scoped.

### P2 (passport real)
- Adoptar `worker_profiles` como passport con `UNIQUE(employee_id)` y tabla puente `worker_passport_links(passport_id, employee_id, company_id)`.
- Migración data: backfill desde `linked_via_checkpoint_at`.
- Consent layer para documentos (`worker_consent_records` ya existe — extender).

### Relación auth.users ↔ employees multi-company
- 1 `auth.users` → N `employees` (uno por company).
- EIC propone reutilizar `user_id` solo si HIGH match → portal único cross-company para esa persona.
- `worker_profiles` actual no se rompe: seguimos sin escribir ahí en P0/P1.

---

## 6. Guardrails obligatorios (en el RPC + en el hook)

Antes de cualquier create/import:
1. **Normalizar** phone (10 dígitos) y email (lower+trim) — usar helpers existentes.
2. **Lookup ecosistema** vía RPC `ecosystem_identity_lookup`.
3. **Lookup auth.users** vía `has_user_id` flag del RPC (no exponemos el id raw cross-tenant).
4. **Warning UI** bloqueante si hay HIGH match.
5. **No permitir** `createEmployee` sin pasar por `EcosystemIdentityCheckpoint` (lint + runtime assert en P1).
6. **Audit log obligatorio** en `activity_log`: `identity_lookup`, `identity_attach`, `identity_skip_with_confirmation`.
7. **No bulk auto-attach.** Imports generan review queue, nunca attach sin click humano.
8. **Rate-limit** del RPC: 60 calls/min/usuario para evitar scraping cross-tenant.

---

## 7. Plan de implementación

### P0 (este sprint — Ecosystem Identity Checkpoint v1)
1. Migración: RPC `ecosystem_identity_lookup` (SECURITY DEFINER, masked payload, admin-only) + RPC `identity_attach_to_company` + 2 columnas audit en `employees` + GRANTs.
2. `src/lib/identity/ecosystem-lookup.ts` (puro, testeado).
3. `src/hooks/useEcosystemIdentityCheck.tsx` (React Query).
4. `src/components/identity/EcosystemIdentityCheckpoint.tsx` (drawer reutilizable mobile+desktop).
5. **Wire-in obligatorio:**
   - MSS activation flow (botón "Activar workers existentes" en `/app/employees` cuando company = MSS y hay matches HIGH con QS).
   - Quick Add (`EmployeeCombobox` "Add new").
   - Full Form (`/app/employees` create dialog).
6. Imports: solo **dry-run report** descargable, no blocking todavía.
7. Tests: matching rules + RPC tenant-safety.

### P1
1. Bulk imports con blocking review queue (`identity_review_queue` tabla).
2. Invitations, referrals, applications adoptan el checkpoint.
3. Global review queue UI en `/app/identity-review` (developer/owner only).
4. ESLint rule + runtime assert: prohibir `employees.insert` directo.

### P2
1. Passport real (`worker_profiles` con UNIQUE) + tabla puente.
2. Consent layer para documentos (`worker_consent_records` extendido).
3. Publicación controlada de documentos por company con doble consent (worker + company source).

---

## 8. Qué NO se toca

Confirmado bajo zero-write contract:
- auth core, RLS sin aprobación, payroll calculations, time_entries, scheduled_shifts, shift_assignments, employee_documents reales, worker_documents, payments, bookings, chat, edge functions críticas, production data fuera del cambio aprobado, companies/tenants, campaigns activas, partner logic.

Activar `user_id` o portal access **no** activa payroll. Payroll sigue dependiendo de `time_entries` reales (regla raíz del proyecto).

---

## 9. Criterios de aceptación

- [ ] Ningún flujo principal puede crear worker sin pasar por `EcosystemIdentityCheckpoint`.
- [ ] MSS puede activar workers existentes de QS sin crear `auth.users` duplicado.
- [ ] Quick Add muestra matches antes de crear.
- [ ] Full Form muestra matches antes de crear.
- [ ] Import genera dry-run de duplicados antes de insertar (P0); blocking en P1.
- [ ] RLS sigue tenant-scoped: RPC enmascara y solo retorna metadata.
- [ ] Payroll calculations **idénticas** antes/después (smoke test: `pay_periods.status='paid'` no se mueve).
- [ ] `activity_log` registra cada `identity_lookup` / `identity_attach`.
- [ ] Mobile: flujo resuelto en ≤ 4 taps, sin charts.
- [ ] Desktop: revisión masiva en review queue (P1).
- [ ] Funciona para cualquier company actual y futura (no contiene strings hardcoded de MSS/QS).

---

## 10. Reporte final

### Arquitectura propuesta
Capa cliente (hook + UI compartida) + capa server (2 RPCs SECURITY DEFINER read-only / single-write tenant-gated) + audit log. **No** edge function nueva en P0.

### Componentes reutilizables
- `ecosystem-lookup.ts` (puro)
- `useEcosystemIdentityCheck` (hook)
- `EcosystemIdentityCheckpoint` (drawer mobile+desktop)
- `ecosystem_identity_lookup` (RPC)
- `identity_attach_to_company` (RPC)

### Archivos que se tocarían (P0)
- **Nuevos:** los 5 de arriba + 1 migración + 1 test file.
- **Modificados (mínimo invasivo):**
  - `src/components/EmployeeCombobox.tsx` (quick add path)
  - `src/pages/admin/Employees.tsx` o el create dialog asociado (full form path)
  - Nueva acción en `/app/employees` cuando `selectedCompany = MSS` (entry point para activación masiva controlada cross-tenant)

### Riesgos
| Riesgo | Mitigación |
|---|---|
| Exponer datos cross-tenant vía RPC | Payload enmascarado + gate de "admin en al menos una company" + rate-limit |
| Falsos HIGH matches | Requiere confirmación humana siempre; nunca auto-attach |
| Romper `/apply/:slug` existente | P0 **no** modifica el edge function; P1 lo refactoriza encima del mismo RPC |
| Bulk imports históricos | P0 solo dry-run; P1 blocking queue |
| `worker_profiles` adoption | Diferido a P2, no se toca en P0/P1 |

### Confirmaciones
- ✅ **No es MSS-only.** MSS es el primer consumidor pero la capa es ecosistema-wide; cero strings de MSS/QS en código.
- ✅ **Previene futuros duplicados** en cualquier flujo que adopte el hook (P0: 3 flujos; P1: 7; P2: todos).
- ✅ **Payroll guardrail:** ningún path del checkpoint escribe en payroll/time_entries/shifts/compensation. Smoke test incluido.

### QA plan
- **Mobile:** Quick Add con HIGH match → drawer → confirm → attach (≤4 taps). MSS activation en bottom sheet.
- **Desktop:** Full Form bloquea "Crear" hasta resolver HIGH match. MSS bulk review desde `/app/employees`.
- **RLS:** RPC llamado por admin de QS no debe ver SSN/documentos de MSS (payload enmascarado verificado en test). Caller sin rol admin → RPC retorna `[]`.
- **Payroll guardrail:** seed un attach completo en Stafly Demo Company; verificar `time_entries`, `pay_periods`, `period_base_pay`, `historical_payroll_entries`, `compensation_profiles` **delta = 0**.

---

**Pendiente:** tu aprobación para arrancar P0 (migración RPC + hook + UI + 3 wire-ins). Hasta entonces, **cero cambios**.
