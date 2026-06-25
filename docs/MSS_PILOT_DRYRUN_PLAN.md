# MSS Pilot Dry-Run Plan v2

**Estado:** Diseño aprobado y persistido. **No ejecuta nada.**
**Propósito:** Procedimiento de validación controlada para el primer uso real del Ecosystem Identity Checkpoint (EIC) contra un tenant productivo — en este caso MSS / My Staff Solution LLC.
**Ejecución:** Requiere autorización separada explícita. No se ejecuta ningún lookup, attach, edge function, migración ni write en base de datos como parte de este documento.

---

## 1. Objetivo

Validar de forma segura y medible que el EIC P0.1-c puede:

- Buscar identidades de un empleado MSS en el ecosistema sin duplicar registros.
- Detectar coincidencias de confianza (HIGH / MEDIUM / LOW / NONE) usando solo phone/email normalizado.
- Emitir y verificar un `match_token` firmado con expiración y alcance restringido.
- Registrar cada intento en `activity_log` con acción (`eic_lookup`, `eic_attach`) y resultado.
- Producir un reporte redactado que permita al owner decidir si se autoriza un attach futuro.
- Garantizar **cero mutaciones** en payroll, shifts, documents, auth.users, time_entries o registros operativos de MSS durante el dry-run.

El dry-run no busca activar portal ni adjuntar usuarios. Busca evidencia.

---

## 2. Scope

### Incluido

- Ejecución de `ecosystem_identity_lookup` para **exactamente 1 worker de MSS** elegido por el owner.
- El worker debe ser un empleado real, activo, con al menos un teléfono o email verificable.
- Recopilación de resultados del lookup: `match_strength`, `reasons`, `source_tenant`, `target_tenant`, y un match token firmado.
- Registro de intentos en `activity_log` (produce rows de auditoría; no toca datos operativos).
- Incremento de `eic_rate_limits` (tabla de control, no contiene PII).
- Verificación de post-condiciones: cero deltas en tablas protegidas.

### Excluido explícitamente

- `ecosystem_identity_attach_existing_employee_to_auth_user` (ningún attach).
- Cualquier write a `employees`, `auth.users`, `payroll`, `documents`, `shifts`, `assignments`, `compensation`.
- Cambios de frontend, migraciones, edge functions permanentes, o bulk processing.
- Activación de portal, documentos, onboarding, o preparación operativa del worker.
- Uso de datos SSN/EIN/DOB/dirección/docs para matching (EIC solo usa phone/email).

---

## 3. Criterios de selección del worker candidato

El owner debe designar un worker que cumpla **todos** los criterios obligatorios:

| # | Criterio | Motivo |
|---|----------|--------|
| 1 | Empleado activo en MSS (`status` activo, no placeholder, no `System N`). | Evita ruido de registros de importación o prueba. |
| 2 | Tiene `phone_number` o `email` limpio, normalizable a 10 dígitos / email canonizado. | EIC requiere al menos un canal de contacto verificable. |
| 3 | No es duplicado de otro empleado MSS bajo consolidación activa. | Evita ambigüedad de identidad. |
| 4 | No está vinculado ya a un `user_id` en auth (no `portal_access_enabled` ni `user_id`). | El dry-run busca candidatos, no targets ya resueltos. |
| 5 | Preferentemente el owner tiene contexto real de su identidad en Quality Staff (QS) o en otro tenant del ecosistema. | Facilita revisión humana posterior. |
| 6 | No es un registro de `person_type_guess` placeholder, system, external, o `payroll_safe=false`. | Excluye automáticamente del EIC. |
| 7 | No pertenece a roles críticos o datos sensibles de compensación. | Reduce riesgo de exposición accidental. |
| 8 | El owner acepta que el intento se registre en `activity_log` y `eic_rate_limits`. | Trazabilidad requerida. |

Si el worker no cumple algún criterio, se descarta y se elige otro.

