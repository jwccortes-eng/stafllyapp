# GOVERNANCE — Reglas del SES

**Fecha:** 2026-07-22
**Estado:** Activo.

---

## Clasificaciones oficiales

| Símbolo | Categoría | Uso |
|---------|-----------|-----|
| ✅ | **Fact** | Evidencia observada en código, migración, RPC, log o artefacto trazable. |
| 🟡 | **Hypothesis** | Explicación plausible que requiere confirmación. |
| 🔴 | **Insufficient Information** | Sin evidencia suficiente. |
| 💡 | **Recommendation** | Sugerencia técnica, **nunca** decisión. |
| 🧭 | **Decision** | Aprobada, con responsable, fecha y evidencia. |
| ⚠️ | **Risk** | Riesgo de comprensión (no vulnerabilidad). |

---

## Reglas duras

1. **Los hechos requieren evidencia trazable** (ruta de archivo, migración, RPC, o registro).
2. **Las hipótesis no autorizan implementación.** Ninguna. Nunca.
3. **Las recomendaciones no son decisiones.** Son insumo para deliberación.
4. **Las decisiones requieren:** responsable, fecha, evidencia y estado.
5. **Los ADR se crean solo cuando la decisión está aprobada.** No antes.
6. **Los MRI no implementan.** Solo describen evidencia y riesgos.
7. **La documentación puede estar desactualizada frente al código.** Se cita, se contrasta, no se copia ciegamente.
8. **El uso real no se prueba por existencia de código.** Un módulo puede existir y no ser usado.
9. **Una UI visible no demuestra adopción operativa.** Requiere evidencia de uso.

---

## Reglas semánticas críticas

- **"Payroll preparado" ≠ "trabajador pagado".** Payroll consolidado indica cálculo; no ejecución bancaria.
- **"Invoice marked paid" ≠ "cobro externo conciliado"**, salvo evidencia adicional (webhook, extracto, ACH).
- **"Turno creado" ≠ "turno cubierto"**. Requiere assignment y attendance.
- **"Closeout registrado" ≠ "operación cerrada"**. No hay flag canónico único.

---

## Proceso para modificar documentos

1. Preservar clasificaciones existentes.
2. Actualizar fecha y estado en el encabezado.
3. Enlazar cambios a evidencia trazable.
4. No mezclar recomendaciones dentro de secciones de hechos.
5. No cerrar decisiones abiertas sin ADR aprobado.
