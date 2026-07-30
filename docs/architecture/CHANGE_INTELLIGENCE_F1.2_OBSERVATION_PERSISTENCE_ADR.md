# ADR-CI-002 — Durable Shadow Observation Persistence (F1.2)

- Estado: **PROPUESTO — requiere aprobación humana antes de implementar**
- Fecha: 2026-07-30
- Fase: F1.2 (Durable Shadow Observation)
- Depende de: `CHANGE_INTELLIGENCE_CHARTER.md` (P1–P17), `CHANGE_INTELLIGENCE_DOMAIN_EVENT_CONTRACT.md`, `CHANGE_INTELLIGENCE_DECISIONS_F0.md`
- Alcance: persistir **evidencia de decisión** del motor durante operaciones reales. Cero entrega.

---

## 1. Decisión propuesta

Persistir la evidencia en una **tabla dedicada de observación CI (Alternativa A)**, aislada del negocio,
en el esquema `public` con prefijo `ci_`, escrita **solo** vía Edge Function con `service_role`,
legible **solo** por staff de plataforma en allowlist, con retención automática y borrado probado.

Rechazadas: B (auditoría existente), C (edge logs), D (externo), E (sessionStorage).

---

## 2. Comparación de alternativas

| Criterio | A. Tabla dedicada `ci_*` | B. Auditoría existente (`activity_log`, `shift_audit_log`) | C. Edge/server logs | D. Almacén externo desacoplado | E. sessionStorage + export manual |
|---|---|---|---|---|---|
| Aislamiento del negocio | **Alto** — tablas nuevas, sin FK a dominio, sin triggers de negocio | Bajo — mezcla evidencia CI con auditoría operativa consumida por producto | Alto | Alto | Alto |
| Privacidad | **Alta** — esquema whitelist, columnas tipadas, sin campos libres | Media — `jsonb` libre invita a PII | Media/baja — logs son texto libre y se replican a terceros | Baja — sale del perímetro del tenant | Alta pero efímera |
| Retención | **Controlable** (`observed_at` + job de purga) | Ligada a la política de auditoría del producto | Fija por proveedor, poco granular | Contrato externo | Nula (se pierde al cerrar pestaña) |
| Consulta | **Alta** — SQL, agregados, índices | Media — filtrar ruido ajeno | Muy baja — grep | Media | Muy baja |
| Volumen | Predecible; sampling y agregados diarios | Contamina una tabla caliente | Alto y costoso | Medio | Trivial |
| Costo | Bajo (filas pequeñas, sin payload) | Bajo pero degrada tabla en uso | Medio/alto | Medio + contrato | Cero |
| Riesgo de volverse cola de entrega | **Mitigable**: sin columnas `status/sent_at/retry_count/channel_target`, sin índice "pendientes", sin cron consumidor (ver §10) | Alto — auditoría ya tiene consumidores que podrían leerla | Bajo | Medio | Bajo |
| Facilidad de eliminación | **Alta** — `DELETE ... WHERE company_id`, o `DROP TABLE` | Baja — borrar mezclado con auditoría real | Baja | Depende del proveedor | Trivial |
| RLS / autorización | **Explícita** — deny-by-default + allowlist | Hereda políticas ya amplias para admins de tenant | Sin RLS | Fuera de RLS | N/A |
| Rollback | **Limpio** — flag OFF + `DROP TABLE` | Sucio | N/A | Sucio | Trivial |
| Compatibilidad entornos | Igual en demo/staging/prod, discriminada por `environment` | Igual | Distinta por entorno | Requiere credenciales extra | Solo local |
| Impacto en producción | Bajo (INSERT async, best-effort, nunca bloquea) | **Medio/alto** — escribe en tabla crítica | Bajo | Latencia de red | Nulo |

**Descartes en una línea:**
- **B** viola P16/aislamiento: los admins de tenant ya leen auditoría; la evidencia CI se volvería visible y editable fuera del staff de plataforma.
- **C** no permite reproducir métricas ni revisión humana y no ofrece borrado por compañía.
- **D** exporta decisiones sobre personas fuera del perímetro sin necesidad.
- **E** ya existe (F1) y no sobrevive a un piloto de 3–7 días con operaciones reales.

---

## 3. Esquema mínimo propuesto (sin migración todavía)

### 3.1 `public.ci_observations` — una fila por evaluación

