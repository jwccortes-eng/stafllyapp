# Changelog — Stafly

## 2026-07-06 — Desktop responsive polish (AdminLayout)

- **AdminLayout main container**: padding escalonado `p-3 sm:p-4 lg:p-6 xl:p-8` (más compacto en laptops pequeñas 1280–1366, más aire en monitores grandes).
- **Ancho máximo**: `max-w-[1600px]` con extensión `2xl:max-w-[1760px]` para monitores 1920+; contenido centrado con `mx-auto`.
- **Anti-overflow**: agregado `min-w-0` en `<main>` y wrapper interno + `overflow-x-hidden` en el shell para evitar scroll horizontal global cuando una tabla/card hija empuja el ancho. Tablas internas mantienen su propio `overflow-x-auto` (verificado en DocumentsCenter).
- **Sin cambios**: lógica de negocio, payroll, time_entries, shift_assignments, scheduled_shifts, documents review, employee_documents, contractor_w9, payments, bookings, chat, auth, RLS, tenants, datos reales, migraciones, mobile layout (mobile shell no tocado).
- **QA visual**: breakpoints objetivo 1280/1366/1440/1920/2560; mobile 390x844 intacto (rama `isMobile` no modificada).


## 2026-07-06 — Document Review v1 (Internal Admin Ready) + W-9 guardrail

- **Release**: Document Review v1 publicado como release interno/admin-only.
  - No se anuncia a clientes reales como compliance completo todavía.
- **W-9 guardrail**: En Documents Center, documentos `category='w9'` pueden visualizarse (preview + historial), pero los botones Aprobar/Rechazar están ocultos en el flujo genérico hasta que exista la Fase W-9 formal.
- **W-9 ya aprobados**: Los 2 documentos W-9 aprobados en Quality Staff durante QA quedan auditados en `document_review_events`; no se hace rollback.
- **contractor_w9**: No fue tocado por este guardrail ni por Document Review v1.
- **Superficie sin impacto confirmada**: payroll, time_entries, shift_assignments, scheduled_shifts, contractor_w9, payments, bookings, chat, onboarding_status, RLS (salvo la nueva tabla document_review_events), triggers de negocio existentes, datos productivos reales.

### Backlog documentado (no retomar hoy salvo bug crítico)
1. Fase W-9 formal (flujo dedicado).
2. Backend guardrail W-9 cuando exista el flujo formal.
3. Worker demo real QA (login físico confirmando que no ve Aprobar/Rechazar ni historial interno).
4. Checklist humano en modal de revisión antes de aprobar/rechazar.
5. Historial de revisión en Worker Profile.
6. Government ID front/back si se decide como requisito.
