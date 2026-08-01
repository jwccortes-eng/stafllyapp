# OX-6 — Stafly Visual Identity Unification Audit

**Tipo:** Auditoría de identidad (no de UI, no de funcionalidad)
**Modo:** Report-only. Cero cambios de código.
**Fecha:** 2026-08-01
**Pregunta única:** ¿Toda la aplicación parece diseñada por una sola mente?

---

## Respuesta corta

**No.**

Stafly hoy tiene **un sistema de diseño excelente aplicado al 8% del producto**.
Lo que construimos en OX-1 → OX-4.5 es correcto, maduro y coherente. El problema es que
convive con **cinco generaciones visuales anteriores** que nunca se retiraron. El usuario
no ve un sistema con excepciones: ve un producto que **cambia de personalidad al navegar**.

La evidencia dura, medida sobre el código actual:

| Sistema canónico | Adopción real | Sistema legacy que sigue vivo |
|---|---|---|
| Operational Card System (`components/ocs`) | **11 archivos** | shadcn `Card` en **190 archivos** |
| `StatusBadge` (OX-2) | **22 archivos** | `Badge` crudo en **279 archivos** |
| `notify()` (OX-1) | **13 archivos** | `useToast` legacy en **102 archivos** |
| Escala móvil `MT`/`TAP` (OX-3) | **26 archivos** | Tipografía ad-hoc en el resto |
| `StaflyCard` (DS1E) | **4 archivos** | — |

Sobre ~178 páginas y ~175 componentes con superficie tipo card.

**Traducción:** OX no es todavía la identidad de Stafly. Es un barrio nuevo dentro de una
ciudad vieja.

---

## 1. Score por módulo

Escala 0–10. **Identidad** = ¿se siente Stafly? **Consistencia** = ¿respeta el sistema?
**Madurez** = ¿está terminado o sigue en obra?

| Módulo | Identidad | Consistencia | Madurez | Score |
|---|---|---|---|---|
| Validation Center | 9 | 9 | 9 | **9.0** |
| Today Hub / Command Center Hub | 9 | 8 | 8 | **8.3** |
| Team Hub (mobile) | 8 | 8 | 8 | **8.0** |
| Context Switcher | 9 | 8 | 7 | **8.0** |
| Assign Workers (OCS) | 8 | 7 | 7 | **7.3** |
| Mobile Admin Home | 7 | 7 | 7 | **7.0** |
| Shift Ops | 6 | 5 | 7 | **6.0** |
| Portal Worker (Home / MyShifts) | 6 | 5 | 6 | **5.7** |
| Time Clock (command view) | 5 | 4 | 6 | **5.0** |
| Shift Detail / ShiftDetailDialog | 4 | 3 | 6 | **4.3** |
| Payroll Review Queue | 4 | 4 | 5 | **4.3** |
| Employee Profile / Directory | 4 | 3 | 5 | **4.0** |
| Clients / Invoicing | 3 | 3 | 5 | **3.7** |
| Reconciliation / Import Wizards | 3 | 2 | 4 | **3.0** |
| Dashboard / OwnerDashboard (legacy) | 2 | 2 | 3 | **2.3** |
| Landing / Public / Apply | 5 | 2 | 6 | **4.3** |
| Front Desk / Kiosk | 3 | 2 | 5 | **3.3** |
| Parceros | 4 | 3 | 5 | **4.0** |

**Media ponderada del producto: 5.3 / 10.**
El techo (Validation Center, 9.0) y el suelo (Dashboard legacy, 2.3) están a **6.7 puntos
de distancia**. Ese delta *es* el problema de identidad.

---

## 2. Top 20 inconsistencias

Ordenadas por daño a la percepción de unidad, no por dificultad.

1. **Tres sistemas de card coexisten.** OCS (11), `StaflyCard` (4), shadcn `Card` (190).
   El usuario ve tres lenguajes de superficie en una sola sesión.
2. **Dos sistemas de estado.** `StatusBadge` con registro semántico (22 archivos) vs
   `Badge` con colores libres (279 archivos). El mismo estado operativo se pinta distinto
   según la pantalla que lo muestre.
3. **Dos sistemas de feedback.** `notify()` (13) vs `useToast` legacy (102). Distinta
   posición, distinta duración, distinto tono de voz, distinto target táctil.
4. **Nueve componentes de cabecera.** `PageHeader`, `PremiumPageHeader`, `SectionHeader`,
   `StaflySectionHeader`, `ShiftRouteHeader`, `MobileAdminHeader`, `AgendaSectionHeader`,
   `ParcerosHeader`, `PremiumTableHeader`. Nueve formas de decir "estás aquí".
