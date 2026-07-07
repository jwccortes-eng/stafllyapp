# Root-Cause Review Notes · Persistence Design Spec

**Sprint 26** · Especificación técnica y operativa para persistir las notas
de revisión del flujo Root-Cause Review. **Documentación pura** — no crea
tabla, no crea migración, no crea RPC, no toca `src/`, no toca queries, no
toca payroll.

> Este spec es el paso previo a cualquier implementación. Nada aquí se
> ejecuta automáticamente. Antes de codear, revisar la sección
> **Criterios de go/no-go** al final.

---

## 1. Objetivo de las notas persistentes

Permitir que un reviewer (admin / manager / supervisor) deje **contexto
operacional** sobre una anomalía detectada por el flujo Root-Cause Review,
de modo que:

- El siguiente reviewer entienda qué ya se revisó y qué queda pendiente.
- Se registre por qué una diferencia de dry-run se considera aceptable,
  requiere corrección, o requiere escalar a supervisor.
- Exista trazabilidad operativa entre "detección de anomalía" y "acción
  tomada en el flujo normal" (Time Clock, Attendance, Shifts).

En resumen: cerrar la brecha entre la nota mental del reviewer y el
próximo turno de revisión.

## 2. Qué NO son las notas

Explícito para evitar drift de alcance:

- **No son aprobaciones de payroll.** Aprobar payroll sigue viviendo en
  el flujo oficial de cierre de período.
- **No son ajustes.** No modifican `time_entries`, `scheduled_shifts`,
  `shift_assignments`, `payroll_adjustments`, `movements`,
  `reconciliation_*`, `compensation_*`, ni `payroll_rate_snapshots`.
- **No recalculan payroll.** No disparan dry-run, ni afectan totales.
- **No reemplazan el audit log oficial** de payroll ni de time entries.
- **No son comunicación con el empleado.** No hay notificaciones,
  emails, ni exposición al usuario final. Son *notas internas de
  operaciones*.
- **No son tickets.** No tienen SLA, prioridad, asignación cruzada.
- **No son documentos legales.** No sustituyen actas, ni justificantes,
  ni evidencia contractual.

## 3. Entidades candidatas para asociar la nota

Una nota describe *qué se está revisando*. Las asociaciones posibles:

| Campo             | Obligatorio | Rol                                                                 |
| ----------------- | ----------- | ------------------------------------------------------------------- |
| `company_id`      | Sí          | Tenant scope. Nunca cross-tenant.                                   |
| `period_id`       | No          | Payroll period donde se detectó la anomalía.                        |
| `worker_id`       | No          | Empleado enfocado (nullable para notas de contexto general).        |
| `reason`          | No          | Clave de causa raíz (`open_entries`, `overlap`, etc.).              |
| `time_entry_id`   | No          | Entry específico que motiva la nota.                                |
| `shift_id`        | No          | Turno específico que motiva la nota.                                |
| `source_module`   | Sí          | Dónde se creó: `root_cause_explorer`, `review_queue`, `attendance`, `time_clock`, `shifts`. |

Regla: al menos uno entre `period_id`, `worker_id`, `time_entry_id` o
`shift_id` debe estar presente para que la nota tenga anclaje operativo.
Si todos son null, se rechaza en el nivel de aplicación (no en constraint
DB, para no bloquear casos futuros).

## 4. Modelo de datos propuesto

**Tabla futura sugerida:** `public.payroll_review_notes` (nombre
tentativo; `review_notes` es alternativa si se decide que las notas
cubran más que payroll).

```text
payroll_review_notes
├── id              uuid pk default gen_random_uuid()
├── company_id      uuid not null                       -- tenant scope
├── period_id       uuid null   → pay_periods(id)
├── worker_id       uuid null   → employees(id)
├── reason          text null                           -- CauseKey
├── time_entry_id   uuid null   → time_entries(id)
├── shift_id        uuid null   → scheduled_shifts(id)
├── source_module   text not null                       -- enum-like check
├── note            text not null                       -- max 2000 chars app-side
├── status          text null                           -- enum-like check
├── created_by      uuid not null → auth.users(id)
├── updated_by      uuid null   → auth.users(id)
├── created_at      timestamptz not null default now()
├── updated_at      timestamptz null
├── archived_at     timestamptz null                    -- soft delete
└── archived_by     uuid null   → auth.users(id)
```

