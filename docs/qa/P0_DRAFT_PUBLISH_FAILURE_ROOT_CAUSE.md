# P0 — DRAFT → PUBLISH FAILURE · Causa raíz y remediación

Caso real: Quality Staff, `/app/shifts`. "3 turno(s) no se publicaron" ·
`record "_shift" has no field "shift_date"` (QK-001658, QK-001651, QK-001652).

## 1. Causa raíz exacta

RPC `public.publish_shift_draft(_shift_id uuid)` (SECURITY DEFINER, plpgsql).

Declara `_shift public.scheduled_shifts%ROWTYPE` y validaba
`IF _shift.shift_date IS NULL`. La columna canónica de fecha en
`scheduled_shifts` se llama **`date`**, no `shift_date`. En plpgsql los campos
de un RECORD se resuelven en ejecución, por eso la función creaba/desplegaba
sin error y fallaba **siempre** al ejecutarse sobre un borrador no publicado.

Origen: código escrito contra un esquema legacy (`shifts.shift_date`, tabla
distinta que sí tiene esa columna y es la que usa `consolidate_passport`).
No hubo migración incompleta ni trigger implicado.

Segundo defecto encontrado durante el QA: `_missing := _missing || 'assignments'`
era ambiguo para Postgres (`text[] || unknown` → cast a `text[]`) y devolvía
`22P02 malformed array literal` en lugar de la lista de faltantes.

Tercer defecto (integridad, frontend): `src/pages/admin/Shifts.tsx` ignoraba el
payload `{ ok:false, missing:[...] }` (que no es un error SQL) y continuaba con
`UPDATE status='published'` + notificaciones → riesgo de estado fantasma
(`status=published` con `publication_status=draft`) y avisos a workers de un
servicio no publicado.

## 2. Schema esperado vs real

| Código esperaba | Real en `public.scheduled_shifts` |
|---|---|
| `shift_date` | `date` (date, NOT NULL) |
| `start_time` / `end_time` | existen (time, NOT NULL) |
| `publication_status` | enum, NOT NULL |

## 3. Blast radius

- **100 % de las publicaciones** vía RPC fallaban para cualquier borrador no
  publicado, en **todos los tenants** (la función no es específica de empresa).
- Afectaba publicación individual y masiva (ambas llaman la misma RPC).
- Borradores vivos al momento del fallo: **87** (`publication_status='draft'`,
  no eliminados).
- Estados parciales: **0** servicios con `status='published'` y
  `publication_status='draft'` (el `RAISE` cortaba antes del segundo write).
- Assignments/notifications: sin estados intermedios detectados; las
  notificaciones sólo se emiten después del retorno OK del RPC.

## 4. Cambios realizados

1. Migración: `publish_shift_draft` usa `_shift."date"`.
2. Migración: transición **atómica** — la RPC ahora fija en la misma
   transacción `publication_status`, `published_at`, `published_by` y sincroniza
   la columna legacy `status` (`draft → published`); además sana divergencia
   legacy cuando el servicio ya estaba publicado.
3. Migración: `array_append` en lugar de `||` para la lista de faltantes.
4. `src/pages/admin/Shifts.tsx`: lector único `readPublishResult()`. Si la RPC
   responde `ok:false`, se reporta "Falta completar: …", **no** hay sync de
   estado ni notificaciones, y el servicio permanece Borrador. Se eliminaron los
   dos `UPDATE status` del cliente (la RPC es la única escritura).

## 5. QA ejecutado

| Prueba | Resultado |
|---|---|
| A/B. Publicar QK-001652 (borrador real, Quality Staff) | `{"ok":true,"published":true}` → `publication_status=published`, `status=published`, `published_at/by` sellados |
| C. Assignments tras publicar | 8 asignaciones intactas (mismos workers, mismos estados) |
| F. Publicación individual | OK |
| G. Publicación múltiple | OK (secuencial, atribución por servicio) |
| H. Fallo controlado (QK-001628, QK-001643 sin personal) | `{"ok":false,"missing":["assignments"]}` · siguen en Borrador, sin `published_at`, sin notificaciones |
| Autorización sin sesión | `42501 permission denied` |
| QA de rol | `has_permission(worker, 'service.publish')` = false en Quality Staff y MyStaff para Carlos, Kevin, Anderson, Juliana |
| J. Aislamiento tenant | La RPC valida `has_permission(actor, _shift.company_id, 'service.publish')`; ningún worker puede publicar en ninguna empresa |
| I. Payroll / time_entries | Sin cambios: 7 424 filas en `time_entries`, último registro 2026-08-13, anterior a esta intervención. Cero escrituras en payroll |
| Estados fantasma | 0 (`status='published'` ∧ `publication_status='draft'`) |

Nota D/E (visibilidad worker): la verificación por navegador no fue concluyente
porque la sesión disponible es de perfil global sin contexto de empresa. La
condición canónica sí quedó verificada en datos: QK-001652 está `published` con
asignaciones activas no-reserva para Jorge Cortes, Dannyerson Rojas, Alejandro
Cortes y Sophia Contreras — entrada exacta del resolver ya certificado
(`worker-visible-shifts`), que excluye a cualquier persona sin asignación.
Recomendado: confirmación manual con un worker asignado.

## 6. UX — recomendaciones (sin rediseño)

- El estado hoy se muestra como etiqueta cromática; no comunica la consecuencia.
  Propuesta de copy explícito: "Borrador · el trabajador NO lo ve" /
  "Publicado · visible para el trabajador".
- "Publicación fallida" no existe como estado visible: hoy sólo hay un toast
  efímero. Debería quedar un marcador persistente en la tarjeta con el motivo
  (p. ej. "Falta personal asignado") y acción directa para resolverlo.
- La publicación masiva debería mostrar un resumen accionable por servicio, no
  un contador de fallos.

## 7. Riesgos pendientes

- 85 borradores siguen sin publicar; algunos sin personal asignado no podrán
  publicarse hasta asignar workers (comportamiento correcto).
- Otras rutas de publicación fuera de `Shifts.tsx` (si se añaden) deben usar la
  RPC y leer `ok:false`; hoy no existe lint que lo garantice.
- Persiste la doble representación `status` + `publication_status`; ya está
  sincronizada por la RPC, pero la consolidación en una sola columna queda como
  deuda.

## Veredicto

🟢 **GO** — la transición Draft → Publish es funcional, atómica y auditable;
las validaciones fallidas dejan el servicio en Borrador sin efectos parciales.
