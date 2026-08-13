# P0 — SERVICE / EVENT MODEL · OPCIÓN B (DISEÑO Y AUDITORÍA, SIN WRITES)

Fecha: 2026-08-13 · Estado: **propuesta de diseño**. No se ejecutó ninguna migración,
ni `INSERT`/`UPDATE`/`DELETE`, ni cambio de RLS, triggers o código de producción.
Toda la evidencia proviene de lecturas (`information_schema`, `pg_catalog`, `SELECT`)
y de inspección estática del repositorio.

---

## 0. Resumen ejecutivo

Hoy **no existe la entidad "Servicio"**. Existe una fila física `scheduled_shifts`
que actúa simultáneamente como: unidad de venta (QK), unidad de horario, unidad de
staffing, unidad de fichaje y unidad de cierre. Cada `INSERT` emite un QK nuevo por
trigger `BEFORE INSERT`, con índice `UNIQUE (shift_ref)`.

La Opción B ("un QK canónico por servicio, segmentos con vida propia") es correcta
como destino. La decisión no es *si* separar Servicio de Segmento, sino *dónde vive
la identidad del servicio*: en la fila raíz (B1) o en una tabla nueva (B2).

**Recomendación: B1 ahora, con B2 como evolución preparada** (ver §9).

---

## 1. Estado real auditado

### 1.1 Emisión del QK

```
trg_assign_shift_company_number  BEFORE INSERT ON scheduled_shifts
  → assign_shift_company_number()
      IF shift_number IS NULL → next_company_shift_number(company_id)
      IF shift_ref IS NULL    → <prefix>-lpad(shift_number, 6, '0')
```

Índices relevantes en `scheduled_shifts`:

| Índice | Definición |
|---|---|
| `scheduled_shifts_ref_uniq` | `UNIQUE (shift_ref)` — global, no por empresa |
| `scheduled_shifts_company_number_uniq` | `UNIQUE (company_id, shift_number)` |
| `idx_scheduled_shifts_parent` | `(parent_shift_id) WHERE parent_shift_id IS NOT NULL` |

`shift_ref` es **NULLABLE** en el esquema, pero hoy `0` filas de `2234` lo tienen nulo.
Esto es clave: técnicamente el modelo ya admite filas sin QK propio.

### 1.2 Jerarquía existente

Ya existen `parent_shift_id`, `segment_label` y el trigger
`trg_enforce_shift_segment_hierarchy` (BEFORE INSERT OR UPDATE OF parent_shift_id),
que impide jerarquías de más de un nivel.

Datos actuales: **2234 turnos totales, 1 con `parent_shift_id`** (QK-001655 → padre
`9c5c…04b6`). El caso huérfano QK-001651 se creó antes de que la persistencia del
vínculo estuviera activa. Es decir: **la superficie de datos afectada por cualquier
cambio es prácticamente nula (1 fila)**.

### 1.3 Dependencias por FK a `scheduled_shifts.id`

23 tablas referencian la fila del turno, no el QK:

```
clock_alerts, clock_events, dispatch_logs, employee_location_history,
legacy_invoice_line_items, migration_shift_mapping, payroll_adjustments,
scheduled_shifts(parent_shift_id), service_request_shift_links,
shift_assignment_admin_overrides, shift_assignments,
shift_attendance_confirmations, shift_chat_config, shift_chat_messages,
shift_closeout_reports, shift_comments, shift_notes, shift_requests,
shift_reviews, shift_rides, shift_role_slots, shift_timeline, time_entries
```

**Hallazgo crítico y favorable:** *ninguna* FK apunta a `shift_ref`. Payroll,
`time_entries`, `shift_assignments`, closeout y clock cuelgan del `id` (uuid) de la
fila. Por tanto **quitar el QK propio a un hijo no rompe ninguna integridad
referencial**. El riesgo es exclusivamente de presentación, búsqueda y reporting.

### 1.4 Superficies que dependen de `shift_ref` (código)

| Capa | Archivo | Dependencia |
|---|---|---|
| Identidad visible | `src/lib/shifts/shift-identity.ts` | `shift_ref` → `primaryRef`; fallback etiquetado si falta |
| Agrupación | `src/lib/shifts/service-segments.ts` | ya resuelve el QK del **root** (`getServiceRef`) |
| Búsqueda | `src/lib/shifts/shift-ref.ts` (`matchesShiftQuery`) | compara `shift_ref`, `shift_number`, `shift_code` |
| Tarjetas | `smart-work-card.ts`, `card-display.ts`, `calendar-service-identity.ts` | leen `shift_ref` de la fila |
| Hoy / Command Center | `src/hooks/useTodayOperations.tsx` | selecciona y expone `shift_ref` |
| Observabilidad | `supabase/functions/oai-observe/index.ts` | registra `shift_ref` como etiqueta |
| Auditoría asistencia | migración `2026-08-01 204503` | copia `shift_ref` a filas de auditoría (denormalizado) |
| Notificaciones | migración `2026-08-01 223954` | usa `COALESCE(shift_ref, title, '')` en el texto |