5. **Radio de esquina sin regla.** `rounded-lg`, `-xl`, `-2xl`, `-3xl`, `-full` conviven en
   el mismo scroll. `ShiftDetailDialog` usa cuatro radios distintos en un solo archivo.
   OCS usa `2xl`; Payroll Reconciliation usa `md`. Se ven como dos productos.
6. **Iconos en 12 tamaños.** `h-3 w-3` aparece **1.000 veces** — 12px, por debajo del
   mínimo legible en operación real; `h-4 w-4` 1.488 veces; y otros diez tamaños más.
   No hay escala de iconografía.
7. **Escala tipográfica no adoptada.** Solo 26 archivos usan `MT` (OX-3). El resto mezcla
   `text-xs`/`text-[11px]`/`text-sm` para información de la misma jerarquía.
8. **Colores hardcodeados en superficies críticas.** `KioskClock` (27 ocurrencias),
   `employee-avatar` (20), `StaflyCalmProcessingBanner` (17), `LiveMapCanvas` (15),
   `Dashboard`, `Auth`, `Landing`. Rompen tema oscuro y rompen la paleta.
9. **51 archivos con gradientes** sin token de gradiente compartido. Cada pantalla inventa
   su propio "premium".
10. **Padding de página sin estándar.** `STAFLY_PAGE_PX = px-5` existe pero conviven
    `px-3`, `p-2`, `p-3`, `p-4`, `py-1` como padding de contenedor en páginas admin.
11. **Densidad opuesta entre módulos hermanos.** `Today.tsx`/`WorkerDuplicates` usan
    `py-2`/`px-3` (tabla comprimida); Validation Center respira con `space-y` OCS.
    La misma persona percibe "sistema operativo denso" y luego "app de bienestar".
12. **155 superficies modales.** 115 `DialogContent` + 37 `SheetContent` + 3 `Drawer`.
    No hay regla de cuándo es dialog, cuándo sheet, cuándo ruta. En móvil algunos abren
    dialogs de escritorio.
13. **Dos gramáticas de card.** OCS impone Estado → Identidad → Contexto → Principal →
    Secundaria → CTA. El resto del producto empieza por el título o por un KPI. El ojo
    tiene que reaprender a leer en cada módulo.
14. **KPI sin contrato fuera de Home.** `KpiCard` con `MetricState` resuelve loading/error/
    cero-confirmado; Dashboard, Reports y Reconciliation siguen mostrando números crudos —
    el cero silencioso que OX-4.5 eliminó sigue vivo en los módulos no migrados.
15. **Sombras arbitrarias.** Tokens `shadow-xs…2xl` existen, pero conviven con `shadow-none`
    manual y con bordes `border-border/50` vs `/40` vs sin opacidad, generando tres
    profundidades para el mismo nivel jerárquico.
16. **Grises inconsistentes.** `text-gray-*`/`slate-*`/`zinc-*` sobreviven junto a
    `text-muted-foreground`. Tres grises distintos para "secundario".
17. **Estados vacíos sin patrón único.** 71 archivos implementan su propio empty state;
    algunos son una frase gris, otros una card ilustrada.
18. **Estados de carga sin patrón único.** 40 archivos con `Skeleton`, 201 con `Loader2`.
    Unos módulos hacen skeleton estructural, otros un spinner centrado: dos sensaciones
    de velocidad distintas.
19. **Avatares duplicados.** `employee-avatar`, `client-avatar`, `premium-avatar` con
    paletas y tamaños propios. La identidad de las personas —lo más importante del
    producto— se representa de tres maneras.
20. **Movimiento sin doctrina.** `animate-pulse`, `animate-spin`, `animate-in`, `press-scale`,
    `hover-lift` se aplican por criterio local. Algunas pantallas vibran, otras están
    completamente quietas.

---

## 3. Qué módulos parecen diseñados por personas diferentes

Puestos uno al lado del otro, se leen como **cinco autores**:

- **Autor A — "OX / operacional adulto":** Validation Center, Today Hub, Team Hub,
  Context Switcher. Silencioso, jerárquico, consecuencia explícita antes de cada acción.
- **Autor B — "admin de datos":** Payroll Reconciliation, Import Wizards, Directory,
  WorkerDuplicates. Denso, tabular, `rounded-md`, iconos de 12px. Herramienta interna.
- **Autor C — "app de consumo":** Portal Worker, PortalClock, Accumulated, PayStub.
  `rounded-2xl`, gradientes, más aire, más emocional.
- **Autor D — "dashboard 2023":** Dashboard, OwnerDashboard, Reports. Colores hardcodeados,
  KPI sin estado, cards genéricas de shadcn.
- **Autor E — "marketing":** Landing, PublicPricing, Apply, Install. `rounded-full`,
  gradientes, escala tipográfica propia.

