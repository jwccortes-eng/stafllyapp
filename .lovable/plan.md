# Ecosystem Profile Standard v1

Propuesta de **estándar unificado de perfil de trabajador** para el ecosistema Stafly (Core + Parceros + Passport público), consolidando lo aprendido de:

- `PublicPassport.tsx` — vista pública gateada por RPC `get_public_passport`
- `ConsentCenterCard` + `useWorkerConsent` — consentimientos versionados
- `WorkerPassport.tsx` (legacy admin) — score dual y badges
- `PortalProfile.tsx` — self-service worker
- `CompleteProfile` / `EmployeeOnboarding` — captura inicial
- `ProfileSummaryGrid` + `UnifiedPersonProfile` — vista one-screen admin
- `worker_profiles` / `passport_profiles` / `rep_scores` / `shift_reviews`

**No se implementa nada en esta fase. Solo se entrega el estándar y el plan.**

---

## 1. Principios del estándar

1. **Una sola fuente de verdad por capa**, con jerarquía explícita:
   - **Identidad operativa** → `employees` (tenant-scoped, payroll/shifts/clock)
   - **Identidad de ecosistema** → `worker_profiles` (cross-tenant, portable, ligada a `user_id`)
   - **Vitrina pública** → `passport_profiles` + `passport_publications` (gated, RPC-only)
2. **Capa visible ≠ capa almacenada.** Nunca exponer SSN/EIN/PIN/phone/email/address fuera de admin tenant-scoped.
3. **Source labeling obligatorio** cuando coexistan sistemas legacy + nuevos (regla heredada de Fase 1B.2/1B.3).
4. **Consentimiento granular y versionado** antes de publicar cualquier dato cross-tenant (Parceros, Passport público, referrals).
5. **Edición progresiva**: el worker completa en su tiempo; admin solo desbloquea lo operativo crítico.
6. **Spanish-first operator copy** (Admin Desk) + ES/EN/HE worker portal (i18n v2).
7. **Cero regresión** a payroll/time_entries/RLS/auth (política estricta vigente).

---

## 2. Modelo de capas

```text
┌──────────────────────────────────────────────────────────┐
│ L4 · Passport público (passport_profiles + RPC)          │  ← cualquiera con slug
│    display_name, primary_role, skills, reputation, KPIs  │
├──────────────────────────────────────────────────────────┤
│ L3 · Ecosystem profile (worker_profiles)                 │  ← Parceros + cross-tenant
│    bio, skills, languages, experience, visibility        │
├──────────────────────────────────────────────────────────┤
│ L2 · Tenant employee (employees)                         │  ← admin del tenant
│    phone, email, address, comp, docs, photo, ssn_last4   │
├──────────────────────────────────────────────────────────┤
│ L1 · Identidad fiscal/sensible (contractor_w9, secretos) │  ← admin + worker dueño
│    tin_last4, signed PDF, EIN/SSN nunca en claro         │
└──────────────────────────────────────────────────────────┘
```

Regla: **datos suben de capa solo con consentimiento explícito y verificación**. Datos bajan de capa (público → privado) automáticamente al revocar consentimiento.

---

## 3. Estándar de campos

| Campo | L1 | L2 | L3 | L4 | Editable por |
|---|---|---|---|---|---|
| legal_name | ✓ | ✓ | — | — | admin tenant |
| display_name | — | ✓ | ✓ | ✓ | worker |
| photo (reviewed) | — | ✓ | ✓ | ✓ | worker → admin aprueba |
| phone / email | — | ✓ | — | — | worker self-service |
| address | — | ✓ | — | — | worker |
| emergency_contact | — | ✓ | — | — | worker |
| ssn_last4 / tin_last4 | ✓ | — | — | — | worker (W-9 flow) |
| primary_role | — | ✓ | ✓ | ✓ | admin + worker |
| skills / languages | — | — | ✓ | ✓ | worker |
| experience | — | — | ✓ | ✓ (gated) | worker |
| reputation_score | — | — | ✓ | ✓ (gated) | sistema |
| consent_records | — | — | ✓ | — | worker |

---

## 4. Componentes UI estándar (a construir)

Reutilizables, presentational, sin lógica de negocio acoplada:

