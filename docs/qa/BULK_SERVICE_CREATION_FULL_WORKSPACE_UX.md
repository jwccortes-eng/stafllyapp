# BULK SERVICE CREATION — FULL WORKSPACE UX

Cambio **solo de presentación**. Mismo motor canónico, misma lógica de
borradores, misma idempotencia. Sin DB, sin payroll, sin assignments, sin
Connecteam, sin Smart Intake, sin auth/RLS.

## Qué cambió

| Antes | Ahora |
|---|---|
| Modal centrado (`max-w-6xl`, en la práctica ~760px por `sm:max-w-lg`) | Workspace a pantalla completa: `96vw × 94vh`, hasta 1800px |
| Header, acciones y grid compitiendo en el mismo scroll | Header sticky + cuerpo con scroll interno + footer sticky |
| Cabecera de tabla dentro de `ScrollArea` | `thead` sticky sobre el scroll del workspace |
| Columnas comprimidas y ancho variable | `table-fixed` + `colgroup`: Fecha 150 · Inicio/Fin 110 · Personal 96 · Estado 210 · acciones 90; Cliente/Lugar/Título fluidos |
| “1 fila sin información obligatoria” | Error inline en la **fila y el campo exactos** + fila resaltada |
| Scope de “aplicar” implícito | Chip visible: `todas las filas` / `N filas seleccionadas` + “Quitar selección” |
| CTA en el flujo del diálogo | CTA fijo abajo: filas · listas · con pendientes · necesitan información |
| Móvil sin acceso a la creación masiva | CTA en la cabecera de Servicios (móvil) → mismas tarjetas |

## Layout

- **Header sticky:** título, subtítulo (“Organiza varios trabajos y guárdalos
  como borradores.”), acciones `Agregar fila` · `Pegar fechas` ·
  `Copiar semana (+7 días)` y contador de filas.
- **Barra masiva:** “Aplicar a …” con scope explícito.
- **Grid amplio:** Fecha · Cliente · Lugar · Inicio · Fin · Personal · Título ·
  Estado · acciones. Sin scroll horizontal a 1280px.
- **Footer sticky:** conteos + `Cancelar` / `Crear N borradores` (altura táctil
  ≥44px, safe-area en móvil).

## Validación por fila

`validateBulkRow` (sin cambios) se proyecta al campo:

- `Fecha` faltante → borde destructivo + “Falta la fecha”.
- Identidad faltante → “Falta cliente, lugar o título” bajo el campo Cliente.
- Fila bloqueada → fondo `destructive/5` y numeración visible.

## Móvil

Tarjetas “Servicio N · día”, inputs de 40px, sin scroll horizontal
(`scrollWidth = 390` verificado), CTA sticky. Entrada nueva en
`MobileShiftsView` (icono calendario junto a “Crear”), montando el mismo
componente con las mismas props que desktop.

## QA

- Desktop 1440 con 20 filas: grid completo, header y footer visibles, sin
  compresión (captura verificada en Playwright).
- Móvil 390 con 5 filas: tarjetas, `scrollWidth = 390`, CTA sticky.
- `src/test/bulk-service-creation.test.ts` — 13/13 PASS.
- Typecheck del proyecto en verde.

## No tocado

`bulk-service-creation.ts`, `bulk-create-write.ts`,
`buildCanonicalServiceInsert`, `SeriesPreviewDialog`, idempotencia por
`reconciliation_hash`, persistencia en `sessionStorage`.

## Confirmación

Crear varios servicios deja de comportarse como un modal limitado y pasa a ser
un workspace operativo amplio, manteniendo el mismo motor canónico y la misma
lógica de borradores.
