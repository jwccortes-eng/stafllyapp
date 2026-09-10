# P0 — Cierre seguro del comunicado histórico publicado por error (auditoría read-only)

Fecha: 2026-09-10 (UTC) · Modo: **solo lectura**. Cero escrituras, cero publicaciones, cero correos.

Comunicado histórico: `b506eaa5-…` "Tu presentación también es parte del servicio"
V1 `published`, tipo `critical_acknowledgment`, **203 destinatarios**, **0 confirmaciones**, `archived_at = 2026-09-10 00:57 UTC`, V2 en borrador.
Comunicado piloto nuevo: `1942ada8-…`, V1 en borrador, 0 destinatarios. **Intacto.**

## 1. Qué significa hoy "archivado"

Casi nada. `announcements.archived_at` existe como columna, pero **ninguna pantalla, hook, RPC ni política la consulta**. Búsqueda en todo el código: cero lecturas en comunicados (solo aparece en tablas ajenas: preferencias, payroll, migración). En la práctica archivar hoy es una anotación interna sin efecto en administración ni en el portal.

## 2. Por qué las 203 personas siguen viéndolo

Tres capas lo dejan pasar, y ninguna mira `archived_at`:

1. **Permiso de lectura** (`can_read_announcement`): abre si la persona es destinataria de alguna versión `published`/`superseded`. La V1 sigue publicada.
2. **Feed del portal** (`useOfficialCommunications`): lee sus filas de destinatario y solo descarta versiones en `draft`.
3. **"Requiere tu atención"** (`pendingItems`): marca pendiente todo lo que exige acuse y no está `acknowledged`. Los 203 están en `available`/`viewed` → 203 pendientes críticos vivos.

## 3. ¿Existe un retiro canónico?

**No.** El modelo solo admite tres estados de versión: `draft`, `published`, `superseded` (CHECK en `announcement_versions`), y tres de destinatario: `available`, `viewed`, `acknowledged`. No hay `withdrawn`, `cancelled`, `retracted` ni `closed`, ni columnas `withdrawn_at/by/reason`, ni RPC de retiro. `superseded` **no sirve**: significa "reemplazada por una versión posterior" y exige publicar otra versión — falsearía la historia.

No se debe reutilizar `archived_at` para esto: administración ("no me lo muestres en la lista") y retiro ("deja de exigir acción a la gente") son decisiones distintas y deben quedar registradas por separado.

## 4. Extensión mínima segura (propuesta, no implementada)

Retiro a nivel de **comunicado**, no de versión ni de destinatario:

- Nuevas columnas en `announcements`: `withdrawn_at`, `withdrawn_by`, `withdrawal_reason` (obligatoria al retirar).
- Nueva RPC `withdraw_announcement(p_announcement_id, p_reason)`: exige permiso de gestión, exige motivo no vacío, es idempotente y **solo** escribe esas tres columnas. Un `undo_withdrawal` equivalente queda para después si se pide.
- El trigger de contenido publicado se ajusta para permitir estas tres columnas (hoy solo vigila título/cuerpo/medios/enlace/tipo, así que no las bloquea; se confirma con prueba).
- `can_read_announcement` deja de abrir cuando el comunicado está retirado **y** la persona no había confirmado; quien ya confirmó conserva acceso a su evidencia.
- Feed y "Requiere tu atención" filtran los retirados de pendientes.
- Administración muestra la etiqueta **"Retirado"** con motivo, fecha y autor, distinta de "Archivado".

Cero borrados, cero acuses inventados, cero cambios de contenido publicado.

## 5–7. Impacto

| Aspecto | Efecto |
|---|---|
| Destinatarios | Las 203 filas quedan **intactas**, con su estado real (`available`/`viewed`). |
| Confirmaciones | Ninguna se crea, edita ni borra. Las que existan siguen siendo evidencia válida. |
| Auditoría | Quién retiró, cuándo y por qué queda en el propio comunicado; los triggers de inmutabilidad de versiones y acuses siguen activos. |

## 8–10. Comportamiento resultante

- **Worker sin confirmar**: desaparece de "Requiere tu atención" y del muro. No se le pide nada más.
- **Worker que ya confirmó**: sigue viendo el comunicado y su confirmación.
- **Admin**: lo ve marcado "Retirado" con motivo; el seguimiento histórico (203 destinatarios, 0 confirmaciones) se conserva y se lee tal cual.
- **V2 borrador histórica**: no se toca. Queda como borrador; si algún día se publica, el comunicado deja de estar retirado de forma implícita — por eso la RPC de publicación debe rechazar publicar sobre un comunicado retirado sin reactivarlo antes.

## 11. Qué cambiaría

- Base: `announcements` (3 columnas), RPC `withdraw_announcement`, ajuste en `can_read_announcement` y en la RPC de publicación.
- Código: `src/lib/announcements/official-communications.ts` (estado de retiro), `src/hooks/useOfficialCommunications.tsx` (filtro de pendientes), `src/pages/admin/Announcements.tsx` (acción + etiqueta + diálogo con motivo), `src/pages/portal/MyAnnouncements.tsx`.
- **No se tocan**: nómina, fichajes, turnos, asignaciones, documentos, pagos, chat, empresas, autenticación, RLS ajena, correo, DNS ni el comunicado piloto.

## 12. QA necesario (en QA Testing, no en producción)

Retirar sin motivo → rechazado · retirar dos veces → idempotente · destinatario sin confirmar deja de tener pendiente sin recargar · destinatario que ya confirmó conserva acceso y evidencia · las 203 filas y los 0 acuses siguen iguales · V1 y V2 sin cambios · un no destinatario sigue sin ver nada · el comunicado piloto no se altera · administración distingue "Retirado" de "Archivado" · comprobación de tipos y pruebas en verde.

## Veredicto

🟡 WITHDRAWAL CAPABILITY NEEDS SMALL EXTENSION
