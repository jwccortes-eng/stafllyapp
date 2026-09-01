# P0 — Auditoría + QA pre-publish del nuevo sistema de email

Modo: READ-ONLY. No se publicó, no se desplegó, no se enviaron correos, no se
modificaron usuarios, auth, PIN, roles, permisos, payroll ni datos operativos.

---

## 1. Veredicto ejecutivo

🔴 **DO NOT PUBLISH** (un bloqueador concreto, arquitectura por lo demás sólida).

La entrega gestionada suprime al destinatario **de forma global por dirección de
correo y dominio remitente**, sin distinguir categorías. En Stafly los correos
críticos (código de recuperación de PIN, invitación de acceso, activación de
portal) viajan como correos de aplicación, así que **una baja, un rebote o una
queja deja a esa persona sin canal de recuperación de cuenta y sin poder ser
invitada**, en todas las compañías a la vez. El carve-out de "los correos de
inicio de sesión siguen funcionando" solo cubre los correos de auth nativos
(hook `auth-email-hook`), que en Stafly casi no se usan porque el acceso real es
teléfono + PIN.

---

## 2. Arquitectura BEFORE → AFTER

### ANTES
```
App / Edge Function
  → RPC public.enqueue_email(queue, payload)      (PGMQ, cola propia)
  → cron → process-email-queue                    (worker propio)
  → proveedor (Resend / API de correo)
  → remitente noreply@notify.staflyapps.com
  → logging propio: email_send_log (pending → sent/failed/dlq)
  → supresión propia: suppressed_emails + email_unsubscribe_tokens
  → ruta pública propia de unsubscribe
```

### AHORA
```
App / Edge Function
  → _shared/send-raw-email.ts  → sendLovableEmail (npm:@lovable.dev/email-js@0.1.0)
     (o _shared/transactional-email-templates/send-email.ts para plantillas)
  → Lovable managed delivery   (entrega, reintentos, rate limit, supresión, footer de baja)
  → sender_domain notify.staflyapps.com · From noreply@notify.staflyapps.com
  → logging: registro de Lovable (Cloud → Emails) + email_send_log de la app
  → eventos terminales → handle-email-events (firma X-Lovable-Signature)
     → email_send_log + suppressed_emails (solo informativo)
```

Sin cola, sin cron, sin estado local de envío. Ya no hay processor propio.

### Elementos tocados
| Tipo | Elemento |
|---|---|
| Helper nuevo | `supabase/functions/_shared/send-raw-email.ts` |
| Convertidos | `_shared/pin-recovery.ts`, `send-invite-email/index.ts`, `bulk-portal-invite/index.ts` |
| Nuevo webhook | `supabase/functions/handle-email-events/index.ts` |
| Auth | `auth-email-hook/index.ts` + `_shared/email-templates/*.tsx` (6 plantillas) |
| Plantillas app | `_shared/transactional-email-templates/*`, `preview-transactional-email/` |
| Eliminados | `process-email-queue/`, migración `*_email_infra.sql`, bloques en `config.toml` |
| Config | `LOVABLE_API_KEY` (provisionada), `LOVABLE_SEND_URL` (opcional), `SENDER_DOMAIN` = `notify.staflyapps.com` |
| Tablas | `email_send_log`, `suppressed_emails` (conservadas), `email_unsubscribe_tokens`, `email_send_state` (huérfanas) |
| RPC | `enqueue_email` sigue existiendo en la base pero ya no la llama nadie |

Dominio: `notify.staflyapps.com` **verificado** (NS delegados a Lovable).
Estado del proyecto: *Setting up — confirmando que la entrega está lista*.

---

## 3. Inventario de emails

**A. Transaccional / seguridad**
| Flujo | Ruta | Label |
|---|---|---|
| Código de recuperación de PIN | `_shared/pin-recovery.ts` → sendRawEmail | `pin_recovery_code` |
| Invitación de acceso | `send-invite-email` → sendRawEmail | `invite_email` |
| Activación de portal (masiva) | `bulk-portal-invite` → sendRawEmail | `portal_activation` |
| Auth nativo (signup, magic link, recovery, invite, email change, reauth) | `auth-email-hook` | vía hook |

**B. Operacional** — hoy no hay correos operativos activos por esta ruta.
`send-payroll-email` sigue con kill switch y todavía referencia `RESEND_API_KEY`
(código muerto, no migrado). Recordatorios de turno/invitación notifican por otros
canales, no por email gestionado.

**C. Comunicación / marketing** — no existe. No hay campañas ni newsletters.

Consecuencia: **el 100% de los correos que hoy salen son críticos**. No hay una
categoría "no crítica" sobre la que un unsubscribe sea inocuo.

