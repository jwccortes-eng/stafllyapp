# P0 — SAME SERVICE DUPLICATION: REGRESIÓN DE QK

**Fecha:** 2026-08-13 · **Modo:** AUDITORÍA (sin correcciones, sin migraciones, sin tocar datos)
**Caso reportado:** duplicar con "Mismo servicio" y obtener un consecutivo nuevo visible (QK-001651).

---

## 1. Veredicto

La regresión es **real y estructural**, no visual.

No existe una entidad "Servicio/Evento" separada. El QK (`shift_ref`) **se emite por fila de
`scheduled_shifts`**, y el flujo "Mismo servicio" **inserta una fila nueva** en esa misma tabla.
Como cualquier fila nueva pasa por el trigger de numeración, el horario hijo recibe **su propio
consecutivo** aunque quede colgado del servicio raíz.

Es decir: el agrupamiento por `parent_shift_id` es correcto, pero **el QK visible pertenece al
hijo, no al padre**.

---

## 2. Qué entidad genera el QK

| Elemento | Realidad |
|---|---|
| Entidad que porta el QK | `public.scheduled_shifts` (una fila = un QK) |
| Campo visible | `shift_ref` (`QK-00XXXX`) |
| Contador | `shift_number` (por empresa) |
| Emisor | trigger BEFORE INSERT → `public.assign_shift_company_number()` |
| Generador del consecutivo | `public.next_company_shift_number(company_id)` |
| Prefijo | `companies.shift_ref_prefix` |

```sql
IF NEW.shift_number IS NULL THEN
  NEW.shift_number := public.next_company_shift_number(NEW.company_id);
END IF;
IF NEW.shift_ref IS NULL OR NEW.shift_ref = '' THEN
  NEW.shift_ref := coalesce(v_prefix,'CO') || '-' || lpad(NEW.shift_number::text, 6, '0');
END IF;
```

Índices vigentes (no se tocan):
- `scheduled_shifts_ref_uniq` → `UNIQUE (shift_ref)` **global**
- `scheduled_shifts_company_number_uniq` → `UNIQUE (company_id, shift_number)`

**Consecuencia dura:** con el modelo actual es *imposible* que dos filas compartan el mismo
`shift_ref`. Un hijo no puede "heredar" el QK a nivel de dato.

---

## 3. Qué crea "Mismo servicio"

Crea **un `scheduled_shifts` nuevo** (child horario). No crea ni reutiliza ninguna entidad
service/event, porque esa entidad no existe en el esquema.

`src/components/shifts/DuplicateShiftDialog.tsx` (líneas ~322-352):

```ts
const basePayload = buildCanonicalServiceInsert({ snapshot, date: dateStr, sourceRef, createdBy: userId, draft: true });

const insertPayload = mode === "same"
  ? { ...basePayload, parent_shift_id: parentServiceId, segment_label: segmentName.trim() || null }
  : basePayload;

await supabase.from("scheduled_shifts").insert(insertPayload)…
```

---

## 4. Ramas exactas

| Rama | Código | Payload | Resultado |
|---|---|---|---|
| Same Service | `mode === "same"` | `basePayload` + `parent_shift_id` + `segment_label` | fila nueva + **QK nuevo** |
| New Service | `mode === "new"` | `basePayload` | fila nueva + QK nuevo |

**Sí: ambas ramas comparten el mismo create-service helper**
(`snapshotFromServiceRow` → `buildSeriesIntentFromSnapshot` → `buildCanonicalServiceInsert` →
`insert` en `scheduled_shifts`). La única diferencia entre ramas son dos columnas. Ninguna rama
suprime ni propaga `shift_ref`, por lo que el trigger numera siempre.

---

## 5. ¿Se preserva el vínculo con el padre?

Sí, el vínculo se persiste correctamente:

- `parent_shift_id = shift.parent_shift_id ?? shift.id` (evita jerarquías de 2+ niveles).
- El trigger `trg_enforce_shift_segment_hierarchy` valida existencia del padre, misma empresa y un
  solo nivel.

Evidencia en datos reales (Quality Staff):

| id | shift_ref | parent_shift_id | segment_label | creado |
|---|---|---|---|---|
| `9c5c8f66…` | **QK-001651** | `null` | `null` | 12-ago 16:06 |
| `dd396622…` | **QK-001655** | `9c5c8f66…` | `Service` | 13-ago 17:09 |

Lecturas:
1. `QK-001651` (el caso reportado) se creó **sin** `parent_shift_id`: en ese momento la duplicación
   aún no persistía la jerarquía → quedó como servicio independiente, no como horario.
2. `QK-001655` ya sí cuelga del padre, **pero igualmente estrenó QK propio** → confirma que la
   jerarquía no evita la numeración.

---

## 6. ¿Agrupación real o sólo visual?

**Real en el dato, incompleta en la presentación.**

- Real: `parent_shift_id` + trigger de jerarquía + `buildServiceGroups()` en
  `src/lib/shifts/service-segments.ts`, y el panel `ServiceSegmentsPanel` lista los horarios del
  grupo.
- Incompleta: las superficies de identidad **no resuelven el padre**. `ShiftCard.tsx:98` y
  `ShiftDetailDialog.tsx:580-585` llaman `getShiftDisplayIdentity(shift)` sobre la **fila propia**,
  nunca `serviceRefFor(shift, byId)`. Por eso la tarjeta del hijo muestra su QK y el usuario percibe
  "otro servicio".

---

## 7. ¿A quién pertenece el QK visible?

Hoy: **al child**. Debería ser: **del padre (servicio)**.

---

## 8. Causa raíz (dos capas)

1. **Modelo:** no hay entidad Service/Event. El QK está atado a la fila-horario y protegido por
   `UNIQUE (shift_ref)`, así que la herencia de QK no puede hacerse copiando el valor.
2. **Presentación:** los componentes de identidad leen `shift.shift_ref` directo en vez de resolver
   el QK del servicio raíz, pese a que el helper `serviceRefFor()` ya existe y está sin usar.

---

## 9. Brecha vs. resultado esperado

| Esperado | Hoy |
|---|---|
| Mismo Service/Event padre | ✅ `parent_shift_id` |
| Mismo QK visible | ❌ hijo emite QK propio y lo muestra |
| Nuevo child horario | ✅ |
| Clock/time_entries propios | ✅ (ciclo por fila, intacto) |
| Nuevo servicio → nuevo QK | ✅ |

---

## 10. Opciones de corrección (no ejecutadas)

- **A — Sólo presentación (bajo riesgo).** El hijo conserva su `shift_ref` interno, pero la UI
  muestra el QK del padre + etiqueta de horario (`QK-001651 · Service`) usando `serviceRefFor()`.
  Cero migraciones, cero riesgo sobre payroll/asistencia.
- **B — Sufijo canónico (medio).** Nueva columna derivada `service_ref` = QK del raíz, y el visible
  del hijo pasa a `QK-001651-2`. Mantiene unicidad y da identidad propia al horario.
- **C — Entidad Service real (alto).** Tabla `services` dueña del QK; `scheduled_shifts` pasa a ser
  horario. Solución correcta a largo plazo, requiere backfill de todo el histórico.

Recomendación de secuencia: **A ahora**, **B como formato oficial**, **C sólo con plan de migración
dedicado**.

---

## 11. Alcance respetado

Sin cambios en payroll, `time_entries`, `shift_assignments`, turnos históricos, constraints ni la
secuencia de QK. Ningún QK existente fue reasignado. Sólo lectura.
