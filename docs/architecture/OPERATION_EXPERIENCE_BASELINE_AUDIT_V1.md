# OPERATION EXPERIENCE (OX) — BASELINE AUDIT V1

**Fecha:** 2026-08-01
**Tipo:** Report-only (cero cambios de código, cero migraciones, cero mutaciones)
**Alcance:** Experiencia operacional completa de Stafly (Worker Mobile, Captain, Dispatcher, Payroll, Owner Desktop)
**Método:** Inspección estática del código (rutas, componentes, handlers, copys, tokens). Los conteos de clics son inferidos de la estructura de componentes, no medidos con usuarios reales.

---

## 1. Resumen ejecutivo

Stafly ya **no** es una app de gestión de personal: la capa de decisión (Assign Workers, Compliance vs Operation, Team Hub, Operational Signals, Shadow Notifications) es de nivel sistema operativo. La brecha ya no está en capacidad, está en **coherencia de experiencia**.

Tres hallazgos estructurales dominan esta línea base:

1. **Dos generaciones de UI conviven.** El Worker Portal es la superficie más madura (tokens `stafly-ui`, i18n `useT()`, patrón Next-Best-Action, densidad baja). El admin móvil y el admin desktop arrastran patrones anteriores: clases Tailwind ad-hoc, copys hardcodeados en inglés, diccionarios de texto paralelos (`MOBILE_SHIFT_COPY`), tokens deprecados aún exportados (`mobile-admin-tokens.ts`).
2. **Las acciones terminales no existen donde el usuario las busca.** "Cerrar turno" y "Aprobar horas" no tienen botón terminal en ninguna pantalla: Shift Ops sólo deep-linkea, y el "Centro de Validación" (`PayrollReviewQueue`) es explícitamente read-only. La etiqueta promete una acción que el código no realiza.
3. **El sistema habla como base de datos.** `toast.error(error.message)` propaga mensajes crudos de Postgres/Supabase al usuario final en 20+ puntos, mezclado con inglés dentro de una interfaz mayoritariamente en español.

**Veredicto de línea base:** Stafly **muestra** la operación con precisión notable; todavía **no la conduce** de extremo a extremo. El worker ya vive en un producto premium; el operador y el owner todavía viven en un panel de control.

**Puntuación global OX V1: 6.4 / 10** (Mobile Worker 8.0 · Mobile Admin 5.5 · Desktop 5.5).

---

## 2. Evaluación por tipo de usuario

### 2.1 Worker (Mobile) — **8.0 / 10** · la superficie más fuerte

| Pregunta | Respuesta | Evidencia |
|---|---|---|
| ¿Entiende qué debe hacer? | **Sí.** `NextBestActionCard` resuelve una sola acción prioritaria entre ~9 estados posibles | `EmployeeDashboard.tsx:402`, `lib/portal/next-best-action.ts` |
| ¿Encuentra su próximo turno sin buscar? | **Sí.** `WorkerHero` + `TodayBlock` + lista "Próximos turnos" (cap. 3) | `EmployeeDashboard.tsx:389-413` |
| ¿Sabe dónde ir? | **Sí.** Meeting point visible en 3 capas (Home, drawer, detalle) | `TodayBlock.tsx:29`, `PortalShiftDetail.tsx:41` |
| ¿Sabe con quién hablar? | **No con claridad.** Chat fracturado: widget flotante global + página `/portal/chat` huérfana, no enlazada desde bottom nav ni More sheet | `EmployeeLayout.tsx:210` vs `App.tsx:463` |
| ¿Puede hacer check-in fácilmente? | **Sí.** 2 taps; auto-preselección del turno cuando hay uno solo accionable | `PortalClock.tsx:328-333` |
| ¿Transmite confianza? | **Alta.** Skeletons, guards de perfil faltante, banners inline de error, recuperación de fichajes abiertos de días previos | `EmployeeDashboard.tsx:310-337`, `PortalClock.tsx:289-323` |
| ¿Información innecesaria? | **Poca.** `ProfileReadinessStrip` + `PortalUpdateBanner` + NBA pueden solaparse y competir por la misma atención | `EmployeeDashboard.tsx:399-410` |

**Fricción residual:** dos implementaciones de detalle de turno (`PortalShiftDetailDrawer.tsx` 493 líneas vs `PortalShiftDetail.tsx` 447 líneas) que deben sincronizarse a mano; dos entradas redundantes a pagos (QuickAction + More sheet).