Ninguna de estas es una restricción de integridad: todas son *presentación,
búsqueda o etiqueta denormalizada*. La capa de agrupación ya está escrita
asumiendo un QK de raíz.

---

## 2. Respuestas directas a las 10 preguntas

**1) ¿Podemos reutilizar `parent_shift_id` como raíz canónica sin tabla nueva?**
Sí. `parent_shift_id` + trigger de jerarquía de un nivel ya modelan
Servicio = fila raíz (`parent_shift_id IS NULL`), Segmento = fila hija. El
`service_id` efectivo es `COALESCE(parent_shift_id, id)`.

**2) ¿Necesitamos entidad Service/Event real?**
No para el caso actual (setup / service / VIP / breakdown / multi-day de un mismo
evento). Sí, más adelante, si aparece alguno de estos requisitos: un servicio sin
ningún segmento (venta antes de programar), atributos de servicio que no son de
turno (contrato, PO, presupuesto, ventana de facturación), o un servicio que
atraviese varias empresas/clientes. Ninguno existe hoy.

**3) ¿Qué depende hoy de `shift_ref` único por fila?**
Solo el índice `scheduled_shifts_ref_uniq` y la presentación/búsqueda (§1.4).
Cero FKs, cero payroll, cero `time_entries`.

**4) ¿Qué rompería si los hijos no tuvieran QK propio?**
- Búsqueda por texto: `matchesShiftQuery` no encontraría al hijo si el QK vive solo en el padre (se resuelve buscando también por QK de servicio).
- Etiquetas denormalizadas (auditoría de asistencia, texto de notificaciones) mostrarían vacío → hay que resolver vía raíz.
- Exports/invoices legadas que impriman `shift_ref` por fila: saldrían en blanco.
- Nada de integridad: assignments, clock, time_entries, closeout siguen colgando del `id`.

**5) ¿Cómo preservar históricos sin renumerar?**
Regla de oro: **nunca reescribir un `shift_ref` ya emitido**. Los 2234 turnos
actuales conservan su QK y quedan como servicios raíz de un solo segmento
(`parent_shift_id IS NULL`). El cambio aplica solo a *nuevas* filas hijas.

**6) Búsqueda, reportes, exports, invoices, payroll**
- Búsqueda: extender `matchesShiftQuery` para comparar contra el QK de servicio resuelto (raíz) además del propio.
- Reportes/exports: exponer dos columnas — `service_ref` (QK canónico) y `segment_ref` (QK-#### o QK-####-2 si se adopta sufijo).
- Invoices: agrupan por servicio → mejora, hoy un evento en 3 tramos genera 3 QK facturables distintos.
- Payroll y `time_entries`: **sin cambio**, siguen por `shift_id`. Es el punto que más protege esta opción.

**7) Migración incremental sin tocar históricos**
Solo escritura hacia adelante: filas existentes intactas; el flujo "Mismo servicio"
del diálogo de duplicar es el único emisor de hijos. Cero backfill obligatorio.
Opcionalmente, un backfill *manual y puntual* podría adoptar QK-001651 como hijo de
su servicio, pero es una fila y puede quedarse como está.

**8) ¿Solo para nuevos servicios desde fecha de corte?**
Sí, y es lo recomendado. La regla se activa por presencia de `parent_shift_id`, que
solo pueden tener filas creadas por el nuevo flujo. La "fecha de corte" es implícita
y no requiere columna ni configuración.

**9) ¿Cómo queda el trigger BEFORE INSERT?**
Propuesta mínima para B1 (no aplicada):

```sql
-- assign_shift_company_number(), rama nueva
IF NEW.parent_shift_id IS NOT NULL THEN
  -- segmento: hereda el servicio, no consume la secuencia de la empresa
  SELECT shift_ref, shift_number INTO v_root_ref, v_root_num
    FROM public.scheduled_shifts WHERE id = NEW.parent_shift_id;
  NEW.shift_number := NULL;                       -- no consume consecutivo
  NEW.shift_ref    := v_root_ref || '-' ||        -- sufijo de segmento
                      lpad(public.next_segment_seq(NEW.parent_shift_id)::text, 1, '0');
ELSE
  ... comportamiento actual intacto ...
END IF;
```

