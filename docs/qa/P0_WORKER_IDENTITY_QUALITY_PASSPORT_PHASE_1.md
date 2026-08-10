# P0 — WORKER IDENTITY QUALITY / PASSPORT PHASE 1

Fecha: 2026-07 · Alcance: Quality Staff (datos reales) · Modo: **solo lectura**

> No se modificaron trabajadores, assignments, documentos, time entries, payroll ni auth.
> Se construyó una capa explicable de verdad de identidad para detectar fragmentación y
> posibles duplicados antes de cualquier consolidación.

---

## A. Modelo actual (inventario de identidad)

| Tabla / campo | Propósito | Owner | Scope | Escribe | Consume |
|---|---|---|---|---|---|
| `employees` (1418 filas en Quality Staff, 84 columnas) | Relación operativa persona ↔ empresa | Admin del tenant | Tenant | Admin, invitaciones, importadores, intake | Staffing, payroll, portal, clock |
| `employees.user_id` | Vínculo con cuenta de acceso | Auth | Global (cuenta) / tenant (fila) | Aceptación de invitación | Portal, permisos |
| `employees.phone_number` / `email` | Contacto e identificador débil-fuerte | Admin del tenant | Tenant | Admin, worker, importador | Login, avisos, matching |
| `employees.connecteam_employee_id` | ID externo del sistema anterior | Puente Connecteam | Tenant | Import/export | Mapping, exportación |
| `employees.employer_identification`, `ssn_last4` | Identificación fiscal (sensible) | Admin del tenant | Tenant, L1 | W-9 guiado | Payroll (no matching) |
| `employees.worker_type` / `identity_status` / `requires_identity_resolution` | Estado de identidad | Sistema + admin | Tenant | Migraciones e intake | Asignabilidad, payroll gating |
| `employees.merged_into_employee_id` / `resolved_person_id` | Preparado para consolidación futura | Sistema | Tenant | **Sin uso hoy (0 filas)** | — |
| `profiles` | Perfil de cuenta | Auth | Global | Registro | Portal |
| `shift_assignments` (6378 filas, 195 trabajadores) | Historia operativa | Operación | Tenant | Staffing | Payroll, reportes |
| `time_entries`, `clock_events` | Horas reales | Operación | Tenant | Clock | Payroll |
| `employee_documents` | Documentación | Admin/worker | Tenant | Onboarding | Compliance |
| `passport_profiles` / `_work_history` / `_metrics` / `_publications` | Vitrina pública de la persona | Ecosistema | Global | Worker | Passport público |

**Fuentes competidoras detectadas:** `employees` (por tenant) vs `passport_profiles` (persona global) vs `connecteam_employee_id` (sistema externo). Hoy no existe una entidad "persona" canónica: la persona se infiere del registro de empresa.

## B. Posibles duplicados (Quality Staff, real)

| Métrica | Valor |
|---|---|
| Registros totales | 1418 |
| Activos | 207 |
| Con portal (`user_id`) | 199 |
| Placeholders legacy (`legacy_placeholder` / `pending_identity`) | 40 |
| Con ID Connecteam | 1304 |
| Fusionados (`merged_into_employee_id`) | 0 |
| Grupos por teléfono exacto | **0** (el teléfono casi no está poblado) |
| Grupos por ID Connecteam duplicado | 0 |
| Grupos por email personal (excluye buzones compartidos) | **27** |
| Grupos por nombre normalizado | **65** |
| Buzones compartidos detectados | `qualitystaff@gmail.com` (20), `qualitystaff1` (10), `qualitystaff2` (10) |
| Registros sin ningún identificador fuerte | 76 |

Casos con mayor fragmentación por nombre: `ivan morales`, `angel colon`, `julio velasquez`, `lizardy castillo` (5 registros cada uno), `justin mora`, `sophia contreras` (3).

## C. Grupos de identidad y clasificación

El motor (`src/lib/identity/person-truth.ts`) agrupa **dentro de una sola empresa** y clasifica:

- `EXACT_MATCH` — dos o más señales fuertes + mismo nombre.
- `PROBABLE_DUPLICATE` — una señal fuerte (teléfono, email personal, ID externo, identificador fiscal) + mismo nombre.
- `POSSIBLE_DUPLICATE` — señales medias (nombre + fragmento de teléfono / dominio de email / correlación de portal), o **solo nombre**.
- `AMBIGUOUS` — señal fuerte con nombres distintos, o señal fuerte con cuentas de acceso diferentes.
- `NO_MATCH` — registro único.

Reglas duras aplicadas: el nombre **nunca** basta para consolidar; los buzones compartidos (3+ usos) se excluyen del matching; no se usan atributos sensibles (SSN, documentos, dirección, género, tarifa) como señal.

En Quality Staff, con teléfono casi vacío, la mayoría de grupos caen en `POSSIBLE_DUPLICATE` (solo nombre) y 27 grupos suben a `PROBABLE_DUPLICATE` por email personal repetido.

## D. Candidatos a registro operativo principal

`computePrimaryCandidate` puntúa señales explicables: asignable hoy (+40), portal activo (+20), volumen de asignaciones (hasta +20), identificador válido (+10), documentos (+8), onboarding completo (+5), penalización a histórico/placeholder (−30). **Nunca** usa monto de payroll ni tarifa.

