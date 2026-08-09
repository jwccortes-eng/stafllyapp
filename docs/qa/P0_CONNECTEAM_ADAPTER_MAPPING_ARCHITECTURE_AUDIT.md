# P0 — Connecteam Adapter / Mapping Architecture Audit

Fecha: 2026-08 (auditoría solo lectura)
Alcance: determinar dónde vive el mapping Job / Sub item y si el Servicio canónico de Stafly está contaminado con conceptos de Connecteam.
**No se modificó código ni datos.**

---

## 1. Inventario real

| Artefacto | Tipo | Scope | Quién escribe | Quién consume |
|---|---|---|---|---|
| `company_settings.key = 'connecteam_mapping'` (JSON `{ entries: Record<key, {job, subItem, label, updatedAt}> }`) | Tabla / fila por compañía | `company_id` (tenant) | `useConnecteamMapping` → `company-config-write.ts` (carril VWC) | `connecteam-compat.resolveConnecteamJobAndSubItem` |
| `src/lib/integrations/connecteam-mapping.ts` | Módulo puro | — | — | Claves (`client:<id>`, `location:<id>`, `title:<slug>`), `lookupMapping`, `candidateSubjects`, `mostReusableSubject`, `upsertEntry` |
| `src/lib/integrations/connecteam-compat.ts` | Resolver | por servicio en tiempo de export | — | `connecteam-export.ts` |
| `BETA_COMPAT_RULES` (6 reglas hardcodeadas: 4 Eminence, 2 Production) | Constante en código | global (regex sobre nombre de venue/cliente) | — | Solo si la compañía **no** tiene ningún mapping declarado |
| `src/lib/integrations/connecteam-export-groups.ts` | Clasificador de bloqueos | UI | — | Causa `missing_destination` (mapea `missing_job_mapping`) |
| `ConnecteamMappingSheet.tsx`, `ExportConnecteamBulkDialog.tsx`, `ExportConnecteamPreviewDialog.tsx` | UI | — | Escriben mapping vía hook | — |
| `employees.connecteam_employee_id` | Columna | empleado | migración | export CSV (identidad de usuario) |
| `migration_*_mapping.connecteam_*` | Tablas | histórico de migración | pipeline de migración | reconciliación, no export |

**Verificado en DB:** no existe ninguna columna `connecteam_job_name` (ni ningún otro campo Connecteam) en `scheduled_shifts`, `clients` ni `locations`.

```
information_schema.columns where column_name ilike '%connecteam%'
→ employees.connecteam_employee_id, employees_safe, migration_* (solo histórico)
```

Es decir: **el Servicio canónico NO está contaminado**. El código sí lee `shift.connecteam_job_name`, `location.connecteam_job_name`, `client.connecteam_job_name` en `resolveFallback` (connecteam-compat.ts, líneas 246-266), pero esos campos **no existen en el esquema**: es una rama muerta heredada del beta.

---

## 2. Casos diferenciales (datos reales, tenant Quality Staff `…0001`)

Único mapping declarado hoy:

```json
{ "entries": {
  "client:30cc3b7f-…d1c8": { "job": "IMPERIAL HALL", "subItem": "", "label": "IMPERIAL HALL" },
  "title:luminance":       { "job": "LUMINANCE HALL", "subItem": "" }
}}
```

| Caso | client_id | venue | Job / Sub item | Resuelto desde | Fallback | Resultado |
|---|---|---|---|---|---|---|
| **A. Imperial** | `30cc3b7f…` IMPERIAL HALL (11 servicios, sin location) | `NULL` | `IMPERIAL HALL` / `""` | `entries["client:30cc3b7f…"]` | ninguno | ✅ exporta, `confidence: exact` |
| **B. Millennium** | `3e6f9c2f…` The Millennium Simcha Hall (93 con venue + 12 sin venue) | `cc8e8986…` The Milenium Simcha | ninguno hasta configurarlo | — | bloqueado | ⛔ `missing_job_mapping` → `missing_destination`; tras configurar una vez a nivel cliente, los 105 servicios resuelven |
| **C. Eminence** | `a736b4ce…` EMMINENCE HALL (532 con venue + 6 sin), `081dbde0…` "Emmincence" (9), y SPARK NEW YORK (28) sobre el mismo venue `fb37c145…` Eminence Ballroom | Eminence Ballroom | ninguno | — | bloqueado | ⛔ pide Job/Sub item |