---

## 4. Regla crítica de unsubscribe — 🔴 BLOCKER

- La baja se aplica por **dirección + dominio remitente**, no por tipo de correo.
- Lovable bloquea en el servidor: el envío devuelve `recipient_suppressed`, la app
  no lo puede saltar (y no debe).
- La única excepción de plataforma son los correos de auth nativos. Stafly autentica
  con teléfono + PIN; la recuperación real es el **código de PIN**, que es correo de
  aplicación → **queda bloqueado**.
- No se puede quitar el pie de baja de un correo concreto ni marcar un envío como
  exento.

Resultado: un trabajador que pulse "unsubscribe" (o cuyo buzón rebote una vez)
pierde de forma permanente la recuperación de acceso por email y la posibilidad de
recibir una nueva invitación/activación. No hay separación de consentimiento
"seguridad" vs "comunicación".

**Arquitectura recomendada (no implementada):**
1. Segundo subdominio remitente exclusivo para seguridad (p. ej. `security.staflyapps.com`),
   con su propio ámbito de supresión, de modo que una baja en el dominio de
   comunicación no toque el canal crítico; **o**
2. Canal alterno garantizado de recuperación (SMS/WhatsApp al teléfono de la ficha,
   o recuperación asistida por administrador ya existente) declarado como camino
   oficial cuando el email está suprimido; **o**
3. Ambas. Además: superficie de administración que muestre "correo suprimido" en la
   ficha para que el admin no crea que la invitación salió.

Hasta que exista (1), (2) o (3), publicar convierte cada baja/rebote en pérdida de
acceso recuperable solo por vía manual no documentada.

---

## 5. Bounce / complaint / unsubscribe — comportamiento exacto

Handler único: `handle-email-events` (firma verificada, reintentos hasta 5, idempotencia
por `event_id` a cargo de la plataforma).

| Evento | Handler | Escribe | Estado resultante | Efecto en envíos futuros |
|---|---|---|---|---|
| `email.bounced` | `recordOutcome` | `email_send_log` (status `bounced`, template `system`) + upsert `suppressed_emails` reason `bounce` | dirección marcada | Lovable bloquea en servidor **todos** los correos de app a esa dirección |
| `email.complaint` | idem | log `complained` + `suppressed_emails` reason `complaint` | dirección marcada | igual; la queja no es reversible |
| `email.unsubscribed` | idem | log `suppressed` + `suppressed_emails` reason `unsubscribe` | dirección marcada | igual; reversible vía `setEmailUnsubscribe` |

Verificado explícitamente que **ningún** handler:
borra usuarios · desactiva `employees` · elimina membresías · toca payroll,
`time_entries`, `shift_assignments`, `scheduled_shifts`, `pay_statements`,
documentos, Passport, roles, permisos ni auth. Solo escribe las dos tablas de correo.
`suppressed_emails` es puramente informativo: **ninguna ruta de la app la consulta
antes de enviar** (verificado por búsqueda: el único uso es el propio webhook).

"Delivered/opened" no existe en esta plataforma: solo sent, rejected, bounced,
complained, unsubscribed, suppressed, rate_limited.

---

## 6. Identidad y multi-tenant

- `suppressed_emails` tiene clave única por **email**, sin `company_id`.
- `email_send_log` tampoco tiene columna de compañía; el contexto viaja dentro de
  `metadata` en `send-invite-email` (`company_id`, `employee_id`, `invitation_id`) y
  no viaja en pin-recovery ni en los eventos del webhook.
- La supresión de Lovable es por dirección + dominio remitente, y **el dominio es uno
  solo para todo Stafly**.

Por tanto: un rebote o baja originado en un correo de **Quality Staff** suprime esa
dirección también para **My Staff, Parceros, JKitchen y cualquier compañía futura**.
La persona canónica y sus membresías no se tocan; lo que se pierde es el canal.
Fuga de datos entre tenants: **no hay** — las tablas solo son legibles por
`service_role` (RLS: SELECT restringido a `auth.role() = 'service_role'`), ningún
cliente ni admin las lee desde la app.

Nota UX: al no haber `company_id`, el registro no permite responder "¿de qué compañía
salió el correo que rebotó?" salvo por `metadata` en invitaciones.

---

## 7. URLs y entornos

- Resolutor canónico `src/lib/app-url.ts`: devuelve `https://staflyapps.com` salvo en
  `localhost`/`127.0.0.1`. Nunca devuelve el dominio de preview de Lovable.
- Invitación / activación → `https://staflyapps.com/activate/:token` (el legacy
  `/invite?token=` redirige).
