# P0 — Connecteam Export: separar "Publicado" de "Listo para exportar"

Fecha: 2026-08-09 · Alcance: UI + validación de export. Sin cambios de CSV, payroll,
permisos, schema, asignaciones ni `scheduled_shifts`.

## 1. Causa raíz

`validateShiftForExport` (`src/lib/integrations/connecteam-export.ts`) contenía:

```ts
if (pub && pub !== "published") return { status: "blocked", warnings: [{ code: "not_published", ... }] };
```

Ese `return` temprano cortocircuitaba TODA la validación real: un borrador nunca
llegaba a evaluarse por fecha, hora, título, timezone, Job o capacidad. De ahí el
"3 servicios · 0 exportables · 3 bloqueados" del video.

`publication_status` es ciclo de vida interno de Stafly; el archivo de Connecteam no
lo consume en ninguna de sus 16 columnas.

## 2. Regla nueva

| Stafly | Readiness | Resultado |
|---|---|---|
| draft | ready | exportable (`draft_export_context`, severidad info) |
| published | ready | exportable |
| draft | not ready | bloqueado con blockers reales |
| published | not ready | bloqueado con blockers reales |
| cancelled / canceled / archived | cualquiera | bloqueado (`terminal_status`) |

Los estados terminales siguen bloqueando: un turno cancelado no debe aparecer en el
calendario de Connecteam. Es la única dependencia real que queda con el ciclo de vida.

Espejo idéntico en el readiness canónico
(`src/lib/shifts/service-operational-readiness.ts`): `export.not_published` fue
eliminado; ahora hay `export.terminal_status` (blocker) y `export.draft_context`
(warning informativo). `readyToExportConnecteam` gobierna la exportación.

## 3. Blockers reales que quedan

`missing_date`, `missing_start`, `missing_end`, `missing_title`, `missing_timezone`,
`missing_job_context` (mapping obligatorio Job/Sub item), `no_capacity_no_users`,
`no_accepted_assignments` (solo en modo Users), más permisos/tenant
(`no_admin`, `no_tenant`, `tenant_mismatch`) y `terminal_status`.

## 4. Exportar no publica

El exportador es puro: resuelve datos y serializa CSV. No escribe
`publication_status`, no notifica, no asigna, no crea `time_entries`, no toca payroll
ni portal. El copy del modal lo declara explícitamente.

## 5. UX

Nuevo componente `src/components/shifts/integrations/ExportStateBadges.tsx`:

```
Luminance · 18 Ago
Stafly: Borrador   Connecteam: Listo para exportar
```

- Diálogo individual: badges duales en el banner de estado.
- Diálogo bulk: lista "Estado por servicio" con estado Stafly + estado Connecteam por
  fila y, si está bloqueado, la razón exacta.
- El mensaje "Publica antes de exportar" ya no existe.

## 6. QA del caso real (datos leídos en solo lectura)

| Servicio | Fecha | publication_status | Antes | Ahora |
|---|---|---|---|---|
| Luminance | 2026-08-18 | draft | bloqueado: "Publica antes de exportar" | evaluado por readiness real |
| Imperial | 2026-08-18 | draft | bloqueado: "Publica antes de exportar" | evaluado por readiness real |
| Luminance | 2026-08-13 | draft | bloqueado: "Publica antes de exportar" | evaluado por readiness real |

Los tres tienen `client_id = null` y `location_id = null`, así que el blocker que ahora
se muestra es el real y accionable: **`missing_job_context`** — "Connecteam necesita un
Job: selecciona el cliente o un lugar guardado". Antes ese dato quedaba oculto detrás
del falso blocker de publicación. Al completar cliente o venue desde el propio editor
(flujo inline P0 anterior), el borrador pasa a exportable **sin publicarse**.

Cobertura en tests: `Draft completo es exportable — publication_status es contexto,
no blocker` y `Blocked cuando el turno está cancelado`
(`src/test/connecteam-export.test.ts`), más los equivalentes en
`src/test/service-operational-readiness.test.ts`. 67 tests verdes.

## 7. Seguridad

Sin cambios en `useCanExportConnecteam`, tenant boundaries, auth, RLS,
`scheduled_shifts`, assignments, payroll ni `time_entries`. El CSV y sus 16 columnas
permanecen byte-idénticos.

---

**Stafly permite exportar Servicios draft a Connecteam cuando cumplen los requisitos
reales de exportación, sin publicarlos ni alterar la operación.**