**Por qué Eminence antes exportaba y ahora pregunta:** `strict = options.strict ?? hasAnyMapping(mapping)` (connecteam-compat.ts:312). En cuanto la compañía declaró el primer mapping (Imperial, 2026-08-09), `strict` pasó a `true` y **desactivó globalmente** `BETA_COMPAT_RULES` y el fallback crudo. Las 4 reglas `eminence.*` que producían `Eminence / Headwaiters | Regular Waiters | Outside Job` dejaron de aplicarse. No es un problema de datos de Eminence: es un efecto colateral del flag global.

**Nota de calidad de datos:** Eminence existe como dos clientes (`EMMINENCE HALL`, `Emmincence`) + un venue compartido con otro cliente (SPARK NEW YORK). Mapear solo por cliente dejaría fuera a SPARK@Eminence Ballroom; mapear solo por venue dejaría fuera a los 6 servicios de EMMINENCE HALL sin venue.

---

## 3. Pregunta crítica

**300 servicios nuevos del mismo cliente/venue ⇒ se configura el destino UNA sola vez.**

El mapping es tenant-scoped por sujeto (`client:<id>` / `location:<id>`), no por servicio. Evidencia: Imperial tiene 11 servicios y una sola entrada; Millennium resolvería 105 servicios con una entrada. No existe ningún campo por servicio que obligue a repetirlo. El comportamiento actual ya es el correcto arquitectónicamente.

---

## 4. Scope correcto

Precedencia de **lectura** hoy: venue → cliente → título (`candidateSubjects`).
Precedencia de **escritura sugerida** hoy: cliente → venue → título (`mostReusableSubject`).

Evidencia real: 40 % de los servicios del tenant no tienen `location_id` (Imperial 11/11, ELY PRODUCCION 230/230, Millennium 12/105). Un scope solo-venue no cubriría la operación.

Scope recomendado (ya implementado de facto, sin cambios necesarios):

- **Base: `company + client`** — el más estable y el que evita repreguntar.
- **Refinamiento: `company + venue/location`** — gana sobre cliente cuando existe (caso SPARK NEW YORK @ Eminence Ballroom, donde el destino real depende del salón, no del cliente).
- **`company + client + venue`**: no necesario; la precedencia venue→cliente lo cubre.
- **Override por servicio**: **no** introducirlo. No hay ningún caso en los datos donde dos servicios del mismo cliente **y** mismo venue vayan a Jobs distintos. La variación observada (horario, rol, hall) no cambia el Job.

---

## 5. Adapter boundary

```
Canonical Service (scheduled_shifts)
        │  client_id, location_id, title, date, times, slots
        ▼
Connecteam Adapter  (connecteam-compat.ts)
        │  candidateSubjects(service)   ← no lee campos Connecteam del servicio
        │  lookupMapping(company_settings.connecteam_mapping)
        ▼
resolve destination → { job, subItem, confidence, source, warnings }
        ▼
build CSV row (connecteam-export.ts)
```

`Service.connecteam_job` / `Service.connecteam_subitem` **no existen en el esquema**. La frontera está bien trazada. La única fuga es la lectura muerta de `connecteam_job_name` en `resolveFallback`, que hoy nunca devuelve valor.

---

## 6. Eminence legacy model

Lo que las reglas beta codificaban:

| "Subjob" Connecteam | Qué es realmente en Stafly |
|---|---|
| `Eminence / Headwaiters` | **rol / staffing category** (headwaiter, captain) |
| `Eminence / Regular Waiters` | **rol / staffing category** (waiter, server) |
| `Eminence / Outside Job` | **modalidad de servicio** (trabajo fuera del venue), texto libre |
| `Production / Weekend Job` vs `Regular Job` | **atributo del servicio** (fin de semana / pay_type daily) |
| Halls | **venue/location** |

Conclusión: los "subjobs" de Eminence son un **workaround Connecteam-only**. Connecteam solo tiene 2 niveles (Job → Sub item), así que rol, modalidad y salón se aplastaron en el nivel `Sub item`. En Stafly esas dimensiones ya existen por separado (`location_id`, `category_id`/rol, `pay_type`, fecha). **No deben importarse al modelo canónico.**

---

## 7. Regla objetivo (propuesta, no implementada)

```ts
resolveConnecteamDestination({
  companyId,
  clientId?, venueId?, serviceId?,
  roleId?,        // solo como señal de derivación de subItem
}): {
  job: string;
  subItem: string;
  source: "mapping:location" | "mapping:client" | "mapping:title" | "legacy_rule" | "none";
  reason: string;                  // texto operativo mostrable
  status: "exact" | "inferred" | "missing";
  overrideApplied: false;          // reservado; hoy no hay overrides por servicio
}
```

El Servicio sigue siendo independiente del proveedor: la función recibe **ids canónicos**, no campos Connecteam del servicio.