Implicaciones de esquema para esa rama:
- `scheduled_shifts_company_number_uniq (company_id, shift_number)` debe volverse
  **parcial**: `WHERE shift_number IS NOT NULL` (hoy admite un solo NULL por empresa
  en la práctica de un índice único b-tree: en Postgres los NULL no colisionan, así
  que el índice **ya tolera** múltiples NULL — verificado por definición del índice;
  aun así conviene documentarlo).
- `scheduled_shifts_ref_uniq` se mantiene: `QK-001655-2` sigue siendo único.
- El sufijo debe emitirse bajo `pg_advisory_xact_lock(hashtext('svc_seg:'||parent))`
  para evitar colisión en duplicaciones concurrentes (mismo patrón que
  `next_internal_id`).

**10) Riesgo de cada alternativa** → §3–§5.

---

## 3. B1 — Root shift como Servicio canónico

**Cambios de schema (mínimos)**
1. `assign_shift_company_number()`: rama para `parent_shift_id IS NOT NULL`.
2. Función `next_segment_seq(parent uuid)` con advisory lock.
3. Columna opcional `segment_index int` para orden estable de segmentos.
4. Vista `v_services` (read-only) que agrupe: `service_id = COALESCE(parent_shift_id, id)`.
5. Nada en RLS: las políticas actuales de `scheduled_shifts` aplican por `company_id`, que el hijo hereda.

**Riesgo:** bajo. La única fila afectada hoy es una. Los históricos no se tocan.
Riesgo concentrado en el trigger (concurrencia del sufijo) y en presentación.

**Impacto en producción:** contenido. Payroll, clock, closeout y assignments no
cambian de forma. El calendario y las tarjetas ya tienen `service-segments.ts`.

**Deuda futura:** el servicio sigue sin existir como fila propia. No se puede
crear un servicio sin al menos un segmento, ni borrar el segmento raíz sin
"perder" el servicio (habría que reparentar). Los atributos de servicio (cliente,
venue, contrato) viven en la fila raíz y se duplican en hijos → riesgo de
divergencia si alguien edita el hijo.

**Compatibilidad con históricos:** total. Toda fila sin padre es un servicio de un
segmento; ningún QK se renumera.

**QA requerido:**
- Duplicar "mismo servicio" ×3 en paralelo → sufijos 2,3,4 sin colisión.
- Hijo no consume consecutivo de la empresa (siguiente servicio nuevo obtiene el número esperado).
- Búsqueda por `QK-001655` devuelve padre e hijos; por `QK-001655-2` devuelve el hijo.
- Clock-in, `time_entries`, closeout y payroll del hijo son independientes del padre.
- Soft-delete del padre no huerfaniza silenciosamente a los hijos.
- Tenant isolation: hijo hereda `company_id` del padre; probar cross-tenant denegado.
- Invoices/exports muestran `service_ref` + `segment_ref`.

---

## 4. B2 — Entidad Service/Event + child shifts

**Cambios de schema**
1. `public.services` (id, company_id, service_ref UNIQUE, client_id, venue/location, título, fechas, estado, auditoría) + GRANTs + RLS + políticas nuevas.
2. `scheduled_shifts.service_id uuid REFERENCES public.services(id)`.
3. Nuevo contador `company_service_counters` + `next_service_ref()`.
4. Trigger de `scheduled_shifts`: si `service_id` presente, no emitir QK propio.
5. Backfill: **2234 servicios sintéticos**, uno por turno histórico, preservando su `shift_ref` como `service_ref`.
6. Reescritura de lecturas: cliente, venue y QK dejan de leerse del turno en decenas de superficies.

**Riesgo:** alto. Toca RLS nuevo, backfill masivo sobre datos de producción,
y desplaza la fuente de verdad de cliente/venue/QK en superficies ya certificadas
(publication-truth, worker-visible-shifts, service-location, service-state,
validation center, reconciliación, invoices legadas).

**Impacto en producción:** amplio. Aunque el backfill sea idempotente, cualquier
lectura no migrada muestra datos vacíos. Conflicto directo con la congelación de
features por P0 de integridad.

**Deuda futura:** la menor de las dos. Modelo correcto y extensible
(servicio sin segmentos, presupuesto, contrato, facturación por servicio).

