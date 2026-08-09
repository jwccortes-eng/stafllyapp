# P0 — CONNECTEAM PROVISIONAL EXPORT COMPLETION

Fecha: 2026-08-09
Alcance: UI + capa de exportación. Sin migraciones, sin escrituras en `scheduled_shifts`,
sin tocar payroll, `time_entries`, staffing, assignments, ELDM, Smart Intake, VWC, auth, RLS ni tenants.

## 1. Problema confirmado

De `docs/qa/P0_CONNECTEAM_WEEK_COMPARISON_BLOCKER_MATRIX.md`:

| Causa | Efecto | ¿Requisito real? |
|---|---|---|
| `end_time == start_time` (17:00) | `export.missing_end` | Sí — el importador de Connecteam descarta filas de duración cero |
| `slots = NULL` | `staff.pending_headcount` | No para Connecteam — `Number of users` es opcional |

## 2. Regla fundamental aplicada

```text
CANONICAL SERVICE DATA        ≠        CONNECTEAM EXPORT OVERRIDE
end_time = pendiente                    End = 23:00 (provisional, solo CSV)
```

Nunca se escribe una hora final ficticia en `scheduled_shifts`. El override vive
en memoria durante la exportación y se descarta al cerrar el diálogo.

## 3. Implementación

### `src/lib/integrations/connecteam-provisional.ts` (nuevo)
- `needsProvisionalEnd(shift)` — detecta fin vacío, fin == inicio o marca de intake "Hora de fin pendiente".
- `resolveProvisionalEnd(shift, decision)` — modo `duration` (horas) o `end_time` (hora explícita); cruza medianoche; rechaza fin == inicio y duraciones fuera de (0, 24].
- `withProvisionalEnd(shift, end)` — copia inmutable para el CSV.
- `provisionalNote(...)` — nota anexada a la columna `Note` del CSV: `End provisional 23:00 (duración provisional 6h) — no confirmado en Stafly`.
- `buildProvisionalTrace(...)` — traza con QK, canonical start/end, export start, provisional end, `provisional=true`, modo, duración, motivo, `confirmed_by`, `exported_at`, `batch_ref`.

### `src/components/shifts/integrations/ProvisionalEndPanel.tsx` (nuevo)
- Copy exacto: "Connecteam necesita una hora final para crear este turno." / "En Stafly la hora final todavía está pendiente."
- CTA: **Definir dato provisional para exportar**.
- Selector Duración provisional / Hora final provisional + motivo opcional.
- Preview por servicio: `QK-001581 · 2026-08-30 · 17:00 → 23:00 provisional`.
- Confirmación humana explícita: **Aplicar provisionalmente a los 9**. Nada se aplica en silencio.
- Tras aplicar: banner de advertencia + **Quitar dato provisional**.

### `src/components/shifts/integrations/ExportConnecteamBulkDialog.tsx`
- Calcula `pendingEnd` y construye copias efectivas solo para el CSV.
- El resumen (listos / en revisión / bloqueados) se recalcula con el override aplicado: 9 pendientes → 9 listos.
- Al descargar, si hay override: `logAudit({ action: "export", entityType: "connecteam_export", details: { batch_ref, rows, provisional_rows, provisional: true, traces } })` — reutiliza la infraestructura de auditoría existente, sin sistema paralelo.
- Toast de descarga muestra: "La hora final utilizada es provisional y no modifica el Servicio en Stafly."

### Personal pendiente (ya entregado en este P0)
- `connecteam-export.ts`: `slots = NULL` → `Number of users` viaja **vacío**; warning `headcount_pending` en lugar de bloqueo.
- `service-operational-readiness.ts`: `slotsPending` degrada `export.no_capacity` a advertencia.

## 4. Caso Imperial

| QK | Fecha | Canonical start | Canonical end | Export end | Provisional |
|---|---|---|---|---|---|
| QK-0015xx | Aug 30 | 17:00 | pendiente | 23:00 | sí |
| … | Aug 31 · Sep 1–7 | 17:00 | pendiente | 23:00 | sí |

9 filas en el CSV, cada una con su QK. En Stafly: `end_time` sigue pendiente, staffing sigue pendiente.

## 5. Criterios de aceptación

| Criterio | Estado |
|---|---|
| Nunca se inventa una hora final canónica | OK — sin writes |
| Connecteam recibe hora final provisional confirmada por el operador | OK |
| El override se distingue del dato real | OK — nota en CSV + banner + traza |
| `slots` NULL permanece pendiente | OK — columna vacía |
| Personal pendiente no bloquea por sí mismo | OK — warning |
| Lote de varios drafts | OK — "Aplicar provisionalmente a los N" |
| 9 Imperial → CSV de 9 filas con QK | OK |
| Tests y typecheck | OK — 9 nuevos + 56 de regresión en verde |

## 6. Confirmación

Stafly conserva la realidad incompleta del Servicio y permite satisfacer requisitos
técnicos de Connecteam mediante datos provisionales explícitos y trazables, sin
convertirlos en hechos operativos confirmados.
