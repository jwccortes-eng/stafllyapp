# P0 — SERVICE COPILOT EXPERIENCE

Fecha: 2026-08-10 · Alcance: UI-only sobre el editor de Servicio.

## Objetivo

El editor deja de ser un formulario administrativo y pasa a ser el centro de
decisión de la operación. El coordinador nunca debería preguntarse "¿qué me
falta?": el sistema responde "este es tu siguiente paso".

No se creó IA, no se inventó lógica de negocio: el copiloto reordena señales que
el editor ya calculaba.

## Arquitectura

### 1. Motor puro — `src/lib/shifts/service-copilot.ts`

`getServiceCopilot(input)` recibe las señales existentes
(`useShiftFormSignals`, `getServicePublishReadiness`, estado de publicación) y
devuelve:

| Campo | Qué es |
| --- | --- |
| `readiness` | 0–100, el ÚNICO indicador de madurez |
| `band` / `bandLabel` | Listo · Necesita atención · Puede esperar · Cerrado |
| `nextStep` | UNA sola recomendación (`label`, `why`, `anchorId`, `stage`) |
| `checklist` | 11 ítems de lectura, con estado `done/pending/attention/na` |

Puro: sin React, sin BD, sin escrituras.

### 2. Prioridad del siguiente paso (sin empates posibles)

```text
Cancelado/Archivado → sin acciones
Fecha → Cliente → Venue → Horario → Cantidad de personal
      → Meeting Point → Información → Publicar
      → Asignar N personas
      → (servicio pasado) Cerrar clock-out → Revisar horas → Preparar Payroll
      → Sin acciones pendientes
```

Cada rama produce **una** recomendación y **un** POR QUÉ en lenguaje operativo
("Faltan 2 personas para completar el staffing.").

### 3. Checklist (solo lectura)

Cliente · Fecha · Venue · Horario · Staffing · Meeting Point · Información ·
Publicado · Clock In · Clock Out · Horas.

Los ítems que no aplican (Meeting Point sin transporte; los de tiempo antes del
servicio) quedan en `na` y **no** penalizan el readiness. No se crearon campos
nuevos.

### 4. Header = resumen operativo

`ServiceCopilotHeader` reemplaza el título del editor:
Cliente (con su identidad cromática) · QK · Fecha · Horario · Estado · Readiness.
Nada secundario arriba.

### 5. Organización por etapas

`ServiceStageLayout` reemplaza el formulario largo del modo edición:

| Etapa | Contenido |
| --- | --- |
| 1 Resumen | Cliente, fecha, horario, plazas, Venue |
| 2 Equipo | Team, roles, transporte y conductores |
| 3 Operación | Meeting Point, notas, información del evento, fichaje/QR |
| 4 Tiempo | Panel de solo lectura + deep-links a Time Clock y revisión de horas |
| 5 Pago | Tarifas y modo de pago del servicio |
| 6 Historial | `ShiftLifecycleTimeline` existente (hitos, no logs técnicos) |

El botón "Ir" del siguiente paso emite `stafly:service-focus`: el layout salta a
la etapa que contiene el ancla y luego enfoca la sección. Si nadie escucha
(editor plano, móvil), cae al scroll directo de siempre.

### 6. Readiness único

`ReadinessBar` es la expresión canónica. `ServicePreparationMeter` (calendario,
lista, drawer) ahora comparte sus tonos y su nombre. No existe score, health,
confidence, risk ni completion.

### 7. Reacciones

Al ser derivado, el copiloto recalcula en cada cambio del formulario o de las
asignaciones: alguien rechaza → "Asignar 1 persona"; el equipo se completa →
"Publicar Servicio"; termina el clock out → "Revisar horas"; horas aprobadas →
"Preparar Payroll".

## Archivos

| Archivo | Cambio |
| --- | --- |
| `src/lib/shifts/service-copilot.ts` | Nuevo — motor puro del copiloto |
| `src/lib/shifts/service-focus.ts` | Nuevo — puente "siguiente paso" → etapa/sección |
| `src/components/shifts/copilot/ReadinessBar.tsx` | Nuevo — indicador canónico |
| `src/components/shifts/copilot/ServiceCopilotHeader.tsx` | Nuevo — header como resumen operativo |
| `src/components/shifts/copilot/ServiceCopilotPanel.tsx` | Nuevo — siguiente paso + por qué + checklist |
| `src/components/shifts/copilot/ServiceStageLayout.tsx` | Nuevo — 6 etapas |
| `src/components/shifts/copilot/ServiceTimePanel.tsx` | Nuevo — etapa Tiempo (solo lectura) |
| `src/components/shifts/ShiftFormShell.tsx` | Prop `headerSummary` |
| `src/components/shifts/ShiftFormFields.tsx` | Prop `copilotStages` + render por etapas en edición |
| `src/components/shifts/ShiftEditDialog.tsx` | Compone el copiloto y las etapas |
| `src/components/shifts/workspace/WorkspaceSummary.tsx` | Encabeza con el copiloto; oculta semáforos duplicados |
| `src/components/shifts/planner/ServicePreparationMeter.tsx` | Comparte tono y nombre con `ReadinessBar` |
| `src/test/service-copilot.test.ts` | Nuevo — 10 pruebas (QA 1–5 incluidos) |

## QA

| Escenario | Resultado |
| --- | --- |
| 1. Servicio recién creado | "Confirmar cliente" (definición) |
| 2. Información completa | "Publicar Servicio" |
| 3. Publicado, staffing incompleto | "Asignar 2 personas" |
| 4. Servicio pasado con clock out | "Revisar horas" |
| 5. Horas aprobadas | "Preparar Payroll" |
| Clock out incompleto | "Cerrar clock-out" antes que revisar horas |
| Cancelado | Sin acciones, banda `closed` |

`vitest run src/test/service-copilot.test.ts` → 10/10. Typecheck limpio.

## Fuera de alcance (no tocado)

Auth · RLS · Tenants · Payroll · Time Entries · Shift Assignments ·
Scheduled Shifts · Documents · Bookings · Payments · Chat · Connecteam ·
Client Truth · Worker Passport · datos de producción.
Cero escrituras, cero migraciones, cero cambios de esquema.

## Nota

Los ítems Clock In / Clock Out / Horas se muestran como pendientes o "no aplica"
mientras el editor no reciba señales de asistencia: `getServiceCopilot` acepta
`attendance` opcional, de modo que conectar esas señales (lectura) no requiere
tocar el motor ni la UI.
