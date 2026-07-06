# Changelog — Stafly

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
