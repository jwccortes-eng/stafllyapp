# F1.1 — Evidence Run (Operational Signal Engine, Shadow Mode)

Estado: **implementado**. `operational_signal_shadow_mode = true`. Ningún envío real,
canal, preferencia, push, chat, email o SMS fue modificado. F2 no iniciado.

## 1. Configuración implementada

| Control | Dónde | Comportamiento |
|---|---|---|
| Persistencia por compañía | tabla `public.operational_signal_shadow_config` | `persistence_enabled` (default `false`) + `sample_rate` (0–1). **No existe hardcode global**: se eliminó `VITE_OSE_SHADOW_PERSISTENCE`. |
| Kill switch | `flags.ts` (`ose:kill-switch`) | Corta observación, evaluación y escritura. Se re-verifica dentro del microtask, así que detiene registros ya encolados. |
| Pausa local | `flags.ts` (`ose:shadow-persistence = paused`) | Apaga el registro solo en ese dispositivo/sesión. |
| Gate en runtime | `company-config.ts::isPersistenceEnabledForCompany` | Compañía desconocida ⇒ nunca persiste. Cache 60 s, carga read-only y failure-safe. |
| Sink | `sink.ts` | Fire-and-forget en microtask, mide latencia, registra éxito/error en telemetría. Nunca lanza hacia `useNotifications`. |
| Telemetría | `health.ts` | Volumen observado, intentos, errores, % error, latencia media y p95, último error. |
| Dashboard | `/app/dev/operational-signals` | Toggle por compañía, salud del sink, distribución por familia/prioridad, aviso de métricas estimadas. |

### RLS confirmada

`operational_signal_shadow_config`: SELECT/INSERT/UPDATE solo si
`has_company_role(auth.uid(), company_id, 'admin')` o `is_company_owner(...)`. Sin `DELETE`.

`operational_signal_shadow_decisions`: SELECT solo owner/admin de la compañía; INSERT solo
miembros de esa compañía. **Sin políticas de UPDATE/DELETE** y con trigger
`trg_ossd_block_mutations` que rechaza cualquier `UPDATE`/`DELETE` ⇒ bitácora append-only,
inmutable y auditable (QA8).

## 2. Compañías activadas

Ninguna por defecto. La activación es una acción explícita de owner/admin desde el panel
(`Registrar decisiones sombra (solo esta compañía)`), registrada con `updated_by` y `updated_at`.
Recomendación de arranque: 1 compañía piloto de alto volumen durante 7 días.

## 3. Volumen, errores y latencia

Medidos en vivo por sesión en el panel (`Salud del sink`): eventos observados, escrituras
intentadas/ok/fallidas, % de error, latencia promedio y p95, omitidos por gate. En este entorno el
Evidence Run aún no acumula tráfico productivo: los contadores arrancan en cero hasta que una
compañía active la persistencia.

## 4. Distribución por familia y prioridad

El panel agrega ambas dimensiones (`critical/high/medium/low/silent` y las 12 familias). Los
clasificadores se validan con 16 tests automatizados (críticos, agrupables y silenciosos entre
ellos).

## 5. Métricas estimadas — advertencia explícita

`actual_recipients_count` todavía se observa **desde el cliente** (1 por evento recibido), así que
la reducción de ruido es un **piso conservador**. El panel lo declara en texto visible.

## 6. Política de retención propuesta

- **90 días** de retención en caliente para `operational_signal_shadow_decisions`.
- Purga diaria por job programado (`delete ... where created_at < now() - interval '90 days'`)
  ejecutada con `service_role`, que no está sujeta al trigger de bloqueo si se implementa una
  excepción explícita de purga; alternativamente, partición mensual y `DROP PARTITION`.
- Agregados diarios por compañía/familia/prioridad conservados **13 meses** (sin `subject_user_id`)
  para tendencia sin dato personal.
- Borrado inmediato al eliminar la compañía (ya cubierto por `ON DELETE CASCADE` en la config;
  añadir la misma cascada en decisiones durante F2).

## 7. QA

| # | Caso | Resultado |
|---|---|---|
| 1 | A activa persistencia, B no | ✅ gate por compañía |
| 2 | A registra, B no | ✅ test `QA1/QA2` |
| 3 | Ningún evento cruza tenants | ✅ compañía desconocida ⇒ `false`; RLS por `company_id` |
| 4 | Fallo de persistencia no afecta notificaciones | ✅ error capturado, logueado, no lanzado |
| 5 | Kill switch detiene nuevos registros | ✅ verificado antes de la evaluación y dentro del microtask |
| 6 | Dashboard solo muestra la compañía activa | ✅ query `.eq(company_id)` + RLS |
| 7 | Críticos/agrupables/silenciosos bien clasificados | ✅ 9 tests F1 + panel |
| 8 | Logs inmutables y auditables | ✅ sin UPDATE/DELETE + trigger de bloqueo |

## 8. Riesgos

1. **Subestimación de ruido** por conteo cliente-side (mitiga F2).
2. **Sub-observación**: solo se observan notificaciones que llegan por realtime al cliente activo;
   eventos sin sesión abierta no se registran.
3. **Crecimiento de tabla** si se activan muchas compañías al 100% ⇒ usar `sample_rate`.
4. **Ruido en consola** ante fallos repetidos de escritura (acotado a `console.warn`).

## 9. Preparación para F2 (backend)

- Mover la observación a un trigger/edge function junto al insert real de `notifications`,
  usando el mismo contrato `OperationalSignalEvent`.
- Portar `evaluateOperationalSignal` a SQL/Deno conservando `decision_version` para comparabilidad.
- Registrar la audiencia real completa (`actual_recipients_count` verdadero) y dejar de estimar.
- Reutilizar `operational_signal_shadow_config` como gate del lado servidor.