### 2.2 Captain / Supervisor (Mobile) — **6.0 / 10**

- **¿Puede operar un turno sin navegar entre pantallas?** Parcialmente sí: `MobileShiftOperationsSheet.tsx` (2.100 líneas) concentra cobertura, workers asignados, asistencia, detalles, notas, compartir/exportar, notificaciones y trazabilidad en un solo sheet.
- **Coste:** ese mismo sheet es el componente más pesado de la app y está **escondido detrás de un tap de fila**, sin entrada directa desde el home admin móvil.
- **Falta:** acción terminal de cierre de turno; envío de mensaje real al equipo (las "notas" tipo `text_message`/`call_log` sólo registran internamente — riesgo de que el capitán crea que envió algo).
- **Sobra:** secciones de trazabilidad/auditoría en la misma superficie donde se opera en vivo.
- **Debería estar inmediato:** marcar asistencia, pedir reemplazo, avisar retraso, abrir chat del turno.
- **Inconsistencia:** `MOBILE_SHIFT_COPY` es un diccionario de textos paralelo al sistema `useT()` del portal — el capitán ve un idioma/tono distinto al del worker.

### 2.3 Dispatcher / Operations — **6.0 / 10**

- **Asignar worker:** ≈2-3 clics una vez dentro del turno (`ShiftOperations.tsx:569-579`, `ShiftOpsBlocks.tsx:398`), sin confirmación adicional. **Es el flujo mejor resuelto del admin.**
- **Carga cognitiva alta:** `ShiftOperations.tsx` (1.005 líneas) muestra hasta 7-9 bloques simultáneos en fases `after/closed`, reordenados dinámicamente por fase (`:654-696`) más 3 badges de estado en el header (`:419-472`).
- **Demasiados clics:** llegar al turno correcto. El sidebar (~40 enlaces, 7 secciones) es la causa raíz de que casi todo flujo tome 3+ clics.
- **Botones fantasma:** "Publicar", "Ver historial/audit", "Ver impacto en payroll" están visibles pero deshabilitados con "Próximamente" (`ShiftActionBar.tsx:167-178, 220-225`) — expectativa rota en producción.
- **Automatizable:** sugerir reemplazo ante rechazo, elevar turnos con cobertura incompleta a <24h, pre-asignar candidatos recomendados de un tap.

### 2.4 Payroll / Administration — **5.0 / 10** · el punto más débil

- `PayrollReviewQueue.tsx:1-18` declara **READ-ONLY: no writes, no period locking, posting or approval**. Agrega 12 buckets desde 10+ tablas.
- **Desalineación crítica etiqueta ↔ función:** se llama "Centro de Validación" y no valida. El usuario de payroll cree estar en el lugar correcto para aprobar y no lo está.
- **No existe un botón terminal** de "aprobar horas" ni "cerrar período" en el recorrido auditado; el cierre real vive disperso (probablemente `PayrollPilotClose` / `WeeklyPayrollReconciliation`).
- **Rutas duplicadas:** "Reconciliation" y "Weekly Recon." apuntan al mismo dominio (`AdminSidebar.tsx:141-142`, `nav-items.ts:70,74`).
- **Lenguaje:** buckets con notas de arquitectura interna filtradas al usuario ("Solo visual — no modifica pagos ni fichajes", `:862`).

### 2.5 Owner / Company Manager (Desktop) — **5.5 / 10**

- **¿Qué necesita saber primero?** `CommandCenterHub` acierta el set: Turnos hoy, Respuestas pendientes, Relojes abiertos, Períodos abiertos, Docs pendientes — 5 KPIs, todos con deep-link a 1 clic (`CommandCenterHub.tsx:189-197`).
- **Ruido:** el mismo hub embebe 5 sub-sistemas completos como tabs (`DailyOps`, `NeedsAttention`, `OperationsCommandCenter`, `DailyClose`, `PayrollReviewQueue`) **y** las rutas legacy siguen montadas — dos mapas de navegación paralelos al mismo contenido.
- **Acciones administrativas difíciles de encontrar:** `AdminHub` (launcher limpio, gate `owner`/`developer`) sólo es accesible para dos roles y no está señalizado desde el Command Center.
- **Cambio de tenant:** técnicamente sólido (invalidación total de cache, storage per-tab) pero **silencioso ante fallo** — `console.error` sin toast; si `fetchCompanies` falla el usuario ve una lista vacía sin explicación (`useCompany.tsx:176-181`).
- **"Sistema de escritorio antiguo":** sidebar de 40 enlaces con secciones auto-expandibles, `window.confirm` nativo para desactivar transporte (`ShiftOperations.tsx:366-386`), banner de deprecación activo en una pantalla aún enlazada (`Directory.tsx:78-82`).