**Índices sugeridos** (para lectura eficiente desde los consumers):

- `(company_id, period_id, worker_id)` — Payroll Review Queue focus.
- `(company_id, worker_id, created_at desc)` — historial por trabajador.
- `(company_id, archived_at)` — filtrar activos rápido.

**No FK duras** hacia `pay_periods` / `time_entries` / `scheduled_shifts`
si preferimos que la nota sobreviva a borrados o re-generaciones de
períodos. Decisión abierta — ver riesgos §11.

## 5. Campos: valores permitidos

`source_module` (constraint check o enum futuro):

- `root_cause_explorer`
- `review_queue`
- `attendance`
- `time_clock`
- `shifts`

`status` (opcional, nullable):

- `verified`             — reviewer confirmó que no hay problema
- `needs_correction`     — requiere ajuste desde flujo normal
- `pending_supervisor`   — escalado, no accionable por reviewer
- `review_time_entry`    — pedir revisión específica de fichaje

Mapeo directo con los chips locales del Sprint 25 para evitar drift.

`note`: texto libre, plano, sin markdown ejecutado. Límite sugerido
2000 caracteres a nivel aplicación. Sin HTML, sin adjuntos (fuera de
alcance v1).

## 6. RLS esperado

Todas las políticas se derivan de `company_id`. Reglas:

- **SELECT**: usuario autenticado con acceso a `company_id` (via el
  helper de tenant existente en el proyecto — no inventar uno nuevo).
- **INSERT**: usuario autenticado con acceso a `company_id`; `created_by
  = auth.uid()`; `archived_at` debe ser null.
- **UPDATE**: sólo el `created_by` original o un rol con permiso de
  supervisor de payroll; sólo permite mutar `note`, `status`,
  `updated_by`, `updated_at`. Nunca permite cambiar `company_id`,
  `created_by`, `created_at`, ni las FKs de anclaje.
- **DELETE físico**: prohibido. Sin política, o política que sólo permita
  a `service_role`.
- **Archivado**: se hace vía UPDATE de `archived_at` + `archived_by`.
  Sólo permitido a `created_by` o rol supervisor.

Se debe usar el patrón `has_role(auth.uid(), 'admin')` /
`has_role(auth.uid(), 'supervisor')` que ya usa el proyecto — nunca
guardar el rol en la nota misma.

## 7. Permisos por rol

| Rol             | Ver notas de su company | Crear | Editar propia | Archivar propia | Editar ajena | Archivar ajena |
| --------------- | ----------------------- | ----- | ------------- | --------------- | ------------ | -------------- |
| Employee        | No                      | No    | No            | No              | No           | No             |
| Manager         | Sí                      | Sí    | Sí (24h)      | Sí (24h)        | No           | No             |
| Supervisor      | Sí                      | Sí    | Sí            | Sí              | Sí           | Sí             |
| Admin           | Sí                      | Sí    | Sí            | Sí              | Sí           | Sí             |
| Payroll officer | Sí (read-only op)       | Sí    | Sí            | Sí              | No           | Sí             |

La ventana "24h" es una regla de aplicación (comparar `now() -
created_at`) — no una constraint DB, para permitir grace period
ajustable sin migración.

## 8. Auditoría

Fuera de audit-log oficial de payroll. Estrategia sugerida:

- **Historial ligero**: cada UPDATE actualiza `updated_by` y `updated_at`
  vía trigger `update_updated_at_column()` estándar del proyecto.
- **Historial completo (opcional v2)**: tabla `payroll_review_notes_history`
  poblada por trigger AFTER UPDATE/INSERT con snapshot de la fila. No se
  incluye en v1 para minimizar superficie.
- **Nunca eliminar filas**. Archivado es la única forma de "borrar".
- **No exponer al empleado**. Las notas nunca se muestran en portales de
  empleado ni se incluyen en exports del empleado.

