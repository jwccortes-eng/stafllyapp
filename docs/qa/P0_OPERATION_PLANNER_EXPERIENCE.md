# P0 — OPERATION PLANNER EXPERIENCE

Fecha: 2026-08-10 · Alcance: UI-only sobre el módulo Servicios.

## Objetivo

Que Servicios deje de sentirse como un CRUD y se comporte como un planner que
acompaña al coordinador desde que llega el evento hasta que queda listo para
payroll. El sistema guía, no obliga, no castiga.

## Qué se implementó

### 1. Preparación separada del estado operativo (Principio 1)

Nuevo módulo puro `src/lib/shifts/service-preparation.ts`:

- `getServicePreparation(identity, { daysUntil })` — checklist de madurez con
  peso, no campos obligatorios:

  ```text
  Horario confirmado        20
  Lugar del servicio        20
  Cantidad de personal      15
  Equipo cubierto           25
  Datos completos del turno 10
  Publicado                 10
  ```

- Devuelve `score` (0–100), `band`, `items`, `pending` y `nextAction`.
- `getLifecyclePreparation(lifecycle)` — la misma preparación leída desde las
  compuertas del editor (`getServiceLifecycleReadiness`), para no duplicar reglas.

El estado operativo (Borrador / Publicado / Cancelado / Archivado) sigue viviendo
en `getCalendarServiceIdentity`. La preparación **nunca** lo reemplaza.

### 2. Draft = evento en construcción (Principio 2)

- El borrador nunca se pinta en rojo: la banda `later` usa el token `primary`.
- Copy sin regaños: "En construcción — vamos paso a paso.",
  "Sigue en construcción: publícalo cuando quieras que el equipo lo vea."
- El rojo queda reservado a problemas reales (cancelado), como ya estaba.

### 3. El calendario muestra prioridades (Principio 3)

`ServiceEventCard` (tarjeta canónica de todos los calendarios):

- Vista MES: punto de prioridad (`PreparationDot`) antes del título.
- Vista SEMANA / CLIENTE / LISTA: barra + porcentaje de preparación en la fila
  de identificadores.
- Tooltip: barra completa, titular y **siguiente paso recomendado**.

Bandas: `ready` (listo) · `attention` (necesita atención) · `later` (puede
esperar) · `closed`. La proximidad de la fecha modula la banda, nunca el score.

### 4. Siguiente recomendación en cada punto (Principio 5)

`NextStepCard` en el panel del editor de Servicio: muestra el único paso
siguiente, con su motivo y un enlace que enfoca la sección correspondiente
(`focusServiceSection`), sin navegar fuera del editor.

### 5. Viewport para la operación (Principio 6)

No se agregó ningún dashboard, KPI nuevo ni banner. Los dos elementos nuevos del
editor (medidor + siguiente paso) sustituyen a la lectura manual de blockers y
ocupan menos de lo que ahorran.

## Principio 4 — asignación asistida

El ranking asistido ya existe en `src/lib/shifts/worker-recommendation.ts`
(historial con cliente/venue, disponibilidad, puntualidad, aceptación,
calificaciones) y alimenta las superficies de staffing. En este pase **no se
modificó**: entra en el mismo lenguaje de preparación a través del ítem
"Equipo cubierto". Cualquier extensión futura debe usar ese módulo, no crear
scoring nuevo.

## Archivos

| Archivo | Cambio |
| --- | --- |
| `src/lib/shifts/service-preparation.ts` | Nuevo — motor puro de preparación |
| `src/components/shifts/planner/ServicePreparationMeter.tsx` | Nuevo — medidor y punto de prioridad |
| `src/components/shifts/planner/NextStepCard.tsx` | Nuevo — siguiente paso recomendado |
| `src/lib/shifts/service-event-model.ts` | Añade `preparation` al modelo de tarjeta |
| `src/components/shifts/calendar/ServiceEventCard.tsx` | Prioridad en mes/semana + tooltip |
| `src/components/shifts/workspace/ServiceReadinessCard.tsx` | Medidor + siguiente paso sobre las compuertas |
| `src/test/service-preparation.test.ts` | 6 pruebas del contrato de preparación |

## Fuera de alcance (no tocado)

Payroll · Time Entries · Shift Assignments · Scheduled Shifts · Attendance ·
Connecteam · Smart Intake · Client Truth · Worker Passport · Auth · RLS ·
datos de producción. Cero escrituras, cero migraciones, cero cambios de esquema.

## Verificación

- `vitest run src/test/service-preparation.test.ts` → 6/6.
- Typecheck y build limpios.
