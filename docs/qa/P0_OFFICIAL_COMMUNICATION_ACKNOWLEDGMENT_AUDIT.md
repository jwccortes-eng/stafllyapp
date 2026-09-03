# AUDITORÍA READ-ONLY — Comunicado oficial + Acuse de recibido

**Fecha:** 2026-09-03 · **Modo:** read-only (zero writes, zero deploys, zero publish)
**Caso disparador:** Quality Staff by Keury — “Presentación e higiene durante el servicio (cabello recogido)”

---

## 1. Estado actual

Stafly YA tiene un canal de comunicación empresa→trabajador funcional y tenant-scoped:
`announcements` + `announcement_reactions`, con pantalla admin (`/app/announcements`) y feed worker (`/app/portal/announcements` → `MyAnnouncements.tsx`).

Lo que NO existe hoy en ninguna parte del sistema:
- **audiencia explícita** (hoy la audiencia es implícita = toda la company)
- **estado por destinatario** (no hay delivered / viewed / acknowledged)
- **acuse de recibido** (no existe ninguna tabla `*_acknowledgments`; la búsqueda de "acknowledg" solo devuelve reconciliation/payroll/change-intelligence, conceptos distintos)
- **versionado de contenido** del comunicado
- **notificación al publicar** (no hay trigger de `notifications` sobre `announcements`)

Conclusión temprana: el contenedor existe, la **evidencia** no.

---

## 2. Infraestructura existente reutilizable

### Tablas
| Tabla | Uso | Reutilizable |
|---|---|---|
| `announcements` (`id, company_id, title, body, priority, pinned, published_at, created_by, media_urls jsonb, link_url, link_label, deleted_at, created_at, updated_at`) | comunicado | ✅ base canónica |
| `announcement_reactions` (`announcement_id, employee_id, emoji`) | reacción social | ⚠️ NO usar como acuse (semántica social, borrable por el worker) |
| `notifications` (`company_id, recipient_id, recipient_type, type, title, body, metadata, read_at`) | bandeja in-app + realtime | ✅ delivery |
| `employees`, `company_users`, `employee_portal_modules` | identidad + gating de módulo | ✅ audiencia e identidad |
| `activity_log` (`user_id, company_id, action, entity_type, entity_id, details`) | auditoría admin | ✅ trazabilidad de publicar/archivar |
| `employee_documents` (`review_status, reviewed_at, expires_at, version`) | documentos del trabajador | ❌ concepto distinto (documento del worker, no comunicado de la empresa) |

### RLS y permisos ya vigentes en `announcements`
- SELECT worker: `published_at IS NOT NULL AND deleted_at IS NULL AND employees.user_id = auth.uid() AND employees.company_id = announcements.company_id` → **aislamiento por tenant correcto**.
- Manager: `user_company_ids(auth.uid())` + `has_module_permission(..., 'announcements', 'edit'/'delete'/'view')`.
- Catálogo de permisos existente (`src/lib/auth/permission-catalog.ts`): `announcements.publish`, `announcements.edit`, `announcements.delete`, `announcements.pin`.
- Nav: `nav-items.ts` id `announcements`, módulo `announcements`; `nav-permissions.ts` mapea `/app/announcements`.

### Storage
Bucket `announcement-media` **existe y es público**; el admin ya sube archivos a `<companyId>/<timestamp>-<rand>.<ext>` desde `src/pages/admin/Announcements.tsx`. Sirve para la imagen educativa (contenido no sensible), con la observación de privacidad del §15.

### Notificación
`useNotifications` + tabla `notifications` + realtime `postgres_changes` + toast/sonido/badge ya operan. Publicar un comunicado puede insertar N filas en `notifications` — **sin crear ningún sistema paralelo**.

---

## 3. Announcements — respuestas puntuales

