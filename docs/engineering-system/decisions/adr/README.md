# ADR — Architecture Decision Records

**Fecha:** 2026-07-22
**Estado:** Vacío. Ningún ADR aprobado a la fecha.

---

## ¿Qué es un ADR?

Un **Architecture Decision Record** documenta una decisión de arquitectura
**ya aprobada**, con contexto, alternativas evaluadas, consecuencias y
riesgos.

## Cuándo crear un ADR

- Cuando una decisión de la [DECISION-REGISTER](../DECISION-REGISTER.md) ha
  sido aprobada por el owner.
- Cuando exista evidencia suficiente (MRI) para respaldarla.
- Cuando la decisión cambie el comportamiento del sistema.

## Cuándo NO crear un ADR

- Para registrar una recomendación.
- Para "reservar" una idea sin decisión.
- Para documentar hipótesis o hallazgos (esos van en MRI).
- Durante SES-001 (bootstrap): **no se crean ADR concretos**.

## Estados posibles

- **Proposed** — Propuesto para deliberación.
- **Accepted** — Aprobado y vigente.
- **Superseded** — Reemplazado por otro ADR.
- **Rejected** — No aprobado.
- **Deprecated** — Ya no aplica.

## Template

Usar [ADR-TEMPLATE](../../templates/ADR-TEMPLATE.md).