---

## 3. Evaluación Mobile (prioridad máxima)

### Jerarquía visual
- **Portal:** ejemplar. Un hero, una acción, un bloque de hoy, una lista corta. La acción principal es siempre evidente porque es única.
- **Admin móvil:** `MobileAdminHome.tsx` abre con saludo + product switcher + barra de búsqueda falsa (dispara un keydown sintético ⌘K, `:104-107,134-152`) + grid de 6 acciones + lista de 4 accesos rápidos = **10 destinos compitiendo, cero jerarquía operacional**. No hay "qué pasa ahora".

### Legibilidad
- Portal: densidad baja, tipografía tokenizada, listas capadas.
- Admin: `MobileShiftOperationsSheet` con 8 secciones apiladas en un sheet; listas sin cap explícito.

### Navegación
- Bottom nav portal: 4 tabs, correcto (`PortalBottomNav.tsx:19-24`).
- **Navegación escondida en dos dialectos distintos:** `PortalMoreSheet` (bottom sheet, tiles con icono y subtexto) vs `MobileTimeClockView` `DropdownMenu` (7 acciones secundarias en menú plano, `:74-120`). Mismo trabajo UX, dos componentes y dos lenguajes visuales.
- **Ruta huérfana:** `/portal/chat` no es alcanzable desde la navegación móvil del worker.

### Acciones
- Tamaños táctiles correctos en portal (tabs 48px, `PortalBottomNav.tsx:57`).
- Acciones repetidas: pagos (2 entradas), detalle de turno (2 implementaciones).
- Acciones escondidas: todo lo operativo del capitán vive tras un tap de fila.

### Estados
- **Portal: confiables.** Skeleton estructural, guard de perfil ausente, banner inline de error, estado de resolución de identidad.
- **Admin móvil: no confiables.** `MobileAdminHome.tsx` **no tiene loading, empty ni error state**: los badges caen a `{tickets:0, shift_requests:0}` en silencio si el fetch falla (`:51,60-76`). Un cero falso en operaciones es peor que un error visible.

### Contexto
- Portal: **sí** entiende el momento (NBA calcula la fase real del worker).
- Admin móvil home: **no**. Muestra el mismo grid a las 4am y a las 4pm, con turno en curso o sin operación activa.

---

## 4. Evaluación Desktop

**¿La experiencia ayuda a administrar una empresa o sólo muestra información?**
**Hoy muestra más de lo que administra.** Shift Ops y Directory sí accionan (asignar, editar, notas, contacto directo `tel:`/`wa.me`). Command Center, Payroll Review Queue y Time Clock son fundamentalmente lecturas y hubs de navegación. Las tres decisiones de mayor valor económico —aprobar horas, cerrar período, cerrar turno— no tienen botón terminal en la superficie donde el usuario las espera.

| Superficie | KPIs | ¿Acciona? | Profundidad |
|---|---|---|---|
| Sidebar | — | Navegación | 2-3 clics a cualquier página nivel 1 |
| Command Center | 5 KPIs con deep-link | No (agrega 5 sub-sistemas) | 1 clic al detalle |
| Shift Ops | 7 métricas de staffing | **Sí** (asignar, editar, notas, rol, transporte) | 2-3 clics |
| Time Clock | — | Hub hacia 8 acciones en dropdown | 2 clics |
| Payroll Review Queue | 12 buckets | **No** (read-only declarado) | 1-2 clics |
| Directory | — | Sí (contacto directo) | 2 clics + tipeo |
| Service Requests | 7 estados en tabs | Sí (crear, abrir drawer) | 2 clics |
| Admin Hub | — | Launcher puro | 1 clic |

---

## 5. Evaluación por flujo (auditoría de fricción)