---

## 8. No silos

No se detectaron tablas Connecteam duplicadas de cliente o venue, ni campos job/subitem por servicio. No hay que crear ninguno.

---

## 9. QA conceptual

- **Imperial** → `entries["client:30cc3b7f…"]` → Job `IMPERIAL HALL` → exporta. Servicios futuros del mismo cliente reutilizan la entrada sin preguntar. ✔
- **Millennium** → configurar una vez a nivel **cliente** (`client:3e6f9c2f…`) → cubre los 93 con venue y los 12 sin venue. Los siguientes no vuelven a preguntar. ✔
- **Eminence** → varios horarios sobre el mismo venue **no** generan mappings nuevos: la clave es `client`/`location`, la fecha y la hora no participan. ✔
- **Regla que sí diferencia destinos sobre el mismo venue**: cuando dos clientes distintos operan el mismo salón (SPARK NEW YORK y EMMINENCE HALL en Eminence Ballroom) y facturan a Jobs distintos, se declara la entrada `location:` (gana sobre `client:`) o entradas `client:` separadas. Es la única excepción legítima observada.

---

## 10. Resultado obligatorio

**A. Dónde vive el mapping hoy:** `company_settings.key='connecteam_mapping'`, JSON de entradas, escrito por `useConnecteamMapping` vía VWC. Resolución en `connecteam-compat.ts`.

**B. Scope real:** tenant + sujeto (`client:` / `location:` / `title:`), lectura venue→cliente→título.

**C. Qué está bien:**
- El Servicio canónico no tiene campos Connecteam en el esquema.
- El mapping es reutilizable: una vez por cliente/venue, no por servicio.
- Adapter aislado, puro, sin writes.
- Escritura por el carril VWC, scoped por compañía, sin fuga entre tenants.

**D. Qué está mal:**
1. `strict = hasAnyMapping(company)` es un **interruptor global**: declarar el primer mapping (Imperial) apagó las reglas legacy para **todos** los clientes del tenant y convirtió Eminence/Millennium en `missing_destination` de golpe. La granularidad debería ser por sujeto, no por compañía.
2. Rama muerta: `resolveFallback` lee `connecteam_job_name` en shift/location/client — columnas inexistentes.
3. `BETA_COMPAT_RULES` mezcla rol y modalidad dentro del Sub item con regex sobre nombres; es lógica de negocio de un tenant dentro del código.
4. Clave `title:` como sujeto de mapping es frágil (depende del texto del servicio) — útil como red, no como scope principal.
5. Datos: clientes Eminence duplicados (`EMMINENCE HALL` / `Emmincence`) obligarían a dos entradas para el mismo negocio.

**E. ¿Servicio contaminado?** No en el esquema. Sí residualmente en el código (punto D2).

**F. Imperial vs Millennium vs Eminence:** Imperial tiene entrada declarada; Millennium nunca la tuvo; Eminence dependía de reglas hardcodeadas que se desactivaron al existir el primer mapping del tenant (efecto del flag global `strict`). No es un problema de modelo, es de granularidad del flag.

**G. Cambio mínimo recomendado (para un pase posterior):**
1. Hacer `strict` **por sujeto**: si el sujeto del servicio no tiene entrada, permitir aún la regla legacy con warning, en vez de bloquear porque otro cliente sí está mapeado.
2. Borrar la rama muerta `connecteam_job_name`.
3. Extraer `BETA_COMPAT_RULES` a "mappings semilla" precargables en `company_settings` (migración de datos, no de esquema) y luego eliminarlas del código.
4. Mantener el scope actual; **no** añadir override por servicio hasta que exista un caso real.

**H. Riesgo de migración:** bajo. No hay cambio de esquema, no se tocan `scheduled_shifts`, payroll, `time_entries` ni assignments. El único riesgo es de reporting: sembrar mappings desde `BETA_COMPAT_RULES` fija los buckets Eminence/Production, así que debe confirmarse con el catálogo real de la cuenta Connecteam antes de escribir.

**I. Qué NO tocar:** CSV builder, payroll, `time_entries`, assignments, datos de producción, `employees.connecteam_employee_id`, tablas `migration_*`, auth/RLS/tenants.

---

**Confirmación:** No se modificó código ni datos. Se determinó con evidencia que **Connecteam ya se adapta al modelo canónico de Stafly** (mapping externo reutilizable, sin campos del proveedor en el Servicio); los residuos que aún heredan el modelo de Connecteam son el flag global `strict`, las reglas hardcodeadas Eminence/Production y una lectura muerta de `connecteam_job_name`.
