# P0 — CONNECTEAM: FIN DEL EFECTO COLATERAL DEL FLAG `strict` GLOBAL

Fuente: `docs/qa/P0_CONNECTEAM_ADAPTER_MAPPING_ARCHITECTURE_AUDIT.md`.
Alcance: solo la DECISIÓN de destino (Job / Sub item). Sin cambios de modelo,
CSV, payroll, staffing, assignments ni datos de producción.

## 1. Causa raíz

`src/lib/integrations/connecteam-compat.ts`:

```ts
const strict = options.strict ?? hasAnyMapping(mapping);
```

`hasAnyMapping` es una pregunta **de compañía**, no de destino. Al declarar el
primer destino explícito (Imperial), `strict` pasaba a `true` para toda la
compañía y apagaba en bloque:

- las reglas legacy `BETA_COMPAT_RULES` (Eminence, Production);
- el fallback por nombre de lugar/cliente/categoría (Millennium).

Un mapping de un destino bloqueaba destinos no relacionados.

## 2. Cambio aplicado (resolución por destino)

- `strict` ya **no se deriva** del estado de la compañía: es opt-in por llamada
  (`options.strict === true`) con semántica acotada y documentada en el tipo:
  "para esta resolución, solo acepta destino declarado explícitamente".
  Clasificación de consumidores: no existe ningún caller que lo pase hoy
  (`connecteam-export.ts` es el único consumidor del resolver) → el uso previo
  era **categoría C, causa del efecto colateral**; el campo se conserva como
  **categoría A** (compuerta explícita disponible para validaciones estrictas).
- Orden de resolución, evaluado siempre contra los sujetos de ESE servicio
  (venue → cliente → título):
  1. mapping explícito de venue
  2. mapping explícito de cliente
  3. mapping explícito por título
  4. hint `connecteam_job_name`
  5. regla legacy vigente
  6. fallback por nombre
  7. `unresolved` → bloqueo con CTA
- Sin lógica hard-coded por nombre de cliente. Las reglas legacy siguen siendo
  las existentes, sin ampliarlas.

## 3. Resolutor explicable

`JobAndSubItem` ahora incluye, además de `job`/`subItem`/`confidence`:

| Campo | Valores |
|---|---|
| `destinationSource` | `explicit_mapping` \| `explicit_hint` \| `legacy_rule` \| `raw_fallback` \| `unresolved` |
| `reason` | texto operativo del porqué |
| `mappingScope` | `client` \| `location` \| `title` (solo con mapping explícito) |
| `fallbackUsed` | `true` cuando no hubo mapping explícito para ese destino |

Nunca devuelve solo `ready/blocked`.

## 4. Matriz QA

| Servicio | Mapping explícito | Legacy válido | Antes | Después | Source final |
|---|---|---|---|---|---|
| Imperial | sí (cliente) | n/a | exporta | exporta | `explicit_mapping` |
| Millennium | no | fallback por nombre | **bloqueado por `strict`** | exporta con aviso | `raw_fallback` |
| Eminence | no | sí (`eminence.*`) | **bloqueado por `strict`** | exporta con aviso | `legacy_rule` |
| Cliente/lugar desconocido sin nombre | no | no | bloqueado | bloqueado | `unresolved` |
| Millennium tras configurarlo | sí | — | — | mapping gana | `explicit_mapping` |
| Otra compañía | no hereda | — | — | sin mapping | `raw_fallback`/`unresolved` |

## 5. Regresión

`src/test/connecteam-strict-scope.test.ts` (7 tests) cubre casos A–F más el
opt-in de `strict`. Suite Connecteam completa: **82/82 PASS**
(`connecteam-strict-scope`, `connecteam-destination-mapping`,
`connecteam-compat`, `connecteam-export`, `connecteam-mapping`). Typecheck limpio.

## 6. Qué NO se tocó

Modelo canónico (`scheduled_shifts`, clientes, ubicaciones sin campos
Connecteam), serialización CSV (columnas, orden, quoting, BOM, fechas, horas,
Shift Title, QK, Number of Users), payroll, `time_entries`, assignments,
documentos, ECC, VWC, auth/RLS/tenants. Sin migraciones.

## Confirmación

Connecteam resuelve el destino por cliente/lugar de forma aislada y explicable:
un mapping explícito ya no altera ni desactiva los fallbacks válidos de otros
destinos de la misma compañía.
