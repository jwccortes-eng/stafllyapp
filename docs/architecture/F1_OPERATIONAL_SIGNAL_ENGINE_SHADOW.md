# F1 — Operational Signal Engine (Shadow Mode)

Estado: implementado en modo sombra estricto. **No cambia ningún envío real.**

## 1. Arquitectura implementada

```text
evento real (notificación insertada)
        │
        ├─► sistema actual  → sigue enviando exactamente igual (intacto)
        │
        └─► observeOperationalEvent()   [fire-and-forget, microtask]
                 │
                 └─► evaluateOperationalSignal()  (PURA, sin side effects)
                          taxonomy → audience → priority → dedupe → ack
                                    │
                                    └─► operational_signal_shadow_decisions
```

Archivos:

| Archivo | Rol |
| --- | --- |
| `src/lib/operational-signals/types.ts` | Contrato de evento, contexto y decisión |
| `src/lib/operational-signals/taxonomy.ts` | 12 familias + mapeo de tipos actuales |
| `src/lib/operational-signals/audience.ts` | Audiencia contextual con razón por persona |
| `src/lib/operational-signals/dedupe.ts` | `dedupe_key` + descripción de agrupación |
| `src/lib/operational-signals/engine.ts` | `notify_operational_event_shadow` (decisión) |
| `src/lib/operational-signals/sink.ts` | Registro durable no bloqueante |
| `src/lib/operational-signals/metrics.ts` | Métricas de ruido |
| `src/lib/operational-signals/flags.ts` | Shadow mode, persistencia, kill switch |
| `src/pages/admin/dev/OperationalSignalsShadow.tsx` | Dashboard interno |
| `src/hooks/useNotifications.tsx` | Único punto de observación (solo lectura) |
| `src/test/operational-signals-shadow.test.ts` | QA automatizado (9 casos) |

## 2. Eventos cubiertos

12 familias: `assignment`, `shift_change`, `attendance`, `no_show`, `clock_in`,
`meeting_point`, `transportation`, `replacement`, `cancellation`, `incident`,
`payroll_exception`, `general_information`. 40+ tipos actuales mapeados en
`EVENT_TYPE_TO_FAMILY`; los no mapeados caen a `general_information`.

## 3. Modelo de decisión

1. **Familia** por tipo de evento.
2. **Prioridad base** por familia (`critical|high|medium|low|silent`).
3. **Escalamiento por proximidad**: ≤120 min del inicio ⇒ `critical`; ≤720 min ⇒ `high`.
4. **Audiencia contextual** con razón explícita de inclusión/exclusión; removidos y
   otros tenants siempre excluidos.
5. **Silencio**: sin audiencia accionable o informativo repetido ⇒ `silent`.
6. **Agrupación**: familia agrupable + no crítica + repeticiones en ventana.
7. **Confirmación**: familias con compromiso operativo (meeting point, cambio de
   hora, reemplazo, cancelación, transporte, asignación) con deadline y escalamiento.
8. **Riesgos**: `over_broad_audience`, `critical_buried_in_generic_feed`,
   `missing_acknowledgement_loop`.

## 4. Migración

Una sola tabla nueva: `public.operational_signal_shadow_decisions`
(log inmutable, RLS por compañía: lectura solo owner/admin de esa compañía,
inserción solo miembros de la compañía, sin update/delete).

## 5. Feature flag

`operational_signal_shadow_mode = true` (fijo en F1, `isEnforcementEnabled() === false`).
Persistencia y panel controlados por flags; kill switch detiene toda observación.

## 6. Métricas iniciales

Reducción de ruido estimada, eventos agrupables, alertas críticas, audiencia
demasiado amplia, eventos que requerirían confirmación, candidatos a silencio,
usuarios sobrecargados y familias más ruidosas. Ejemplo validado: un
`no_show_alert` enviado a 40 personas ⇒ audiencia recomendada 3 ⇒ 92.5% de
reducción.

## 7. QA ejecutado

9 pruebas en `src/test/operational-signals-shadow.test.ts` cubriendo los 7
escenarios obligatorios (asignación, meeting point, ráfaga, no-show, informativo,
multi-tenant) más payroll y detección de audiencia amplia. Rendimiento: la
observación corre en microtask y captura todos sus errores, por lo que no puede
bloquear ni retrasar el evento principal.

## 8. Riesgos

- El contexto de audiencia (captains, dispatchers, transporte) aún se recibe como
  entrada; en F2 debe resolverse desde datos reales de turno.
- `actual_recipients_count` es 1 por observación cliente; la comparación exacta
  requerirá observación server-side.
- Volumen del log: mitigado con persistencia off por defecto y kill switch.

## 9. Recomendación para F2

Mover la observación al backend (trigger/edge function de notificaciones) para
capturar audiencia real completa, resolver contexto de turno desde la base y
recién entonces evaluar activar agrupación y confirmaciones sobre un subconjunto
piloto de compañías.
