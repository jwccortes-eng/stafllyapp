# P0 — Matriz de blockers Connecteam: semana 12–18 Ago vs 26 Ago–1 Sep

Fecha: 2026-08-09. Empresa: QA Testing (`00000000-…-0001`).
Solo lectura: no se modificó código, CSV, Servicios ni payroll.

Método: se leyeron las filas reales de `scheduled_shifts` (más el conteo real de
`shift_assignments`) y se ejecutaron los helpers de producción
`getCalendarServiceIdentity` → `getServiceLifecycleReadiness` →
`getServiceOperationalReadiness` con esos datos exactos.

## Semana A — 12 al 18 de agosto

| QK | Fecha | publication_status | Horario (BD) | slots | Draft | Staff | Export CT | Publish | Close |
|---|---|---|---|---|---|---|---|---|---|
| QK-001577 | 2026-08-13 | draft | 16:00 → 23:59 | 2 | ✅ | ✅ | ✅ | ✅ | ✅ |
| QK-001578 | 2026-08-18 | published | 00:08 → 00:09 | 1 | ✅ | ✅ | ✅ | ✅ | ✅ |
| QK-001579 | 2026-08-18 | draft | 00:08 → 00:09 | 2 | ✅ | ✅ | ✅ | ✅ | ❌ |

Blockers de export en la semana A: **ninguno** en los tres Servicios.
(El único ❌ es `close`, que depende de operación finalizada, no de Connecteam.)

## Semana B — 26 de agosto al 1 de septiembre

| QK | Fecha | publication_status | Horario (BD) | slots | Draft | Staff | Export CT | Publish | Close |
|---|---|---|---|---|---|---|---|---|---|
| QK-001581 | 2026-08-30 | published | 17:00 → 17:00 | NULL | ✅ | ❌ | ❌ | ❌ | ✅ |
| QK-001582 | 2026-08-31 | draft | 17:00 → 17:00 | NULL | ✅ | ❌ | ❌ | ❌ | ✅ |
| QK-001583 | 2026-09-01 | draft | 17:00 → 17:00 | NULL | ✅ | ❌ | ❌ | ❌ | ✅ |

### READY_TO_EXPORT_CONNECTEAM = FALSE — detalle idéntico en los tres

| Elemento | Valor |
|---|---|
| Blocker exacto | `export.missing_end` — "Connecteam necesita una hora de fin para crear el turno." |
| Campo faltante | `end_time` |
| Helper que devuelve FALSE | `getServiceOperationalReadiness` (rama `if (!end)`), consumido por `getServiceLifecycleReadiness` y por `getCalendarServiceIdentity` |
| Archivo responsable | `src/lib/shifts/service-operational-readiness.ts` (líneas ~144-164); el `end` vacío llega desde `src/lib/shifts/calendar-service-identity.ts`, que fuerza `endTime: ""` cuando `notes` contiene "Hora de fin pendiente" o cuando `start === end` |
| ¿Regla de Stafly? | Sí, la *forma* del mensaje y el `endMissing` derivado de las notas de intake |
| ¿Regla real de Connecteam? | Sí, el fondo: `validateShiftForExport` (`src/lib/integrations/connecteam-export.ts`) marca `missing_end` y `zero_duration` como `block`; el importador descarta filas con End vacío o End == Start |

Blockers adicionales de la semana B (no de Connecteam):
`staff.pending_headcount` (cantidad de personal PENDIENTE, `slots = NULL`) y
`publish.end_time`.

## Diferencias reales (solo hechos observados)

| Campo | Semana A | Semana B |
|---|---|---|
| `end_time` | Distinta de `start_time` (23:59 / 00:09) | **Igual a `start_time`: 17:00 → 17:00** |
| `slots` | 2 / 1 / 2 | **NULL en los tres** |
| `notes` | Texto simple ("Luminance Aug 13") | Bloque `[Intake pendiente]` con "Hora de fin pendiente de confirmar" y "Cantidad de personal pendiente" |
| Origen | Importación previa con horario completo | Smart Intake multi-fecha sin hora de fin |

Todo lo demás es igual: misma empresa, mismo `job_site_address` textual,
cliente presente (IMPERIAL/LUMINANCE HALL), timezone resuelta, sin
`job_site_location_id`, sin meeting point. `publication_status` NO explica nada:
hay draft exportable (QK-001577, QK-001579) y hay published bloqueado (QK-001581).

## Respuestas

1. **¿Qué campo cambia?** `end_time` (igual al inicio en la semana B) y `slots`
   (NULL en la semana B). Secundariamente el marcador en `notes`.
2. **¿Qué readiness cambia?** `READY_TO_STAFF`, `READY_TO_EXPORT_CONNECTEAM` y
   `READY_TO_PUBLISH` pasan de true a false. `READY_TO_CREATE_DRAFT` sigue true
   en las dos semanas.
3. **¿Qué helper devuelve distinto?** `getServiceOperationalReadiness`
   (rama de hora de fin) y, para staffing, la compuerta `staff` de
   `getServiceLifecycleReadiness` por `staffingPending`.
4. **¿Qué blocker aparece solo en la semana B?** `export.missing_end`
   (más `staff.pending_headcount` y `publish.end_time`, fuera de Connecteam).
5. **¿Representa la realidad operacional?** Sí. Esos Servicios se registraron
   con "aprox 5pm" y sin hora de cierre: la hora de fin realmente no existe.
6. **¿Es requisito real de Connecteam?** Sí. `End` es columna obligatoria del
   template y una fila con `End == Start` se descarta en la importación. No es
   una invención de Stafly. Lo que sí es de Stafly es el *momento* en que se
   muestra: el turno se ve "bloqueado" en calendario aunque el dato solo haga
   falta al exportar.
7. **Cambio mínimo para que ambas semanas sigan la misma lógica:** no relajar la
   regla (rompería el importador), sino cerrar el dato en un solo paso: exponer
   en el chip/tarjeta de la semana B un CTA "Definir hora de fin" que escriba
   `end_time` (y opcionalmente `slots`) desde el mismo calendario, con duración
   por defecto sugerida. En cuanto `end_time > start_time`, las dos semanas
   quedan bit a bit en la misma rama del helper — sin tocar el validador.

## Conclusión

**La única diferencia real es que los Servicios del 26 Ago–1 Sep no tienen hora
de fin (`end_time == start_time == 17:00`) y tienen la cantidad de personal
pendiente (`slots = NULL`).** Nada más difiere: ni cliente, ni lugar, ni
timezone, ni estado de publicación.
