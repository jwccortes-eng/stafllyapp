# P0 — Comunicados Oficiales · Fix antes del piloto real

Fecha: 2026-09-07 (UTC) · Empresa de prueba: **QA Testing** · Cero personas reales, cero correos, cero comunicados reales publicados.

---

## 1. Causa raíz — bloqueo de publicación

`publish_announcement_version` marca la versión como `published` y **acto seguido** espeja
título/cuerpo/media/tipo en la fila padre `announcements` (es lo que alimenta el muro).
El trigger `announcement_lock_official_content` contaba versiones en `published|superseded`
y, al haber ya una (la recién publicada), rechazaba ese propio espejo:

> «Este comunicado oficial ya fue publicado. Para cambiar el contenido crea una versión nueva…»

Es decir, el sistema se bloqueaba a sí mismo. Se disparaba en:

- publicación inicial cuyo contenido de versión difiere del padre (caso típico: **se añadió imagen**);
- **toda** publicación de V2 (el texto cambia por definición).

Nada en el flujo intentaba mutar una versión ya publicada: la mutación era del **resumen padre**, que sí debe seguir a la versión vigente.

## 2. Causa raíz — fuga de audiencia

Dos capas fallaban a la vez:

- **Backend/RLS:** la política `Employees can view published announcements` sobre `public.announcements`
  concedía lectura a *cualquier* empleado de la empresa por `published_at IS NOT NULL`, sin mirar
  `announcement_recipients`. La fila padre lleva el contenido espejado → contenido completo expuesto.
- **Frontend:** `MyAnnouncements.tsx` consulta `announcements` filtrando solo por `company_id`,
  `published_at` y `deleted_at`; mezcla avisos generales con comunicados oficiales sin aplicar `announcement_recipients`.
  Las versiones sí estaban bien protegidas — la fuga era la fila padre.
- **Media:** el almacén `announcement-media` era **público**; la imagen era recuperable por enlace por cualquiera.

---

## 3. Cambios aplicados

| Objeto | Cambio |
|---|---|
| `announcement_lock_official_content()` | Ignora la comprobación solo cuando la bandera de transacción `app.announcement_publish` está activa. Cualquier otra edición sigue bloqueada. |
| `publish_announcement_version()` | Fija esa bandera con `set_config(..., true)` (local a la transacción) justo alrededor del espejo al padre. También `COALESCE(jsonb_array_length(...),0)` para media nula. |
| `can_read_announcement(uuid)` *(nuevo)* | Juez único: legado sin versiones → visible; oficial → solo destinatario congelado de una versión `published`/`superseded`. |
| Política `Employees can view published announcements` | Reescrita: empresa + publicado + `can_read_announcement()`. Rol acotado a `authenticated`. |
| Políticas de `announcement_reactions` (SELECT e INSERT) | Añadido `can_read_announcement()`: las reacciones no pueden revelar la existencia ni permitir interacción con un comunicado dirigido. |
| `can_read_announcement_media(text)` *(nuevo)* | Autoriza el objeto: owner global, admin con permiso de comunicados en esa empresa, destinatario congelado si el objeto pertenece a una versión de audiencia `selected`; resto (legado / toda la empresa) miembros de la empresa. |
| Bucket `announcement-media` | Pasa a **privado**. Política `Anyone can view announcement media` eliminada, sustituida por `Announcement media authorized read`. |
| `src/lib/announcements/media.ts` *(nuevo)* | Extrae ruta y firma acceso temporal (30 min). |
| `src/components/announcements/AnnouncementMedia.tsx` *(nuevo)* | Render con acceso firmado; si la firma falla no muestra nada. |
| `MyAnnouncements.tsx`, `admin/Announcements.tsx`, `OfficialCommunicationDialog.tsx` | Todas las `<img>/<video>` de comunicados pasan por el componente autorizado. |

**No se tocó:** auth, correo, payroll, `pay_statements`, `time_entries`, `shift_assignments`,
`scheduled_shifts`, documentos, bookings, pagos, chat, tenants, memberships, My Staff, JKitchen, Parceros.

