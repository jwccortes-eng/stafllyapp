# P1 — Comunicados oficiales · refresco en vivo + descubrimiento en Inicio

Fecha: 2026-09-09 (UTC) · Empresa: **QA Testing** (`7c1458db-…`) · Sin producción, sin personas reales, sin emails.

## 1. Causa del contenido parcial

El muro leía dos fuentes distintas: la lista general de `announcements` (con tiempo real) y los datos oficiales (versión, estado, acuse, adjuntos), que solo se leían **una vez al montar**. Al publicar con la sesión abierta llegaba el texto general y la tarjeta se pintaba sin aviso de confirmación, sin versión, sin idiomas y sin adjuntos.

## 2. Mecanismo de actualización

Una sola fuente, `useOfficialCommunications`, que trae la unidad completa (versión + estado + requisito de acuse + adjuntos + idioma) en una lectura. Frescura, sin sondeo:

1. tiempo real sobre `announcement_recipients` y `announcement_versions` (añadidas a la publicación con identidad completa de fila);
2. relectura al volver al primer plano.

Mientras no estén ambas capas, la tarjeta no se pinta: nunca se muestra una versión a medias.

**Hallazgo corregido durante el QA:** el canal de tiempo real usaba el mismo nombre en Inicio, muro, guardia y menú; al repetirse el nombre solo una instancia recibía eventos y Inicio no se enteraba. Ahora cada instancia abre su propio canal. Medido: el pendiente aparece en **~2,5 s** sin recargar.

## 3. Inicio — "Requiere tu atención"

Tarjeta compacta arriba de Inicio (`AttentionRequiredCard` + modelo genérico `AttentionItem`): empresa, título, "Requiere confirmación", botón "Revisar". Solo muestra acciones reales pendientes; los comunicados informativos no aparecen. No bloquea navegación, fichaje ni turnos, y no abre ventanas al iniciar sesión. El modelo admite futuras categorías sin crear tablas nuevas.

## 4. Acuse → Inicio

El pendiente se resuelve **solo** por acuse (`acknowledged`), nunca por abrir. Verificado: tras confirmar, Inicio queda sin pendientes.

## 5. Acceso sin el muro habilitado

La cuenta usada **no tenía** `my_announcements` habilitado (cero filas de configuración). Aun así accedió al comunicado: la ruta usa ahora una guardia propia que abre si la persona es destinataria de algún comunicado oficial, y "Anuncios" aparece en el menú en ese caso. El muro general sigue siendo un módulo opcional aparte.

## 6. QA ejecutado (solo QA Testing)

| Caso | Resultado |
|---|---|
| A — sesión abierta antes de publicar | pendiente en Inicio ~2,5 s **sin recargar**; comunicado completo (aviso de confirmación, v1, ES/EN, texto) ✅ |
| B — entra después de publicar | pendiente visible de inmediato; Inicio → Revisar → contenido (**2 toques**, sin pasar por "Más"); confirmación registrada 1 sola vez (`es`); Inicio queda en cero ✅ |
| C — misma empresa, no destinataria | sin pendiente en Inicio; `/portal/announcements` redirige a Inicio; no ve el comunicado; lectura directa de destinatarios y del comunicado: vacío; confirmar: "Este comunicado no está dirigido a ti" ✅ |
| Móvil real 390×844 | todo el recorrido validado en ese tamaño ✅ |
| Multi-empresa | la lectura se hace por la ficha de la empresa activa; la cuenta C, que además administra otra empresa, no vio nada de QA Testing ✅ |
| Estados | `available ≠ viewed ≠ acknowledged` intactos; abrir no confirma ✅ |
| Legacy | anuncios generales, reacciones, versionado, adjuntos, seguimiento admin y ES/EN sin cambios ✅ |

Comprobación de tipos limpia y pruebas de módulos del portal en verde (5/5).

## 7. Archivos y base de datos

- Nuevos: `src/hooks/useOfficialCommunications.tsx`, `src/lib/portal/attention-items.ts`, `src/components/portal/home/AttentionRequiredCard.tsx`, `src/components/portal/OfficialCommunicationsGuard.tsx`.
- Modificados: `src/pages/portal/EmployeeDashboard.tsx`, `src/pages/portal/MyAnnouncements.tsx`, `src/components/portal/PortalMoreSheet.tsx`, `src/App.tsx`.
- Base de datos: solo se añadieron `announcement_recipients` y `announcement_versions` al tiempo real (identidad completa de fila). **Cero cambios** en permisos, políticas, funciones, nómina, fichajes, turnos, documentos, correo, autenticación o inquilinos.

## 8. Limpieza

Eliminados los 5 comunicados de prueba con sus versiones, destinatarios y confirmaciones. Verificado: 0 filas restantes. No se subieron archivos, así que no quedan adjuntos huérfanos de esta ronda.

## 9. Riesgos residuales

1. Siguen en el almacenamiento privado los 7 archivos huérfanos de la ronda anterior; el administrador aún no puede borrarlos.
2. Si el tiempo real se cae, la actualización depende de volver al primer plano (sin sondeo, por diseño).
3. Un comunicado crítico todavía no bloquea nada: es una señal, no una barrera.

## Veredicto

🟢 OFFICIAL COMMUNICATIONS READY FOR CONTROLLED REAL PILOT
