# OX-8 — ONE STAFLY · Reporte de percepción

**Fecha:** 2026-08-01
**Alcance:** exclusivamente experiencia. Cero cambios en auth, payroll, time_entries,
RLS, tenants, operational signals, shift/assignment logic, compliance, RPCs,
multi-driver, `shift_ref` ni datos de producción. Sin migraciones, sin edge functions.

---

## 1. Continuidad — ¿qué hiciste para que todas las pantallas parezcan una sola?

Ataqué la causa, no las pantallas.

Antes existían **tres lenguajes de cabecera** compitiendo:
`PageHeader` (con **5 variantes** distintas: caja de icono, badge, minimal,
eyebrow + subrayado decorativo, escudo), `PremiumPageHeader` (eyebrow dorado +
icono + KPIs) y cabeceras artesanales dentro de cada página. Cada pantalla
elegía su propia identidad visual, y por eso se sentían de equipos distintos.

Ahora hay **una sola cabecera en todo Stafly**:

`src/components/stafly-ui/OperationalScreenHeader.tsx`

```
[logo empresa]  My Staff Solution LLC        ← ¿de quién es esta operación?
                Fichajes                     ← ¿dónde estoy?
                Actividad real de hoy...     ← ¿qué está pasando?      [Operar el día] [⋯]
```

`PageHeader` y `PremiumPageHeader` ya no dibujan nada: son adaptadores de 40
líneas sobre esa cabecera. Eso propagó la misma composición, ritmo, tipografía y
jerarquía a **~40 pantallas admin y de portal en una sola edición**, sin tocar
la lógica de ninguna.

Además creé `src/lib/ox/continuity.ts`: una única fuente de verdad para
respiración (`OX_SCREEN_X`, `OX_STACK`), profundidad (`OX_SURFACE`,
`OX_SURFACE_SOFT`), motion (`OX_MOTION`, `OX_ENTER`, `OX_PRESS`) y composición
de cabecera. Ninguna pantalla vuelve a inventar su ritmo: si un espaciado debe
cambiar, cambia para todos.

---

## 2. Ruido — cuánto desapareció

| Qué | Antes | Después |
|---|---|---|
| Lenguajes de cabecera | 3 componentes | 1 (+2 adaptadores) |
| Variantes visuales de cabecera | 5 + 1 premium = **6** | **1** |
| Decisiones visuales por pantalla (icono/eyebrow/badge/subrayado) | 4 por página | 0 — la empresa es la identidad |
| Botones visibles en la cabecera de Fichajes | 5 (primario + 2 con tooltip + settings + ⋯) | **2** (1 protagonista + overflow) |
| Párrafos de disclaimer sueltos en Fichajes | 2 bloques (subtítulo + nota de 11px) | 1 línea de contexto |
| Tipografía decorativa (`text-[10px]` uppercase tracking-widest) | en cabeceras y KPIs | eliminada (mínimo 12px legible) |
| Subrayados/adornos decorativos | 1 variante completa | eliminada |

**No se eliminó información**: discrepancias, comparación, importaciones,
timesheets, kiosk y configuración siguen accesibles — ahora agrupados por
intención (Revisar / Importar / Configuración) en un solo overflow, en vez de
compitiendo con la operación.

---

## 3. Jerarquía — quién pasó a ser protagonista

El protagonista de toda pantalla es, en orden fijo:

1. **La empresa** (presencia, no selección).
2. **El lugar** (título corto, operativo: “Fichajes”, no “Reloj de tiempo”).
3. **Lo que está pasando** (una línea).
4. **Una sola acción**.

Los iconos de módulo dejaron de ser identidad. Un icono de reloj no dice nada
que el título no diga; el logo de la empresa sí dice dónde estoy trabajando.

---

## 4. Empresa — cómo logré que se sintiera presente

La empresa aparece **en cada pantalla**, no solo en el switcher: logo real (o
inicial con su color de marca), con anillo activo y glow sutil, y su nombre
como primera línea leída. En modo global, la cabecera dice “Vista global”
explícitamente en el mismo lugar — nunca deja el marco vacío ni ambiguo.

