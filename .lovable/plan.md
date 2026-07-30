# F1 — Change Intelligence · Modo Observación · Plan técnico final

Sin código hasta aprobación. Cero envíos reales. Cero migraciones.

---

## 1. Archivos a crear o modificar

### Motor puro (sin dominio, sin canales) — `src/lib/change-intelligence/engine/`
| Archivo | Rol |
| --- | --- |
| `types.ts` | `DomainChangeEvent`, `FieldDelta`, `AudienceRef`, `ObservationRecord`, `EngineDecision` |
| `detect.ts` | L1: filtra `cosmetic`/`internal` y deltas netos nulos |
| `classify.ts` | L2: nivel 0–3 por `semantic` + `materiality` + registry |
| `audience.ts` | L3: precedencia D3, dedupe por `deduplicationKey`, `unresolved` |
| `compose.ts` | L4: redacción antes → después desde plantillas del registry |
| `route.ts` | L5: canal **simulado** + ventana de consolidación |
| `observe.ts` | Orquestador puro: evento → `ObservationRecord` |
| `registry.ts` | Carga declarativa de `ChangeTypeRegistration` |
| `version.ts` | `ENGINE_VERSION` |

### Registry de catálogo (datos, no lógica) — `src/lib/change-intelligence/catalog/`
`scheduling.registry.ts` — los 6 `changeType` autorizados con nivel, matriz de audiencia, ack y plantillas.

### Adapter de dominio (propiedad de Scheduling) — `src/lib/change-intelligence/adapters/scheduling/`
| Archivo | Rol |
| --- | --- |
| `buildShiftEvent.ts` | diff de `scheduled_shifts` → `FieldDelta[]` |
| `buildAssignmentEvent.ts` | alta/baja/reemplazo desde `shift_assignments` |
| `resolveAudienceHints.ts` | `shift_admin_id`, `assignment_role='shift_admin'` → `responsible`; `check_in_admin` → `supervisor`; asignados → `assigned` |
| `resolveReachability.ts` | puente employee → `employees.user_id` → `profiles` → canal |
| `legacyBaseline.ts` | audiencia que el comportamiento actual habría notificado |
| `emit.ts` | único punto que invoca el motor; se retira para apagar F1 |

### Sink de observación — `src/lib/change-intelligence/observation/`
`sink.ts` (interfaz), `memory-sink.ts`, `console-sink.ts`, `local-buffer-sink.ts` (ring buffer en `sessionStorage`, sin PII más allá de ids), `report.ts` (10 preguntas de divergencia), `redact.ts`.

### Inspección (dev-only) — `src/pages/admin/dev/ChangeIntelligenceObservation.tsx`
Ruta `/app/dev/ci-observation`, visible solo con flag activo. Tabla de `ObservationRecord`, detalle de decisión y exclusiones, botón "Exportar JSON/CSV".

### Modificados
- `src/lib/flags.ts` (o equivalente): `CI_OBSERVATION_MODE`, default **off**.
- `src/App.tsx`: registro de la ruta dev-only tras el flag.
- Puntos de guardado de turno/asignación: **una** llamada `emit(...)` en `try/catch` no bloqueante.

**No se toca:** payroll, time entries, asignaciones reales, `notifications`, edge functions, esquema.

---

## 2. Paquetes y límites

```text
adapters/scheduling  ──emite──▶  engine (puro)  ──escribe──▶  observation/sink
      │                              │
   conoce DB                  no conoce nada          sin capacidades de envío
```

- El motor no importa nada de `shifts|payroll|recruit|document|timeclock|supabase`.
- El motor no importa ningún cliente de push/email/SMS/WhatsApp.
- El adapter no clasifica, no redacta, no elige canal.
- Test estructural (`engine.boundaries.test.ts`) recorre los imports y falla si se viola.

---

## 3. Persistencia e inspección del log

F1 **no crea tablas**. Tres sinks componibles:
1. **Memory sink** — en tests, determinista.
2. **Console sink** — `[CI:OBS]` con payload redactado, solo con flag activo.
3. **Local buffer sink** — ring buffer de 500 registros en `sessionStorage`, namespaced por usuario, exportable a JSON/CSV desde la pantalla dev.

El análisis se hace sobre el JSON exportado. Persistencia en base de datos se evalúa en F2, con migración explícita y aprobación.

---

## 4. Estrategia frente al 97,7 % `unresolved`