---

## 4. Pre-checks (P1–P12)

Antes de ejecutar cualquier lookup real, se debe completar esta lista:

| ID | Check | Estado esperado | Bloquea ejecución |
|----|-------|-----------------|-------------------|
| P1 | Plan v2 aprobado y guardado en `docs/MSS_PILOT_DRYRUN_PLAN.md` | Sí | Sí |
| P2 | Owner designó 1 worker candidato de MSS y validó criterios 1–8 | Sí | Sí |
| P3 | EIC P0.1-c QA COMPLETE (11/11 gates PASS) | Sí | Sí |
| P4 | Sección de autorización de este documento firmada por el owner (ver sección 10) | Sí | Sí |
| P5 | Snapshot pre-run de `employees` de MSS (`id`, `user_id`, `portal_access_enabled`, `phone_number`, `email`, `status`) capturado | Sí | Sí |
| P6 | Snapshot pre-run de `activity_log` y `eic_rate_limits` capturado | Sí | Sí |
| P7 | Entorno de ejecución aislado: edge function temporal, no frontend, no cron, no bulk | Sí | Sí |
| P8 | Service-role key disponible solo en terminal local del owner / executor humano designado | Sí | Sí |
| P9 | No hay otras operaciones de EIC activas ni escrituras concurrentes en MSS | Sí | Sí |
| P10 | Rate-limit helper operativo y no bloqueado para `lookup` en el tenant | Sí | Sí |
| P11 | Vault secret `eic_match_token_secret` configurado y verificado | Sí | Sí |
| P12 | Canal de comunicación owner↔executor establecido para aborto inmediato | Sí | Sí |

Si algún check no está en estado esperado, **no ejecutar**.

---

## 5. Dry-run steps (T0–T10)

### T0 — Preparación

- Owner ejecuta en terminal local: snapshot SQL pre-run de MSS y tablas de control.
- Guardar output en archivo local, no compartir en Lovable/chat.
- Confirmar que el worker candidato sigue cumpliendo criterios.

### T1 — Deploy de edge function temporal (solo si aplica)

- Si se usa executor local: saltar.
- Si se usa edge function temporal: deploy con `--no-verify-jwt` no permitido. Usar JWT de sesión de admin con `service_role` solo en invocación de prueba local. Eliminar inmediatamente después de T10.

### T2 — Lookup estructurado

- Invocar `ecosystem_identity_lookup` con:
  - `source_user_id`: auth user del admin/owner que ejecuta (no el worker).
  - `target_company_id`: UUID de MSS.
  - `target_employee_id`: UUID del worker candidato.
- Capturar solo: `match_strength`, `reasons`, `has_phone`, `has_email`, `source_tenant_id`, `source_tenant_name`, `target_tenant_id`, `target_tenant_name`, `expires_at` (sin datos desnormalizados de PII).
- No capturar ni registrar el `match_token` completo; solo confirmar que fue emitido.

### T3 — Verificación de token

- Validar que el token devuelto tiene firma HMAC-SHA256 y expiry ≤ 5 minutos.
- No ejecutar attach.

### T4 — Rate-limit sanity

- Verificar que se creó exactamente 1 fila en `eic_rate_limits` para el attempt_type `lookup`.
- Confirmar que no se activó rate limit para el tenant/admin.

### T5 — Audit sanity

- Verificar que se creó exactamente 1 fila en `activity_log` con `action='eic_lookup'`.
- Confirmar que los detalles del log no contienen PII sin redactar.

### T6 — Post-snapshot

- Capturar snapshot post-run de `employees` de MSS, `activity_log`, `eic_rate_limits`.
- Comparar con snapshot pre-run.

### T7 — Delta comparison

- `employees` de MSS: delta debe ser **0**.
- `auth.users`: delta debe ser **0**.
- `payroll`, `time_entries`, `shifts`, `documents`, `compensation`: delta debe ser **0**.
- `activity_log`: delta = +1 lookup.
- `eic_rate_limits`: delta = +1 lookup.

