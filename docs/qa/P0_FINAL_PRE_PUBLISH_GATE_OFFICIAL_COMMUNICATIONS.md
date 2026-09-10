# P0 — FINAL PRE-PUBLISH GATE · Comunicados Oficiales

Fecha: 2026-09-10 · Modo: **solo lectura**. Cero publicaciones, cero emails, cero escrituras.

## 1. Snapshot actual

- HEAD: `0fb85d6b3` — "Fijó refresco y visibilidad móvil".
- Último snapshot certificado en staging: `462e24d09` — "Impuso inmutabilidad V1".

## 2. Diferencias vs snapshot certificado

59 archivos. Distribución:

| Dominio | Archivos | Riesgo |
|---|---|---|
| Documentación QA / roadmap | 12 | ninguno |
| Comunicados oficiales (UI, modelo, hooks, guard) | 16 | esperado, ya certificado en P1 |
| Email (plantillas, política, funciones edge) | 18 | fuera del piloto |
| Invitaciones / empleados (estados honestos de envío) | 5 | bajo |
| Migraciones | 7 | comunicados + email |
| `src/integrations/supabase/types.ts`, `App.tsx` | 2 | generado / rutas |

Búsqueda dirigida en dominios críticos (payroll, pay statements, shifts, assignments, time entries, tenants, permissions, RLS de nómina): **cero archivos tocados**. Las dos únicas coincidencias con "auth" son `auth-email-hook` y su plantilla de reautenticación, es decir infraestructura de correo, no lógica de autenticación ni PIN.

## 3. Dependencias de backend (producción)

Todo presente y activo:

- Tablas: `announcements`, `announcement_versions`, `announcement_recipients`, `announcement_acknowledgments`, `announcement_reactions` — las 5 con RLS habilitado.
- Funciones: `announcement_new_version`, `publish_announcement_version`, `acknowledge_announcement`, `can_read_announcement`, `can_read_announcement_media`, `announcement_can_manage`, más las 6 funciones-trigger de inmutabilidad y numeración.
- Triggers: `trg_announcement_lock_official_content`, `trg_announcement_protect_evidence`, `trg_announcement_version_immutability`, `trg_announcement_version_number`, `trg_announcement_ack_immutability`.
- Índices: `idx_announcement_recipients_employee_state`, `idx_announcement_versions_company`, `idx_announcement_ack_version` + únicos `(version_id, employee_id)` en destinatarios y acuses (base de la idempotencia).
- Almacenamiento: bucket `announcement-media` **privado**, con 3 políticas (lectura autorizada por audiencia, carga, borrado admin).
- Tiempo real: `announcement_versions` y `announcement_recipients` publicados con `REPLICA IDENTITY FULL`.

Sin desalineación frontend/backend.

## 4. Smoke de regresión

- Typecheck (`tsgo -p tsconfig.app.json`): sin errores.
- Suite completa: **109 archivos, 1.259 pruebas, todas verdes** (108,9 s).
- Datos QA de la ronda anterior: 0 comunicados y 0 versiones en QA Testing. Limpieza confirmada.

## 5. Dominios críticos

Verificación de lectura únicamente: `pay_statements`, `shifts`, destinatarios y acuses responden con conteos coherentes. **Cero escrituras** ejecutadas en esta sesión: ninguna nómina recalculada, ningún recibo publicado, ningún turno modificado.

## 6. Estado del incidente de correo

`staflyapps.com` figura ahora como **Verified** en el proveedor. El correo sigue **fuera del piloto**: no se envió ningún mensaje, no se conectó correo a Comunicados y no se tocó DNS.

## 7. HALLAZGO BLOQUEANTE — el comunicado del piloto ya está publicado

En **Quality Staff by Keury** (empresa real) existe:

- Comunicado `b506eaa5…` · **V1 publicada** el 2026-09-09 05:38 UTC
- Título ES: "Tu presentación también es parte del servicio"
- Tipo: **`critical_acknowledgment`** (el piloto pedía `acknowledgment_required`)
- Audiencia: **`all_company`** — **203 destinatarios reales**
- Acuses: **0**
- Además existe una **V2 en borrador** con el mismo título y el mismo tipo crítico.

Esto contradice tres condiciones del piloto: audiencia de 2–3 personas, tipo no crítico y "V1 aún sin publicar". No fue creado en esta sesión; ya estaba en la base desde el 9 de septiembre.

Consecuencia: no se puede "preparar hasta preview" una V1 que ya salió a toda la empresa. Y por diseño una versión publicada es inmutable y no se puede despublicar.

Caminos posibles (requieren decisión humana, ninguno ejecutado):

1. **Reencauzar con V2**: convertir la V2 en borrador en la versión del piloto, con tipo `acknowledgment_required` y audiencia seleccionada de 2–3 personas. La V1 queda como histórico con 0 acuses.
2. **Comunicado nuevo**: crear un comunicado independiente para el piloto y archivar el actual sin publicar la V2.

## 8. Audiencia de piloto seleccionable

Personas reales de Quality Staff con acceso al portal ya activo (muestra; la lista completa se elige en pantalla por nombre, nunca por identificador):

- Alejandra Sánchez — perfil listo
- Alejandro Cortés — español, documentos pendientes
- Ángel Colón — activo
- Alejandra Medina, Alison Vargas, Ammy Prieto, Andrés Pardo… (hay más de 20 con portal activo)

No se seleccionó ni congeló ninguna audiencia.

## 9. Preview

**No preparado.** Depende de la decisión del punto 7: mientras no se defina si el piloto va por la V2 o por un comunicado nuevo, cualquier preview mostraría datos que ya salieron a 203 personas.

## 10. Confirmaciones

- No se publicó ningún comunicado.
- Cero correos enviados.
- Cero escrituras en nómina, recibos, turnos, asignaciones, marcaciones, documentos o membresías.
- Cero cambios de DNS, autenticación, PIN o RLS.

## 11. Riesgos restantes

1. V1 crítica viva para 203 personas con 0 acuses: cualquiera que abra el portal la ve hoy como pendiente destacado.
2. Quedan 7 archivos huérfanos en el bucket privado de la ronda QA anterior.
3. El correo no está conectado a Comunicados: la única vía de aviso es dentro de la aplicación.

## Veredicto

🟡 FIX REQUIRED BEFORE PILOT PREVIEW