## 9. Política de edición y borrado

- **Editar**: sí, dentro de ventana o por supervisor (ver §7). Un cambio
  actualiza `updated_at` y `updated_by`.
- **Borrar físicamente**: no.
- **Archivar**: sí, escribe `archived_at` + `archived_by`. Las notas
  archivadas no aparecen en listados por defecto; se pueden ver con
  toggle "Ver archivadas".
- **Reactivar**: opcional v2. En v1, archivar es terminal — evita
  ambigüedad de "quién y por qué reactivó".

## 10. UI propuesta

### RootCauseExplorer (evolución del draft del Sprint 25)

- Reemplazar el bloque local por uno persistente cuando la persistencia
  esté aprobada:
  - Al abrir, cargar notas existentes filtradas por `company_id +
    period_id + worker_id`.
  - Mostrar lista compacta (max 5, con "Ver todas").
  - Formulario para crear nota nueva: textarea + chip de estado + botón
    "Guardar nota".
  - Banner de contexto: *"Las notas no aprueban ni modifican payroll"*.
- Mantener el textarea como "Nueva nota" — no editar in-place la lista.
- Edición de una nota existente abre un mini-dialog (no inline) para
  reducir errores de touch.

### PayrollReviewQueue

- Ícono/contador de notas por bucket cuando `worker_id` matchea.
- Click abre el explorer con la sección de notas expandida.
- Nunca reemplaza el número de anomalías: nota ≠ resolución.

### Time Clock / Attendance / Shifts

- **v1: read-only indicator.** Si una fila tiene notas asociadas
  (`time_entry_id` o `shift_id`), mostrar un `NotebookPen`-like icon con
  tooltip *"N notas de revisión"*. Click lleva al RootCauseExplorer.
- **v1: no formulario de creación aquí.** La nota nace en el contexto
  del explorer para forzar diagnóstico previo.

### Historial

- Vista "Historial de revisión del trabajador" en el drawer del
  explorer: últimas N notas del `worker_id`, ordenadas desc, con badge
  de `source_module`, `status` y autor.

### Diferenciación visual con "aprobación"

- Copy explícito: *"Nota interna · no aprueba payroll"*.
- Colores neutros (border/border, no verde). Verde reservado para
  aprobaciones oficiales.
- Nunca CTA con texto "Aprobar" en el módulo de notas.

## 11. Riesgos

- **Confusión nota ↔ aprobación.** Mitigación: copy explícito, sin
  verde, sin CTA de aprobación.
- **PII en texto libre.** Mitigación: nota interna, invisible al
  empleado, límite de longitud, sin exports v1.
- **Notas huérfanas** si se borra un período o entry. Mitigación:
  decidir FK dura vs blanda (ver §4). Recomendación: `ON DELETE SET
  NULL` para no perder la nota, pero sí perder el anclaje.
- **Cross-tenant leak** si RLS mal escrita. Mitigación: revisar RLS con
  el linter de Supabase y usar helpers de tenant existentes.
- **Ruido operativo.** Notas viejas activas ensucian el explorer.
  Mitigación: filtro por período activo por default, con toggle "Ver
  todas".
- **Divergencia con audit log oficial.** Riesgo: alguien lee la nota
  como "prueba". Mitigación: copy *"contexto operativo, no evidencia
  legal"* y no incluir en exports.
- **Uso como buzón de sugerencias del empleado.** Riesgo: se filtra
  como canal. Mitigación: no exponer al empleado, nunca.
- **Deuda si se implementa sin este spec.** Riesgo real hoy.

## 12. QA (para cuando se implemente)

- **Multi-tenant**: crear nota en company A, verificar que usuario de
  company B no la ve con ninguna combinación de filtros.
- **RLS INSERT**: forzar `created_by` distinto de `auth.uid()` — debe
  fallar.
- **RLS UPDATE**: intentar cambiar `company_id`, `created_by`,
  `created_at` — debe fallar.
