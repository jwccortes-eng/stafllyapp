# P0 — WORKER IDENTITY REMEDIATION + DUPLICATE PREVENTION

Tenant: **Quality Staff by Keury**
Fuente de hallazgos: `docs/qa/P0_QUALITY_STAFF_DUPLICATE_IDENTITY_AUDIT.md`
Estado: **Fase 1 y Fase 2 implementadas (código). Fases 3–8 en dry-run: CERO escrituras ejecutadas.**

---

## 1. Resumen ejecutivo

| Dimensión | Antes | Después de este trabajo |
|---|---|---|
| Puerta de entrada de duplicados | Abierta (import, CSV, alta manual, quick add) | Cerrada por un único resolver canónico |
| Canónicos ocultos en staffing | 47 (solo por `added_via='Pending approval'`) | 0 — el flag ya no oculta a personas con portal real |
| Trazabilidad de altas | Parcial e inconsistente | `added_via` + `added_by` + `activity_log` con `correlation_id` |
| Registros duplicados existentes | 187 en 86 grupos | Sin tocar. Clasificados y con expediente de dry-run |
| Payroll / time entries | — | No se movió ni un registro |
| Auth | — | No se tocó ninguna cuenta |

Ninguna fusión, borrado ni reasignación fue ejecutada. Este documento es la precondición para cualquier write posterior.

---

## 2. Fase 1 — Cerrar la puerta (IMPLEMENTADO)

Único resolver canónico: `src/lib/identity/employee-identity-resolver.ts`.

Orden de matching, estrictamente de más fuerte a más débil:

1. **ID de empleador** (`employer_identification`) — normalizado, sin guiones ni espacios
2. **Teléfono** — solo dígitos, últimos 10, descarta números compartidos/basura
3. **Email** — minúsculas, descarta buzones corporativos compartidos (un mismo email usado por ≥3 registros deja de ser señal de identidad)
4. **ID externo** (`connecteam_employee_id`)
5. **Nombre + señal corroborante** — nombre normalizado (sin acentos, sin sufijos, orden estable) más una segunda señal

Resultados posibles y su semántica:

| Outcome | Significa | Acción del sistema |
|---|---|---|
| `EXACT_MATCH` | Señal fuerte única | Reutilizar el employee existente. Nunca crear |
| `PROBABLE_MATCH` | Nombre normalizado coincide sin señal fuerte | Bloquear creación, pedir revisión humana |
| `AMBIGUOUS` | Varias personas compiten | Bloquear creación. Nunca fusionar automáticamente |
| `NOT_FOUND` | Persona nueva real | Crear una sola vez |

Superficies conectadas al resolver (todas las puertas de alta del tenant):

| Superficie | Archivo | Modo |
|---|---|---|
| Alta manual | `src/pages/admin/Employees.tsx` | `resolveExistingEmployeeIdentity` (async) |
| Import CSV de personal | `src/pages/admin/Employees.tsx` | índice en memoria (1 consulta por lote) |
| Actualización masiva CSV | `src/pages/admin/Employees.tsx` | resolver por fila nueva |
| Import Wizard (horarios/nóminas) | `src/pages/admin/ImportWizard.tsx` | índice en memoria |
| Import Connecteam | `src/pages/admin/ImportConnecteam.tsx` | índice en memoria |
| Import extras de nómina | `src/pages/admin/ImportPayrollExtras.tsx` | resolver + auto-vínculo si `EXACT_MATCH` |
| Quick Add / invitación | `src/components/employee/QuickAddInviteWizard.tsx` | resolver |

Cambio de comportamiento clave en Import Wizard: un nombre suelto proveniente de un horario **ya no crea una persona**. Si no hay coincidencia limpia, la fila cae en “no emparejadas” con la razón visible para el operador.

## 3. Fase 2 — Corregir assignable workers (IMPLEMENTADO)

`src/lib/shifts/assignable-workers.ts`

`added_via='Pending approval'` pasa a ser **historia de origen**, no un bloqueo. Solo oculta a alguien si además no existe evidencia operativa real:

- cuenta de portal vinculada (`user_id`), o
- onboarding completado

Efecto medido en el tenant: **47 registros canónicos activos con portal vuelven a aparecer en el selector de staffing**, lo que elimina la causa raíz del patrón “el operador elige el duplicado porque el bueno no aparece”.

Se alineó también la consulta de `DuplicateShiftDialog` para que traiga `user_id` y `onboarding_status`; sin esos campos el veredicto de asignabilidad se calculaba a ciegas.

## 4. Fase 9 — Trazabilidad (IMPLEMENTADO)

`src/lib/identity/creation-trace.ts` — toda alta escribe:

- `added_via`: `manual`, `csv`, `import_wizard`, `connecteam_import`, `payroll_extras_import`, `quick_add`
- `added_by`: actor autenticado
- entrada en `activity_log` con `correlation_id` por lote, cantidad creada y **cantidad de duplicados prevenidos**