Un operador que en un turno pasa por A, B y C **no percibe un producto: percibe tres
proveedores**.

---

## 4. Qué componentes rompen la identidad

| Componente | Por qué rompe |
|---|---|
| `ui/premium-page-header.tsx` | Compite con `PageHeader` y con `ShiftRouteHeader`; "premium" como estilo paralelo, no como estándar |
| `ui/premium-table.tsx` | Segunda gramática de datos, ajena a OCS |
| `ui/premium-avatar.tsx` / `client-avatar` / `employee-avatar` | Tres identidades visuales para personas |
| `ShiftDetailDialog.tsx` | Cuatro radios, iconografía mixta, jerarquía propia; es el contraejemplo perfecto de OCS |
| `PayrollReconciliation.tsx` | 22 `rounded-lg` + 19 `rounded-md` + 13 `rounded-xl` en un archivo |
| `Dashboard.tsx` / `OwnerDashboard.tsx` | Generación anterior completa, colores hardcodeados |
| `StaflyCalmProcessingBanner.tsx` | 17 colores literales; se comporta como pieza de marca aislada |
| `KioskClock.tsx` / `FrontDesk.tsx` | Lenguaje propio (`rounded-3xl`, paleta literal) para superficies que el cliente final sí ve |
| `hooks/use-toast.ts` | Mantiene viva la segunda voz del producto en 102 archivos |
| `components/ui/card.tsx` usado directamente | No es "malo", pero su uso directo es el vector nº1 de divergencia |

---

## 5. Qué patrones deben convertirse en estándar

Todos ya existen y ya están probados. No hay que inventar nada.

1. **La gramática OCS** (Estado → Identidad → Contexto → Principal → Secundaria → CTA →
   Acciones) como la única forma de contar cualquier objeto operativo.
2. **Consecuencia antes de la acción** ("Este turno quedará listo para payroll").
   Es la firma emocional de Stafly y hoy solo vive en Validation Center.
3. **`MetricState` / `presentMetric`**: ningún número sin unidad, significado y estado.
4. **`TerminalCard`**: toda decisión terminal se confirma con hecho + consecuencia + siguiente paso.
5. **`StatusBadge` + `status-registry`** como única fuente de color de estado.
6. **`notify()`** como única voz del sistema (título + hecho + consecuencia + acción).
7. **`MT` / `TAP` (44px)** como escala universal, no solo móvil.
8. **`ShiftRouteHeader` con densidad** como patrón de cabecera contextual.
9. **Tokens `STAFLY_*`** para padding de página, clearance y superficies.
10. **Permisos fail-closed visibles** (banner de solo lectura) como comportamiento por defecto.

---

## 6. Qué debe desaparecer

En este orden:

1. `hooks/use-toast.ts` y sus 102 consumidores → `notify()`.
2. Uso directo de `ui/card` en features → OCS o `StaflyCard`.
3. `Badge` crudo para estados operativos → `StatusBadge`.
4. `premium-page-header`, `premium-table`, `premium-avatar` (la palabra "premium" como
   variante paralela debe morir: lo premium es el estándar).
5. `client-avatar` + `employee-avatar` → un solo `PersonAvatar`.
6. `Dashboard.tsx` / `OwnerDashboard.tsx` → absorbidos por Command Center Hub.
7. Todo color literal (`#hex`, `gray-*`, `slate-*`, `zinc-*`, `bg-white`, `text-black`).
8. Radios fuera de la escala (`rounded-md`, `-3xl` en superficies de producto).
9. Iconos `h-3 w-3` en información operativa.
10. Dialogs de escritorio abiertos en viewport móvil.

---

## 7. Qué módulos ya son la identidad que buscamos

- **Validation Center** — el estándar de oro. Identidad primero, evidencia después,
  consecuencia antes de decidir. Si el producto entero se sintiera así, esta auditoría
  no existiría.
- **Today Hub** — la mejor jerarquía de atención del producto (Critical → Low).
- **Team Hub** — la mejor traducción de datos crudos a lenguaje operativo.
- **Context Switcher** — la mejor transición: el usuario nunca duda de dónde está.

Estos cuatro módulos son el **canon**. El resto del plan es propagarlos, no rediseñarlos.

---

## 8. Matriz de consistencia

