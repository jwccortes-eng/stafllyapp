# P0 — Comunicados Oficiales · QA end-to-end controlado

Fecha: 2026-09-09 (UTC) · Empresa: **QA Testing** (`7c1458db-…`) · Sin producción, sin personas reales, sin emails.

## Cuentas usadas
| Rol | Persona QA | Resultado |
|---|---|---|
| Admin QA | cuenta admin de QA Testing | publicó V1 y un segundo comunicado de aislamiento |
| Worker A | Test Invite Gmail | destinatario |
| Worker B | Test NoPhone QA | destinatario del comunicado 1 / **no destinatario** del comunicado 2 |
| Worker C | **no disponible** | no existe una tercera cuenta worker QA y el alta de cuentas está deshabilitada; el rol de C se cubrió usando a B como no-destinatario en un segundo comunicado |

## Escenario ejecutado
1. **A antes de publicar (móvil 390×844):** feed vacío, "No hay publicaciones aún".
2. **Publicación V1:** audiencia explícita A+B, ES+EN, imagen + PDF adjuntos, acuse requerido.
3. **Sin recargar:** apareció una tarjeta genérica **sin** distintivo "Requiere confirmación", sin versión, sin selector de idioma, sin adjuntos y sin botón de confirmar. 🔴
4. **Tras recargar:** tarjeta completa y correcta (distintivo, v1, ES/EN, 2 adjuntos, botón de confirmar).
5. **Adjuntos:** imagen y PDF se abren con enlaces firmados temporales del almacenamiento privado (HTTP 200).
6. **ES/EN:** ambos idiomas correctos; botón de confirmar traducido y de tamaño táctil adecuado.
7. **Confirmación de A:** registrada una sola vez (`en`, 06:09:24). El segundo intento **no** duplicó nada.
8. **B:** ve el comunicado como pendiente, sin confirmar. Estado correcto.
9. **Aislamiento (B como no-destinatario del comunicado 2):**
   - no aparece en su muro;
   - lectura directa del comunicado, la versión y la lista de destinatarios: **vacío**;
   - firma del adjunto: **denegada** (objeto no encontrado);
   - marcar como visto: sin efecto;
   - confirmar: rechazado con "Este comunicado no está dirigido a ti".
10. **Seguimiento en administración:** 2 destinatarios · 1 confirmado (A, 09/09 06:09, EN) · 1 pendiente (B, "visto sin confirmar") · 50 % confirmado. Sin estados inventados de entrega.

## Hallazgos
1. 🔴 **Tarjeta incompleta hasta recargar.** El muro actualiza la lista general en vivo pero no vuelve a leer los datos oficiales, así que el worker ve el texto sin el aviso de confirmación ni los adjuntos. Peor que no verlo: parece informativo y no pide acuse.
2. 🟡 **Descubrimiento en el teléfono.** El comunicado vive en Inicio → Más → "Anuncios", tres toques, sin ningún aviso en Inicio ni contador de pendientes. Con una confirmación pendiente, la pantalla de Inicio no lo menciona.
3. 🟡 **El muro de comunicados no está activo por defecto.** Hubo que habilitarlo a mano para las dos personas QA; en un piloto real la mayoría no vería nada.
4. 🟡 **Archivos huérfanos al borrar un comunicado.** Al eliminar los datos QA, sus 7 archivos quedaron en el almacenamiento privado y ni el administrador puede borrarlos, porque el permiso de lectura depende del comunicado ya inexistente. Sin datos personales, pero hay que corregir el permiso de borrado.

## Limpieza
Eliminados: 2 comunicados QA, sus versiones, destinatarios, reacciones y confirmaciones, y los permisos temporales del muro. Verificado en base de datos: 0 filas restantes. Sesiones y archivos locales de prueba borrados. Quedan los 7 archivos huérfanos descritos arriba.

## Sin regresiones
No se tocó autenticación, nómina, turnos, documentos, correo ni ninguna otra empresa. No se envió ningún mensaje.

## Veredicto

🟡 CASI LISTO — corregir el refresco de la tarjeta y la visibilidad en el teléfono antes del piloto real
