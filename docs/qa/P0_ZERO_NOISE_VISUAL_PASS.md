# P0 — ZERO NOISE VISUAL PASS

Objetivo: reducir 30–50 % el ruido del primer viewport en tres pantallas piloto,
con cambio visible sin explicación técnica. Sólo presentación: no se tocó
attendance engine, payroll, `time_entries`, `shift_assignments`,
`scheduled_shifts`, storage de documentos, auth, RLS ni datos productivos.

Capturas: `/tmp/browser/zn/before/*.png` (antes) y `/tmp/browser/zn/after/*.png`
(después), viewport 1440×900, tenant de staging.

## Resumen de métricas (primer viewport, 1440×900)

| Pantalla | Controles visibles antes | Después | Δ | Alto de cabecera antes | Después |
|---|---|---|---|---|---|
| Invitaciones (`/app/invite`) | 73 | 58 | −21 % | 57 px | 90 px (sticky, incluye pestañas) |
| Documentos (`/app/documents`) | 48 | 35 | −27 % | 90 px | 90 px |
| Asistencia (`/app/attendance`) | 30 | 24 | −20 % | 908 px | 90 px (−90 %) |

Viewport operativo recuperado: Asistencia ~370 px (cabecera + 5 KPI cards +
barra de filtros eliminadas), Documentos ~60 px (chips de métricas y 4 pestañas
redundantes), Invitaciones ~110 px (chips + panel de acceso al portal).

## Invitaciones

Pregunta única: «¿Quién necesita acceso al portal?».

- Eliminado: fila de chips de métricas, panel de acceso al portal siempre
  visible con QR, subtítulo descriptivo, indicadores duplicados por fila.
- Colapsado: acceso al portal (link + QR + copiar) ahora vive en un diálogo
  detrás de una sola acción secundaria en la cabecera.
- Secundario: copiar invitación pasa a botón icono; generar PIN sólo aparece
  cuando falta.
- Contenido: una fila por persona con `EntityCard` canónico (avatar con anillo
  de estado, `ST-XXXXX`, teléfono, máximo 2 badges) en columna de 3xl, sin
  desperdicio horizontal.
- Filtrado por pestañas con foco por defecto en **Necesitan acceso**.

## Documentos

De tabla ERP a experiencia centrada en persona.

- Eliminado: chips de métricas (redundantes con pestañas), columnas Origen y
  Subido, línea de contexto, cabeceras de tabla.
- Reducido: 9 pestañas → 5 (Necesitan revisión · Faltantes · Vencidos ·
  Por vencer · Todos).
- Contenido: bloque por persona con `EntityCard` (estado, «N por revisar»,
  «N vencidos», acceso a Perfil) y debajo sus documentos en filas compactas:
  Documento · Estado · Vencimiento · Acción.
- Conservado: revisión completa (preview, extracción asistida, edición de
  vencimiento, historial) y exportación CSV.

## Asistencia

Prioridad: quién debía llegar, quién fichó, quién falta, quién llegó tarde.

- Eliminado: `PageHeader` grande no sticky, subtítulo, nota de payroll, 5 KPI
  cards, selector de estado y barra de filtros completa, tabla de 8 columnas.
- Reducido a 3 indicadores accionables en chips clicables que filtran:
  **Faltan por fichar**, **Tarde**, **No-show** (+ «Ver todos» cuando hay filtro).
- Movido a la cabecera canónica: buscador y selector de fecha.
- Contenido: una fila por persona con `EntityCard` (servicio · horario, badges
  de tarde/no-show, entrada/salida y estado a la derecha).
- Conservado: foco por deep-link (`data-entry-id`, `data-employee-id`), banner
  de contexto, filtro local por empleado y pestaña Reportes intacta.

## Verificación

- Tipos limpios (`tsgo --noEmit`).
- Capturas antes/después en las tres rutas con sesión inyectada.
- Sin escrituras nuevas: los cambios son de renderizado y filtrado en cliente.
