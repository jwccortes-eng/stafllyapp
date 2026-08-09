# P0 — BULK SERVICE CREATION

Creación masiva de Servicios **nativa** de Stafly. No es un importador: no hay
archivos, no hay extracción, no hay tabla intermedia, no toca Smart Intake.

## Qué se agregó

| Pieza | Rol |
|---|---|
| `src/lib/shifts/bulk-service-creation.ts` | Modelo PURO: fila, validación, pegado de fechas, plan, vista previa, resumen |
| `src/lib/shifts/bulk-create-write.ts` | Única puerta de escritura: `buildCanonicalServiceInsert` + idempotencia |
| `src/components/shifts/bulk/BulkServiceCreationDialog.tsx` | Vista operativa (grilla desktop / cards mobile) |
| `src/pages/admin/Shifts.tsx` | CTA “Crear varios servicios” junto a las acciones de Servicios |
| `src/test/bulk-service-creation.test.ts` | 13 tests |

## Ubicación

Botón **Crear varios servicios** en la barra de acciones de Servicios
(`/app/shifts`). No vive dentro de “Importar servicios”.

## Modelo

- Fila mínima creable: **fecha + identidad** (cliente, lugar o título).
- Todo lo demás es **PENDIENTE**, nunca 0 y nunca inventado:
  - `headcount = null` → `slots` se persiste como `NULL`;
  - `end_time` ausente → se ancla al inicio y queda declarado en notas;
  - cliente/lugar escritos pero no vinculados → se conservan en el bloque
    `[Pendiente por vincular]` dentro de `notes`.
- Estado por fila: `Completo` / `Borrador con pendientes` / `Falta información
  obligatoria` (esta última no se crea y se avisa en el pie).

## Acciones masivas

Agregar fila · duplicar fila · eliminar antes de guardar · selección múltiple ·
aplicar cliente / lugar / horario / personal / notas a la selección · pegar
lista de fechas · copiar semana (+7 días sobre la selección).

## Pegar fechas

Reutiliza `expandDateList` (ya existente): `Aug 30 … Sep 7` → 9 filas editables
que heredan el contexto de la fila plantilla. **Nada se escribe todavía.**

## Guardar

CTA `Crear X borradores` → vista previa obligatoria (`SeriesPreviewDialog`, el
mismo diálogo de las series) → por cada fila:

`buildCanonicalServiceInsert({ draft: true })` → `scheduled_shifts`
(`publication_status = 'draft'`, `status = 'open'`, `published_at = null`) →
QK propio por secuencia de empresa → `reconciliation_hash = bulk:<batchId>:<rowId>`.

No hay registro intermedio ni bulk engine paralelo.

## Idempotencia

Cada fila tiene identidad estable dentro del lote. Antes de insertar se busca
`(company_id, reconciliation_hash)`; si existe se reutiliza (`reused`). El
mismo camino cubre la carrera post-error. Doble tap y reintento **no duplican**.
El lote (`batchId` + filas) se guarda en `sessionStorage` por empresa, así un
refresh antes de guardar no pierde el trabajo ni cambia las referencias.

## Casos reales

| Caso | Resultado |
|---|---|
| Imperial · Aug 30/31 + Sep 1–7 | 9 filas → 9 drafts → 9 QK |
| Eminence · varias fechas | mismo flujo |
| Millennium + Zemer mismo día | 2 filas independientes, 2 refs distintas |

## Entity resolution

Se reutiliza `rankCatalogMatches` (Ecosystem Intake Engine): exacta → alias →
fuzzy → confirmación humana. **Nunca** se crea cliente o venue automáticamente;
lo ambiguo queda como texto pendiente.

## Readiness

Los Servicios creados conservan readiness independiente (draft, staffing,
Connecteam, publish, close). La creación masiva **no** exige estar listo para
Connecteam ni tener personal asignado.

## QA

`src/test/bulk-service-creation.test.ts` — 13/13 PASS:
1 fila · 50 filas cruzando mes · mismo día con 2 clientes · datos incompletos ·
duplicar fila · estabilidad de referencia (double tap) · pegado de 9 fechas ·
ISO + duplicados + líneas ilegibles · pendientes preservados en notas · vista
previa 100% borrador · resumen con fallos visibles.
Typecheck del proyecto en verde. Desktop = grilla; mobile = cards sin scroll
horizontal.

## No tocado

payroll · time_entries · assignments · auth · RLS · tenants · ECC · ELDM ·
Smart Intake · exportador Connecteam. Sin migraciones ni tablas nuevas.

## Confirmación

Stafly permite crear múltiples Servicios directamente desde una vista operativa
masiva, preservando borradores incompletos, QK independientes y el motor
canónico existente, sin convertir esta experiencia en otro importador o sistema
paralelo.