- **DELETE físico**: intentar DELETE — debe fallar para todos los roles
  no `service_role`.
- **Archivado**: verificar que archivar sin permiso falla; que archivar
  con permiso escribe `archived_at` + `archived_by`.
- **Grace window** (24h manager): mockear `now()` para probar dentro y
  fuera de ventana.
- **UI**: mobile 390×844 y desktop 1366/1440, sin overflow, chips wrap.
- **Payroll intacto**: correr dry-run antes/después de crear notas —
  totales idénticos.
- **Regresiones del harness Playwright**: copy visible del Sprint 19–25
  intacto o regex actualizada intencionalmente.

## 13. Migración futura sugerida

**Cuando** se decida implementar (ver §14), la migración deberá:

1. `CREATE TABLE public.payroll_review_notes (...)` con los campos del §4.
2. `GRANT SELECT, INSERT, UPDATE ON public.payroll_review_notes TO
   authenticated;` (sin DELETE).
3. `GRANT ALL ON public.payroll_review_notes TO service_role;`
4. `ALTER TABLE public.payroll_review_notes ENABLE ROW LEVEL SECURITY;`
5. Políticas del §6, una por operación.
6. Trigger `update_updated_at_column()` sobre BEFORE UPDATE.
7. Índices del §4.

Todo esto en una sola migración. No mezclar con lógica de payroll ni
con cambios de otras tablas.

## 14. Criterios de go / no-go antes de persistir

**Go** (proceder con la migración) sólo si TODO lo siguiente es cierto:

- [ ] El equipo de producto confirma que las notas locales del Sprint 25
      resultan insuficientes en uso real (feedback de >= 2 usuarios QA).
- [ ] Existe consenso sobre roles y ventana de edición (§7).
- [ ] Existe consenso sobre FK dura vs blanda (§4).
- [ ] Se acepta explícitamente que las notas **no aprueban payroll** y
      **no se muestran al empleado**.
- [ ] Se aprueba mostrar el indicador read-only en Time Clock /
      Attendance / Shifts (§10) o se decide postponer.
- [ ] Se define quién es dueño operativo del feature (soporte,
      onboarding, etc.).
- [ ] El harness Playwright puede extenderse con casos de
      creación/lectura sin datos de producción.

**No-go** (mantener sólo el borrador local del Sprint 25) si:

- Aún hay ambigüedad sobre roles o exposición al empleado.
- No hay demanda real medida.
- Hay presión para usarlo como sustituto de aprobación o de audit log.
- No hay bandwidth para operar RLS + auditoría con el rigor descrito.

---

## 15. ¿Preguntas abiertas que este documento responde?

- **¿Se permite editar?** Sí, con ventana 24h para manager, sin límite
  para supervisor/admin. §7.
- **¿Se permite archivar?** Sí, soft delete via `archived_at`. §9.
- **¿Quién ve notas?** Manager, supervisor, admin, payroll officer del
  mismo `company_id`. Empleado no. §7.
- **¿Quién crea?** Los mismos, excepto empleado. §7.
- **¿Quién archiva?** Autor dentro de 24h o supervisor/admin siempre. §7.
- **¿Historial?** `updated_at`/`updated_by` en v1. Tabla history opcional
  v2. §8.
- **¿Confusión con aprobación?** Copy y color explícitos, sin CTA de
  aprobación en el módulo. §10, §11.
- **¿Exports?** No en v1. §2, §11.
- **¿Aparece en Payroll Review Queue?** Sí, como contador/indicador,
  no como aprobación. §10.
- **¿Aparece en RootCauseExplorer?** Sí, home del feature. §10.
- **¿Aparece en Time Clock / Attendance / Shifts?** Sólo indicador
  read-only. §10.
- **¿Alimenta el passport/persona del trabajador?** Fuera de alcance
  v1. Requeriría privacy review adicional; recomendación: no, o sólo
  agregado (count), nunca texto libre.

---

**Estado:** SPEC — no implementado. Sin cambios en `src/`, sin
migraciones, sin queries, sin payroll. Este documento es la referencia
única antes de abrir un sprint de implementación.