| Pregunta | Respuesta |
|---|---|
| Tabla | `public.announcements` |
| Tenant-scoped | ✅ por `company_id` + RLS |
| Quién publica | permiso `announcements.publish` / módulo `announcements:edit` |
| Audiencia | ❌ no existe; hoy = toda la company |
| Adjuntos | ✅ `media_urls jsonb` + bucket `announcement-media` (público) |
| Portal worker | ✅ `MyAnnouncements.tsx` (feed, realtime) |
| Read/unread | ❌ inexistente |
| Confirmación | ❌ inexistente (solo emojis) |
| Historial | parcial: `created_at/updated_at`, sin diffs |
| Versionado | ❌ inexistente |
| Draft/Published | ✅ implícito por `published_at IS NULL` |
| Archivar | ✅ soft delete `deleted_at` (semántica "eliminar", no "archivar") |
| Notificaciones | ❌ no se dispara nada al publicar |

---

## 4. Documentos — qué sí y qué no reutilizar

`employee_documents` tiene `review_status / reviewed_at / expires_at / version / rejection_reason`; `employee_onboarding_documents` tiene `status / verified_at`. **Ambos modelan documentos que el trabajador aporta y la empresa revisa** — dirección inversa a un comunicado. Reutilizar esa tabla mezclaría cumplimiento documental con comunicación interna y contaminaría los contadores de compliance (`useCompanyDocuments`, `buildWorkerDocSignals`).

Reutilizable **como patrón**, no como tabla: el par `version` + `reviewed_at` y la idea de "estado por fila y por persona".

---

## 5. Identidad canónica

Cadena correcta:

```
announcement (company_id)
  → audiencia resuelta a employees.id dentro de ese company_id
    → acknowledgment(employee_id, company_id, announcement_id, version)
      → auditoría con acting user_id = auth.uid()
```

- `employees.id` es la clave operativa por tenant (una persona tiene una ficha por company); `employees.user_id` es la identidad de acceso (memoria: *portal-status-truth*).
- **No** crear copia del worker. **No** cruzar a Parceros/Passport: un comunicado interno de Quality Staff es contenido empresarial (§13).

---

## 6. Modelo de estados honesto

Nivel comunicado: `DRAFT` → `PUBLISHED` → `ARCHIVED`.

Por destinatario, solo lo demostrable con la infraestructura actual:

| Estado | ¿Demostrable hoy? | Evidencia |
|---|---|---|
| `AVAILABLE` | ✅ | fila de audiencia creada + RLS permite verlo |
| `UNAVAILABLE` | ✅ | sin `user_id`, portal inactivo o módulo `announcements` deshabilitado en `employee_portal_modules` |
| `NOTIFIED` | ✅ | fila en `notifications` |
| `VIEWED` | ✅ (si se instrumenta apertura) | timestamp al abrir el detalle |
| `ACKNOWLEDGED` | ✅ (nuevo) | pulsación explícita del CTA |
| ~~`DELIVERED`~~ | ❌ | no hay recibo de entrega push/email → **prohibido mostrarlo como hecho** |

Regla: el KPI admin dice “Disponible / Notificado”, nunca “Entregado”.

---

## 7. Tipos de comunicación

`announcements.priority` (`normal / high|important / urgent`) ya diferencia énfasis visual, pero **prioridad ≠ obligación**. Se necesita un eje ortogonal `acknowledgment_mode`:

- **A. Informativo** — sin acuse.
- **B. Requiere acuse** — CTA "Confirmo que recibí y entendí".
- **C. Crítico** — igual que B + permanece como pendiente bloqueante en Inicio del worker hasta confirmar.

Separación conceptual obligatoria: `VIEWED ≠ ACKNOWLEDGED ≠ ACCEPTED ≠ SIGNED`. **No** implementar firma electrónica.

---

## 8. Simulación arquitectónica del caso real (zero writes)