- Activación masiva → `https://staflyapps.com/portal` (literal en `bulk-portal-invite`).
- Portal / credenciales → `https://staflyapps.com/auth`.
- `auth-email-hook`: `SITE_URL = https://staflyapps.com`. La URL de preview de Lovable
  aparece **solo** en `SAMPLE_DATA`, usada por el visor de plantillas, nunca en envíos.
- Recuperación: no lleva enlace, lleva **código de 6 dígitos con vigencia de 10 minutos**,
  intentos limitados y consumo único.
- No se encontró ningún enlace final a preview, staging, localhost ni dominio temporal.

✅ URLs de producción correctas.

---

## 8. Remitente y Reply-To

| Flujo | From |
|---|---|
| Invitación | `StaflyApps <noreply@notify.staflyapps.com>` |
| Recuperación de PIN | `Stafly <noreply@notify.staflyapps.com>` |
| Activación masiva | `{Compañía} via StaflyApps <noreply@notify.staflyapps.com>` |
| Auth nativo | dominio visible `staflyapps.com` |

`Reply-To`: **no se configura en ningún flujo** (el helper lo soporta, nadie lo usa).

Hallazgos UX/Trust (no bloqueantes, no modificados):
- Marca inconsistente: "Stafly" vs "StaflyApps" vs "Staflycore" (nombre del sitio en el hook).
- El trabajador recibe correos de un `noreply@` sin respuesta posible; para un canal
  que incluye recuperación de acceso conviene un Reply-To de soporte real.
- Solo la activación masiva nombra la compañía; invitación y recuperación no la
  identifican, lo que en una persona multi-compañía es ambiguo.

---

## 9. Logging y privacidad

Se registra por envío en `email_send_log`: `message_id`, `template_name`,
`recipient_email`, `status`, `error_message`, `metadata`, `created_at`.

Revisado línea a línea: **no se registran** PIN, código de recuperación, tokens de
activación, magic links, contenido de documentos, SSN ni datos de nómina. El código de
recuperación nunca se imprime en consola ni se guarda; el helper de eventos loguea solo
`event_id` + código/mensaje de error, nunca el destinatario. `send-invite-email` sí
loguea el destinatario y el asunto en consola de función (PII de contacto, no secreto).

El destinatario en claro vive en `email_send_log.recipient_email` y en
`suppressed_emails.email`; ambas tablas tienen RLS activo con SELECT restringido a
`service_role` → inaccesibles desde el navegador y desde cualquier rol de la app.

Deuda: 403 filas `pending` y 165 `dlq` heredadas de la cola anterior siguen en
`email_send_log`. No se enviarán nunca (ya no hay processor) pero contaminan cualquier
lectura de estado. También quedan huérfanas `email_unsubscribe_tokens`,
`email_send_state` y la RPC `enqueue_email`.

---

## 10. Tests controlados — NO EJECUTADOS

TEST 1–7 **no se ejecutaron**, por tres razones acumulativas:
1. Enviar implicaría correo real a direcciones reales (prohibido por el encargo).
2. La configuración de correo del proyecto sigue en *Setting up*; el histórico de
   entregas está vacío en la ventana visible.
3. Los eventos de rebote/queja/baja **solo se entregan para envíos de producción**, y los
   webhooks solo quedan registrados al publicar → TEST 6 y TEST 7 son físicamente
   imposibles antes de publicar.

Plan recomendado post-publish, con buzón de prueba controlado y ninguna cuenta real:
invitación → activación → recuperación → rebote contra `bounce@simulator.amazonses.com`
o equivalente → baja controlada → reintento de recuperación (aquí se confirmará el
bloqueador del punto 4).

TEST 7 ya tiene resultado por análisis estático: **falla**. Es el bloqueador.

---

## 11. Idempotencia / duplicados

| Flujo | Clave | Evaluación |
|---|---|---|
| Invitación con `invitation_id` | `invite-email-{invitation_id}` | ✅ estable, doble clic no duplica |
| Invitación sin `invitation_id` | `invite-email-{to}-{Date.now()}` | ⚠️ nueva en cada intento → duplica |
| Recuperación de PIN | `pin-recovery-{uuid}` | ⚠️ no idempotente, **pero** protegido aguas arriba por rate limit + cooldown + código único de 10 min |
| Activación masiva | `bulk-activation-{emp.id}-{Date.now()}` | ⚠️ no idempotente: reejecutar la campaña reenvía a todos |

