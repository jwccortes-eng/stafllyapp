# P0 — EMAIL TRUST & DELIVERY TRUTH

Fecha: 2026-09-03 · Alcance: correo transaccional ya activo en backend.
Cero emails enviados durante este trabajo. Comunicados Oficiales intacto.

## 1. Root causes

1. **Branding "Staflycore" + inglés genérico**: lo introdujo el scaffolding de la
   nueva infraestructura de correo (1-sep). `SITE_NAME = "Staflycore"` quedó
   hardcodeado en `auth-email-hook/index.ts` y en el helper de plantillas
   registradas, y las seis plantillas de auth se generaron en inglés.
   Las activaciones masivas además usaban la marca de plataforma antigua
   ("StaflyApps") por encima de la compañía.
2. **Falsa verdad de entrega**: el backend ya distinguía `sent` vs `suppressed`,
   pero la UI de invitación fijaba `status: "queued"` y mostraba "Email en cola
   de envío" pase lo que pase; el envío masivo solo reportaba `emails_sent` sin
   contar los bloqueados.

## 2. Templates afectados

| Template | Evento | Antes | Ahora |
|---|---|---|---|
| `signup.tsx` | alta / confirmación | EN, Staflycore | ES+EN, Stafly |
| `invite.tsx` | invitación auth | EN | ES+EN |
| `magic-link.tsx` | magic link | EN | ES+EN |
| `recovery.tsx` | reset contraseña | EN | ES+EN |
| `email-change.tsx` | cambio de correo | EN | ES+EN |
| `reauthentication.tsx` | código OTP | EN | ES+EN |
| `bulk-portal-invite` (HTML inline) | activación portal | EN, "StaflyApps" | ES+EN, compañía + powered by Stafly |
| `send-invite-email` (HTML del llamador) | invitación al portal | ES | ES (sin cambio), remitente por tenant |
| `_shared/pin-recovery.ts` | código PIN | ya ES/Stafly | sin cambios |

Nuevo cascarón común: `_shared/email-templates/shared.tsx` (marca, estilos,
bloque bilingüe, CTA). Nueva marca única: `_shared/email-brand.ts`.

## 3. Before → After branding

- Antes: `Staflycore <noreply@staflyapps.com>`, `StaflyApps <noreply@notify...>`.
- Ahora: sin contexto de compañía → `Stafly`. Con contexto → `"<Compañía> —
  powered by Stafly"` vía `brandFrom(companyName)`. Ninguna compañía está
  hardcodeada: Quality Staff, My Staff y JKitchen usan la misma plantilla y solo
  cambia el nombre que envía el llamador.

## 4. ES/EN behavior

Los emails de auth no tienen preferencia de idioma confiable por persona (la
identidad de trabajador es teléfono+PIN, no perfil de idioma). Fallback de
producto: **bilingüe ES/EN, español primero**, separado por línea. No se duplican
cuentas ni plantillas para resolver idioma.

## 5. Tenant branding

`brandName()` / `brandFrom()` son la única fuente. `send-invite-email` acepta
`company_name` opcional; `bulk-portal-invite` lo resuelve de `companies.name`.
Sin nombre → "Stafly", nunca la compañía de otro tenant.

## 6. Suppression behavior

La supresión la aplica la plataforma en servidor (bounce, complaint,
unsubscribe). `sendRawEmail` traduce `recipient_suppressed` a
`{ sent:false, reason:'recipient_suppressed' }` y nunca lo convierte en éxito.

Estados expuestos hoy: `SENT` / `SUPPRESSED` (respuesta de `send-invite-email`),
y en `email_send_log`: `sent`, `suppressed`, `failed`, `bounced`, `complained`.
UI: nuevo estado canónico `suppressed` en `invitation-status.ts` (cuenta como
fallo, no como "en cola").

## 7. Transactional vs marketing

Todo lo que envía la app hoy es transaccional/seguridad (`purpose:
'transactional'`); no existe envío de marketing en el código. **Deuda material**:
la lista de supresión de la plataforma es por dirección y no separa
"unsubscribe de marketing" de "bounce/complaint", así que un unsubscribe podría
bloquear también un email de recuperación. Mitigación operativa vigente: la
recuperación de PIN y el acceso por teléfono+PIN no dependen del email, y la
supresión nunca desactiva persona, membresía ni Passport.

## 8. Admin delivery truth