| Columna | Tipo | Nota |
|---|---|---|
| `observation_id` | `uuid pk default gen_random_uuid()` | |
| `event_id` | `text not null` | idempotencia con `unique (event_id, engine_version)` |
| `correlation_id` | `text` | reemplazos comparten correlación |
| `company_id` | `uuid not null` | **sin FK** (aislamiento + borrado independiente) |
| `environment` | `text not null check in ('demo','staging','production')` | |
| `pilot_stage` | `smallint not null check in (1,2,3)` | |
| `aggregate_type` / `aggregate_id` | `text` / `uuid` | |
| `change_type` | `text not null` | limitado a los 7 tipos de F1.2 |
| `occurred_at` / `observed_at` | `timestamptz not null` | |
| `engine_version` / `adapter_version` | `text not null` | |
| `impact_level` | `smallint not null check between 0 and 3` | |
| `delta_semantics` | `text[] not null default '{}'` | p.ej. `{start_time_moved_later}` — **sin valores** |
| `audience_counts` | `jsonb not null default '{}'` | solo conteos por relación |
| `resolved_role_types` | `text[] not null default '{}'` | |
| `unresolved_count`, `unreachable_count`, `deduplication_count` | `int not null default 0` | |
| `suppression_reasons` | `text[] not null default '{}'` | |
| `simulated_channel` | `text not null default 'none'` | **siempre simulado** |
| `acknowledgement_required` | `text check in ('none','light','probatory')` | |
| `deadline_category` | `text check in ('none','lt_2h','lt_12h','lt_24h','gt_24h')` | categoría, no timestamp personal |
| `message_quality_gate` | `text check in ('pass','fail')` + `message_quality_issues text[]` | |
| `privacy_gate` | `text check in ('pass','fail')` + `privacy_gate_findings text[]` | |
| `legacy_recipient_count`, `ci_recipient_count` | `int not null default 0` | |
| `unresolved_causes` | `text[] not null default '{}'` | |
| `location_ref`, `client_ref` | `text` | **ref opaca/etiqueta redactada**, no nombre libre |
| `observation_only` | `boolean not null default true` + `check (observation_only)` | invariante a nivel de base de datos |

Índices: `(company_id, observed_at desc)`, `(change_type, observed_at desc)`, `(correlation_id)`, parcial `(company_id) where unresolved_count > 0`.
**No** se crea índice sobre "no procesados": no existe tal concepto.

### 3.2 `public.ci_observation_reviews` — clasificación humana (append-only)

`review_id`, `observation_id` (FK → `ci_observations` `on delete cascade`), `reviewer_user_id`, `verdict`
(`correct | audience_excessive | audience_insufficient | message_unclear | wrong_level | wrong_ack | wrong_deadline | wrong_reachability | needs_investigation`),
`notes` (máx. 500, redactado en cliente y servidor), `created_at`.
**Nunca** actualiza la observación original (P: la evidencia es inmutable).

### 3.3 `public.ci_observation_daily_metrics` — agregados que sobreviven al borrado

`company_id`, `day`, `environment`, `change_type`, y conteos de las 20 métricas agregables. Sin `aggregate_id`, sin refs de persona.

### 3.4 `public.ci_pilot_allowlist` — control del piloto

`company_id`, `pilot_stage`, `enabled_by`, `enabled_at`, `expires_at`, `notes`. Sin fila ⇒ no se observa nada de esa compañía.

**Prohibido por diseño en el esquema:** teléfonos, emails, tokens, payroll, documentos, notas internas, direcciones,
payload del turno, textos de mensajes renderizados (solo el resultado del gate), nombres de personas.

---

## 4. RLS y matriz de acceso

Deny-by-default; **ninguna** política para `anon`.

| Actor | `ci_observations` | `ci_observation_reviews` | `ci_observation_daily_metrics` | `ci_pilot_allowlist` |
|---|---|---|---|---|
| Anónimo | — | — | — | — |
| Trabajador | — | — | — | — |
| Supervisor / manager de tenant | — | — | — | — |
| Admin / owner de compañía | — | — | — | — |
| Staff de plataforma en allowlist (`developer`/`owner`/`founder` + fila en allowlist) | SELECT | SELECT, INSERT (propio) | SELECT | SELECT |
| `service_role` (Edge Function de escritura) | INSERT, DELETE (purga) | — | INSERT/UPSERT, DELETE | SELECT |

- GRANTs: `GRANT SELECT ON ... TO authenticated` (filtrado por RLS), `GRANT ALL ... TO service_role`. Sin `anon`.
- Predicado de lectura: `public.ci_can_read_observations(auth.uid())` — función `security definer`, `stable`, `set search_path = public`, que exige rol de plataforma **y** pertenencia a `ci_platform_allowlist`.
- **Ningún cliente escribe**: el INSERT solo ocurre en la Edge Function con `service_role`; el frontend no tiene política de INSERT.
- UI: se mantiene `ObservationAccessGuard` (ya validado con 11 tests) + bloqueo de producción sin override explícito.

