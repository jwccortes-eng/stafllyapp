# P0.1 — CANONICAL PERSON RESOLUTION LAYER (SHADOW MODE)

Fecha: 2026-09-15 · Modo: SOLO LECTURA · Fusiones: 0 · Escrituras de contacto: 0 · Escrituras de nómina: 0

---

## 1. EXISTING IDENTITY AUTHORITY

No se crea tabla maestra nueva. El esquema actual ya soporta la resolución canónica:

| Autoridad | Entidad existente | Notas |
|---|---|---|
| Persona canónica | `employees.user_id` (cuenta auth) → si no existe, contacto verificado normalizado → si no, ficha viva | clave estable `account:` / `phone:` / `email:` / `employee:` |
| Relación con la empresa | fila de `employees` (`company_id`) | una persona puede tener varias, una por empresa |
| Contacto | fila de `employees` de ESA empresa | nunca se toma contacto de otra empresa |
| Cuenta | `employees.user_id` | autoridad de portal/acceso |
| Verificación | `identity_status`, `photo_review_status`, flags existentes de la ficha | sin cambios |
| Alias / legado | `employees.merged_into_employee_id` + `employee_aliases` | vínculo histórico explícito |

Reutiliza y complementa `src/lib/identity/identity-set.ts` (expansión de lectura por fusión) y `src/lib/identity/person-truth.ts` (señales de duplicado).

## 2. CANONICAL MODEL

```text
PERSONA CANÓNICA (cuenta / contacto verificado)
  └── RELACIÓN CON EMPRESA (employees.company_id)
        ├── datos operativos, asignaciones, fichajes
        ├── nómina, documentos, permisos
        └── fichas alias / legado (merged_into_employee_id)
```

Identidad compartida ≠ nómina, permisos o datos compartidos. La operativa jamás se aplana entre empresas.

## 3. SHADOW RESOLVER

`src/lib/identity/canonical-person.ts` (puro + lectura), hook `src/hooks/useCanonicalPerson.ts`.

Devuelve: `person_key`, `canonical_employee_id`, `company_id`, `account_user_id`, contacto canónico permitido, lista de registros con rol (`canonical` / `alias` / `legacy` / `inactive_relationship` / `other_company_relationship`), conteo de vínculos, estado de revisión y evidencia.

Confianza: `CONFIRMED_SAME_PERSON`, `POSSIBLE_SAME_PERSON`, `DISTINCT_PERSON`, `INSUFFICIENT_EVIDENCE`.
Evidencia fuerte: misma cuenta, vínculo de fusión explícito, mismo teléfono normalizado, mismo correo. El nombre solo es evidencia débil y nunca confirma.

## 4. DANIEL OCHOA RESULT

| Ficha | Empresa | Teléfono | Cuenta | Rol resuelto |
|---|---|---|---|---|
| `751d864f…` | Quality Staff | 6317037813 | `de4b4faa…` | canonical |
| `629d0b49…` | Quality Staff | — | — | legacy (fusionada al canónico) |
| `c2897e98…` | Parceros | — | — | other_company_relationship (solo conteo) |

- Desde Home, Reloj, Perfil, Búsqueda y superficies de nómina el resolver devuelve la misma `person_key` (`account:de4b4faa…`) y el mismo `canonical_employee_id`.
- Quality Staff conserva el teléfono válido: se lee del registro canónico de esa empresa, sin copiar valores.
- La ficha de Parceros no aporta ni recibe contacto en el contexto de Quality Staff.
- El error de activación provenía de operar sobre la ficha legado/inactiva; el resolver siempre apunta la escritura al canónico.

## 5. ANGEL COLON RESULT

`CONFIRMED_SAME_PERSON` — mismo teléfono normalizado (3473132118) y mismo correo.