1. **Admin crea:** `/app/announcements` → "Nuevo comunicado" → título, cuerpo, prioridad `high`, sube la imagen educativa a `announcement-media/<qualityStaffId>/...`, elige audiencia "Todos los trabajadores activos", tipo "Requiere acuse", preview, publicar.
2. **Se almacena:** `announcements` (fila v1, `published_at = now()`), imagen en `media_urls`, audiencia congelada en filas de destinatarios.
3. **Notificación:** N filas en `notifications` (`type = 'announcement'`, `metadata.announcement_id`), realtime + badge + toast en el portal.
4. **Worker:** card en Inicio/Pendientes → detalle con título, company, fecha, texto, imagen → CTA grande → acuse registrado con `employee_id + company_id + announcement_id + version + acknowledged_at`.
5. **Admin ve:** en el detalle del comunicado — `85 destinatarios · 63 confirmados · 17 pendientes · 5 no accesibles`, con lista nominal de pendientes y deep-link al perfil.

---

## 9. UX admin propuesta

Sin módulo nuevo: se queda en **Comunicados (`/app/announcements`)**, hoy bajo la sección Operations.

- Wizard en un solo diálogo: contenido → adjunto → audiencia → tipo de confirmación → preview → publicar.
- Detalle del comunicado con KPIs compactos + barra de progreso simple + tabs `Confirmados / Pendientes / No accesibles`.
- Sin gráficos en móvil; cards + listas (One Design System, `@/components/stafly-ui`).

## 10. UX worker mobile

- Entrada primaria: **Inicio / Pendientes** (card destacada cuando el comunicado exige acuse), además del feed existente en Comunicados.
- Detalle: título · empresa · fecha · contenido · imagen a pantalla completa · CTA grande.
- Tras confirmar: `✓ Confirmado — <fecha/hora>`, y no se vuelve a pedir para la **misma versión**.

---

## 11. Versionado (punto crítico)

Hoy `announcements` se edita **in place** (`UPDATE` directo desde el admin) y `announcement_reactions` no ata a contenido. Un edit material después de 63 confirmaciones haría que esos acuses parezcan confirmar el texto nuevo. **Riesgo real de evidencia falsa.**

Modelo mínimo seguro (no implementar aún): columna `content_version int` en `announcements`, incrementada por trigger cuando cambian `title / body / media_urls`; el acuse guarda la versión confirmada. Si `content_version > acknowledged_version`, el destinatario vuelve a `PENDING` y el admin ve "reconfirmación requerida".

---

## 12. Permisos

Reutilizar el dominio existente `communication`, sin crear otro:

| Acción | Permiso |
|---|---|
| Crear / editar draft | `announcements.edit` |
| Publicar | `announcements.publish` |
| Fijar | `announcements.pin` |
| Archivar | `announcements.delete` (soft delete existente) |
| Ver resultados / acuses | `announcements.edit` (o, si se quiere granularidad, un solo permiso nuevo `announcements.view_acknowledgments`) |

Worker: confirma su propio acuse vía RLS `employees.user_id = auth.uid()`, sin permiso de módulo.

## 13. Privacidad y auditoría

Guardar solo: `announcement_id, content_version, company_id, employee_id, acknowledged_at, acting user_id, y opcionalmente viewed_at`. **No** guardar IP, user-agent, geolocalización ni contenido duplicado. **No** publicar nada de esto en Passport ni cruzarlo entre tenants. Registrar publicar/archivar en `activity_log` con `entity_type = 'announcement'`.

Observación: `announcement-media` es un bucket **público**. Aceptable para una imagen educativa; si algún día se adjunta material sensible (nómina, disciplinario), hará falta bucket privado + signed URLs, como ya hace `shift-attachments`.

## 14. Tenant isolation

Ya resuelto por las políticas actuales de `announcements` (company del `employees` del `auth.uid()`). Las tablas nuevas deben repetir el mismo patrón con `company_id` denormalizado + GRANTs explícitos, y la audiencia debe resolverse **solo** dentro del `company_id` del comunicado.

---

## 15. Decisión de arquitectura

