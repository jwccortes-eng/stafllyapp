# P1 — QA FINAL: Comunicados oficiales + acuse + versionado + ES/EN

Fecha: 2026-09-03 · Modo: verificación controlada (sin publicar, sin comunicaciones reales, sin email)
Entorno de prueba: empresa **QA Testing** (5 personas ficticias, 0 workers reales). Todos los datos de prueba fueron creados y **eliminados**; base restaurada a su estado inicial (9 anuncios históricos, 3 reacciones, 0 versiones, 0 destinatarios, 0 acuses, 0 avisos).

## 1. Schema creado

Tablas nuevas (todas con RLS activo):

| Tabla | Campos clave | Restricciones |
|---|---|---|
| `announcement_versions` | `announcement_id`, `company_id`, `version_number`, `status` (draft/published/superseded), `communication_type`, `default_language`, `title_es/body_es/title_en/body_en`, `media_urls`, `link_url/link_label`, `audience_mode`, `audience_employee_ids`, `published_at/published_by` | UNIQUE (announcement_id, version_number); CHECKs de status/tipo/idioma/audiencia |
| `announcement_recipients` | `version_id`, `company_id`, `employee_id`, `state` (available/viewed/acknowledged), `requires_acknowledgment`, `available_at`, `first_viewed_at`, `acknowledged_at` | UNIQUE (version_id, employee_id); CHECK de estado |
| `announcement_acknowledgments` | `version_id`, `company_id`, `employee_id`, `user_id`, `language_variant`, `acknowledged_at`, `metadata` | UNIQUE (version_id, employee_id); CHECK idioma es/en; FKs ON DELETE RESTRICT |

Columnas añadidas a `announcements`: `communication_type`, `archived_at`, `current_version_id`.

Triggers: `trg_announcement_version_number`, `trg_announcement_version_immutability`, `trg_announcement_ack_immutability`, `trg_announcement_protect_evidence`.

RPCs: `announcement_new_version`, `publish_announcement_version`, `mark_announcement_viewed`, `acknowledge_announcement`, `announcement_version_recipients`, helper `announcement_can_manage`.

## 2. Resultados de las pruebas ejecutadas

| # | Prueba | Resultado |
|---|---|---|
| 1 | Publicación congela audiencia seleccionada (2 personas) | 2 destinatarios exactos ✅ |
| 2 | Aviso interno por destinatario, sin email | 2 avisos, 0 emails (log de email en 24 h = 0) ✅ |
| 3 | Worker ve solo su versión / su fila | 1 versión, 1 destinatario ✅ |
| 4 | Marcar visto | estado `viewed`, sin sobrescribir confirmación ✅ |
| 5 | Doble confirmación (retry/doble clic) | 1 solo acuse; segunda llamada devuelve `already` ✅ |
| 6 | Idioma registrado | `language_variant = en` (el mostrado al confirmar) ✅ |
| 7 | Worker ve acuses de otros | 0 filas ✅ |
| 8 | Worker confirma por otra persona (insert directo) | bloqueado por RLS ✅ |
| 9 | Worker modifica `acknowledged_at` / borra acuse | 0 filas afectadas; evidencia intacta ✅ |
| 10 | Worker edita contenido de versión | 0 filas afectadas ✅ |
| 11 | Worker manipula su fila de destinatario | 0 filas afectadas ✅ |
| 12 | Aislamiento Quality Staff ↔ QA Testing (lectura de versiones/destinatarios/acuses) | 0 filas en los tres casos ✅ |
| 13 | Worker de otra empresa confirma comunicado ajeno | "Este comunicado no está dirigido a ti" ✅ |
| 14 | Worker de otra empresa llama al RPC de seguimiento | "No tienes permiso para ver los destinatarios" ✅ |
| 15 | V2 con cambio material | V1 → `superseded` con contenido original intacto; V2 `published` ✅ |
| 16 | Acuse V1 tras publicar V2 | acuse sigue ligado exclusivamente a V1 ✅ |
| 17 | Pendiente de V2 | quien confirmó V1 aparece `available` en V2 ✅ |
| 18 | Audiencia congelada (persona nueva creada después de publicar) | V1=2 y V2=2 destinatarios, sin cambio retroactivo ✅ |
| 19 | Admin: nombres humanos y tiempos | "Test Invite Gmail \| Test NoPhone QA", sin UUID; sin etiqueta "Entregado" ✅ |
| 20 | Compatibilidad hacia atrás | 9 anuncios históricos intactos, sin versiones, sin acuse retroactivo; 3 reacciones intactas ✅ |
| 21 | Bloqueo operativo | ningún guard de login/portal/clock-in/turnos/nómina consulta acuses ✅ |
| 22 | Typecheck | `tsgo --noEmit` OK ✅ |

Cero cambios en nómina, fichajes, turnos, documentos, pagos, auth/PIN y cero comunicaciones a personas reales.

## 3. Hallazgos

**Material (bloquea el piloto):**

1. **La edición heredada evade el versionado.** En `/app/announcements` el botón de lápiz abre el editor legacy para *cualquier* anuncio, incluidos los comunicados oficiales con versiones. Ese editor escribe directo en `announcements.title/body/media_urls`, sin crear versión nueva y sin reabrir el acuse: la tarjeta visible puede cambiar mientras la evidencia sigue apuntando al texto anterior. La tarjeta tampoco muestra el tipo de comunicación ni si requiere confirmación.

**Deuda técnica (no bloqueante):**

2. `anon` conserva permiso de tabla sobre las tres tablas nuevas; RLS lo neutraliza (toda política exige sesión), pero conviene revocarlo.
3. `authenticated` conserva INSERT/UPDATE/DELETE a nivel tabla; sin políticas de escritura el efecto es 0 filas, pero es permiso innecesario.
4. Falta índice en `announcement_recipients (employee_id, state)`; el feed del portal escaneará más de lo necesario al crecer.
5. `announcement_version_assign_number` usa MAX+1 sin bloqueo: dos borradores simultáneos fallarían por unicidad en vez de serializarse.
6. Borrar un comunicado con evidencia exige desactivar triggers (correcto por diseño), pero no existe una acción administrativa de archivado en la UI.
7. No se validó el render móvil en navegador real (habría requerido sesión de un worker real). A nivel de código: CTA con `min-h-[44px]`, sin gráficos y contenido responsive.

## Veredicto

🟡 FIX REQUIRED BEFORE PILOT
