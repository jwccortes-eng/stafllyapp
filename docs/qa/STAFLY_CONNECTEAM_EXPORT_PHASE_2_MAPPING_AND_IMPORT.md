# STAFLY → CONNECTEAM — FASE 2: JOB / SUB ITEM MAPPING + PRIMER CSV IMPORTABLE

Alcance: traducción configurable y explicable entre entidades Stafly y Connecteam.
Sin tocar payroll, `time_entries`, publicación real ni datos operativos.

## 1. Auditoría del mapping anterior

`src/lib/integrations/connecteam-compat.ts` resolvía Job/Sub item con
`BETA_COMPAT_RULES`: 6 reglas hardcodeadas y globales (Eminence → Regular
Waiters / Headwaiters / Outside Job; Production → Weekend/Regular Job). Fuera de
esas dos cuentas el resolver caía en `fallback` y el CSV podía llegar a
Connecteam con un Job que el importador muestra como **"Select"** — es decir,
turnos importados sin ubicación de reporting y sin manera de saber por qué.

Problemas concretos:

- Reglas globales, no por compañía: la cuenta A heredaba el vocabulario de la B.
- `fallback` silencioso: nunca se le decía al usuario que el Job era una suposición.
- Sin memoria: nada se aprendía del servicio anterior del mismo cliente.

## 2. Semántica real (verificada contra el template oficial)

| Connecteam | Significado | Origen en Stafly |
|---|---|---|
| `Job` | Contenedor de reporting (cliente/venue/cuenta) | Venue → Cliente → Título, vía mapping declarado |
| `Sub item` | Subdivisión del Job (rol, tipo de jornada, área) | Entrada del mapping (opcional) |
| `Users` | Trabajadores asignados | Asignaciones efectivas |
| `Number of users` | Plazas del turno | `slots` |
| `Location` | Dirección física | Venue / cliente |

Job y Sub item deben existir **previamente** en Connecteam. Stafly no los crea:
solo declara a cuál pertenece cada cliente/venue.

## 3. Configuración por compañía (sin hardcode)

Nuevo módulo `src/lib/integrations/connecteam-mapping.ts`.

- Almacenamiento: `company_settings`, clave `connecteam_mapping`, siempre
  scoped por `company_id`. Nunca se comparte entre compañías.
- Claves de entrada: `location:<id>`, `client:<id>`, `title:<slug normalizado>`.
- Prioridad de resolución: **venue → cliente → título**. La primera con Job
  no vacío gana; se registra qué sujeto la resolvió.
- Escritura por el carril VWC: `versioned_update_company_setting` con
  `expected_version` (PATCH parcial, merge server-side, auditoría). La clave se
  añadió a la allowlist de la función y a `EDITABLE_SETTING_KEYS`.

Hook: `src/hooks/useConnecteamMapping.tsx` (lectura + escritura + conflicto).

## 4. Resolver desde el servicio

`src/components/shifts/integrations/ConnecteamMappingSheet.tsx`:

- Se abre desde el preview de exportación con **[Resolver ahora]** cuando falta
  mapping, y con **[Cambiar destino]** cuando ya existe.
- Elige el sujeto a recordar (Lugar / Cliente / Título) y escribe Job y Sub item
  exactos, con autocompletado desde lo ya confirmado.
- No obliga a salir a Clientes ni a Ubicaciones: el usuario no pierde el contexto.

## 5. Aprendizaje / reutilización

`knownJobs` y `knownSubItems` derivan el catálogo de lo ya declarado por esa
compañía y lo ofrecen como sugerencia en el siguiente servicio. El aprendizaje
es tenant-scoped por construcción (vive en `company_settings` de la empresa).

## 6. Fin del fallback silencioso

`resolveConnecteamJobAndSubItem` ahora opera en modo estricto:

- Con mapping → `confidence: "exact"`, badge "Mapping de la compañía".
- Sin mapping → `missing_job_mapping` con severidad **block**. El servicio queda
  NOT_READY y el CSV no se genera con un Job inventado.
- `BETA_COMPAT_RULES` sobrevive solo como legado para compañías sin mapping
  configurado, y siempre emite aviso visible ("Regla beta").

## 7. Servicios reales del video (Luminance / Imperial)

Ambos servicios tienen `client_id` y `location_id` en `NULL`, por lo que el
único sujeto disponible es el **título**. Antes: fallback silencioso → "Select"
en Connecteam. Ahora: bloqueo explícito `missing_job_mapping` con CTA para
declarar el destino desde el propio preview, o confirmar el cliente y mapear por
cliente (que se reutiliza en todos sus servicios futuros).

## 8-10. CSV y formato

La serialización no cambió en esta fase: mismas 16 columnas del template, orden
idéntico, `CRLF`, BOM UTF-8 y comillas por RFC 4180. Lo que cambia es el
contenido de `Job`/`Sub item`: pasa de suposición a valor declarado, que es
justamente lo que el importador necesita para no caer en "Select". No se
introdujo ningún ajuste de formato porque el importador no rechazó la estructura.

## 11. Seguridad

Solo lectura sobre servicios. Ninguna escritura a `scheduled_shifts`,
asignaciones, `time_entries`, payroll ni `publication_status`. La única
escritura es la configuración de mapping de la compañía, por VWC y auditada.

## Verificación

- `src/test/connecteam-mapping.test.ts` — 9 tests (prioridad de sujetos, lookup,
  upsert idempotente, borrado, catálogo de reutilización, "nunca inventa un Job").
- `src/test/connecteam-compat.test.ts` — 26 tests, actualizados a la semántica estricta.
- `src/test/connecteam-export.test.ts` — 35 tests.
- Typecheck limpio. Único fallo pendiente en la suite:
  `driver-sync-roundtrip`, deuda previa documentada en
  `docs/qa/DEBT_DRIVER_SYNC_ROUNDTRIP_TEST_FAILURE.md`.

## Confirmación

Stafly puede traducir un Servicio a Job/Sub item de Connecteam mediante
configuración explícita por compañía y generar un CSV que llega al Overview del
importador sin edición estructural manual.
