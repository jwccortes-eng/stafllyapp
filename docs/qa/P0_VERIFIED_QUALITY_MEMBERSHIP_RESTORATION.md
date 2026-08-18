# P0 — RESTORE VERIFIED QUALITY MEMBERSHIPS

**Fecha:** 2026-08-18 · **Tipo:** Remediación de producción limitada
**Fuente:** `P0_WORKER_IDENTITY_ACTIVATION_CENSUS.md` + auditoría individual de los 7 workers con turno futuro
**Alcance ejecutado:** 4 filas nuevas en `public.company_users`. Nada más.

---

## 1. Cambio aplicado

Una única fila de membresía por persona en Quality Staff (`00000000-0000-0000-0000-000000000001`), usando el `user_id` y el `employee` existentes:

```
role = 'employee'        (no privilegiado)
operating_role_key = 'worker'   (scope SELF)
ON CONFLICT (company_id, user_id) DO NOTHING
```

No se creó ninguna persona, cuenta auth, ficha de empleado ni PIN. No se tocaron teléfonos, historial, asignaciones, horas, nómina ni documentos.

Total de membresías en el sistema: 88 → **92** (+4, exactamente las esperadas).

---

## 2. Estado post-cambio

| Persona | Employee ID | Auth user | Membresías Quality | Rol | PIN (huella) | Portal | Asignaciones | Time entries | Próximo turno |
|---|---|---|---|---|---|---|---|---|---|
| Carlos Alvarez | `ea1f9ae0…` | `b88a09ef…` | 1 | employee / worker | `41c05aaa…` (sin cambio) | ✅ | 147 | 193 | 2026-08-18 |
| Kevin Velasquez | `f181f849…` | `11cde408…` | 1 | employee / worker | `7d70b0c4…` (sin cambio) | ✅ | 135 | 227 | 2026-08-18 |
| Anderson Vargas | `54cbef12…` | `19c29cf1…` | 1 | employee / worker | `744bf7f2…` (sin cambio) | ✅ | 117 | 46 | 2026-08-18 |
| Juliana Quintero | `f3d4334f…` | `e6c3755a…` | 1 | employee / worker | `5e4354e2…` (sin cambio) | ✅ | 20 | 4 | 2026-08-18 |

La huella del PIN es un hash del hash almacenado (nunca el PIN ni el hash real) y es idéntica antes y después del cambio.

---

## 3. QA obligatorio

| # | Verificación | Carlos | Kevin | Anderson | Juliana |
|---|---|---|---|---|---|
| 1 | Membresía Quality existe exactamente una vez | PASS | PASS | PASS | PASS |
| 2 | Mismo auth user | PASS | PASS | PASS | PASS |
| 3 | Mismo employee / profile | PASS | PASS | PASS | PASS |
| 4 | PIN sin cambios | PASS | PASS | PASS | PASS |
| 5 | Portal habilitado con identidad ligada | PASS | PASS | PASS | PASS |
| 6 | Quality aparece como compañía válida | PASS | PASS | PASS | PASS |
| 7 | Ve solo sus propios turnos (scope SELF, sin permisos de lectura de empresa) | PASS | PASS | PASS | PASS |
| 8 | Sin permisos administrativos (`has_permission(..., 'employees.edit') = false`) | PASS | PASS | PASS | PASS |
| 9 | Asignaciones históricas intactas | PASS (147) | PASS (135) | PASS (117) | PASS (20) |
| 10 | Time entries históricos intactos | PASS (193) | PASS (227) | PASS (46) | PASS (4) |
| 11 | Próximo turno visible (18-ago) | PASS | PASS | PASS | PASS |
| 12 | Otros tenants sin cambios (MyStaff sigue en 14 membresías) | PASS | PASS | PASS | PASS |

Cada uno tiene **una sola membresía en total** (`memb_total = 1`), es decir, ninguna se propagó a otro tenant.

---

## 4. Casos NO tocados (permanecen HUMAN REVIEW)

- **Cristian Contreras** — evidencia operativa mínima (1 hora, alta `Pending approval`).
- **Martin Cossio** — sin auth user; el bloqueo es activación, no membresía.
- **jeancarlos ortiz** — sin auth user ni invitación registrada; validar persona real antes de invitar.

Ninguno recibió cambios de ningún tipo.

---

## 5. Resultado

**PASS × 4** — Carlos Alvarez, Kevin Velasquez, Anderson Vargas y Juliana Quintero quedan habilitados como *worker* en Quality Staff, con identidad, PIN, portal e historial intactos y sin privilegios administrativos.