1. `<ProfileLayerBadge layer="L2|L3|L4" />` — chip que indica qué capa estoy viendo.
2. `<SourceProvenanceBadge source="legacy|db|mixed|none" />` — extensión del patrón de Fase 1B.2.
3. `<ConsentGate type="parceros|passport|referrals">` — bloquea render hasta `hasConsent`.
4. `<PhotoReviewStatusChip />` — ya existe, se canoniza.
5. `<ProfileFieldRow editable={layer === currentLayer} />` — unifica FieldRow + SmartPhoneInput + GenderSelect + SmartDateInput.
6. `<ProfileReadinessCard scope="L2|L3" />` — extiende la actual a multi-capa.
7. `<ProfileSwitcher />` — para workers con múltiples tenants, muestra qué capa están editando.

---

## 5. Plan de implementación por fases

Cada fase es independiente, frontend-first, sin tocar payroll/RLS/schema salvo donde se indica explícitamente.

### Fase E1 · Foundations (UI only, sin DB)
- E1.1 — Crear `src/lib/profile-layers.ts` con tipos `ProfileLayer`, helpers `getLayerForField`, `canEditField`.
- E1.2 — Componentes `ProfileLayerBadge`, `SourceProvenanceBadge`, `ConsentGate`.
- E1.3 — Documentar en `docs/ECOSYSTEM_PROFILE_STANDARD.md`.

### Fase E2 · Auditoría y etiquetado de surfaces existentes
- E2.1 — Etiquetar capa visible en `UnifiedPersonProfile`, `PortalProfile`, `WorkerPassport`, `PublicPassport`.
- E2.2 — Aplicar `SourceProvenanceBadge` a todos los puntos donde score/categorías/badges mezclan fuentes.
- E2.3 — QA mobile/desktop sin cambios funcionales.

### Fase E3 · Consent Center unificado
- E3.1 — Promover `ConsentCenterCard` a página dedicada `/portal/consent` con histórico.
- E3.2 — Wrap de surfaces L3/L4 con `<ConsentGate>` (Parceros, Passport público, Referrals).
- E3.3 — Admin tenant-scoped: read-only view de consentimientos del worker.

### Fase E4 · Self-service edición progresiva
- E4.1 — Unificar PortalProfile + UpdateCenter en single page `/portal/profile` con secciones colapsables por capa.
- E4.2 — Banderas visuales de "campo bloqueado por admin" vs "tu puedes editar".
- E4.3 — Photo flow ya consolidado en Fase 1B.1; reusar.

### Fase E5 · Reputación unificada (requiere decisión de producto)
- E5.1 — Decisión: deprecar `useEmployeeReputation` o conservar como fallback histórico.
- E5.2 — Migrar categorías/barras a `rep_scores` o etiquetar permanentemente como legacy.
- E5.3 — Backend: ningún cambio sin diseño formal (fuera del alcance de este standard).

### Fase E6 · Passport público hardening
- E6.1 — Auditar `get_public_passport` RPC: confirmar que ningún campo L1/L2 puede escaparse.
- E6.2 — Versionar `passport_publications.version` para invalidación.
- E6.3 — Añadir `<ProfileLayerBadge layer="L4" />` visible en `PublicPassport`.

### Fase E7 · Worker Passport legacy → redirect total
- E7.1 — Cuando E2+E3+E6 estén cerrados, marcar `WorkerPassport.tsx` como **read-only archive**.
- E7.2 — Redirect duro desde rutas legacy al nuevo flujo (mantener URL por 90 días con banner).

---

## 6. Reglas de no-regresión (heredadas y reforzadas)

- No tocar: `payroll_*`, `time_entries`, `pay_periods`, `period_base_pay`, `shift_assignments`, `clock_events`, RLS de `employees`, auth, `auth_rate_limits`, edge functions de payroll/clock.
- No exponer: SSN/EIN completo, PIN, raw phone/email cross-tenant, address cross-tenant.
- No re-introducir: doble upload de foto (Fase 1B.1), SSN completo en activation (Fase 1A.1), score sin source label (Fase 1B.2/1B.3).
- Cada fase entrega su propio QA mobile/desktop y queda registrada en memory.

---

## 7. Entregables de esta propuesta

1. Este plan (estándar + fases E1–E7).
2. Tabla de capas y campos (sección 3).
3. Catálogo de componentes a construir (sección 4).
4. Reglas de no-regresión (sección 6).

**Próximo paso sugerido:** aprobar el estándar y comenzar por **Fase E1.3** (documento en `docs/`) + **Fase E1.1** (tipos y helpers), que son zero-risk y desbloquean E2.