Devuelve `candidateId`, `reason` y `confidence`. Es una hipótesis, no una decisión: la UI lo etiqueta como "Candidato principal" y no ofrece fusionar.

## E. Fragmentación

Flags detectados por grupo:

- `portal_split` — el acceso vive en un registro y el resto no lo tiene. **45 grupos por nombre** en Quality Staff tienen portal en unos registros y no en otros.
- `documents_elsewhere` — los documentos están en un registro distinto al del portal.
- `history_split` — historia de servicios repartida entre varios registros.
- `no_strong_identifier` — ningún registro del grupo tiene teléfono ni ID externo.
- `mixed_lifecycle` — registros en etapas distintas (activo, histórico, pendiente).

Esto confirma el patrón del enunciado: portal en A, documentos en B, historia en C. La consolidación debe ser planificada, no una elección simplista.

## F. Assignments sospechosos

3133 de 6378 asignaciones de Quality Staff pertenecen a trabajadores que caen en algún grupo de nombre repetido. Distribución por estado del registro asignado:

- Asignaciones a registros hoy **no asignables**: 418 a `legacy_placeholder` inactivos, ~295 a `real_employee` inactivos, 1007 con `added_via = Pending approval`.
- Clasificación aplicada (`src/lib/identity/assignment-risk.ts`): `CONFIRMED_OK`, `SUSPICIOUS_IDENTITY`, `NON_ASSIGNABLE_RECORD`, `AMBIGUOUS`, `HIGH_RISK_DO_NOT_TOUCH`.
- Cualquier registro con **horas registradas** y dudas de identidad se marca `HIGH_RISK_DO_NOT_TOUCH`: no se toca en ninguna fase automática.

Nada se corrige automáticamente.

## G. Comparación con Connecteam

`compareWithConnecteam` clasifica `MATCHED`, `MULTIPLE_STAFFLY_MATCHES`, `CONNECTEAM_ONLY`, `STAFLY_ONLY`, `AMBIGUOUS`. Connecteam se usa **solo como señal adicional**, nunca como fuente de verdad. En Quality Staff, 1304 registros ya llevan `connecteam_employee_id` y **ningún ID externo está duplicado**, así que el ID externo es hoy la señal más limpia disponible para desempatar grupos de nombre.

## H. Riesgos

1. **Teléfono vacío**: sin teléfono normalizado no hay señal fuerte para la mayoría; el nombre solo no permite consolidar.
2. **Buzones compartidos**: 40 registros comparten tres correos de operación; tratarlos como identidad produciría falsos positivos masivos (mitigado).
3. **Portal fragmentado**: consolidar mal rompería el acceso de trabajadores activos.
4. **Horas y pago**: cualquier reasignación de historia afectaría payroll cerrado; por eso el veredicto de bloqueo explícito.
5. **Aislamiento de tenant**: la misma persona existe en Quality Staff, My Staff, JKitchen y Parceros; agrupar cruzando empresas filtraría datos privados. El motor nunca cruza `company_id`.

## I. Propuesta Passport (modelo conceptual, sin migrar datos)

```text
PERSON (Passport)                      ← identidad global, propiedad de la persona
  ├─ contact methods (verificados)
  ├─ consent records
  ├─ skills / languages / experience
  ├─ reputation & verification
  └─ TENANT WORKER RELATIONSHIP  (1..n)  ← employees row, propiedad del tenant
        ├─ estado operativo, rol, asignabilidad
        ├─ TENANT-PRIVATE HISTORY: asignaciones, horas, payroll, documentos
        └─ external ids (Connecteam, etc.)
```

- Passport ≠ fila de `employees`. `employees` representa la relación operativa con una empresa.
- Nada tenant-private se comparte entre empresas por defecto: cruzarlo exige consentimiento explícito.
- La consolidación futura vincula filas de `employees` a un `person_id`, **sin mover** documentos, horas ni payroll.

## J. Recomendación para Phase 2

1. **Campaña de identificador fuerte**: capturar y verificar teléfono en los 207 activos antes de cualquier merge. Sin esto, el 80% de los grupos son irresolubles.
2. Usar `connecteam_employee_id` como desempate en los 65 grupos de nombre.
3. Introducir `person_id` (link table) en modo *shadow*: vincular sin fusionar, y medir cuántas decisiones humanas coinciden con `operational_primary_candidate`.
4. Cola de revisión con decisión humana registrada y auditable (VWC), botón "Vincular" antes que "Fusionar".
5. Congelar como intocables los grupos con horas o payroll cerrado hasta tener consolidación con reversa.

## Superficies entregadas

- `src/lib/identity/person-truth.ts` — motor puro de agrupación, clasificación, primary candidate, fragmentación, enmascarado y comparación Connecteam.
- `src/lib/identity/assignment-risk.ts` — auditoría pura de asignaciones por identidad.
- `src/hooks/useIdentityQuality.ts` — read model de solo lectura.
- `src/pages/admin/IdentityQuality.tsx` — pantalla "Calidad de identidad" en `/app/identity-quality`, sin botón de fusionar (solo **Revisar**).
- `src/test/identity-person-truth.test.ts` — 15 pruebas (normalización, privacidad, buzones compartidos, veredictos, aislamiento por empresa, primary, riesgo de asignaciones, Connecteam).
