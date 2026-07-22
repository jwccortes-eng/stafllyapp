# MRI-001 — Attendance-to-Payroll Truth

**Fecha:** 2026-07-22
**Estado:** ✅ Aprobado.
**Alcance:** Cadena canónica que transforma asistencia en payroll.

---

## 1. Hallazgos clave

- ✅ `clock_events` es **evidencia auxiliar**; **no** es leído por `consolidate_period_base_pay`.
- ✅ `time_entries` es el **input nativo canónico** de la consolidación.
- ✅ Existe fallback a `shifts` cuando no hay `time_entries` aprobadas.
- ✅ Reglas anti-fraude en el RPC (>16h descartadas).
- ✅ **Cascada de rates** implementada (empleado → concepto → default).
- ✅ Filas con `period_base_pay.import_id` **están protegidas** frente al RPC nativo.
- ✅ `shift_closeout_reports` **no bloquea** la consolidación.
- ⚠️ Divergencia potencial: **UI resolver** aplica cutoff 03:00 para overnight; el **RPC SQL** usa `clock_in::date`.
- 🟡 Coexisten payroll **nativo** y **reconciliation externa** (Connecteam).
- 🔴 **No se observó** payout financiero real (ACH / Stripe Payout).

## 2. Data lineage observado

```
clock_events  (auxiliar, GPS/device)
      │
      ▼ [no ingresa directamente]
time_entries ──► consolidate_period_base_pay ──► period_base_pay + movements
      ▲                                                 │
      │                                                 ▼
   fallback ◄──── shifts (si no hay entries)      [worker paid?] 🔴
```

## 3. Reglas observadas

- Anti-fraude: descarta entries >16h.
- Rate cascade con precedencia empleado > concepto > default.
- Protección `import_id`: filas importadas no se sobrescriben.
- Correcciones vía RPC con separación de roles (requester ≠ reviewer).

## 4. Riesgos ⚠️

- Divergencia overnight entre UI y RPC (posible sub/sobre-conteo).
- Duplicidad de `time_entries` (sin garantía global observada).
- Manejo de timezone no confirmado en fronteras.
- Doble truth set (nativo vs Connecteam) puede generar inconsistencia.

## 5. Canonicality Status

```
Attendance evidence:
  clock_events — auxiliar

Native attendance truth:
  time_entries — confirmado para consolidación nativa

Native payroll base:
  period_base_pay + movements

Current payment authority:
  Connecteam / external reconciliation, según guardrail observado
  (deriva del guardrail; requiere validación operativa del dueño)

Financial payout:
  fuera del alcance observado de Stafly
```

## 6. Decisiones pendientes

Ver DEC-002, DEC-004, DEC-005, DEC-008 en el
[Decision Register](../decisions/DECISION-REGISTER.md).

## 7. Confirmación read-only

Investigación 100% estática. Cero escrituras, cero migraciones, cero
mutaciones en base de datos.

---

## Observaciones para futuras inspecciones

- Reproducir el cutoff overnight con datos reales (Time Accuracy MRI).
- Auditar concurrencia entre payroll nativo y reconciliation (Reconciliation Deep Dive).
- Confirmar existencia (o no) de payout financiero real.
