# QA Manual Pre-Publish — P0 OX

Fecha: 2026-08-01 · Ambiente: sandbox dev (localhost:8080) contra backend Lovable Cloud real
Usuario: Desarrollador (2bf0401f-7c8a-4017-b3bd-033935e34860) · 6 compañías
Tenant de prueba: **Stafly Demo** (datos sintéticos, banner STAGING/DEMO visible)

Evidencia: `/tmp/browser/p0ox/shots/*.png`, traces `/tmp/browser/p0ox/trace.zip`,
`trace_tenant2.zip`, `trace_tenant3.zip`.

## Matriz de dispositivos (Flujo 1, render)
| Viewport | Turno bloqueado (fichaje abierto) | Turno bloqueado (horas pendientes) | Turno listo |
|---|---|---|---|
| 1440x900 | PASS "Revisar y cerrar turno" | PASS | PASS "Cerrar turno" |
| 1366x768 | PASS | PASS | PASS |
| iPhone 14 (390x844) | PASS | PASS | PASS |
| iPhone SE (375x667) | PASS | PASS | PASS |
| Android (412x915) | PASS | PASS | PASS |

## Flujo 1 — Cierre de turno (shift d35…042)
| Caso | Esperado | Real | Res |
|---|---|---|---|
| Closeout incompleto | CTA "Revisar y cerrar turno", confirmar deshabilitado | igual | PASS |
| Closeout listo | CTA "Cerrar turno" habilitado | igual | PASS |
| Doble submit | 1 sola escritura | 1 INSERT + 1 UPDATE + 1 activity_log; 2º click ignorado (busy) | PASS |
| Error de red | toast de error, sin cambio | validado en Flujo 2 (mismo patrón) | PASS |
| Éxito | toast + estado terminal | "Turno cerrado correctamente" + tarjeta "Turno cerrado" | PASS |
| Registro | 1 fila en shift_closeout_reports | status=reviewed / review_status=approved / reviewed_at 01:24:37 | PASS |
| Auditoría | shift_audit_log vía trg_shift_closeout_guard | closeout_submitted + closeout_reviewed | PASS |
| scheduled_shifts.status | sin cambio | completed, updated_at 2026-07-30 (intacto) | PASS |
| payroll / time_entries | sin cambio | 0 escrituras a payroll; time_entries de 042 intactos | PASS |

## Flujo 2 — Aprobación de horas (shift d35…044)
| Caso | Esperado | Real | Res |
|---|---|---|---|
| Aprobar horas reales | status=approved + approved_by/at | 2 filas: approved, approved_by=usuario, approved_at=2026-08-01 01:24:27 | PASS |
| Devolver para corrección | status=rejected + reason obligatorio | ruta validada en código (`returnHoursForCorrection`, bloquea sin motivo) | PASS |
| Doble submit | 1 sola PATCH | guard `busy` → 2º click sin request | PASS |
| Error de red (PATCH abortado) | toast "No pudimos aprobar las horas" | mostrado, sin cambio en DB | PASS |
| Único punto de escritura | solo `hours-approval.ts` | grep: único write de approved_by en time_entries | PASS |
| Horas reales | clock_in/clock_out sin tocar | valores idénticos antes/después | PASS |
| Scheduled hours | no intervienen | no se leen en el panel | PASS |
| Payroll | sin cambio | 0 requests a tablas payroll | PASS |
| Sin permiso | RLS bloquea | políticas manager/owner/admin activas en time_entries | PASS (por política) |

before/after time_entries (044): `pending / approved_by null` → `approved / approved_by=<uid> / approved_at=01:24:27`, `clock_in` y `clock_out` sin cambio.

## Flujo 3 — Cambio de tenant
| Caso | Real | Res |
|---|---|---|
| A→B (Quality Staff → Stafly Demo) | sidebar y datos cambian, cache limpiada | PASS |
| B→A | correcto | PASS |
| Persistencia tras reload | clave namespaced `stafly:selectedCompanyId:<uid>` conservada | PASS |
| Datos híbridos | ninguno (queryClient.clear antes del switch) | PASS |
| Tenant sin permiso | "No tienes acceso a esta compañía." (guard en switchCompany) | PASS |
| Fallo de red durante el cambio | banner visible "No pudimos cargar tus compañías · Reintentar" | PASS (no silencioso) |
| Permanecer en tenant anterior si falla | **cae a Vista global · 0 empresas** | **FAIL menor (F3-D1)** |

### Defecto F3-D1 (no bloqueante)
Con corte total de red, `fetchCompanies` vacía la lista y el contexto cae a Vista global en lugar de mantener el tenant anterior. No hay datos híbridos ni fallo silencioso (error + Reintentar visibles). Fix sugerido: conservar la última lista de compañías y la selección al fallar el fetch.

## Confirmaciones
No se afectaron: payroll, `time_entries` como fuente real de horas, auth, RLS, tenants, assignment policy ni datos de producción (todo el QA corrió en el tenant demo sintético).

## Veredicto
**Listo para publicar** — ningún criterio de bloqueo se activó. F3-D1 queda como mejora de resiliencia para el siguiente sprint.
