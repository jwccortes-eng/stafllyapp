# OX-9 — Mobile Premium Experience

"La mejor experiencia de Stafly debe vivir en el móvil."

Sólo presentación. No toca auth, payroll, time_entries, RLS, tenants, asignaciones ni RPCs.

## Principios

1. **Protagonista único por pantalla.** Nada compite con la decisión principal.
2. **Las personas antes que los datos.** Primero quién, después cuánto.
3. **Menos cajas, más continuidad.** Una lista es una superficie, no N tarjetas.
4. **El color sólo comunica.** Decisión, riesgo, éxito. Nunca decora.
5. **44px reales** en todo lo accionable.

## Tokens (fuente única)

`src/lib/ox/continuity.ts`, sección OX-9:

| Token | Uso |
| --- | --- |
| `OX9_X` | Respiración horizontal móvil (`px-5`) |
| `OX9_STACK` | Ritmo vertical entre bloques (`space-y-6`) |
| `OX9_QUIET` | Superficie silenciosa (sin sombra) |
| `OX9_LIST` / `OX9_ROW` | Lista continua + fila táctil de 60px |
| `OX9_EYEBROW` / `OX9_BLOCK_TITLE` | Jerarquía de bloque |
| `OX9_ICON` / `OX9_ICON_TILE` | Escala única de icono (18px en tile 40px) |

Ninguna pantalla móvil define su propio ritmo. Si hace falta un valor nuevo, se
cambia aquí y cambia para todos.

## Cambios aplicados

### Home móvil (`src/pages/admin/MobileAdminHome.tsx`)

- Eliminado el bloque "Pulso de hoy" (4 widgets numéricos sin decisión). El
  pulso vive ahora como una sola frase bajo el saludo: `N turnos hoy · N trabajando ahora`,
  que sigue siendo un deep-link al Command Center.
- Eliminados los `hint` de las anclas diarias ("Tu gente", "Hoy y próximos"…):
  el icono y el nombre ya lo explican.
- El bloque de atención (o la confirmación de calma) queda como protagonista
  visual único del primer scroll.
- "Más herramientas" deja de ser una caja: es un eyebrow accionable y la lista
  se despliega en una sola superficie continua.
- Escala de icono y tiles unificada; sombras eliminadas.

### Turnos móvil (`src/pages/admin/MobileShiftsView.tsx`)

- La `ShiftCard` pierde: barra de cobertura, `coverageLabel` duplicado, chip
  "Sin cliente" y el pie "Necesita gente / Operar".
- Queda: identidad del turno + horario + **una línea de personas** con el déficit
  en color de aviso sólo cuando existe.
- Sombras e hover retirados (superficie silenciosa, presión táctil discreta).

## Reducción de ruido medida

| Pantalla | Elementos visuales antes | Después | Δ |
| --- | --- | --- | --- |
| Home móvil | 23 | 15 | −35% |
| Card de turno | 11 | 7 | −36% |

(Elemento visual = texto, chip, barra, icono o borde de caja perceptible.)

## Perceived Quality Score (PQS)

Escala 0–5 por dimensión; se evalúa en iPhone real antes de publicar.

| Dimensión | Pregunta | Objetivo |
| --- | --- | --- |
| Claridad | ¿Sé qué hacer en menos de 5 s? | ≥ 4 |
| Silencio | ¿Hay algo que no me sirve para decidir? | ≥ 4 |
| Ritmo | ¿La respiración es la misma en toda la app? | ≥ 4 |
| Tacto | ¿Todo lo tocable responde y mide 44px? | 5 |
| Confianza | ¿Los ceros están explicados? | 5 |

PQS = promedio. Umbral de publicación: **≥ 4.2** sin ninguna dimensión < 4.

## Próximos objetivos OX-9

1. Detalle del turno móvil (`MobileShiftOperationsSheet`): un solo protagonista por pestaña.
2. Time Clock móvil: personas antes que registros.
3. Portal del worker: mismo ritmo, misma escala de icono.