### T8 — Human review

- Owner revisa el resultado de lookup y aplica la checklist de la sección 6.
- Owner decide: `no-attach`, `candidate-for-future-attach`, o `reject`.

### T9 — Cleanup

- Eliminar edge function temporal si se usó.
- Borrar variables de entorno locales del terminal (ej: `unset SUPABASE_SERVICE_ROLE_KEY`).
- No borrar logs de auditoría (`activity_log`, `eic_rate_limits`).

### T10 — Report final

- Generar reporte siguiendo formato de sección 7.
- Entregar a Lovable solo versión redactada. Nunca compartir tokens, service keys, ni PII crudo.

---

## 6. Human review checklist

El owner debe responder estas preguntas antes de decidir:

| # | Pregunta | Respuesta |
|---|----------|-----------|
| 1 | ¿El match_strength fue HIGH, MEDIUM, LOW o NONE? | |
| 2 | ¿Las reasons devueltas son consistentes con el contexto real del worker? | |
| 3 | ¿El source tenant es Quality Staff (QS) o un tenant inesperado? | |
| 4 | ¿Hay algún riesgo de duplicado no detectado por EIC? | |
| 5 | ¿El worker tiene documentos, payroll, shifts o asignaciones activas en MSS que podrían verse afectados por un futuro attach? | |
| 6 | ¿El owner confirma que este worker es un buen candidato para un attach futuro, o prefiere rechazarlo? | |
| 7 | ¿Se detectó algún error de RPC, rate limit, o token inválido? | |
| 8 | ¿Se respetó la redacción de PII en el reporte? | |

Resultado de revisión: **no-attach** / **candidate-for-future-attach** / **reject**

---

## 7. Stop conditions (aborto inmediato)

Abortar el dry-run si ocurre cualquiera de lo siguiente:

1. Cualquier delta distinto de cero en `employees` de MSS.
2. Cualquier write en `auth.users`, `payroll`, `time_entries`, `shifts`, `assignments`, `compensation`, `documents`, o `company_settings`.
3. El lookup devuelve match_strength HIGH sin que el owner esté listo para revisión humana (no significa autorización de attach).
4. El match_token no se pudo verificar, está expirado, o la firma falla.
5. Rate limit activado para el admin/owner ejecutor.
6. Error 500 / excepción no manejada en la función RPC.
7. Snapshot pre/post inconsistente por cualquier causa externa.
8. Presencia de PII cruda en logs de auditoría o en reporte.
9. El owner emite la palabra clave de aborto.

En caso de aborto, proceder a T9 (cleanup) y reportar `status=aborted`.

---

## 8. Report format (redacted)

El reporte final debe contener únicamente estos campos:

```text
dry_run_id: <uuid o timestamp generado localmente>
status: success | aborted | error
tenant_target: <tenant name, e.g. MSS>
source_tenant: <tenant name o "none">
worker_selected: <employee_id, no email/phone/name>
match_strength: HIGH | MEDIUM | LOW | NONE
reasons: <array de strings de reasons RPC, no PII>
has_phone: true | false
has_email: true | false
token_issued: true
audit_action: eic_lookup
audit_count: 1
rate_limit_hit: true | false
employees_delta: 0  # obligatorio
protected_deltas: 0  # obligatorio
recommendation: no-attach | candidate-for-future-attach | reject
owner_approved_next_step: false  # siempre false en dry-run
notes: <string breve, sin PII>
```

### No incluir

- `match_token` completo ni parcial.
- `phone_number` sin enmascarar.
- `email` sin enmascarar.
- SSN, EIN, DOB, dirección, documentos, payroll, compensation.
- Service-role key, JWTs, o credenciales.

---

## 9. Reglas de seguridad