- Invitación individual: si el correo queda bloqueado, el diálogo ya no dice
  "Email en cola de envío". Muestra "No se pudo enviar la invitación a este
  correo" + "Este correo tiene una restricción de entrega. Verifica la dirección
  o comparte el acceso por WhatsApp o enlace". La invitación sigue creada.
- Campaña masiva: la respuesta añade `emails_suppressed` y `emails_failed`; el
  resumen distingue "workers activados" de "emails enviados" y avisa cuántos no
  salieron.
- No se expone detalle del proveedor al admin.

## 9. Auth regression QA

No se tocó auth, PIN, `internal_set_auth_pin`, lockout, memberships ni
multi-compañía. `bunx tsgo --noEmit -p tsconfig.app.json`: PASS.
`bunx vitest run src/lib`: 132 tests PASS. Funciones desplegadas arrancan
(`booted`, sin errores de import); endpoints responden 401 ante llamada sin
credencial (control de acceso intacto).

## 10. URL/security QA

Links en emails: `https://staflyapps.com/portal` y `confirmationUrl` provisto por
el hook de auth (token de un solo uso, expiración del proveedor sin cambios). No
aparece dominio de staging ni preview. No se exponen service keys ni IDs internos.
No se modificó ningún mecanismo criptográfico ni de tokens.

## 11. Logging/privacy QA

`email_send_log` guarda destinatario, plantilla, estado y error truncado. No se
registran PIN, códigos de recuperación, magic tokens ni HTML sensible. El
webhook de eventos loguea `event_id`, no la dirección.

## 12. Idempotency/retry QA

- `send-invite-email`: clave estable `invite-email-<invitation_id>`.
- `bulk-portal-invite`: se eliminó `Date.now()`; ahora
  `bulk-activation-<employee_id>-<YYYY-MM-DD>` → un reintento del mismo día no
  duplica el email.
- `pin-recovery`: clave por solicitud (código nuevo = email nuevo, correcto).
- Webhook de eventos: handlers idempotentes por dirección (upsert), reintentos
  del proveedor no duplican estado.

## 13. Emails QA enviados

**Ninguno.** No se envió correo a workers reales ni a cuentas QA: la validación
fue estática, de compilación y de despliegue. Los casos A–J de envío real quedan
pendientes con cuentas QA autorizadas.

## 14. Archivos modificados

Edge functions / shared:
- `supabase/functions/_shared/email-brand.ts` (nuevo)
- `supabase/functions/_shared/email-templates/shared.tsx` (nuevo)
- `signup.tsx`, `invite.tsx`, `magic-link.tsx`, `recovery.tsx`,
  `email-change.tsx`, `reauthentication.tsx`
- `supabase/functions/auth-email-hook/index.ts` (SITE_NAME + asuntos bilingües)
- `supabase/functions/_shared/transactional-email-templates/send-email.ts`
- `supabase/functions/send-invite-email/index.ts`
- `supabase/functions/bulk-portal-invite/index.ts`

Frontend:
- `src/lib/invitation-status.ts`, `src/lib/invitation-error-messages.ts`
- `src/components/employee/EmployeeInviteDialog.tsx`
- `src/pages/admin/Employees.tsx`

Migraciones: **ninguna**. RLS: sin cambios.

## 15. Desplegado inmediatamente

`auth-email-hook`, `send-invite-email`, `bulk-portal-invite`,
`preview-transactional-email`. Los cambios de `src/` NO están publicados: viajan
con el próximo Publish del frontend.

## 16. Riesgos / deuda

1. Supresión global sin separar marketing vs seguridad (ver §7).
2. Los cambios de UI de verdad de entrega solo aplican tras publicar frontend;
   hasta entonces el admin en producción sigue viendo el texto antiguo.
3. Falta QA de envío real (A–J) con cuentas QA autorizadas, incluido branding
   multi-tenant y eventos bounce/complaint reales.
4. `email_send_log` no distingue `unsubscribed` de `suppressed`.

## 17. Confirmación

Cero emails a workers reales. Cero cambios en payroll, time_entries,
pay_statements, shifts, pagos, documentos, tenants, memberships, auth ni PIN.

## 18. Comunicados Oficiales

Intacto: no se tocaron `announcement_versions`, `announcement_recipients`,
acknowledgments, audiencia ni el borrador de Quality Staff. No se conectó
announcements con email.

🟡 FIX / QA REQUIRED
