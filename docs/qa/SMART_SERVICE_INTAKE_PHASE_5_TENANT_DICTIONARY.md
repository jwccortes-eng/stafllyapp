# SMART SERVICE INTAKE — FASE 5: TENANT LEARNING DICTIONARY

**Estado:** implementado y verificado
**Alcance:** memoria operativa por compañía para el carril canónico de Smart Service Intake.
**No toca:** payroll, fichajes, tarifas, asignaciones, publicación de servicios.

---

## 1. Qué se construyó

Un diccionario **por compañía** que aprende SÓLO de correcciones humanas confirmadas
y se aplica a **todas las fuentes** del carril canónico (excel, csv, texto pegado /
WhatsApp, imagen, PDF, notas de voz), porque se inyecta en el **único punto de
resolución compartido**: `resolveCandidateEntities`.

No hay pipeline nuevo, ni bandeja nueva, ni modelo paralelo.

```
fuente → candidatos → resolveCandidateEntities (exacto > DICCIONARIO > fuzzy)
       → bandeja compartida (revisión humana) → scheduled_shifts (draft)
                    ↑
       confirmación humana → "¿Recordamos esta corrección?" → diccionario
```

## 2. Piezas

| Pieza | Rol |
| --- | --- |
| `intake_dictionary_rules` | Reglas aprendidas: término, interpretación, tipo, evidencia, confianza, `version` (VWC) |
| `intake_dictionary_events` | Telemetría: `created`, `applied`, `conflict`, `edited`, `deactivated` (sin contenido sensible) |
| `intake_dictionary_upsert_rule` | Único camino de aprendizaje; exige rol owner/admin/manager |
| `intake_dictionary_record_usage` | Evidencia de uso; la confianza sólo crece con aplicaciones reales |
| `versioned_update_intake_dictionary_rule` | Edición administrativa por VWC (PATCH parcial + `expected_version`) |
| `src/lib/intake/dictionary.ts` | Módulo PURO: normalización, lookup, ambigüedad, guardas, conflictos |
| `src/lib/intake/dictionary-store.ts` | Único I/O; edición vía `versionedWrite` |
| `src/lib/intake/text-intake.ts` | Punto único de resolución, ahora con diccionario |
| `RememberCorrectionPrompt.tsx` | "¿Recordamos esta corrección?" tras confirmación humana |
| `src/pages/admin/CompanyDictionary.tsx` | `/app/company-dictionary`: editar, desactivar, ver conflictos |

## 3. Tipos de regla

`venue_alias`, `client_alias`, `service_type_alias`, `role_alias`, `abbreviation`,
`spelling_variant`.

## 4. Orden de resolución (invariante)

1. **Match canónico exacto** contra el catálogo real del tenant — siempre gana.
2. **Diccionario del tenant** — regla activa, no ambigua, confianza ≥ 0.60.
3. **Resolver fuzzy** — sugerencia que exige confirmación humana.
4. **Sugerencia de IA** — suggestion-only (Fases 3 y 4).
5. **Revisión humana** — nada se crea sin ella.

Casos que **nunca** se aplican solos: regla ambigua (dos interpretaciones activas del
mismo término), regla de baja confianza, regla desactivada, regla que apunta a una
entidad que ya no existe en el catálogo.

## 5. Reglas duras

- **Aprendizaje sólo humano.** Ninguna ruta automática escribe reglas.
- **Cero cross-tenant.** `company_id` obligatorio, RLS por pertenencia y RPC con rol.
- **Cero datos personales.** Correos, teléfonos y términos de pago/tarifa se rechazan
  en cliente y en backend (`intake_dictionary_is_sensitive`).
- **Escritura sólo por RPC.** No hay política de INSERT/UPDATE directa sobre la tabla.
- **VWC obligatorio** en toda edición administrativa.

## 6. Confianza

`confidence = (aciertos + 1) / (aciertos + conflictos + 2)`, tope 0.99.
Una regla nueva nace en 0.667 y sube sólo con evidencia real de uso.

## 7. QA ejecutado

### 7.1 Pruebas automáticas
`src/test/smart-service-intake-phase5.test.ts` — **16 en verde**:

| Caso | Resultado |
| --- | --- |
| Normalización idéntica al backend (acentos, símbolos) | ✅ |
| Bloqueo de correos, teléfonos y términos de pago | ✅ |
| Sólo aprende correcciones reales (no texto equivalente) | ✅ |
| Aislamiento: regla de empresa A invisible para B | ✅ |
| Exacto canónico gana sobre diccionario | ✅ |
| Diccionario gana sobre fuzzy y no pide confirmación | ✅ |
| Sin regla, el fuzzy sigue exigiendo confirmación | ✅ |
| Regla huérfana (entidad borrada) no se aplica | ✅ |
| Baja confianza / desactivada no se aplican | ✅ |
| Ambigüedad detectada y devuelta a revisión humana | ✅ |
| Reutilización voz → imagen → PDF → WhatsApp → excel | ✅ |
| Expansión de abreviaciones de tipo de servicio y rol | ✅ |

Regresión: **92/92** de Fases 1–4 en verde. Total intake: **108 pruebas**.

### 7.2 Verificación en runtime (backend real, sesión autenticada)

| Prueba | Resultado observado |
| --- | --- |
| Crear regla nueva | `created`, confianza 0.667, versión 1 |
| Reconfirmar el mismo término escrito distinto (`bm  qa!`) | `reinforced`, confianza 0.750, versión 2 |
| Mismo término con otra interpretación | `conflict` — no se sobrescribe nada |
| Aprender un correo electrónico | `invalid` — rechazado por el backend |
| Registrar uso | `applied`, `usage_count` 1 |
| Edición por VWC con versión correcta | `applied`, versión 4 |
| Edición con versión vieja | `conflict` — nada sobrescrito |
| Patch con `company_id` | `invalid` — campo no editable |
| `PATCH` directo a la tabla vía API | 0 filas afectadas: el valor NO cambió |
| Lectura de reglas | sólo las empresas del usuario autenticado |

### 7.3 UI
`/app/company-dictionary` renderiza con contexto de empresa (cabecera canónica
`OperationalScreenHeader`), muestra estado vacío honesto, pestañas Activos /
Desactivados / Conflictos, búsqueda y edición con diálogo de conflicto compartido.
Sin empresa seleccionada, la ruta cae en el guard estándar.

## 8. Lo que NO hace

- No crea clientes, lugares ni servicios.
- No corrige servicios ya creados retroactivamente.
- No aprende de importaciones sin confirmación humana.
- No comparte nada entre compañías.

---

**Confirmación:** Stafly puede recordar correcciones operativas por compañía y
reutilizarlas en cualquier fuente de Smart Service Intake, sin compartir aprendizaje
entre tenants ni aplicar correcciones ambiguas de forma automática.
