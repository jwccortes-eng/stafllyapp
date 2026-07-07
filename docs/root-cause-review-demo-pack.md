# Root-Cause Review · Demo Pack

**Sprint 20** · Empaquetado operativo del circuito Payroll Dry Run →
Root-Cause Explorer → Time Clock / Attendance / Shifts / Payroll Review Queue.
Documentación pura, **read-only end-to-end**.

> Este documento es la referencia única para producto, QA manual, onboarding
> de admins y demos comerciales. No cubre implementación interna — para eso
> ver los sprints 11–19 en el historial de cambios.

---

## 1. Resumen ejecutivo

Stafly detecta anomalías en payroll durante el **Dry Run** (simulación sin
impacto). Cada anomalía tiene una **causa raíz** con evidencia. Desde el
**Root-Cause Explorer** el operador hace un click y aterriza en el módulo
correcto (Time Clock, Attendance, Shifts o Review Queue) con el **día,
empleado, entry o turno correcto ya enfocado**. El circuito completo es
**solo navegación** — nada se aprueba, edita, exporta ni recalcula.

Objetivo de negocio: cerrar el loop entre "detectar" y "revisar" sin que el
admin tenga que buscar manualmente por fechas, IDs o nombres.

## 2. Problema que resuelve

Antes: el admin veía "hay 12 diferencias en este dry-run" y tenía que abrir
5 pestañas, filtrar por fecha, buscar al empleado y comparar a ojo.

Ahora: cada diferencia lleva un CTA con contexto completo. El módulo destino
abre en el día correcto, hace scroll a la fila correcta y la resalta. Si el
elemento no existe en el rango cargado, muestra un fallback ámbar claro en
vez de fallar silenciosamente.

## 3. Módulos conectados

| Origen                                | Destino(s)                              |
| ------------------------------------- | --------------------------------------- |
| Payroll Dry Run → Root-Cause Explorer | Time Clock, Attendance, Shifts, Review Queue |
| Root-Cause Explorer                   | Time Clock (`/app/timeclock`)           |
| Root-Cause Explorer                   | Attendance (`/app/attendance`)          |
| Root-Cause Explorer                   | Shifts (`/app/shifts`)                  |
| Root-Cause Explorer                   | Payroll Review Queue (`/app/payroll-review-queue`) |

## 4. Params por módulo (contrato de deep-link)

Todos los params son **inocuos**: sólo controlan navegación y foco visual.
Ninguno dispara escrituras.

### Time Clock — `/app/timeclock`
| Param        | Uso                                                    |
| ------------ | ------------------------------------------------------ |
| `date`       | `YYYY-MM-DD` — carga día histórico o futuro permitido  |
| `filter`     | `needs-review` \| `open` \| `abnormal` — pre-filtra    |
| `time_entry` | UUID — enfoca fichaje (scroll + badge "foco")          |
| `shift`      | UUID — enfoca turno relacionado                        |
| `when`       | `today` \| `historical` — hint informativo             |

### Attendance — `/app/attendance`
| Param        | Uso                                                    |
| ------------ | ------------------------------------------------------ |
| `date`       | `YYYY-MM-DD` — día a mostrar                           |
| `employee`   | UUID — enfoca empleado                                 |
| `time_entry` | UUID — enfoca fila de fichaje                          |
| `when`       | `today` \| `historical` — hint informativo             |
| `filter`     | Passthrough al filtro operativo si aplica              |

### Shifts — `/app/shifts`
| Param     | Uso                                                       |
| --------- | --------------------------------------------------------- |
| `date`    | `YYYY-MM-DD` — vista día                                  |
| `shift`   | UUID — abre `ShiftDetailDialog` (alias: `shiftId`)        |
| `shiftId` | Alias de `shift` (compatibilidad)                         |
| `tab`     | Tab inicial del dialog (`details`, `attendance`, etc.)    |
| `when`    | Hint informativo                                          |

### Payroll Review Queue — `/app/payroll-review-queue`
| Param      | Uso                                                     |
| ---------- | ------------------------------------------------------- |
| `period`   | UUID `pay_periods.id` — resuelve fuera de rango si hace falta |
| `bucket`   | Slug de bucket a expandir (`open-entries`, `overlap`, …) |
| `employee` | UUID — enfoca worker en la cola                         |
| `explore`  | Alias de `employee` desde Root-Cause Explorer           |
| `reason`   | Reason key (ver §5) — banner "Causa raíz: <label>"     |

## 5. Causas raíz (reason labels)

Fuente única: `src/utils/reviewNavigationCopy.ts` (`REVIEW_REASON_LABELS`).