| | A. Extender Announcements | B. Extender Documents/Policy | C. Entidad nueva |
|---|---|---|---|
| Reutilización | Alta: tabla, RLS, permisos, storage, ruta admin, feed worker | Baja: dirección conceptual inversa | Nula |
| Complejidad | Baja-media (2 tablas satélite + 1 columna) | Alta (reinterpretar compliance) | Alta |
| Riesgo | Bajo; edición in-place mitigada con versión | Alto: contamina compliance y KPIs de documentos | Medio |
| Duplicación | Ninguna | Conceptual | Silo completo |
| UX | Ya hay lugar natural admin y worker | Confuso ("documento" que no aportó el worker) | Otro módulo más |
| Tenant isolation | Ya probada | Ya probada | A construir |
| Crecimiento | Bueno (audiencia/segmentos, ack, versión) | Malo | Bueno pero caro |
| Deuda | Mínima | Alta | Alta |

**Elegida: OPCIÓN A.**

---

## 16. Qué NO debemos construir

- Firma electrónica / e-sign legal.
- Estado "Entregado" sin recibo real de entrega.
- Acuse sobre `announcement_reactions` (el worker puede borrarlo).
- Comunicados cross-company o expuestos en Passport.
- Un módulo de navegación nuevo.
- Envío de email/SMS/WhatsApp en esta fase (el sistema de email está 🔴 bloqueado por la auditoría previa de supresión global).

## 17. Minimum Safe Implementation (para autorización)

1. `announcements`: `+ content_version int default 1`, `+ acknowledgment_mode text ('none'|'required'|'critical')`, `+ audience_mode text ('all_active'|'selected')`, `+ archived_at`.
2. `announcement_recipients(announcement_id, company_id, employee_id, notified_at, unavailable_reason)` — audiencia congelada al publicar.
3. `announcement_acknowledgments(announcement_id, company_id, employee_id, content_version, viewed_at, acknowledged_at, acknowledged_by_user_id)` — único por `(announcement_id, employee_id, content_version)`.
4. RPC `publish_announcement(...)`: congela audiencia + inserta `notifications` + escribe `activity_log`, todo en una transacción.
5. RPC `acknowledge_announcement(announcement_id)`: resuelve el `employees.id` del `auth.uid()` en esa company, valida versión, upsert idempotente.
6. Trigger de versión: incrementa `content_version` solo ante cambio material de `title/body/media_urls` en un comunicado ya publicado.
7. GRANTs + RLS calcadas del patrón vigente de `announcements`.

## 18. Áreas probables a modificar

`src/pages/admin/Announcements.tsx`, `src/pages/portal/MyAnnouncements.tsx`, Inicio del worker (`EmployeeDashboard.tsx`), `src/hooks/useNotifications.tsx` (tipo `announcement` + deep link), `src/lib/auth/permission-catalog.ts` (solo si se añade `view_acknowledgments`), nuevo `src/lib/communications/announcement-truth.ts` como resolver único de estado por destinatario.

## 19. QA futuro requerido

Aislamiento cross-tenant de audiencia y acuse; idempotencia de doble tap en el CTA; reconfirmación tras edición material; trabajador sin `user_id` o con módulo deshabilitado → `UNAVAILABLE` y no `PENDING`; suma exacta `destinatarios = confirmados + pendientes + no accesibles`; multi-company (misma persona en Quality y MyStaff no ve el comunicado ajeno).

## 20. Recomendación final

Extender `announcements` como entidad canónica de comunicación empresa→trabajador, añadiendo **audiencia**, **acuse** y **versión** como satélites; delivery vía `notifications`; adjuntos vía `announcement-media`; permisos del dominio `communication` ya existente.

Requiere extensión estructural (3 piezas de schema + 2 RPCs), no basta con lo actual:

🟡 **EXISTING SYSTEM NEEDS STRUCTURAL EXTENSION** — sistema base: **`public.announcements` / `/app/announcements`**.

*Nada implementado. Zero writes. Esperando autorización.*