| Flujo | Clics | Pantallas | Decisiones | Tiempo est. | Veredicto |
|---|---|---|---|---|---|
| Worker: check-in | 2 | 1-2 | 0-1 (qué turno, auto-resuelto) | ~10 s | ✅ Excelente |
| Worker: ver próximo turno + meeting point | 0-2 | 1 | 0 | ~5 s | ✅ Excelente |
| Worker: contactar supervisor | 1 (widget) / ∞ (página huérfana) | 1 | 1 (¿cuál chat?) | ~20 s | ⚠️ Ambiguo |
| Asignar worker a turno | 2-3 | 1 | 1-2 (elegir candidato) | ~30 s | ✅ Bueno |
| Cambiar meeting point | 3 | 2 | 1 | ~45 s | ⚠️ Bloqueado si hay fichajes, con mensaje ambiguo |
| Cerrar turno | 3+ | **3+** | múltiples | **sin fin definido** | ❌ Sin acción terminal |
| Aprobar horas | indeterminado | **3+** | múltiples | **sin fin definido** | ❌ No existe en "Centro de Validación" |
| Encontrar un worker | 2 + tipeo | 1 | 1 (¿Directory o Worker Hub?) | ~20 s | ⚠️ Dos fuentes de verdad |
| Enviar mensaje (desde turno) | — | — | — | — | ❌ No conectado en Shift Ops; sólo "notas" internas |
| Completar documentos (worker) | 2-3 (NBA o More sheet) | 2 | 1 | ~2 min | ✅ Bueno |

---

## 6. Evaluación visual

**Consistencia: 5 / 10.** Dos capas de tokens vivas simultáneamente:
- Canónica: `src/components/stafly-ui/tokens.ts` (`STAFLY_CARD_BASE`, `STAFLY_PAGE_PX`, `STAFLY_BOTTOM_NAV_CLEARANCE`), consumida por `MobileAdminModuleShell`, `MobileEntityCard`, `PortalShiftCard`, `MyAnnouncements`, `PortalResources`, `MobileShiftsView`.
- Compatibilidad/deprecada: `mobile-admin-tokens.ts` (`MOBILE_PAGE_PX`, `TXT_EYEBROW`, `CARD_SURFACE`… marcados `@deprecated` pero aún exportados y consumidos).

**Drift ya medible:** `MobileAdminHome.tsx:166` escribe a mano `"rounded-2xl border border-border/50 bg-card"` mientras el token equivalente incluye `shadow-xs` — el token dice literalmente que "coincide con las action cards de MobileAdminHome" (`stafly-ui/tokens.ts:34`) y ya no coincide.

**Componentes antiguos (candidatos a rediseño):**
- `MobileAdminHome.tsx` — clases ad-hoc, inglés hardcodeado sin `useT()`, sin estados.
- `MobileShiftOperationsSheet.tsx` — 2.100 líneas, diccionario de copy propio.
- `AdminSidebar.tsx` — 40 enlaces, secciones auto-expandibles, duplicados.
- `Directory.tsx` — deprecada pero enlazada.
- `QuickActions.tsx` — mapa `ACCENT` propio junto a un `TodayBlock` ya tokenizado, **en la misma pantalla**.

**Componentes nuevos (referencia de calidad):** `ShiftRouteHeader`, `StaflyPageShell`, `MobileAdminHeader`, `MobileSummaryStrip`, `NextBestActionCard`, `MobileShiftEditSheet` (reutiliza `ShiftFormFields`, sin duplicación).

**Idioma:** mezcla es/en dentro de la misma sesión ("Switching you to a company where you have admin permissions", `AdminLayout.tsx:196-208`; "Couldn't update attendance…", `ShiftAttendancePanel.tsx:221`).

---

## 7. Evaluación contextual — ¿qué decisión ayuda a tomar cada pantalla?

| Pantalla | Decisión que habilita | ¿Resuelve demasiado? |
|---|---|---|
| Portal Home | "¿Qué hago ahora?" | No — ejemplar |
| Portal Clock | "¿Fichó o no?" | No |
| Portal Shifts | "¿Acepto este turno?" | No |
| MobileAdminHome | *ninguna decisión* — sólo lanza | Sí, por vacío: es un menú, no un contexto |
| Shift Ops | "¿Este turno va a salir bien?" | **Sí** — 7-9 bloques, edición + staffing + cierre + evidencia + transporte |
| Command Center | "¿Dónde está el fuego hoy?" | **Sí** — 5 sub-sistemas en tabs + rutas legacy |
| Payroll Review Queue | "¿Qué está mal antes de pagar?" | **Sí** — 12 buckets de 10+ tablas, sin poder actuar |
| Time Clock | "¿Quién está trabajando?" | No, pero es un hub más que una pantalla |
| Directory | "¿Cómo contacto a X?" | No |