| Key                          | Label humano                     | Qué significa                                                    |
| ---------------------------- | -------------------------------- | ---------------------------------------------------------------- |
| `open_entries`               | Fichajes abiertos                | Time entries sin `clock_out` que afectan el período              |
| `no_shift_link`              | Fichajes sin turno               | Fichaje nativo sin `scheduled_shift` asociado                    |
| `overlap`                    | Entradas solapadas               | Dos fichajes del mismo empleado se pisan                         |
| `abnormal_duration`          | Duración anormal                 | Fichaje con duración fuera del rango razonable                   |
| `midnight_cross`             | Cruce de medianoche              | Fichaje atraviesa 00:00 y necesita split de día                  |
| `missing_pbp`                | Sin reconciliación PBP           | No hay Payroll-By-Period para ese worker/período                 |
| `no_native_entries`          | Sin fichajes nativos             | Worker sin fichajes nativos cerrados en el período               |
| `delta_critical_unexplained` | Diferencia crítica sin explicar  | Delta payroll grande sin causa mapeada                           |

## 6. Cómo probar Time Clock

1. Ir a `/app/payroll-native-dry-run`, abrir el **Root-Cause Explorer** de
   un worker con `open_entries` o `abnormal_duration`.
2. Click en el CTA "Ver fichaje en Time Clock" de una entrada.
3. **Verificar**:
   - URL contiene `date=`, `time_entry=`, opcional `shift=`.
   - Banner: **"Abierto desde revisión"** (o **"No encontrado en el rango cargado"** si es sintético).
   - Si el día ≠ hoy: KPIs muestran "Fichajes del día" / "Horas registradas del día".
   - Si encontrado: fila con badge **"foco"** visible y scroll automático.
   - Botón **"Volver a hoy"** cuando aplica.

## 7. Cómo probar Attendance

1. Desde Root-Cause Explorer, CTA "Ver en Attendance" de una fila.
2. **Verificar**:
   - URL contiene `date=`, `employee=` y/o `time_entry=`.
   - Banner **"Abierto desde revisión"** o fallback ámbar.
   - Fila del empleado con badge **"foco"**.
   - Nota **"Solo navegación: no modifica payroll"** visible.

## 8. Cómo probar Shifts

1. Desde Root-Cause Explorer, CTA "Ver turno" en una anomalía con
   `no_shift_link` o `overlap`.
2. **Verificar**:
   - URL contiene `date=`, `shift=` (o `shiftId=`), opcional `tab=`.
   - **ShiftDetailDialog** abre automáticamente en el turno.
   - Toast **"Abierto desde revisión — Solo navegación: no modifica payroll"**.
   - Si el turno no existe en el rango: toast warning **"Turno no encontrado en el rango cargado"**.

## 9. Cómo probar Payroll Review Queue

1. Desde Root-Cause Explorer, CTA "Abrir en Review Queue" con reason.
2. **Verificar**:
   - URL contiene `period=`, `employee=` (o `explore=`), `reason=`.
   - Si `period` no está en la ventana cargada: se resuelve puntualmente y
     aparece el banner **"Abierto desde revisión"**; si no se puede resolver,
     banner ámbar **"No encontrado en el rango cargado · mostrando período por defecto"**.
   - Segundo banner: **"Abierto desde revisión · Causa raíz: <label humano>"**.
   - El bucket relevante se auto-expande, la fila del worker recibe badge **"foco"**.
   - Nota **"Solo navegación: no modifica payroll"** al final del banner.

## 10. "Solo navegación: no modifica payroll"

Copy estándar (fuente: `REVIEW_COPY.readOnlyNote`). Aparece en cada consumer
para dejar explícito que el circuito completo **no**:

- aprueba, cierra, publica o finaliza payroll,
- edita, elimina o mueve `time_entries` / `scheduled_shifts` / `shift_assignments`,
- modifica `pay_periods`, `payroll_*`, `movements`, `reconciliation_*`, `compensation_*`, `payroll_rate_snapshots`,
- dispara RPC, edge functions, migraciones ni storage writes,
- toca auth, RLS o tenants.

Es puramente `SELECT` + navegación cliente-side + resalto visual.

## 11. Checklist QA mobile (390×844)

- [ ] Banners "Abierto desde revisión" caben en una línea o hacen wrap sin overflow.
- [ ] Badge **"foco"** visible junto al nombre sin romper el card.
- [ ] Fallback ámbar legible (contraste ≥ AA) sobre `bg-warning/10`.
- [ ] Nota "Solo navegación…" no ocupa más de 2 líneas.
- [ ] Toast de Shifts no tapa el botón cerrar del dialog.
- [ ] No hay charts nuevos, no hay tablas densas nuevas.
- [ ] Time Clock KPIs "Fichajes del día" / "Horas del día" truncan bien.
- [ ] Review Queue: bucket expandido no fuerza scroll horizontal.

## 12. Checklist QA desktop (1366 / 1440)

- [ ] Root-Cause Explorer: CTAs claros, sin duplicar botones.
- [ ] Time Clock: banner + KPI strip no empujan la tabla debajo del fold más de lo esperado.
- [ ] Attendance: fila enfocada con ring primary y `bg-primary/5`.
- [ ] Shifts: dialog abre sobre el listado, foco navegable con teclado.
- [ ] Review Queue: bucket + worker foco visibles sin scroll manual.
- [ ] Copy uniforme entre módulos (mismo string "Abierto desde revisión").
- [ ] Volver a "hoy" restaura vista por defecto y limpia `date=` de la URL.

