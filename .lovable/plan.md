# Fase E2 — Aplicar estándar a una primera surface admin (propuesta)

Propuesta detallada. **No implementar hasta aprobación explícita.**

## 1. Objetivo exacto

Aplicar por primera vez los componentes foundation-only de E1 (`ProfileLayerBadge`, `SourceProvenanceBadge`) a **una sola superficie admin read-only**, sin lógica nueva, sin consent, sin edición, sin red. Validar en producción real que:

- Los badges renderizan correctamente en mobile y desktop.
- El estándar de capas (L1–L4) es legible para el operador.
- No introducen regresiones visuales ni de performance.

E2 NO incluye: `ConsentGate`, self-service, mutaciones, wiring cross-tenant, ni etiquetado masivo.

## 2. Surface candidata: `ProfileSummaryGrid`

Archivo: `src/components/employee/ProfileSummaryGrid.tsx`

Es la grid de 6 tarjetas read-only ("Datos principales / Cumplimiento / Acceso / Operación / Actividad reciente / Avanzado e importado") que se renderiza dentro de `UnifiedPersonProfile` en `/app/employees/:id`.

Alternativa descartada: `UnifiedPersonProfile` directamente (demasiada superficie, mezcla tabs editables + readiness + W-9 trigger).

## 3. Por qué es la más segura

- Componente puramente **presentacional**: recibe props ya cargadas por el padre, no hace fetch, no escribe.
- **Read-only**: no toca formularios, no toca SSN/EIN, no toca W-9, no toca foto.
- Ya pasó QA Premium ([Employee Profile One-Screen v1] + [IA Cleanup v3]).
- Vive **solo en admin** (`/app/employees/:id`), nunca en `/portal/*`, nunca en `/apply`, nunca en `PublicPassport`.
- Cambio aislable: 1 archivo, badges decorativos.
- Reversible con `git revert` de un solo commit.

## 4. Archivos que tocaría

**Modificados (1):**
- `src/components/employee/ProfileSummaryGrid.tsx` — añadir import de los 2 badges E1 y renderizarlos junto a labels específicas.

**Nuevos (0).**

## 5. Componentes E1 que usaría

- `ProfileLayerBadge` — junto al título de cada una de las 6 tarjetas, indicando la capa dominante (ej. "Datos principales" → L2, "Avanzado e importado" → L2 con fuente legacy/import).
- `SourceProvenanceBadge` — solo en la tarjeta "Avanzado e importado" cuando el origen sea legacy/import (Connecteam, CSV).

**NO se usa** `ConsentGate` en E2.

## 6. Campos/datos etiquetados

Etiquetado **a nivel tarjeta**, no a nivel campo individual (para evitar ruido visual):

| Tarjeta | Layer badge | Source badge |
|---|---|---|
| Datos principales | L2 employees | — |
| Cumplimiento | L2 employees | — |
| Acceso | L2 employees | — |
| Operación | L2 employees | — |
| Actividad reciente | L2 employees | — |
| Avanzado e importado | L2 employees | legacy/import si aplica |

Sin tocar valores, sin tocar formato de números, sin tocar fechas.

## 7. Qué NO tocaría

- `PublicPassport.tsx`, `ConsentCenterCard.tsx`, `WorkerPassport.tsx` (legacy).
- `PortalProfile`, `UpdateCenter`, `CompleteProfile`, `EmployeeOnboarding`.
- Cualquier flujo de onboarding, SSN/EIN, W-9, foto, documentos.
- Cualquier mutación, hook nuevo, fetch nuevo.
- Rutas, navegación, sidebar.
- Supabase: DB, RLS, migrations, edge functions, storage, RPCs.
- Auth, tenants, payroll, time_entries, scheduled_shifts, pay_periods.
- `worker_consent_records`, `passport_publications`, `worker_profiles`, `review_scores`.
- Bookings, payments, chat, campaigns, notifications.
- Mobile portal (`/portal/*`) y kiosk.

## 8. Riesgos

| Riesgo | Mitigación |
|---|---|
| Ruido visual en cards densos | Badges `text-[10px]`, color muted, máximo 1–2 por card |
| Regresión QA Premium previo | Badges colocados al lado del título existente, sin reordenar contenido |
| Layer mal asignado | Empezar todo en L2 (employees); fuentes legacy solo en "Avanzado e importado" |
| Confusión operador | Tooltip usa `PROFILE_LAYER_DESCRIPTIONS` ya definido en E1 |
| Bundle size | <1 KB gz adicional (badges ya existían como código muerto en E1) |

## 9. QA mobile (390×844)

- `/app/employees/:id` con cuenta admin + worker real de tenant de prueba (no Quality Staff real).
- Verificar: badges no rompen wrap de títulos, no aumentan altura de cards >4px, no producen overflow horizontal.
- Verificar tap target del tooltip si se agrega (si no se agrega, solo visual).
- Screenshot antes/después.

## 10. QA desktop (1280+)

- `/app/employees/:id` en Stafly Demo + MyStaff (tenants seguros).
- Verificar grid de 2 columnas mantiene altura simétrica.
- Verificar `UnifiedPersonProfile` que embebe el grid no rompe el resto del layout (Readiness card, tabs).
- Sin regressions en tabs "Más detalles".

## 11. Build / vitest esperado

- `bun run build` → PASS.
- `bunx vitest run` → 196 PASS / 4 pre-existing FAIL (`next-best-action.test.ts`, no relacionado).
- Sin warnings nuevos de TS, sin warnings nuevos de Vite.

## 12. Rollback

`git revert <commit-de-e2>` — revierte solo `ProfileSummaryGrid.tsx`. Cero colateral. Los componentes E1 siguen existiendo como foundation-only.

## 13. Criterios de aceptación

1. Solo `ProfileSummaryGrid.tsx` modificado (`git diff --stat` = 1 archivo).
2. 0 archivos nuevos.
3. Badges visibles en las 6 tarjetas en `/app/employees/:id`.
4. JSDoc en `ProfileLayerBadge` / `SourceProvenanceBadge` actualizado: `@status wired in ProfileSummaryGrid (E2)`.
5. Build + vitest pasan.
6. QA mobile + desktop sin regresiones visuales.
7. `rg "ProfileLayerBadge|SourceProvenanceBadge"` muestra import solo en `ProfileSummaryGrid.tsx` + los archivos E1 (+ tsbuildinfo).
8. Cero cambios en `.sql`, `supabase/`, `src/integrations/`, hooks, rutas.

## 14. Confirmación de no impacto

E2 **NO toca**: payroll, time_entries, tenants, auth, RLS, migrations, edge functions, storage, RPCs, production data, `PublicPassport`, `ConsentCenterCard`, `worker_consent_records`, `passport_publications`, `worker_profiles`, `review_scores`, onboarding, SSN/EIN, W-9, documentos privados, chat, payments, bookings, campaigns, notificaciones, kiosk, portal worker.

E2 es **UI-only, 1 archivo, presentacional, reversible con un revert**.

---

**Pendiente: aprobación explícita para ejecutar E2 con este alcance exacto.**