- `unresolved` es un **atributo del registro**, no un evento adicional: no genera alerta por ocurrencia.
- Agregación por `shiftId`: un solo `managerResolution` por operación, no por delta.
- El reporte muestra `unresolved` agrupado por **causa de configuración** (turno sin `shift_admin_id`, ubicación sin responsable…), no por turno.
- La comunicación a trabajadores nunca se bloquea ni se retrasa por `unresolved`.

---

## 5. Muestreo y agregación de alertas simuladas

- Alertas de configuración **coalescidas por `(company_id, causa, ventana 24h)`** → una entrada agregada con contador y hasta 10 ids de ejemplo.
- Nivel 0 se registra pero se marca `suppressed`, fuera del conteo de comunicaciones.
- Console sink limitado a 1 línea por `correlationId`; el detalle vive en el buffer.
- Muestreo configurable (default 100 % en dev, 10 % si el volumen supera 1.000 registros/sesión).

---

## 6. Casos de prueba unitarios

- **D3:** CA-D3-01…CA-D3-10 como fixtures del sobre estándar.
- **Precedencia:** `shift_explicit` presente descarta niveles inferiores; dos explícitos → ambos.
- **Dedupe:** manager + supervisor misma persona → un destinatario, una comunicación.
- **Materialidad:** nota interna → nivel 0, cero trabajadores; cambio neto nulo → silencio.
- **Reemplazo:** un solo `ChangeSet`; saliente y entrante con mensajes distintos; supervisor con mensaje de reemplazo; ningún otro trabajador.
- **Reachability:** afectado sin puente employee→user → `unreachable` con razón, presente en el reporte.
- **Autor:** actor sin relación explícita nunca es destinatario.
- **Determinismo:** mismo evento → `ObservationRecord` byte-idéntico salvo timestamps.
- **Idempotencia:** mismo `eventId` dos veces → una decisión.
- **Estructural:** cero imports de dominio y de canales en el motor.

## 7. Casos de prueba de integración

- Editar hora, fecha y ubicación de un turno real de QA → 1 `correlationId`, deltas correctos, cero mutaciones extra (verificado con conteos antes/después en `scheduled_shifts`, `shift_assignments`, `notifications`, `time_entries`).
- Reemplazo de trabajador en una operación → consolidación en un `ChangeSet`.
- Cancelación de turno → nivel 3, ack probatorio simulado, sin envío.
- Turno con `shift_admin_id` seteado vs. turno sin él → `shift_explicit` vs. `unresolved`.
- Turno con `check_in_admin` → supervisor, nunca manager.
- Corrida sobre un lote de QA → reporte de divergencia con las 10 respuestas.
- Flag apagado → cero registros, cero logs, cero coste.

---

## 8. Plan de rollback

1. **Nivel 1 (inmediato):** apagar `CI_OBSERVATION_MODE`. El motor deja de ejecutarse; ningún flujo de negocio cambia.
2. **Nivel 2:** eliminar la llamada `emit(...)` de los puntos de guardado (una línea por punto).
3. **Nivel 3:** borrar el directorio `src/lib/change-intelligence/` y la ruta dev.

Sin migraciones que revertir, sin datos que limpiar, sin estado de negocio afectado. CA-F1-11 se cumple por construcción: no existe dependencia de entrega que desmontar.

---

## 9. Confirmación de cero envíos reales

El paquete del motor y el adapter **no importan ningún transporte**. No hay llamadas a edge functions, ni inserciones en `notifications`, ni providers de push/SMS/email/WhatsApp. `route.ts` devuelve un canal como **valor de decisión**, nunca ejecuta una entrega. El test estructural bloquea la introducción de cualquier dependencia de canal. CA-F1-01 verificado por prueba, no por disciplina.

## 10. Confirmación de cero migraciones

F1 no crea, altera ni elimina tablas, columnas, tipos, políticas, funciones ni triggers. Todas las lecturas son `SELECT` sobre objetos existentes (`scheduled_shifts`, `shift_assignments`, `employees`, `profiles`). No se crean tablas de responsabilidad: los niveles 2–5 de D3 permanecen `unresolved` hasta que se apruebe el modelo de datos en una fase posterior.

---

**Alcance de cambios cubierto:** solo `shift.time_changed`, `shift.date_changed`, `shift.location_changed`, `shift.worker_added`, `shift.worker_removed`, `shift.cancelled`. Ningún otro dominio.