## 4. Cómo se preserva la inmutabilidad

- La bandera es `set_config(..., is_local := true)`: solo existe dentro de la transacción de la RPC
  `SECURITY DEFINER`. Ninguna ruta de cliente puede fijarla (PostgREST no permite `SET`).
- `announcement_version_immutability()` **no se tocó**: una versión publicada sigue sin poder cambiar
  título, cuerpo, media, tipo, audiencia, `published_at` ni empresa, y no se puede borrar.
- V2 nace como versión nueva (`announcement_new_version`), V1 pasa a `superseded` sin alteración de contenido.
- Los acuses siguen atados a `version_id`; `announcement_ack_immutability` sigue prohibiendo editar/borrar.

## 5. Cómo se garantiza la audiencia

Enforcement en la base de datos, no en la interfaz: fila padre, versiones, destinatarios, acuses,
reacciones y objeto de media pasan todos por el mismo juez (`can_read_announcement` / `can_read_announcement_media`).
La consulta directa de un no-destinatario devuelve cero filas. Aislamiento por `company_id` intacto.

---

## 6. QA controlado (empresa QA Testing)

Escenario: Admin QA (identidad developer) · Worker A y Worker B destinatarios · Worker C misma empresa, fuera de la audiencia.

| Prueba | Resultado |
|---|---|
| V1 borrador ES+EN + imagen + audiencia A+B + acuse obligatorio → **publicar** | ✅ `published`, 2 destinatarios congelados (antes: fallaba) |
| A destinatario: muro / versión / destinatario / imagen | ✅ 1 / 1 / 1 / autorizado |
| B destinatario: muro / versión / imagen / marcar visto / acuse | ✅ visible, `viewed`, `acknowledged` (variante `en`) |
| B doble acuse (idempotencia) | ✅ segundo intento → `already`, un solo registro |
| **C no destinatario**: muro, versión, destinatarios, reacciones, imagen | ✅ **0 / 0 / 0 / 0 / denegado**, por consulta directa a la base de datos |
| C intenta confirmar | ✅ rechazado: «Este comunicado no está dirigido a ti.» |
| C intenta marcar visto | ✅ `noop` |
| V2 con redacción modificada → publicar | ✅ versión 2 publicada |
| V1 tras V2 | ✅ intacta, `superseded`, contenido original, **1 acuse conservado** |
| V2 acuse | ✅ independiente (0 acuses al publicar), 2 destinatarios propios |
| Edición manual del comunicado ya publicado | ✅ sigue bloqueada («ya fue publicado…») |
| Aviso general legado (sin versiones) visto por C | ✅ visible — comportamiento histórico intacto |
| Suite de pruebas del proyecto | ✅ 1.259 pruebas, 109 archivos, todas pasan |
| Comprobación de tipos | ✅ limpia |

**Datos QA eliminados:** los 2 comunicados de prueba, sus 2 versiones, 4 filas de destinatarios,
1 acuse y las notificaciones generadas. `announcements` vuelve a **10 filas** (recuento previo).
No quedó ningún rastro `aaaa0000%`.

## 7. Riesgos residuales

1. **Imágenes ya publicadas en avisos legados**: se sirven ahora con acceso firmado. Un enlace público
   antiguo copiado fuera de Stafly (por ejemplo pegado en WhatsApp) deja de funcionar. Es el efecto buscado.
2. La autorización de un objeto de media busca su ruta dentro de `media_urls`; si alguien reutiliza el
   **mismo archivo** en dos comunicados con audiencias distintas, basta pertenecer a una de ellas.
   Las subidas generan siempre una ruta nueva, así que no ocurre por el flujo normal.
3. Un worker que además sea administrador de la empresa con permiso de comunicados sigue viendo todos
   los comunicados de esa empresa: es la semántica de gestión, no una fuga.
4. Advertencias preexistentes del linter (funciones `SECURITY DEFINER` ejecutables) sin cambio de categoría.

---

🟢 OFFICIAL COMMUNICATIONS READY FOR CONTROLLED REAL PILOT