---

## 5. Retención y eliminación

| Dato | Retención | Mecanismo |
|---|---|---|
| Observaciones detalladas | **30 días** | purga diaria por `observed_at < now() - 30d` |
| Revisiones humanas | 30 días (cascade con la observación) | `on delete cascade` |
| Métricas diarias agregadas | **90 días** | purga diaria |
| Allowlist del piloto | Manual | vence con `expires_at` |

- **Automática:** una función de purga invocada por la Edge Function de mantenimiento (no un cron de envío).
- **Manual por compañía:** `DELETE FROM ci_observations WHERE company_id = $1` — acción explícita de staff, con confirmación.
- **Fin del piloto:** `DROP TABLE ci_observations, ci_observation_reviews, ci_observation_daily_metrics, ci_pilot_allowlist` deja cero rastro.
- **Solicitud de privacidad:** el modelo no guarda identificadores de persona, así que no hay dato personal que exportar; aun así se borra la compañía/ubicación implicada dentro de las 72 h.
- **Sobreviven al borrado:** solo `ci_observation_daily_metrics` (conteos sin `aggregate_id`, sin refs de persona) — suficiente para las 20 métricas de tendencia.

Se acepta la recomendación inicial (30/90 días) sin desviaciones.

---

## 6. Plan de piloto por etapas

| Etapa | Alcance | Duración | Entrada | Salida |
|---|---|---|---|---|
| 1 | Compañía demo/sandbox, datos sintéticos y operaciones manuales | 24–48 h | Aprobación de este ADR | Escritura verificada, gates en verde, purga probada |
| 2 | **Una** compañía piloto autorizada, solo Scheduling | 3–7 días | Aprobación humana explícita + fila en allowlist | Revisión humana sobre muestra representativa, divergencias documentadas |
| 3 | Varias compañías seleccionadas | A definir | Aprobación de resultados de Etapa 2 | Gates de F1.2 |

Ninguna etapa se activa sola: requiere flag `CI_DURABLE_OBSERVATION` **y** fila vigente en `ci_pilot_allowlist`. Sin ambas, el motor sigue en modo F1 (memoria).

Tipos incluidos, sin adiciones: `shift.time_changed`, `shift.date_changed`, `shift.location_changed`, `shift.worker_added`, `shift.worker_removed`, `shift.worker_replaced`, `shift.cancelled`.

---

## 7. Rollback

1. **Nivel 0 (segundos):** `CI_DURABLE_OBSERVATION = false` → se deja de persistir; la app no cambia de comportamiento.
2. **Nivel 1:** vaciar `ci_pilot_allowlist` → ninguna compañía observada.
3. **Nivel 2:** borrar datos por compañía.
4. **Nivel 3:** eliminar la Edge Function.
5. **Nivel 4:** `DROP TABLE` de las cuatro tablas — el resto del producto no las referencia (sin FK entrantes, sin triggers, sin vistas).

El rollback se **prueba** en Etapa 1 antes de pasar a Etapa 2.

---

## 8. Volumen y sampling

- Estimación: ~1 evaluación por cambio de turno; con una compañía piloto activa, orden de 10²–10³ filas/día. Fila < 1 KB.
- **Tope duro:** `CI_MAX_OBSERVATIONS_PER_COMPANY_PER_DAY` (por defecto 5 000). Al superarlo se deja de persistir el detalle y solo se incrementan los agregados diarios (nunca se bloquea la operación).
- Sampling determinístico opcional por hash de `event_id` (`CI_OBSERVATION_SAMPLE_RATE`, por defecto 1.0 en piloto) para no sesgar el análisis.
- Escritura **best-effort y no bloqueante**: el fallo de persistencia nunca interrumpe una operación de negocio ni se reintenta (los reintentos son mecánica de entrega y están prohibidos).

---

## 9. Plan de pruebas