Esto permite responder, para cualquier registro futuro: quién lo creó, desde qué puerta, en qué lote y qué se bloqueó en ese mismo lote.

---

## 5. Fases 3–8 — Clasificación y dry-run (SIN EJECUTAR)

86 grupos / 187 registros. Recuento vigente:

| Clase | Grupos | Riesgo | Acción propuesta |
|---|---|---|---|
| `DEAD_DUPLICATE_SAFE` | 73 | Bajo | Archivar el duplicado, conservar el canónico |
| `CRITICAL_IDENTITY_SPLIT` (Sophia-like) | 10 | Alto | Consolidar identidad, mantener ambos registros vivos hasta validación |
| `PAYROLL_REVIEW_REQUIRED` | 2 | Alto | Congelar. Revisión de nómina antes de tocar nada |
| `MULTI_PORTAL_REVIEW` | 2 | Alto | Dos cuentas de portal: decisión humana sobre cuál sobrevive |
| `AMBIGUOUS` | 1 | Medio | Sin acción hasta obtener señal fuerte |

### 5.1 Dry-run · duplicado muerto (73 grupos)

Definición de “muerto”: sin cuenta de portal, sin horas registradas, sin nómina, sin asignaciones futuras.

```text
PLAN (no ejecutado)
  employees.is_active            -> false
  employees.merged_into_employee_id -> <canonical_id>
  employees.identity_status      -> 'merged'
  activity_log                   += { action: 'identity_merge_dry_run', correlation_id }
NO TOCA: payroll, time_entries, clock_events, auth.users, shifts históricos
```

Verificación previa obligatoria por grupo: recuento en cero de horas, nómina y asignaciones futuras. Cualquier valor distinto de cero reclasifica el grupo a revisión manual.

### 5.2 Dry-run · Sophia-like (10 grupos)

Patrón: portal y nómina en un registro, asignaciones operativas en otro.

```text
PLAN (no ejecutado)
  1. Elegir canónico = el registro con user_id (portal real)
  2. Copiar señales fuertes faltantes al canónico (employer_identification, teléfono, email)
  3. Reapuntar asignaciones FUTURAS al canónico
  4. Marcar el secundario como 'merged' SIN desactivarlo hasta validar el turno siguiente
NO TOCA: turnos pasados, horas, nómina, auth
```

El paso 3 es el único que mueve datos operativos y exige confirmación explícita del operador por grupo.

### 5.3 Congelados (5 grupos)

`PAYROLL_REVIEW_REQUIRED` (2), `MULTI_PORTAL_REVIEW` (2) y `AMBIGUOUS` (1) no tienen plan automático. Requieren decisión humana registrada antes de generar cualquier write.

---

## 6. Rollback

| Escenario | Reversión |
|---|---|
| Fase 1 genera falsos positivos | Los outcomes `PROBABLE_MATCH`/`AMBIGUOUS` no escriben nada: el operador crea desde alta manual con señal fuerte. Sin datos que revertir |
| Fase 2 muestra gente que no debía aparecer | Revertir `hasRealOperationalEvidence`; el flag vuelve a ocultar. Sin datos que revertir |
| Una fusión futura resulta incorrecta | `merged_into_employee_id -> null`, `identity_status -> 'active'`, `is_active -> true`. El registro nunca fue borrado |

Las Fases 1, 2 y 9 son reversibles por código puro: no destruyen información.

---

## 7. Fase 10 — QA

`src/test/worker-identity-remediation.test.ts` — 14 casos, todos en verde.

| QA | Caso | Resultado |
|---|---|---|
| QA1 | Reimportar “Sophia Contreras” no crea otro employee | Bloqueado (`PROBABLE_MATCH`) |
| QA1b | Con `ST-1073` reutiliza el canónico | `EXACT_MATCH` |
| — | Teléfono normalizado gana al nombre | `EXACT_MATCH` por `phone` |
| QA2 | Persona nueva real se crea una sola vez | `NOT_FOUND` → crear |
| QA3 | Repetir el mismo import es idempotente | Segunda pasada resuelve al ya creado |
| QA4 | Canónico con `Pending approval` + portal es asignable | Asignable |
| QA5 | Duplicado muerto no compite en staffing | No asignable |
| QA6 | Nombre repetido sin señal fuerte | `AMBIGUOUS`, nunca fusiona |
| QA7 | El índice es por tenant, no cruza compañías | Aislado |
| — | Buzón corporativo compartido no es identidad | Ignorado |
| — | Registros ya fusionados no compiten | Descartados |
| — | Histórico sigue bloqueado aunque tenga portal | No asignable |

---

## 8. Qué NO se hizo (por diseño)

- No se borró ningún employee
- No se movió nómina ni horas registradas
- No se tocó ninguna cuenta de acceso
- No se ejecutó ninguna fusión sobre los 86 grupos existentes