---

## 8. Evaluación de simplicidad

**Pantallas que podrían eliminarse o fusionarse:**
- `Directory` → absorber en Worker Hub (ya está deprecada y aún enlazada).
- `PortalShiftDetail` (página) → el drawer cubre el caso; mantener la ruta sólo para deep-links.
- Rutas legacy de Command Center (`/app/daily-ops`, `/app/needs-attention`, `/app/ops-center`, `/app/daily-close`) → dejar sólo redirects.
- Una de las dos rutas de reconciliación de payroll.
- `PortalChat` **o** `EmployeeChatWidget` — no ambos.

**Pasos que podrían desaparecer:**
- Elegir turno al fichar cuando sólo hay uno (ya resuelto en portal — replicar el patrón en admin).
- Navegar a Time Clock + Payroll Review Queue para cerrar un turno: debería ser una acción de cierre en Shift Ops.

**Lo que el sistema podría inferir:**
- Fase del turno para decidir qué acción ofrecer primero en móvil admin (la lógica ya existe: `lib/shifts/shift-phase.ts`).
- Reemplazo sugerido ante un rechazo (el motor de dispatch ya existe: `src/core/dispatch-engine.ts`).
- Estado de revisión de cierre (ya existe: `lib/shifts/closeout-review-status.ts`) — llevarlo al home admin móvil.

**Lo que debería ser automático:** coalescencia de notificaciones (ya en F0), elevación de turnos con cobertura incompleta, recordatorio de clock-out, cierre de fichajes huérfanos.

---

## 9. Evaluación de comunicación

**¿Habla como software o como compañero de trabajo?**
**El worker escucha a un compañero. El operador escucha a una base de datos.**

**Mensajes demasiado técnicos (muestra):**
- `toast.error(error.message)` crudo de Postgres en 20+ puntos: `ShiftOperations.tsx:294,313,336,373,577`; `ShiftRidesPanel.tsx:204,221,235,241`; `ShiftDetailDialog.tsx:474,911,958,1446`; `SendNotificationDialog.tsx:180,261`; `ShiftCommentsPanel.tsx:86,112`. Puede exponer violaciones de unicidad, claves foráneas y nombres de columnas a la persona de payroll.
- `AttendanceValidator.tsx:88` — `Couldn't update ${workerName}: ${error.message}` (inglés + error crudo).
- `ShiftActionBar.tsx:105` — "Edición de datos base restringida porque ya hay fichajes…": explica la restricción, no la salida.
- `PayrollReviewQueue.tsx:862` — "Solo visual — no modifica pagos ni fichajes": nota de arquitectura filtrada al usuario.
- "Próximamente" en botones visibles de producción.

**El patrón correcto ya existe** en el código: `ShiftEditDialog.tsx:144-152` ("Selecciona un admin del turno antes de guardar…") — español simple, orientado a la siguiente acción. No está aplicado a los errores de backend.

---

## 10. Evaluación premium (1-10)

| Dimensión | Mobile | Desktop | Justificación |
|---|---|---|---|
| **Claridad** | 8 | 5 | Portal: una acción por pantalla. Desktop: 40 enlaces, etiquetas que prometen acciones inexistentes. |
| **Consistencia** | 5 | 5 | Dos capas de tokens, dos sistemas de copy, dos patrones de "More", mezcla es/en. |
| **Confianza** | 8 (worker) / 4 (admin) | 5 | Portal: estados completos. Admin móvil: ceros silenciosos ante fallo. Tenant switch falla sin avisar. |
| **Elegancia** | 7 | 5 | Portal tokenizado y espacioso; desktop con `window.confirm` nativo y banners de deprecación activos. |
| **Velocidad percibida** | 7 | 5 | Portal cachea páginas y muestra skeletons; switch de compañía invalida todo el cache sin feedback. |
| **Performance percibida** | 7 | 5 | Command Center lazy-loadea 5 sub-sistemas; Shift Ops y PRQ agregan 10+ tablas por render. |
| **PROMEDIO** | **7.0** | **5.0** | |

**Global OX V1: 6.4 / 10.**

---

## 11. Hallazgos más importantes