**Compatibilidad con históricos:** buena si el backfill copia `shift_ref` → `service_ref`,
pero exige un backfill obligatorio (no hay modo "solo hacia adelante" limpio: quedarían
dos modelos coexistiendo indefinidamente, que es su propio tipo de deuda).

**QA requerido:** todo lo de B1, más: RLS de `services` por tenant, backfill
verificado fila a fila, reconciliación de payroll pre/post backfill, exports e
invoices legadas, y re-certificación de las superficies ya cerradas.

---

## 5. Comparación

| Criterio | B1 (root como servicio) | B2 (entidad Service) | A (solo presentación) |
|---|---|---|---|
| Cambios de schema | 1 trigger + 1 función + 1 vista | tabla + FK + RLS + contador + backfill | ninguno |
| Filas de producción tocadas | 0 | 2234 (backfill) | 0 |
| Riesgo RLS / tenant | nulo (hereda) | nuevo perímetro a certificar | nulo |
| Payroll / time_entries | intactos | intactos, pero re-certificar | intactos |
| Consistencia del dato | QK único real por servicio | QK único real por servicio | **inconsistente** (N QK por servicio) |
| Deuda futura | media | baja | alta |
| Compatible con congelación P0 | sí | no | sí |
| QA | acotado | extenso | mínimo |

---

## 6. Invariantes a respetar en cualquier opción

- Un `shift_ref` emitido **nunca** se reescribe ni se reutiliza.
- Segmento = fila propia: horario, staffing, assignments, clock, `time_entries` y closeout propios. Ninguna FK se mueve al padre.
- `company_id` del hijo = `company_id` del padre. Sin excepción.
- La jerarquía es de **un solo nivel** (ya lo garantiza `trg_enforce_shift_segment_hierarchy`).
- Nada de esto toca auth, PIN, RLS existente, payments, bookings ni documents.

---

## 7. Qué NO resuelve la Opción A por sí sola

A muestra el QK del padre en la UI, pero la base sigue con `QK-001655` emitido para
un segmento. Cualquier export, invoice legada, log de observabilidad o consulta SQL
directa seguirá viendo dos QK para un mismo servicio. Es maquillaje sobre una
inconsistencia de modelo — exactamente lo que se pidió evitar.

---

## 8. Plan incremental sugerido (cuando se autorice implementar)

1. **Paso 1 (schema, bajo riesgo):** `next_segment_seq` + rama del trigger + índice documentado. Solo afecta a filas con padre.
2. **Paso 2 (lectura):** `getServiceRef` como única fuente del QK visible; búsqueda por QK de servicio; `service_ref` + `segment_ref` en exports.
3. **Paso 3 (limpieza puntual):** decidir qué hacer con QK-001651 (dejarlo como servicio propio es aceptable y es la opción de riesgo cero).
4. **Paso 4 (opcional, futuro):** si aparece la necesidad de servicio sin segmentos o de atributos comerciales, promover la raíz a `public.services` con la raíz ya identificada — B1 deja el camino preparado porque `COALESCE(parent_shift_id, id)` ya es el `service_id`.

---

## 9. Recomendación

**B1 — Root shift como Servicio canónico**, con sufijo de segmento (`QK-001655-2`).

Razones:
1. **Coste/beneficio:** resuelve la inconsistencia real de modelo (un QK por servicio) con un trigger y una función, sin tabla nueva, sin RLS nueva y sin tocar una sola fila histórica.
2. **La evidencia lo permite:** cero FKs apuntan a `shift_ref`; payroll, `time_entries`, assignments y closeout cuelgan del `id`. Quitar el QK propio al hijo no rompe integridad.
3. **Superficie de datos mínima:** 1 fila hija en producción. El momento de cambiar el contrato de numeración es ahora, no cuando haya cientos.
4. **Compatible con la congelación P0:** no exige backfill masivo ni re-certificar perímetros ya cerrados.
5. **No cierra la puerta a B2:** `COALESCE(parent_shift_id, id)` es literalmente el futuro `service_id`. Promover a tabla real después es un backfill mecánico desde una jerarquía ya correcta; hacerlo hoy sería pagar el coste alto antes de tener el requisito que lo justifica.

**B2 se recomienda solo cuando** aparezca al menos uno de: servicio vendido antes de
programarse, atributos comerciales propios del servicio (PO, contrato, presupuesto),
o facturación por servicio desacoplada de los turnos.

**A no se recomienda ni como paso intermedio permanente.** Si se necesita alivio
visual inmediato, puede aplicarse como parche de días —no de semanas— y siempre
acompañado del compromiso del Paso 1 de B1.
