---
name: Estado de persona en 4 dimensiones
description: resolvePersonStatus como única verdad de identidad, portal, cumplimiento y asignabilidad; prohibido inferir una dimensión desde otra
type: feature
---
`src/lib/people/person-status.ts` → `resolvePersonStatus` es la única fuente de verdad para el
estado de una persona. Cuatro dimensiones SIEMPRE separadas y etiquetadas:

1. IDENTITY (VERIFIED · PENDING_IDENTITY · POSSIBLE_DUPLICATE · HISTORICAL · REVIEW_REQUIRED)
2. PORTAL (PORTAL_ACTIVE · INVITED · ACCESS_REPAIR_REQUIRED · NO_PORTAL) — vía `resolvePortalStatus`
3. COMPLIANCE (COMPLIANT · MISSING_DOCS · EXPIRED_DOCS · REVIEW_REQUIRED · UNKNOWN)
4. ASSIGNABILITY (ASSIGNABLE · ASSIGNABLE_WITH_WARNING · BLOCKED) + `reason`/`reasons[]`

Reglas: portal activo NO implica asignable; missing/expired docs NUNCA bloquean solos;
invited no implica bloqueo; possible duplicate solo bloquea sin resolver y siempre con razón.
Presentación única: `src/components/employee/PersonStatusMatrix.tsx`.
Reporte: `docs/qa/P0_PERSON_STATUS_ASSIGNABILITY_TRUTH.md`.