1. **[P0] "Aprobar horas" y "Cerrar turno" no tienen acción terminal.** El recorrido termina en pantallas read-only. Es el mayor riesgo operacional del producto.
2. **[P0] "Centro de Validación" no valida.** Desalineación etiqueta↔función que hace perder tiempo real a payroll.
3. **[P0] `MobileAdminHome` sin estados de error.** Badges en cero silencioso: el operador no ve el fuego.
4. **[P0] Tenant switch falla en silencio.** El owner puede estar viendo una empresa equivocada o vacía sin saberlo.
5. **[P1] Errores crudos de Postgres al usuario final** en 20+ puntos.
6. **[P1] Chat fracturado**: widget + página huérfana. El worker no sabe con quién hablar.
7. **[P1] `ShiftOperations` resuelve demasiado**: 7-9 bloques simultáneos.
8. **[P1] Doble mapa de navegación** (Command Center tabs + rutas legacy) y sidebar de 40 enlaces con duplicados.
9. **[P2] Drift de tokens** ya medible entre `stafly-ui` y clases ad-hoc.
10. **[P2] Botones "Próximamente" visibles en producción.**

---

## 12. Quick Wins (bajo riesgo, alto retorno, sin backend)

| # | Quick win | Esfuerzo | Impacto |
|---|---|---|---|
| QW-1 | Wrapper `toastError(err, fallbackEs)` que nunca muestre `error.message` crudo | S | Alto |
| QW-2 | Toast de error + retry en `useCompany.fetchCompanies` | S | Alto |
| QW-3 | Loading/empty/error states en `MobileAdminHome` (badges) | S | Alto |
| QW-4 | Renombrar "Centro de Validación" → "Revisión previa a pago (solo lectura)" | XS | Alto |
| QW-5 | Ocultar botones "Próximamente" en lugar de mostrarlos deshabilitados | XS | Medio |
| QW-6 | Enlazar `/portal/chat` desde el More sheet **o** retirar la ruta | XS | Medio |
| QW-7 | Deduplicar enlaces de reconciliación de payroll en el sidebar | XS | Medio |
| QW-8 | Sustituir `window.confirm` de transporte por `AlertDialog` | XS | Medio |
| QW-9 | Unificar idioma de `AdminLayout` ("Restoring admin access") a español | XS | Bajo |
| QW-10 | `MobileAdminHome` importa `STAFLY_CARD_BASE` en vez de clases a mano | XS | Bajo |

---

## 13. Roadmap de experiencia

### P0 — Afectan la operación
- P0-1 Acción terminal de **cierre de turno** en Shift Ops (o estado de cierre explícito con siguiente paso único).
- P0-2 Acción terminal de **aprobación de horas** en la superficie que el usuario llama "validación", o renombrado + ruta explícita al lugar correcto.
- P0-3 Estados de error/empty en todas las superficies admin móviles (prohibir ceros silenciosos).
- P0-4 Feedback visible en fallo y cambio de tenant.
- P0-5 Envío de mensaje real al equipo desde el turno (hoy sólo "notas" internas que parecen envíos).

### P1 — Afectan la experiencia
- P1-1 Capa única de mensajes de error en español orientados a la siguiente acción.
- P1-2 Consolidar chat a una sola implementación.
- P1-3 Home admin móvil contextual por fase de operación (reutilizar `shift-phase.ts` y `closeout-review-status.ts`).
- P1-4 Reducir el sidebar a ~12 entradas por rol; el resto vive en Admin Hub.
- P1-5 Colapsar rutas legacy de Command Center a redirects.
- P1-6 Dividir `ShiftOperations` por fase real, no reordenar 9 bloques.

### P2 — Pulido premium
- P2-1 Migrar consumidores restantes de `mobile-admin-tokens` a `stafly-ui`; eliminar alias deprecados.
- P2-2 Un solo patrón "More" (bottom sheet) en todas las superficies móviles.
- P2-3 Unificar `MOBILE_SHIFT_COPY` con `useT()`.
- P2-4 Deduplicar `PortalShiftDetailDrawer` / `PortalShiftDetail`.
- P2-5 Retirar `Directory` a favor de Worker Hub.

### P3 — Futuro
- P3-1 Reemplazo sugerido automático ante rechazo (via `dispatch-engine`).
- P3-2 Elevación automática de turnos con cobertura incompleta <24h.
- P3-3 Cierre asistido: el sistema propone el cierre y el humano confirma.
- P3-4 Métrica OX continua por sprint (clics por flujo, % pantallas con estados completos, % copys tokenizados).