Relación canónica propuesta (para una reconciliación controlada futura, NO ejecutada):
- Canónica: `50f5c5ac…` (activa, con cuenta de portal).
- Alias/relación inactiva: `24c83018…`.
- Residuos de importación sin contacto: `8cc898ae…`, `52f25b1e…`, `4eff2314…` → candidatos a `legacy`.
- `01ca0ff7…` (Parceros) queda como relación de otra empresa, nunca fusionable con la operativa de Quality Staff.

Sin fusión, sin borrado, sin cambios de nómina.

## 6. EDINSON LEON RESULT

`POSSIBLE_SAME_PERSON` — únicamente nombre. `ef4e5966…` tiene teléfono y correo; `d04a3506…` no tiene ningún dato de contacto.
Evidencia humana requerida: teléfono o correo del registro vacío, o confirmación directa de la persona / del supervisor que la contrató.

## 7. FRANCISCO PATINO RESULT

`POSSIBLE_SAME_PERSON` — únicamente nombre. `82e58682…` tiene teléfono, correo y cuenta; `1f61628f…` está vacío.
Misma evidencia humana requerida. Sin decisión automática.

## 8. CONTACT-INCOMPLETE SEMANTICS

Cuatro estados separados y no intercambiables:

- `CONTACT_INCOMPLETE`: falta teléfono válido (10 dígitos). Acción: completar contacto.
- `IDENTITY_CONFLICT`: mismo contacto con cuentas de acceso distintas.
- `POSSIBLE_DUPLICATE`: evidencia insuficiente, requiere revisión humana.
- `CONFIRMED_DUPLICATE`: evidencia fuerte, requiere reconciliación controlada.

Las 211 personas activas sin teléfono son `CONTACT_INCOMPLETE`, no duplicados.

## 9. SHARED-CONTACT REVIEW

7 grupos comparten correo y 2 comparten teléfono dentro de la misma empresa. Se exponen solo como candidatos a revisión. Contacto compartido con cuentas distintas se clasifica `IDENTITY_CONFLICT` y nunca dispara acción destructiva.

## 10. LEGACY RECORD STRATEGY

- `canonical`: ficha viva de la empresa; único destino de escrituras.
- `alias`: ficha activa vinculada por evidencia fuerte, pendiente de reconciliación.
- `legacy`: ficha fusionada (`merged_into_employee_id`); conserva historia, no compite en búsqueda ni en asignación.
- `inactive_relationship`: relación cerrada con esa empresa.
- `other_company_relationship`: existe pero no aporta datos en este contexto.

Sin migración en esta fase.

## 11. TENANT / RLS SAFETY

El resolver lee `employees` con el cliente autenticado, por lo que RLS aplica íntegro. El contacto y los roles operativos se calculan solo dentro del `company_id` solicitado; de otras empresas se expone únicamente el conteo. Conocer la identidad entre empresas no otorga acceso operativo.

## 12. PAYROLL ZERO-WRITE CONFIRMATION

Cero escrituras en `movements`, `period_base_pay`, `time_entries`, `shift_assignments`, statements o períodos. Los períodos 138 y 148 quedan idénticos. El resolver solo explica que el mismo monto quedó atribuido a dos fichas de la misma persona por dos vías de ingesta.

## 13. FUTURE CONTROLLED RECONCILIATION PLAN

1. Confirmación humana de Angel Colon (ya `CONFIRMED`), Edinson y Francisco.
2. Marcar alias/legado con el vínculo existente `merged_into_employee_id`, sin borrar filas.
3. Reatribuir movimientos duplicados solo tras decidir qué vía de ingesta es autoritativa por período.
4. Recalcular diferencia de 138 y 148 y dejar constancia auditable.
5. Activar la resolución canónica fuera de modo sombra en búsqueda y activación.

## QA

- 14 pruebas específicas de la capa canónica (Daniel desde ficha viva y legado, Angel, Edinson, Francisco, contacto incompleto, aislamiento de empresa, sin vinculación accidental).
- Suite completa y verificación de tipos en verde.

---

**FINAL VERDICT: 🟡 IDENTITY MODEL DEFINED — MORE HUMAN EVIDENCE REQUIRED**
