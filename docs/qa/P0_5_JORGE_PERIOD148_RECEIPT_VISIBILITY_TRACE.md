# P0.5 — JORGE CORTES · PERIODO 148 · TRAZA DE VISIBILIDAD DEL RECIBO PUBLICADO

**Modo:** solo lectura. Cero escrituras en producción. Ninguna publicación,
republicación, despublicación, invitación, notificación ni cambio de identidad.

---

## Encabezado obligatorio

- **JORGE CORTES — PERIODO 148**
- Admin receipt published: **YES**
- Frozen amount: **$567.00**
- Mobile "Mis pagos" visibility: **NO** (reproducido por el usuario real)
- Admin "visible" KPI: **YES**
- Same canonical person: **YES**
- Same worker/company relationship: **YES**
- First failed visibility condition: **ninguna condición de datos falla. Falla
  la capa cliente: la app que usó el trabajador no consulta `pay_statements`.**
- Root cause: **el dispositivo ejecuta una versión anterior de la pantalla
  "Mis pagos" (build previo al 2026‑08‑19) que lee `period_base_pay` y solo
  muestra importaciones históricas o periodos con `published_at`. Esa versión
  nunca llama al RPC de recibos, por lo que el recibo nativo de $567 no puede
  aparecer, aunque exista, esté publicado y esté correctamente vinculado.**
- Affected native published receipts: **0 por datos** · **hasta 14 por cliente
  desactualizado** (todos los recibos publicados hoy).
- Safe to bulk publish period 148: **NO** (bloqueo previo P0.4 vigente +
  entrega al trabajador no garantizada mientras haya clientes desactualizados).

---

## PASO 1 — Identidad del trabajador en administración

| Dato | Valor |
|---|---|
| Registro de nómina 148 ("ID 101") | `482e78ca-d42b-4e12-86f5-6963c3012e61` |
| Empresa | `00000000-0000-0000-0000-000000000001` (Quality Staff) |
| Cuenta vinculada (`user_id`) | `e5495b59-8b80-471d-bd64-eec9ea7b1ccb` |
| `merged_into_employee_id` | NULL (registro canónico, no es sombra) |
| Segunda relación de la misma persona | `340db246-…` en empresa `37f92f75-…`, **misma** cuenta |

El "ID 101" de administración corresponde al mismo vínculo operativo que
resuelve la sesión móvil. Sin PII de contacto en este informe.

## PASO 2 — Identidad de la sesión móvil (Teléfono + PIN)

`auth_pin_credentials` tiene **una sola** credencial para esta persona:
`user_id = e5495b59-…`, PIN fijado 2026‑08‑13, último cambio 2026‑09‑15.
Esa cuenta resuelve exactamente dos registros de trabajador
(`340db246` y `482e78ca`), uno por empresa.

- SAME WORKER RELATIONSHIP: **YES**
- SAME CANONICAL PERSON: **YES**

## PASO 3 — Registro del recibo de $567

| Campo | Valor |
|---|---|
| `id` | `f606ddb9-99c4-45c4-8e96-3346b3a142c1` |
| `employee_id` | `482e78ca-…` |
| `pay_period_id` | `b17caedc-…` (periodo 148, 2026‑09‑02 → 09‑08) |
| `company_id` | `00000000-…-0001` |
| `frozen_total` | 567.00 |
| `status` | `published` · `published_at` 2026‑09‑15 17:33:35 UTC |
| `source` | `external_approved` · sin `unpublished_at` |

No modificado.

## PASO 4 — Consulta real de "Mis pagos"

Código vigente: `src/pages/portal/PayReports.tsx` → `fetchWorkerPayStatements`
→ RPC `worker_pay_statements()` (SECURITY DEFINER, STABLE, solo `authenticated`).

Condiciones del RPC, evaluadas contra `f606ddb9…`:

| Condición | Resultado |
|---|---|
| Existe el recibo | PASS |
| `status = 'published'` | PASS |
| `published_at IS NOT NULL` | PASS |
| `employee_id ∈ user_identity_employee_ids(auth.uid())` | PASS |
| Empresa resuelta por JOIN (sin filtro extra) | PASS |
| Sin filtro de `source`/tipo | PASS |
| Sin filtro de fecha/periodo | PASS |

Es decir: con el build actual, este recibo **sí** se devuelve.

Los tres reportes que sí ve el trabajador (periodos 129 $93.50, 128 $204.50,
124 $575.00) **no existen** en `pay_statements` — la tabla tiene 14 filas y
ninguna de esos periodos. Coinciden exactamente con `period_base_pay.base_total_pay`
de las tres únicas filas de Jorge con `import_id` (importaciones Connecteam).
Por lo tanto la pantalla que vio **no** es la actual.

## PASO 5 — Primera condición que falla

Ninguna condición de datos falla (recibo, publicación, empresa, relación,
persona canónica y cuenta: todo PASS). El primer punto de fallo está en la
capa cliente: **"la consulta del portal incluye recibos nativos" = FAIL** en el
build que ejecuta el dispositivo.

Versión histórica `cdf0fb30` (2026‑05‑11) de `PayReports.tsx`: lee
`period_base_pay` + `imports` y filtra
`is_historical_import || period.published_at` — para Jorge eso produce
exactamente 3 filas y $873.00 en total, el número que reportó el usuario.
Desde `2f149abe` (2026‑08‑19) la pantalla usa el RPC de recibos.

## PASO 6 — Connecteam vs recibo nativo

Rutas distintas. Connecteam histórico = `period_base_pay` con `import_id`
(pantalla antigua). Recibo nativo = `pay_statements` vía RPC (pantalla actual).
En el build actual **no se combinan**: "Mis pagos" muestra solo recibos
publicados. `historical_payroll_entries` sigue siendo admin‑only por RLS.

## PASO 7 — KPI "Visible" del tab Recibos

`summarizeDistribution` → `visible = filas con status PUBLISHED_VISIBLE`, y
`PUBLISHED_VISIBLE = publicado + portalAccess` (definición **B**: recibo
publicado y trabajador con cuenta vinculada). No ejecuta ni simula la consulta
real de "Mis pagos" (definición C). **Difieren explícitamente**: el KPI prueba
vinculación de cuenta, no entrega en pantalla.

## PASO 8 — Alcance (solo lectura)

- Recibos nativos publicados: **14**
- Resolubles por la consulta real de "Mis pagos": **14** (todos con cuenta
  vinculada, misma empresa, ningún registro fusionado)
- No resolubles por datos: **0**
- Afectados por la misma causa raíz (cliente desactualizado): **todos los que
  se abran desde una app no actualizada** — no determinable desde el servidor.

Ninguno reparado ni tocado.

## PASO 9 — Seguridad de publicación

¿Podemos garantizar hoy que los trabajadores verán los recibos del periodo 148
en "Mis pagos" si publicamos el resto? **NO.** El dato llega correcto, pero la
entrega depende de que el dispositivo ejecute el build vigente. Sumado al
bloqueo de identidad de P0.4, la publicación masiva sigue detenida.

---

## VEREDICTO

🟢 **ROOT CAUSE ISOLATED — WORKER VISIBILITY FIX IS SAFE AND LOCALIZED**

La cadena canónica (persona → relación de empresa → nómina → recibo →
publicación → cuenta → consulta del portal) está íntegra. El fallo está
aislado en la versión de cliente que ejecuta el trabajador y se corrige
actualizando la app, sin tocar datos de nómina, identidad ni recibos.