---

## 14. Comparación Mobile vs Desktop

| Dimensión | Mobile (Worker) | Mobile (Admin) | Desktop |
|---|---|---|---|
| Acción principal evidente | ✅ Única y calculada | ❌ 10 destinos | ⚠️ Depende de la pantalla |
| Estados completos | ✅ | ❌ | ⚠️ |
| Idioma consistente | ✅ es (`useT()`) | ❌ en hardcodeado | ❌ mezcla es/en |
| Tokens de diseño | ✅ `stafly-ui` | ⚠️ mixto/drift | ⚠️ mixto |
| Contexto operacional | ✅ NBA | ❌ estático | ⚠️ fase en Shift Ops |
| Acciones terminales | ✅ fichar | ❌ | ❌ cierre/aprobación |
| Profundidad | 0-2 taps | 1 tap + mega-sheet | 3-6 clics |

**Conclusión:** el Worker Portal debe ser el **patrón de referencia** para el resto del ecosistema. Todo lo que falta en admin ya está resuelto en portal: NBA, estados, tokens, i18n, densidad.

---

## 15. Componentes candidatos a rediseño

1. `src/pages/admin/MobileAdminHome.tsx` — reconstruir como NBA operacional.
2. `src/components/shifts/mobile/MobileShiftOperationsSheet.tsx` (2.100 líneas) — dividir por fase.
3. `src/components/AdminSidebar.tsx` — reducir y deduplicar.
4. `src/pages/admin/ShiftOperations.tsx` (1.005 líneas) — descomponer por fase.
5. `src/pages/admin/PayrollReviewQueue.tsx` — renombrar y/o dotar de acción terminal.
6. `src/components/portal/QuickActions.tsx` — tokenizar.
7. `src/pages/admin/Directory.tsx` — retirar.
8. `src/components/admin/mobile/mobile-admin-tokens.ts` — eliminar tras migración.

## 16. Pantallas candidatas a simplificación

`CommandCenterHub` (5 tabs + legacy) · `ShiftOperations` (9 bloques) · `PayrollReviewQueue` (12 buckets) · `TimeClock` (8 acciones en dropdown) · `MobileAdminHome` (10 destinos sin jerarquía).

---

## 17. Recomendación para el siguiente sprint

**Sprint propuesto: OX-1 — "Cerrar el círculo operativo" (P0 + Quick Wins, UI-only donde sea posible).**

Alcance sugerido, en orden:
1. **QW-1 a QW-5** (un día): capa de errores en español, feedback de tenant switch, estados en `MobileAdminHome`, renombrado de "Centro de Validación", ocultar botones fantasma.
2. **P0-1 / P0-2 (fase de diseño):** definir *dónde* vive la acción terminal de cierre de turno y de aprobación de horas. Requiere decisión de producto antes de código — es la única pieza que no puede resolverse con UI sola.
3. **P0-3 / P0-4:** contrato obligatorio de estados (loading/empty/error) para toda superficie admin, con checklist de revisión.

**Criterio de éxito medible para OX-2:** cero `error.message` crudos en UI · cero pantallas admin sin estado de error · "cerrar turno" y "aprobar horas" completables en ≤3 clics desde el turno · puntuación OX ≥ 7.5.

---

## 18. Criterios de calidad — respuesta directa

| Criterio | Worker | Admin/Owner |
|---|---|---|
| ¿Reduce la incertidumbre? | **Sí** — NBA elimina la pregunta "¿qué hago?" | **Parcialmente** — muestra el problema, no siempre el remedio |
| ¿Reduce la carga cognitiva? | **Sí** | **No** — 40 enlaces, 9 bloques, 12 buckets |
| ¿Reduce la fricción operacional? | **Sí** — 2 taps para fichar | **No en cierre/aprobación** |
| ¿Se siente que Stafly entiende la operación? | **Sí** | **Sí en diagnóstico, no en ejecución** |
| ¿Permite concentrarse en el trabajo y no en administrar el sistema? | **Sí** | **Todavía no** |

---

**Estado del documento:** línea base V1 congelada. Toda mejora futura se mide contra esta versión.
**Próxima revisión sugerida:** al cierre del sprint OX-1 (OX BASELINE V2, con puntuaciones comparadas).