## 13. Checklist de seguridad

- [ ] Todo el circuito es `SELECT`-only.
- [ ] No hay `POST`/`PATCH`/`PUT`/`DELETE` contra tablas sensibles
      (`time_entries`, `scheduled_shifts`, `shift_assignments`, `pay_periods`,
      `payroll_*`, `movements`, `reconciliation_*`, `compensation_*`,
      `payroll_rate_snapshots`).
- [ ] Todas las queries llevan `company_id = selectedCompanyId`.
- [ ] Resolver de período (S16) también scoped por `company_id`.
- [ ] Params de URL son inocuos: sólo IDs de foco y fechas.
- [ ] No se ejecutan RPCs, edge functions, migraciones ni storage writes.
- [ ] Harness Playwright falla si algún request mutante llega a esas tablas
      (network guard en `tests/e2e/root-cause-deeplinks.spec.ts`).

## 14. Guion de demo comercial (~90 seg)

> **"Detectar es fácil. Revisar era el cuello de botella."**
>
> 1. Abro **Payroll Dry Run**. Stafly encontró 8 diferencias en este período.
> 2. Click en una worker. El **Root-Cause Explorer** me dice exactamente
>    qué pasó: "Entradas solapadas el martes 03/06".
> 3. Un click en "Ver en Time Clock". Aterrizo en el día correcto,
>    con la fila resaltada en primary y badge **foco**. No busqué nada.
> 4. Otro click en "Ver turno". Se abre el **detalle del turno** con
>    contexto — nada se editó, solo se abrió.
> 5. Vuelvo al Dry Run, click en "Revisar en cola". Estoy en la
>    **Review Queue**, período correcto, bucket "Entradas solapadas"
>    ya abierto, worker enfocado.
> 6. En todo momento arriba dice **"Solo navegación: no modifica payroll"**.
>    Nada se aprobó, exportó ni recalculó.
>
> **Cierre:** "Cerramos el loop entre encontrar el problema y verlo en
> contexto en menos de 5 segundos, y sin riesgo de tocar payroll por error."

## 15. Limitaciones conocidas

- **Foco por worker en Review Queue** funciona sólo para buckets que exponen
  `employeeId` en sus rows. Buckets basados en estados complejos de shift
  (ej. `pendiente-cierre`) no exponen worker individual.
- **Resolver de período (S16)** carga el período pedido pero no rellena
  `pbpCounts` para él — puede aparecer con contadores vacíos.
- **Time Clock histórico** respeta `date=` pero no re-abre ventanas de
  semanas completas hacia atrás; días muy antiguos pueden verse vacíos si el
  worker no tenía fichajes.
- **Harness Playwright** requiere `E2E_STORAGE_STATE_B64` en CI para
  autenticarse. Sin él, cubre sólo las pantallas públicas y no valida
  banners/fallbacks reales.
- **Shifts** no muestra banner global — sólo toast; decisión consciente
  para no duplicar contexto con el dialog abierto.
- **PayrollNativeDryRun** y **BatchTrendPanel** aún tienen `REASON_LABEL`
  locales (mismos strings). Migración a fuente única es candidata futura.

## 16. Cómo correr el harness (Playwright / CI)

Detalles completos en [`tests/e2e/README.md`](../tests/e2e/README.md).

**Local (baseline, sin IDs reales):**
```bash
bun install
bunx playwright install chromium
bunx playwright test
```

**Local con IDs QA:**
```bash
E2E_BASE_URL=https://<qa-preview>.lovable.app \
E2E_STORAGE_STATE=./.playwright/auth.json \
E2E_PAY_PERIOD_ID=... \
E2E_EMPLOYEE_ID=... \
E2E_TIME_ENTRY_ID=... \
E2E_SHIFT_ID=... \
bunx playwright test --project=desktop --project=mobile
```

**CI:** workflow `.github/workflows/root-cause-e2e.yml`. Corre en
`workflow_dispatch`, nightly cron, y PRs que tocan el harness. Sube
`playwright-report/` y `test-results/root-cause/**` como artifacts.
Rechaza correr contra `staflyapps.com` / `staflyapp.lovable.app`.

Secrets requeridos (QA/staging únicamente):
`E2E_BASE_URL`, `E2E_STORAGE_STATE_B64`, `E2E_COMPANY_ID`,
`E2E_PAY_PERIOD_ID`, `E2E_EMPLOYEE_ID`, `E2E_TIME_ENTRY_ID`,
`E2E_SHIFT_ID`, `E2E_TARGET_DATE`.

---

**Historial:** Sprints 11–19. Este pack (S20) es documentación pura y no
introduce código en `src/`.
