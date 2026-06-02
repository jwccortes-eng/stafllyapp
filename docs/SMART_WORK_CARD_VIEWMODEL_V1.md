# Smart Work Card v1 — Spec + ViewModel

Estado: **Diseño + scaffold read-only**. No reemplaza UI productiva.
Complementa `docs/SMART_WORK_CARD_DESIGN_V1.md` con el contrato de datos.

## 1. Principio

> Mostrar sólo lo necesario para actuar.

Cada card debe responder en <2 segundos:
**qué trabajo, cuándo, dónde, qué hago, siguiente paso.**

Todo lo demás vive en "Más detalles".

## 2. Audiencias y densidades

| Audiencia | Compact (calendario) | Standard (feed Daily Ops / Portal) | Full (Shift Ops / detalle) |
|-----------|----------------------|------------------------------------|----------------------------|
| Worker    | identity · timing · status · action | + location, pay | + uniform, riesgo personal |
| Admin     | identity · timing · status · action | + location, cobertura | + uniform, pay (ref), evidencia |

## 3. Bloques obligatorios (orden visual)

A. **Tiempo** — entrada grande (Sora 32–36), `Termina aprox.` muted, meeting si existe.
B. **Trabajo** — `{Cliente} · {Categoría}` o título manual limpio. Legacy `#0250` → chip secundario "Ref #0250".
C. **Lugar inteligente** — `saved_job_site` / `manual_address` / `meeting_only` / `missing` con copy ES + botones `Cómo llegar` y `Copiar dirección`.
D. **Qué llevar** — instrucciones + foto opcional. Prioridad futura: turno → cliente/location/rol → compañía → manual.
E. **Pago estimado** — SIEMPRE etiquetado `Estimado` / `Aprox.` / `Pago final pendiente` / `Sin tarifa`. Nunca pago final. Color ámbar, nunca verde.
F. **Acción principal** — UNA sola. Worker: Aceptar / Reconfirmar / Marcar entrada / Ver detalles. Admin: Operar / Asignar / Auditar / Revisar antes de pagar.

## 4. ViewModel — `src/lib/shifts/smart-work-card.ts`

API pública:

```ts
buildSmartWorkCardViewModel(input, { audience, density })
  → SmartWorkCardViewModel

getWorkIdentity(input)   → WorkIdentity
getWorkTiming(input)     → WorkTiming
getWorkLocation(input)   → WorkLocation
getWorkUniform(input)    → WorkUniform
getPayEstimate(input)    → PayEstimate    // isFinal: false SIEMPRE
getWorkStatus(input, a)  → WorkStatus
getNextAction(i, a, st)  → NextAction
```

Reutiliza:
- `card-display` → `buildShiftCardTitle`, `stripLeadingShiftCode`, `formatShiftRef`
- `location-status` → `classifyShiftLocation`
- `attendance-evidence` → consumido por el caller cuando quiera enriquecer `riskHints` (no acoplado al builder para mantenerlo puro)

## 5. Datos esenciales vs "Más detalles"

| Esencial en card | Va a "Más detalles" |
|------------------|---------------------|
| Cliente · Categoría | Manager, tags, grupos Connecteam |
| Entrada / Termina aprox. | Horas programadas exactas, breaks plan |
| Dirección o estado de dirección | GPS, geofence radius, lat/lng |
| Acción principal | Historial de versiones, audit log |
| Riesgo top (admin) | Lista completa de assignments y notas |
| Estimado de pago | Compensation profile, overrides, adjustments |

## 6. Lenguaje (ES)

| Decir | No decir |
|-------|----------|
| Trabajo | Assignment / Scheduled shift |
| No marcó entrada | Missing clock-in |
| Revisar antes de pagar | Payroll review |
| Cómo llegar | Directions |
| Qué llevar | Uniform policy |
| Pago estimado | Estimated payroll |
| Ref #0250 | Legacy shift code |

## 7. Reglas de pago (críticas)

- `getPayEstimate()` SIEMPRE devuelve `isFinal: false`.
- Si falta clock-out → label `Pago final pendiente`, `amount: null`.
- Si no hay tarifa → label `Sin tarifa`.
- Disclaimer obligatorio: "Estimado operativo. El pago final se calcula con fichajes reales o validaciones aprobadas."
- La UI debe usar tinte ámbar; **prohibido verde** (lectura de "pagado").

## 8. Variantes — bloques visibles

| Densidad | Worker | Admin |
|----------|--------|-------|
| compact  | identity, timing, status, action | idem |
| standard | identity, timing, location, pay, action | identity, timing, location, status, action |
| full     | + uniform, status | + uniform, pay, evidencia |

## 9. Riesgos

- **Confusión con pago final** → mitigado con label + tinte + disclaimer.
- **Acoplamiento al schema** → input es un objeto plano; el adapter desde Supabase se hará por pantalla, no en el builder.
- **Drift con `card-display`** → reutilizamos sus helpers, no duplicamos lógica.
- **Performance en calendario** → builder es O(1), sin allocations pesadas.

## 10. No implementado todavía

- Componente React `<SmartWorkCard />` (siguiente paso, tras aprobar este spec).
- Adapter desde el query actual de `/portal/shifts` y de `ShiftOperations`.
- Lookup de uniforme por cliente/rol/compañía (requiere nuevo storage; fuera de scope v1).
- Botón "Cómo llegar" real (sólo flag `hasDirections` y `copyText` en el VM).
- Sustitución del `ShiftCard` actual del calendario.

## 11. Confirmación de no-tocados críticos

- ❌ No se tocó payroll calculations.
- ❌ No se tocó `time_entries`.
- ❌ No se tocó schema / migrations / RLS / auth.
- ❌ No se tocó Connecteam (export/import).
- ❌ No se reemplazó calendario ni Shift Operations.
- ✅ Sólo: `src/lib/shifts/smart-work-card.ts`, `src/test/smart-work-card.test.ts`, este doc.
