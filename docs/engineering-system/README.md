# SES — Stafly Engineering System

**Estado:** En ejecución (SES-001)
**Fecha:** 2026-07-22
**Alcance:** Documentación oficial del ecosistema Stafly + Parceros.

---

## ¿Qué es el SES?

El **Stafly Engineering System (SES)** es la memoria técnica oficial del
ecosistema Stafly + Parceros. Su propósito es que cualquier persona futura
—ingeniería, producto u operaciones— pueda entender el sistema **sin
depender de conocimiento tribal**.

## Principio rector

> **Observe → Understand → Decide → Build → Learn**
>
> **No diagnosis, no surgery.**

Ninguna hipótesis autoriza implementación. Ninguna recomendación es una
decisión. Ninguna decisión existe sin responsable, fecha y evidencia.

---

## Cómo navegar el repositorio

| Área | Propósito |
|------|-----------|
| [STATUS](./STATUS.md) | Estado global de protocolos y próximos pasos |
| [GOVERNANCE](./GOVERNANCE.md) | Reglas de clasificación y gobernanza documental |
| [GLOSSARY](./GLOSSARY.md) | Vocabulario oficial (provisional) |
| [FACTS-HYPOTHESES-DECISIONS](./FACTS-HYPOTHESES-DECISIONS.md) | Separación entre hechos, hipótesis y decisiones |
| [architecture/](./architecture/README.md) | Baseline arquitectónico del ecosistema |
| [capabilities/](./capabilities/README.md) | Capability Atlas |
| [domains/](./domains/README.md) | Índice provisional de dominios |
| [value-streams/](./value-streams/README.md) | Flujos de valor observados |
| [mri/](./mri/README.md) | Minimum Recoverable Investigations |
| [decisions/](./decisions/README.md) | Decision Register y ADRs |
| [risks/](./risks/RISK-REGISTER.md) | Registro de riesgos de comprensión |
| [templates/](./templates/) | Plantillas para MRI, VS, ADR y Domain Sheet |

---

## Diferencia entre hechos, hipótesis, recomendaciones y decisiones

| Símbolo | Categoría | Significado |
|---------|-----------|-------------|
| ✅ | Fact | Evidencia observada y trazable |
| 🟡 | Hypothesis | Explicación plausible sin confirmación total |
| 🔴 | Insufficient Information | Sin evidencia suficiente para clasificar |
| 💡 | Recommendation | Sugerencia; **no** autoriza cambios |
| 🧭 | Decision | Aprobada, con responsable y fecha |
| ⚠️ | Risk | Riesgo de comprensión, no vulnerabilidad |

**Regla dura:** una hipótesis **nunca** puede usarse como verdad productiva.

---

## Estado actual

- EIP-001A — Ecosystem Baseline ✅ aprobado
- EIP-001B — Domain and Capability Discovery ✅ aprobado
- CAP-001 — Ecosystem Capability Atlas ✅ aprobado v1.0
- VS-001 — Request-to-Pay ✅ aprobado con observaciones
- MRI-001 — Attendance-to-Payroll Truth ✅ aprobado
- SES-001 — Knowledge Repository Bootstrap 🟡 en ejecución

Ver [STATUS.md](./STATUS.md) para el detalle.

---

## Cómo actualizar estos documentos

1. Todo cambio debe preservar la separación **Fact / Hypothesis / Unknown**.
2. Los ADR solo se crean cuando existe una decisión **aprobada**.
3. Los MRI no implementan: describen evidencia.
4. No convertir hipótesis en hechos sin nueva evidencia trazable.
5. Actualizar fecha y estado en el encabezado de cada documento tocado.
6. Enlazar mediante rutas relativas.

---

## Prohibición explícita

**No se puede usar una hipótesis de este repositorio como base para
implementación en producto, migraciones, RLS, payroll, invoicing o
integraciones.**

Cualquier salto de "documento" a "código" requiere una decisión formal
registrada en el [Decision Register](./decisions/DECISION-REGISTER.md).
