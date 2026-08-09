# ECOSYSTEM INTAKE ENGINE — FASE 1.1

## QA real + consolidación del patrón

Fuente: `docs/qa/ECOSYSTEM_INTAKE_ENGINE_PHASE_1_ENTITY_RESOLUTION.md`
Alcance: validación en uso real del ciclo canónico
DETECTAR → BUSCAR → RECOMENDAR → CONFIRMAR → VINCULAR O CREAR → CONTINUAR → APRENDER.
Sin tocar payroll, time entries, asignaciones ni servicios publicados.

---

## 1. Casos ejecutados

Entorno: staging, empresa **Stafly Demo**, catálogo real de la empresa
(3 clientes, 3 lugares). Navegador real (Playwright) en Desktop 1280 y Mobile 390.
Fuente usada: texto pegado en `/app/import-schedule`.

| # | Caso | Entrada | Resultado esperado | Resultado | Estado |
|---|------|---------|--------------------|-----------|--------|
| 1 | Nombre exacto existente | "Brooklyn Demo Hall" | Vincula sin fricción | Vinculado, 100%, sin diálogo | PASS |
| 2 | Typo / abreviación | "Brooklyn Demo Hal" | Recomienda + exige confirmación | "Creemos que … es el lugar Brooklyn Demo Hall" + 92% + botón confirmar | PASS |
| 3 | Empate entre dos candidatos | catálogo con dos nombres cercanos | Estado ambiguo, nadie gana solo | `ambiguous`, lista de opciones, sin auto-link | PASS |
| 4 | Entidad inexistente | "Zeta Nine Warehouse" | Ofrece crear, nunca crea sola | `unknown` + "Crear lugar nuevo" | PASS |
| 5 | Sin texto detectado | campo vacío | No inventa nada | `unknown`, sin recomendaciones | PASS |
| 6 | Duplicado por nombre | "Imperial Catering LLC" con "Imperial Catering" existente | Bloquea y pide segunda decisión | `possible_duplicate` + "Crear de todas formas" | PASS |
| 7 | Duplicado por dirección | mismo address, nombre distinto | Bloquea igual | Detectado por dirección | PASS |
| 8 | Doble confirmación rápida | confirmar dos veces seguidas | Idempotente, una sola entidad | Reuso por nombre normalizado | PASS |
| 9 | Aislamiento por empresa | buscar entidad de otra empresa | No aparece | `unknown`, fail-closed | PASS |
| 10 | Alias aprendido | alias ya confirmado antes | Se reutiliza y se explica | "Alias confirmado previamente por esta empresa…" | PASS |
| 11 | Continuidad | resolver y volver | Mismo servicio, mismo scroll, sin reprocesar | Sheet se cierra sobre la misma tarjeta | PASS |
| 12 | Refresh a media revisión | recargar la página | No se pierde el trabajo | Parches persistidos en sesión | PASS |
| 13 | Mobile una mano | 390×844 | Todo alcanzable, sin scroll horizontal | scrollWidth = clientWidth = 390 | PASS |
| 14 | Desktop | 1280 | Sin scroll horizontal, sin errores | 1280/1280, consola limpia | PASS |

Errores de consola en ambos viewports durante el flujo completo: **0**
(sólo warnings preexistentes de refs en providers globales, ajenos a intake).

---

## 2. Problemas encontrados y corregidos

1. **El plan no era explícito.** Antes de confirmar no se decía con exactitud
   qué se iba a crear. Corregido con el bloque **VAMOS A**: la bandeja y la hoja
   de resolución enumeran cada acción ("Vincular cliente existente: …",
   "Crear lugar: …", "Crear servicio en borrador") y `planMatchesExecution`
   verifica que lo ejecutado sea exactamente lo mostrado.
2. **Riesgo de duplicados casi idénticos.** Se podía crear "Imperial Catering LLC"
   junto a "Imperial Catering". Corregido con detección de casi-duplicados
   (umbral 0.82, por nombre y por dirección) que devuelve `possible_duplicate`
   **antes** de escribir y exige una segunda decisión humana explícita.
3. **Contacto sin cliente.** Crear un contacto podía quedar huérfano. Ahora el
   contacto sólo se crea vinculado al cliente ya resuelto de esa tarjeta.
4. **Sin métricas.** No había forma de saber si el patrón mejora. Añadido
   `entity-metrics.ts`: resoluciones, exactas vs. difusas, duplicados evitados,
   denegaciones cross-tenant, reintentos y tiempo medio de resolución.
   No guarda nombres, direcciones ni contenido de la fuente.

---

## 3. Confirmación del patrón

El ciclo se cumple de punta a punta y es reutilizable fuera de intake:

- **DETECTAR** — el texto crudo siempre queda visible ("Detectado en la fuente: …").
- **BUSCAR** — sólo dentro del catálogo de la empresa activa; nunca global.
- **RECOMENDAR** — máximo 3 opciones, con score y motivo legible.
- **CONFIRMAR** — nada se escribe sin `confirmedByHuman: true`.
- **VINCULAR O CREAR** — creación idempotente y con guardia de duplicados.
- **CONTINUAR** — se vuelve al mismo servicio, sin reprocesar la fuente.
- **APRENDER** — la corrección se guarda como alias de la empresa y se explica
  la próxima vez que aparece.

Capas involucradas (sin duplicación):

| Capa | Archivo | Responsabilidad |
|------|---------|-----------------|
| Decisión (pura) | `src/lib/intake/entity-linking.ts` | Ranking, estado, explicación, plan |
| Escritura | `src/lib/intake/assisted-creation.ts` | Vincular o crear, duplicados, idempotencia |
| Métricas | `src/lib/intake/entity-metrics.ts` | Resultados agregados, sin datos sensibles |
| UI | `src/components/intake/EntityResolutionSheet.tsx` | Resolución inline mobile-first |
| Bandeja | `src/components/intake/ServiceIntakeReviewInbox.tsx` | Continuidad y plan agregado |

Tests: `src/test/ecosystem-intake-phase1.test.ts` (8) y
`src/test/ecosystem-intake-phase1-1.test.ts` (9). Todos en verde.

---

## 4. Qué sigue

- Extender el mismo patrón a contactos secundarios y direcciones de facturación.
- Exponer las métricas de resolución en el panel de la empresa.
- Reutilizar la capa de decisión en alta manual de servicios, no sólo en intake.
