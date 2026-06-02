# Flujo Operativo Oficial · Stafly

Esta es la narrativa que usa Stafly para auditar y operar un turno de
principio a fin. Está pensada para que cualquier admin pueda explicar en
voz alta lo que está pasando, qué falta, qué riesgo hay y cuál es el
siguiente paso, sin abrir 5 pantallas distintas.

## 1. Qué pantalla sirve para qué

| Pantalla | Pregunta que responde | Mutaciones permitidas |
|---|---|---|
| `Daily Operations` (`/app/daily-ops`) | "¿Qué tengo que resolver **hoy** en toda la operación?" | Sólo navegación a la pantalla correcta. |
| `Shift Operations` (`/app/shift-ops?id=…`) | "¿Qué está pasando con **este turno**?" | Asignar workers, editar turno, registrar **validación admin** (sin afectar payroll), agregar notas. |
| `Attendance` (`/app/attendance`) | "¿Quién vino, quién no vino, quién llegó tarde?" | Validación administrativa **de presencia**. Nunca modifica payroll. |
| `Time Clock` (`/app/timeclock`) | "¿Cuál es la evidencia real de fichaje?" | Cerrar clocks abiertos / corregir un fichaje **con auditoría**. |
| `Centro de Validación` (`/app/payroll-review-queue`) | "¿Qué horas voy a pagar?" | Aprobar/rechazar ajustes manuales que sí impactan payroll. |

> **Regla de oro:** payroll sólo se calcula con `time_entries` reales o con
> ajustes aprobados. Las horas programadas (`scheduled_shifts.start_time` /
> `end_time`) son **referencia operativa**, nunca fuente de pago.

## 2. Flujo operativo de un turno

```text
ANTES                       DURANTE                      DESPUÉS
─────                       ───────                      ───────
Crear turno         ──►     Detectar clock-in    ──►     Revisar clock-in/out
Cliente + ubicación         Alertar si no fichó          Revisar presentes sin clock
Asignar workers             Contactar worker             Revisar tardanzas / no-shows
Confirmar workers           Marcar Present/Late/         Aprobar ajustes
Publicar                    Absent con razón             Marcar listo para payroll
Confirmar punto de          Validación admin             review
encuentro                   sin afectar payroll          (Centro de Validación)
```

## 3. Caso crítico: "llegó pero no marcó"

1. `Shift Operations` detecta que el turno ya comenzó y el worker no tiene
   `time_entries`.
2. Muestra estado humano **"Falta clock-in"** + acción sugerida.
3. El admin puede, en el mismo bloque "Asistencia y evidencia":
   - Llamar al worker (deep-link a `tel:`).
   - Marcar **Presente sin clock**.
   - Marcar **Tarde**.
   - Marcar **Ausente**.
4. Si elige Presente / Tarde / Salió temprano, se abre un diálogo que pide
   **razón obligatoria**:
   - "Lo vi en sitio"
   - "Supervisor lo confirmó"
   - "Worker envió mensaje / foto"
   - "Confirmado por llamada"
   - "Otro" (con nota libre opcional)
5. La validación se guarda como `shift_notes.note_type =
   'attendance_validation'` con el payload codificado en `content`
   (prefijo `ATTENDANCE_VALIDATION_V1::` + JSON). **No se crea ni modifica
   ningún `time_entries`.**
6. El estado del worker pasa a **"Presente sin clock evidence"** con la
   leyenda *"payroll requiere ajuste aprobado antes de pagar"*.
7. Se cuenta automáticamente como **pendiente de payroll review** en el
   KPI del bloque.

## 4. Helpers puros (frontend, read-only)

Implementados en `src/lib/shifts/attendance-evidence.ts`:

| Helper | Qué devuelve |
|---|---|
| `getAttendanceEvidenceState(shift, entries, validations, nowIso)` | Estado humano por worker: `clocked_complete`, `clocked_in`, `missing_clock_in`, `missing_clock_out`, `present_no_clock`, `late_no_clock`, `left_early_no_clock`, `absent_confirmed`, `no_data`. Real clock **siempre** gana sobre validaciones admin. |
| `getShiftOperationalSummary(...)` | KPIs + frase humana ("2 de 2 workers confirmados. Ambos marcados presentes sin clock. Revisa horas antes de payroll."). |
| `getPayrollReviewFlags(...)` | Lista de pendientes que el Centro de Validación tiene que resolver (`manual_presence_needs_hours`, `open_clock_not_closed`, `no_evidence_after_end`, `early_departure_without_clock`). |
| `getWorkerNextActions(state)` | 1–4 acciones recomendadas por worker, dependientes del estado. |

Helpers complementarios ya existentes en
`src/lib/shifts/shift-operations-intelligence.ts`:
`getShiftOperationalStatus`, `getShiftMissingItems`, `getShiftRisks`,
`getRecommendedNextActions`, `buildCandidatePool`, `normalizeArea`.

## 5. UI nueva en Shift Operations

Bloque **"Asistencia y evidencia"** (componente
`src/components/shifts/ops/AttendanceEvidenceCard.tsx`):

- Frase humana arriba ("Este turno tiene N pendientes de payroll review").
- KPIs: Fichaje completo, En turno, Presente sin clock, Falta clock-in,
  Falta clock-out, Ausente.
- Tarjeta por worker con estado, sugerencia, última validación admin y
  botonera contextual (Llamar / Marcar presente / Marcar tarde / Marcar
  ausente / Cerrar clock-out / Revisar horas).
- Diálogo "Registrar validación admin" con `kind` + `reason` + nota
  opcional + recordatorio: *"No cambia payroll. Payroll se calcula con
  fichajes reales o ajustes aprobados."*
- Banner inferior con el mismo recordatorio para que quede impreso en la
  pantalla.

## 6. Copy nuevo clave

- **Smart summary card**: ya en español operativo ("Este turno está en
  riesgo: faltan 2 workers confirmados", "Listo para publicar: ubicación,
  horario y cobertura completos").
- **Attendance evidence**: cada estado tiene una frase humana específica
  (ver tabla de `getAttendanceEvidenceState`).
- **Boundary message** (siempre visible cuando hay validación admin):
  *"Las validaciones admin son evidencia operativa. No cambian payroll.
  Payroll se calcula con fichajes reales o ajustes aprobados en el Centro
  de Validación."*

## 7. Reglas de seguridad respetadas

Ninguno de estos elementos fue tocado:

- `time_entries` (lectura sólo; nunca insert/update/delete).
- Cálculos de payroll, `pay_periods`, `period_base_pay`,
  `payroll_adjustments`.
- Closeout, attendance crítica, clock-in/out writes.
- `worker portal`, auth, RLS, payments, bookings, chat, documents.
- Edge functions, schema, production data.
- Connecteam export/import.
- Tenants (no se mezclan).

La única tabla con escritura nueva es `shift_notes`, usando un `note_type`
nuevo (`attendance_validation`) que no rompe ningún CHECK (verificado:
`shift_notes` no tiene constraints sobre `note_type`).

## 8. Pendientes (no implementados ahora)

- Bloque equivalente en Mobile Shift Operations Sheet.
- Filtro "Presente sin clock" en `/app/attendance` y `/app/timeclock`.
- Reflejar `getPayrollReviewFlags(...)` como tarjetas en el bucket
  *"Pendiente aprobación final"* del Centro de Validación.
- Convertir validaciones admin en propuestas de ajuste reales (un click
  → `payroll_adjustment` pendiente de aprobación).