1. **Estructural (P16):** el motor sigue sin importar dominio ni cliente de base de datos (test existente extendido).
2. **Anti-delivery:** test que falla si aparecen en el repo del motor/adaptadores strings de canal real (`push`, `sms`, `whatsapp`, `resend`, `twilio`, `fcm`, `apns`) o columnas de cola (`sent_at`, `retry_count`, `delivery_status`).
3. **Invariante `observation_only`:** intento de INSERT con `false` debe fallar por CHECK.
4. **Serialización de privacidad:** la fila construida no contiene emails, teléfonos, tokens, payroll ni nombres (extensión del gate ya verde en F1.1).
5. **RLS:** worker, supervisor, admin de compañía y anónimo obtienen 0 filas; staff en allowlist lee; cliente no puede insertar.
6. **Idempotencia:** doble emisión del mismo `event_id` no duplica filas.
7. **Retención:** purga borra >30 días y conserva agregados >30 y <90.
8. **Rollback:** con el flag OFF no se produce ninguna escritura.
9. **Reproducibilidad de métricas:** las 20 métricas calculadas desde la tabla coinciden con las calculadas en memoria para la matriz A–O.
10. **Revisión humana:** insertar un veredicto no modifica la observación original.

---

## 10. Confirmación explícita: no existe ruta de entrega

- No se añade ninguna dependencia de proveedor, SDK, webhook, cola ni cron de envío.
- `simulated_channel` es descriptivo; **no existe** columna de destinatario individual, estado de envío, reintento ni acuse.
- No hay índice ni consulta de "pendientes de enviar": la tabla es un libro de evidencia, no una bandeja.
- `observation_only` es `NOT NULL` con `CHECK (observation_only)` — la base de datos rechaza cualquier fila que no sea observación.
- Los tests 2 y 3 de §9 hacen fallar el build si alguien intenta convertirla en cola.
- No se crean acknowledgements reales: `acknowledgement_required` y `deadline_category` son clasificaciones, no compromisos con una persona.

---

## 11. Archivos y migraciones propuestos (nada creado todavía)

**Migraciones (1 sola, tras aprobación):**
- `ci_observations`, `ci_observation_reviews`, `ci_observation_daily_metrics`, `ci_pilot_allowlist`, `ci_platform_allowlist`
- GRANTs → `ENABLE ROW LEVEL SECURITY` → políticas, en ese orden
- Funciones `ci_can_read_observations(uuid)` y `ci_purge_expired_observations()`

**Código nuevo:**
- `src/lib/change-intelligence/observation/durable-record.ts` — mapeo puro `ObservationRecord → CiObservationRow` (whitelist estricta)
- `src/lib/change-intelligence/observation/durable-sink.ts` — sink que invoca la Edge Function; no-op si el flag está OFF
- `src/lib/change-intelligence/observation/metrics.ts` — las 20 métricas sobre filas persistidas
- `src/lib/change-intelligence/observation/review.ts` — tipos y lógica pura de la clasificación humana
- `supabase/functions/ci-observation-write/index.ts` — único punto de escritura (`service_role`, valida allowlist, tipos permitidos e invariantes)
- `supabase/functions/ci-observation-purge/index.ts` — purga por retención
- `src/pages/admin/dev/ChangeIntelligenceObservation.tsx` — pestaña histórica, métricas y panel de revisión
- `src/components/change-intelligence/ObservationReviewPanel.tsx`
- Tests: `durable-record.test.ts`, `no-delivery-path.test.ts`, `metrics.test.ts`, `rls.test.ts`

**Modificados:** `flags.ts` (`CI_DURABLE_OBSERVATION`, sample rate, tope diario), `adapters/scheduling/emit.ts` (elegir sink), `isolation.test.ts`.

---

## 12. Riesgos y criterios de aborto

| Riesgo | Mitigación | **Aborta el piloto** |
|---|---|---|
| Deriva a cola de entrega | Esquema sin campos de envío + tests 2/3 | Sí, inmediato |
| PII en la tabla | Whitelist + gate de privacidad + validación en la Edge Function | Sí, inmediato + borrado |
| Volumen inesperado | Tope diario + sampling | Si se supera 3 días seguidos |
| Latencia en operaciones reales | Escritura no bloqueante, sin reintentos | Si aparece cualquier regresión perceptible |
| Acceso indebido | RLS deny-by-default + doble allowlist | Sí, inmediato |
| Fallback masivo de audiencia | Métrica 8 vigilada a diario | Si `unresolved` amplía audiencia una sola vez |
| Confusión de entorno | Columna `environment` + banner de staging | Si aparecen filas de producción sin autorización |
| Sospecha de entrega real | Auditoría del repo | Sí, inmediato |

---

## 13. Solicitud de aprobación

Pendiente de autorización humana para: (a) esta alternativa de persistencia, (b) el esquema de §3,
(c) la retención 30/90, (d) iniciar Etapa 1 en la compañía demo. **Hasta entonces no se crea ninguna migración ni código.**