| Módulo | Identidad | Consistencia | Madurez | Veredicto |
|---|---|---|---|---|
| Validation Center | Alta | Alta | Alta | Canon |
| Today Hub | Alta | Alta | Alta | Canon |
| Team Hub | Alta | Alta | Media-Alta | Canon |
| Context Switcher | Alta | Alta | Media | Canon |
| Assign Workers | Media-Alta | Media | Media | Alinear |
| Mobile Admin Home | Media-Alta | Media | Media | Alinear |
| Shift Ops | Media | Baja | Media | Alinear |
| Portal Worker | Media | Baja | Media | Alinear |
| Time Clock | Media | Baja | Media | Alinear |
| Shift Detail | Baja | Baja | Media | Reescribir sobre OCS |
| Payroll Review Queue | Baja | Baja | Media | Reescribir sobre OCS |
| Employee Profile | Baja | Baja | Media | Reescribir sobre OCS |
| Clients / Invoicing | Baja | Baja | Media | Reescribir sobre OCS |
| Reconciliation / Imports | Baja | Muy baja | Baja | Contener (herramienta interna) |
| Dashboard legacy | Muy baja | Muy baja | Baja | Retirar |
| Front Desk / Kiosk | Baja | Muy baja | Media | Sub-marca explícita o alinear |
| Public / Landing | Media | Muy baja | Media | Sub-marca explícita (aceptable) |
| Parceros | Baja | Baja | Media | Sub-marca explícita o alinear |

---

## 9. Plan de unificación — ordenado por ROI

ROI = impacto en percepción de unidad ÷ superficie tocada. **No por facilidad.**

**OX-6.1 — Una sola voz (ROI máximo).**
Retirar `use-toast`. 102 archivos, cambio mecánico. Cada acción del producto empieza a
sonar igual. Es el cambio más barato con mayor efecto emocional: el feedback es lo que el
usuario *siente*, no lo que ve.

**OX-6.2 — Un solo color de estado.**
Migrar los 279 usos de `Badge` a `StatusBadge`. El estado operativo es lo que el operador
escanea primero; unificarlo unifica la lectura del producto entero de un golpe.

**OX-6.3 — Constitución visual ejecutable.**
Congelar la escala: radios (`xl`/`2xl` únicos), iconos (16/20/24), tipografía (`MT`),
espaciado (`STAFLY_*`), sombras. Añadir lint que prohíba color literal y clases fuera de
escala. Sin esto, todo lo demás vuelve a divergir en dos sprints.

**OX-6.4 — Una sola card en las rutas de decisión.**
Migrar a OCS: Shift Detail, Payroll Review Queue, Employee Profile, Shift Ops. Son las
cuatro pantallas donde se toman decisiones que cuestan dinero, y son hoy las cuatro con
peor identidad.

**OX-6.5 — Una sola cabecera.**
Nueve headers → uno con densidades. El "estás aquí" debe ser idéntico en todo el producto.

**OX-6.6 — Una sola persona.**
`PersonAvatar` único. El producto trata de personas; representarlas de tres formas es el
fallo de identidad más simbólico.

**OX-6.7 — Retirar la generación 2023.**
Absorber Dashboard/OwnerDashboard en Command Center Hub. Eliminar, no migrar.

**OX-6.8 — Doctrina de superficies.**
Regla dura: móvil = sheet, escritorio = dialog, decisión terminal = ruta. Auditar las 155
superficies modales contra esa regla.

**OX-6.9 — Contención de sub-marcas.**
Declarar formalmente que Landing/Public, Kiosk/Front Desk y Parceros son sub-marcas con
licencia visual acotada — o alinearlas. Hoy divergen sin decisión, que es lo peor.

**OX-6.10 — Movimiento con doctrina.**
Una sola curva, una sola duración, tres usos permitidos (entrada, confirmación, espera).

---

## 10. Conclusión

**¿Hoy Stafly parece un solo producto?**

No.

Hoy Stafly parece **un producto excelente que aún está dentro del producto anterior**.

La razón no es falta de diseño. Es exceso de historia. Construimos OX-1 a OX-4.5 con una
idea clarísima de cómo debe sentirse el trabajo operativo: calmado, explícito, respetuoso
con quien toma decisiones a las 5 de la mañana. Esa idea existe, está escrita en código y
funciona. Pero convive con todo lo que había antes, y **la identidad no se promedia: se
rompe en el punto más débil**. Basta con que una pantalla de doce grite para que el usuario
deje de confiar en las once que susurraban.

Lo que falta no es diseñar más. Es **terminar de retirar**.

Cuando alguien entra por Home, decide en Today Hub, opera en Team Hub, valida en Validation
Center y vuelve, hoy siente cuatro productos distintos con un mismo login. El día que sienta
uno solo —mismo silencio, mismo color de estado, misma voz al confirmar, misma consecuencia
antes de cada decisión— Stafly dejará de ser una plataforma que funciona muy bien y pasará a
ser un producto que se recuerda.

Ese es el trabajo de OX-6. No es un sprint de UI.
Es el sprint en el que el sistema deja de tener funciones y empieza a tener carácter.