- **Service-role key permanece fuera de Lovable.** Solo en terminal local del executor humano.
- **No se ejecutan writes de datos operativos.** Solo `activity_log` y `eic_rate_limits` (auditoría + control).
- **No se comparten tokens ni PII crudos** en chat, commit, ni documentos.
- **El dry-run se ejecuta sobre exactamente 1 worker.** No bulk.
- **No se modifica `auth.users`, `employees`, `payroll`, `shifts`, `documents`, `compensation`.**
- **No se reutiliza el `match_token` fuera de la ventana de verificación.**
- **Edge function temporal se elimina al final**, si se usó.
- **Todo reporte se redacta antes de compartir.**
- **El dry-run no activa portal, onboarding, documentos ni shifts.**

### 9.1 Token Redaction Hardening (precondición obligatoria — 2026-06-25)

Cualquier ejecución EIC real futura (lookup o attach, en MSS o en cualquier
tenant productivo) debe cumplir **todos** los siguientes requisitos antes
de invocar el RPC:

1. La edge function importa y usa `supabase/functions/_shared/eic-redact.ts`:
   - `deepRedactTokens(value)` para cualquier estructura intermedia.
   - `buildEicSafeResponse(rpcRow)` (allowlist-first) para construir el
     payload de respuesta. **Solo** los campos
     `match_strength`, `reasons`, `source_company_name`, `masked_name`,
     `masked_phone`, `masked_email` pueden salir, más los indicadores
     `match_token_returned` y `token_not_logged`.
2. Keys exactas (case-insensitive) prohibidas en cualquier profundidad de
   logs, respuestas, reportes, archivos o transcripts:
   `match_token`, `token`, `p_match_token`, `signed_token`, `eic_token`,
   `match_token_hash`, `signature`, `hmac`.
   La key segura `match_token_returned` **sí** está permitida.
3. **Prohibido** `console.log` de payloads completos del RPC. Solo loggear
   `stage`, `row_count`, `error.code`, `error.message`.
4. **Prohibido** persistir respuesta cruda del RPC en `docs/**` o `/tmp/**`.
5. Tests negativos (`supabase/functions/_shared/eic-redact.test.ts`) deben
   estar en verde — incluye fixture `matches[].match_token` y variantes
   profundas / case-insensitive / array-en-array.
6. Cualquier campo nuevo emitido por el RPC en el futuro **no** sale
   automáticamente: requiere edit explícito de `SAFE_FIELDS` con revisión
   de redacción.

Sin estos seis puntos verificables, no se autoriza nuevo lookup, nuevo
dry-run ni attach.

---

## 10. Autorización de ejecución (por completar por owner)

Este documento es solo diseño. La ejecución requiere autorización explícita separada. El formato mínimo de autorización es:

```text
AUTORIZO MSS PILOT DRY-RUN v2
Worker candidato: <employee_id de MSS>
Executor: <nombre / rol>
Razón: <breve justificación>
Fecha/hora UTC: <YYYY-MM-DD HH:MM UTC>
Confirmo que entiendo que este es un dry-run read-only con 1 worker y cero attach.
```

Hasta que esta sección sea completada y comunicada de vuelta, **no se ejecuta nada**.

---

## 11. Confirmaciones del plan guardado

1. Archivo creado: `docs/MSS_PILOT_DRYRUN_PLAN.md`
2. Cero DB writes.
3. Cero ejecución de `ecosystem_identity_lookup` o `ecosystem_identity_attach_existing_employee_to_auth_user`.
4. Cero deploy de edge function.
5. Cero migraciones, frontend, bulk, cleanup, o cambios a payroll/shifts/documents/auth.users/employees.
6. Único cambio de código: la creación de este archivo de documentación.

## 12. Próximo paso recomendado

Esperar autorización de ejecución del owner (sección 10). Una vez autorizado, proceder con los pre-checks P1–P12 y luego los pasos T0–T10 en orden, respetando todos los stop conditions.
