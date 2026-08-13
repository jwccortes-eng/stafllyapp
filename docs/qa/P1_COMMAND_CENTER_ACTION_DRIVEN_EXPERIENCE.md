# P1 — Command Center: experiencia accionable

## Objetivo
Cada alerta responde en menos de 3 segundos: qué pasó, dónde, a quién afecta y qué hacer ahora.

## Qué se implementó

### 1. Deep link canónico
`src/lib/command-center/deep-link.ts` es la única fuente de URLs operativas:
`/app/shift-ops?id=<uuid>&stage=<etapa>&focus=<empleado>&from=command-center`.
Etapas válidas: `summary`, `team`, `attendance`, `time`, `operation`.

### 2. Modelo de alerta con contexto completo
`src/lib/command-center/today-hub-model.ts` produce `alerts` y `alertGroups`
(agrupadas por servicio). Cada alerta lleva referencia canónica QK, cliente,
sitio, horario, antigüedad, personas nombradas y una sola acción principal.
La verdad la resuelven los resolvers canónicos ya existentes:
Publication Truth, Service Location Truth y Attendance Truth. Sin datos
estructurados de ubicación no se emite alerta de ubicación (cero falsos positivos).

### 3. Bandeja operativa en la vista
`TodayHubView.tsx` hidrata personas y ubicación desde `useTodayOperations`
y renderiza la bandeja agrupada por servicio: el contexto se dice una vez y
cada alerta muestra Dónde / Cuándo / A quién / Ahora. Mobile-first.
Sin permiso no se muestra acción resolutiva, se explica por qué.

### 4. Aterrizaje exacto en el servicio
`ShiftOperations.tsx` lee `stage` y `focus`, ancla el scroll a la etapa
(`data-stage`) y resalta a la persona (`data-employee-id`). El botón volver
regresa a la bandeja cuando la navegación vino del Command Center.

## Validación
- Typecheck limpio.
- `src/test/today-hub-model.test.ts`: 19 pruebas verdes, incluyendo contexto
  completo, deep link con etapa y foco, agrupación por servicio y ausencia de
  acción sin permisos.
- Verificación en navegador con datos reales: bandeja renderiza QK-001645
  (cobertura incompleta) y QK-001604 (equipo sin confirmar, personas nombradas).

## Regla operativa
Si una alerta se genera, no puede desaparecer de la pantalla: la bandeja
incluye toda severidad distinta de informativa.