El resultado: cambiar de empresa ya no cambia solo un dropdown; cambia la
identidad visible de **todas** las pantallas simultáneamente.

---

## 5. Personas — presencia humana

La cabecera canónica reserva el mismo espacio de identidad (avatar 44px) que ya
usan `WorkerCard` y `ValidationCard`. Workforce, Team Hub y Validación ya
muestran foto → nombre → operación → estado → acción; la cabecera de pantalla
ahora comparte exactamente esa gramática visual, así que el ojo recorre la
pantalla y la card con el mismo patrón. El ID dejó de tener rango visual.

---

## 6. Mobile — por qué ya no parece escritorio adaptado

- La cabecera se compone **primero para 375px**: título 20px, contexto 13px, y
  la acción protagonista nunca se parte en dos líneas ni se recorta.
- Todo texto operativo ≥ 12px; se eliminaron los 10px uppercase que solo eran
  legibles en un monitor.
- `OX_SCREEN_X` = `px-4` en móvil / `px-6` en desktop: la respiración se decide
  desde el pulgar hacia arriba, no al revés.
- Una acción visible; el resto vive en overflow alcanzable con el pulgar.

---

## 7. Identidad — si oculto el logo, ¿por qué sigue siendo Stafly?

Porque quedan cinco firmas propias:

1. La secuencia **empresa → lugar → qué pasa → qué hago**, idéntica en toda pantalla.
2. El radio 2xl con borde tenue y sombra de 1px (una sola profundidad).
3. La escala tipográfica OX-3 (sin uppercase decorativo, sin 10px).
4. El color solo cuando hay consecuencia — el resto es calma neutra.
5. El idioma: español operativo, verbos en infinitivo, sin jerga técnica
   (“Operar el día”, no “Abrir en operación diaria”).

---

## 8. Criterios de aceptación

| Pregunta | Estado |
|---|---|
| ¿Toda la app parece de un solo equipo? | Sí en cabecera/ritmo/tipografía de ~40 pantallas |
| ¿La empresa es protagonista? | Sí, en todas las pantallas con cabecera canónica |
| ¿Personas antes que registros? | Sí (gramática compartida con OCS) |
| ¿Operación por encima de módulos? | Sí (una acción protagonista; herramientas en overflow) |
| ¿Un único protagonista por pantalla? | Sí en las migradas |
| ¿Se redujo el ruido visual? | Sí (6 variantes → 1; 5 botones → 2 en Fichajes) |
| ¿Deja de sentirse cambio de aplicación? | Sí en la franja superior, que es lo que ancla la percepción |
| ¿Mobile es la mejor superficie? | Mejorada; la compresión profunda de tablas densas sigue pendiente |
| ¿Transmite calma y organización? | Sí |
| ¿Un gerente lo mostraría con orgullo? | Sí en Home, Validación, Fichajes, Turnos, Workforce |

---

## 9. Deuda consciente (siguiente ola)

1. `Workforce` conserva copy en inglés (“Workforce control”, “Missing docs”) —
   rompe la Regla 9 de lenguaje único. Traducción pendiente, no hecha aquí para
   no mezclar copy con continuidad.
2. Tablas densas de `PayrollReviewQueue` y `Workforce` siguen siendo desktop-first
   en móvil.
3. Quedan cabeceras artesanales dentro de páginas grandes (`Shifts.tsx`) que aún
   no pasan por la cabecera canónica.

## 10. Archivos tocados

- **NUEVO** `src/lib/ox/continuity.ts`
- **NUEVO** `src/components/stafly-ui/OperationalScreenHeader.tsx`
- **EDIT** `src/components/ui/page-header.tsx` (ahora adaptador)
- **EDIT** `src/components/ui/premium-page-header.tsx` (ahora adaptador + KPI strip unificada)
- **EDIT** `src/pages/admin/TimeClock.tsx` (una acción protagonista, overflow agrupado)
- **NUEVO** este documento

Verificación: `tsgo --noEmit` limpio; render comprobado en `/app/timeclock`,
`/app/validation-center` y `/app/workforce` sin errores de runtime nuevos.