Protecciones reales existentes: rate limit y cooldown canónicos en recuperación
(intactos, no se tocaron), un solo código activo por solicitud, y rate limit propio de
la entrega gestionada (429 con `retryAfterSeconds`). No hay deduplicación en la campaña
masiva más allá de su propio filtro de destinatarios: el riesgo de envío masivo
accidental es **operativo, no técnico**.

---

## 12. Análisis de rollback

- **Antes de publicar:** reversible al 100%. La app publicada sigue usando las funciones
  desplegadas anteriores; nada de lo nuevo afecta a usuarios. Descartar el cambio deja
  el sistema anterior intacto.
- **"Permanente" al publicar significa:** la publicación registra los webhooks de eventos
  y conmuta el proyecto a envío gestionado; la plataforma retira el modo anterior. No
  existe un botón de "des-migrar".
- **Qué pasa con el mecanismo anterior:** los archivos de la cola ya se borraron del
  repositorio y la migración de infraestructura también; las tablas de datos se
  conservaron. Restaurarlo exigiría reescribir el worker, recrear la cola y el cron, y
  volver a contratar un proveedor externo — con el agravante de que los NS de
  `notify.staflyapps.com` están delegados a Lovable y su retirada tarda hasta 72 h.
- **Datos nuevos que empiezan a escribirse:** filas `sent`/`suppressed`/`failed` desde los
  remitentes, y `bounced`/`complained`/`suppressed` desde el webhook, más el histórico de
  la plataforma (14 días en el plan actual).
- **Eventos ya procesados:** quedan como filas históricas; no se reprocesan ni se revierten.
- **Rollback realista si la entrega falla tras publicar:** desactivar Lovable Emails
  (los correos de auth vuelven a las plantillas por defecto y los envíos de app fallan
  con `emails_disabled`), o retirar los puntos de envío del código. Ninguna de las dos
  restaura la cola anterior. Es decir: **el rollback práctico es "dejar de enviar", no
  "volver atrás"**.

---

## 13. Riesgos encontrados

| # | Riesgo | Severidad |
|---|---|---|
| R1 | Baja/rebote/queja bloquea recuperación de PIN, invitación y activación | 🔴 Bloqueador |
| R2 | La supresión cruza tenants: un evento en Quality Staff apaga My Staff, Parceros, JKitchen | 🔴 Bloqueador (mismo origen que R1) |
| R3 | Sin Reply-To y con marca inconsistente en un canal de seguridad | 🟡 UX/Trust |
| R4 | Campaña masiva de activación sin idempotencia → reenvío completo si se reejecuta | 🟡 |
| R5 | Ninguna superficie de administración muestra "correo suprimido": el admin cree que envió | 🟡 |
| R6 | 403 `pending` + 165 `dlq` huérfanos y tablas/RPC muertas de la cola anterior | 🟢 Higiene |
| R7 | `send-payroll-email` conserva ruta a Resend (kill switch activo) — segundo proveedor latente | 🟢 Higiene |
| R8 | Ningún flujo crítico probado end-to-end (imposible antes de publicar) | 🟡 |

## 14. Blockers

- **B1** — No existe separación entre consentimiento de seguridad y de comunicación.
  Con el 100% de los correos actuales siendo críticos, cualquier supresión equivale a
  pérdida de canal de recuperación de cuenta, y además en todas las compañías.

## 15. Qué NO fue modificado en esta auditoría

Nada. Ni auth, ni PIN, ni RLS, ni roles, ni permisos, ni payroll, ni `time_entries`,
`shift_assignments`, `scheduled_shifts`, `pay_statements`, `period_base_pay`,
movimientos, documentos, Passport, membresías, tenants, campañas, lógica de partners
ni datos de contacto reales. No se publicó, no se desplegó, no se envió ningún correo,
no se ejecutó rollback y no se alteró ningún consentimiento.

## 16. Recomendación de publicación

No publicar todavía. Mínimo para pasar a 🟡 y luego a 🟢:
1. Decidir y ejecutar la separación de canal crítico (dominio remitente aparte para
   seguridad) **o** declarar e implementar el camino alterno de recuperación
   (SMS/WhatsApp o recuperación asistida por admin) como respaldo obligatorio.
2. Exponer el estado "correo suprimido" en la ficha de la persona para que el admin no
   opere a ciegas.
3. Fijar claves de idempotencia estables en activación masiva e invitación sin
   `invitation_id`.
4. Publicar y ejecutar TEST 1–7 con buzones de prueba controlados, incluida la
   simulación de rebote, antes de considerar el sistema certificado.

---

🔴 **DO NOT PUBLISH** — el modelo de baja/supresión global puede dejar sin recuperación
de cuenta a trabajadores reales, y el efecto cruza los límites de compañía.
