# OX-9.1 — QA visual autenticado y continuidad móvil

Sesión real autenticada (admin, empresa **My Staff Solution LLC**, entorno STAGING/DEMO).
Recorrido: Home → Turnos → Detalle de turno → Gestionar equipo → Equipo (workers) → Time Clock → Home.
Sólo observación. No se implementó, agregó ni rediseñó nada.

## Matriz de viewports

| Viewport | Tema | Scroll horizontal | Veredicto |
| --- | --- | --- | --- |
| iPhone SE (375×667) | light | 0 px en las 4 rutas | **FAIL** (por continuidad, no por layout) |
| iPhone 14 (393×852) | light | 0 px | **FAIL** |
| iPhone 14 (393×852) | dark | 0 px | **FAIL** |
| Android estándar (412×915) | light | 0 px | **FAIL** |

`scrollWidth == clientWidth` en Home, Turnos, Time Clock y Equipo en los cuatro viewports:
**el criterio 3 (cero scroll horizontal) es el único que pasa limpio en todos lados.**

## Resultado por criterio

| # | Criterio | Resultado |
| --- | --- | --- |
| 1 | Un solo protagonista por pantalla | FAIL fuera de Home/Turnos |
| 2 | Empresa activa visible y estable | PASS parcial |
| 3 | Cero scroll horizontal | PASS |
| 4 | Ritmo/respiración uniforme | FAIL |
| 5 | Targets de 44px | FAIL |
| 6 | Jerarquía tipográfica única | FAIL |
| 7 | El color sólo comunica | FAIL |
| 8 | Idioma único (español operativo) | FAIL |
| 9 | Sin repetición de la misma información | FAIL |
| 10 | Empty/loading/error con la misma calidad | PASS parcial |

## Hallazgos por pantalla

### Home (`/app`)
- PASS: un solo protagonista, pulso en una frase, sin widgets.
- FAIL: la barra superior dice **"Dashboard"** en inglés y repite lo que ya dice la cabecera con la empresa.
- FAIL: el badge **STAGING / DEMO** flota encima de la barra inferior y tapa la etiqueta "Reloj"/"Equipo".
- FAIL: target de 20 px en la frase-pulso "1 turno hoy" (es un deep-link) y 34 px en el badge "9+".

### Turnos (`/app/shifts?tab=today`)
- PASS: la card OX-9 quedó limpia (identidad + horario + personas).
- FAIL: barra superior en inglés ("Shifts") sobre la cabecera en español.
- FAIL: chip "Necesitan gente 1" mide 36 px.

### Detalle de turno (hoja móvil)
Ruptura más grave del recorrido. La misma carencia se dice **cuatro veces**:
chip "Faltan 1" → línea "0/1 asignados · faltan 1" → alerta "Faltan 1 trabajador" →
alerta "Sin trabajadores asignados".
- FAIL: **dos CTAs "Gestionar equipo" idénticos** en la misma pantalla (uno en "Siguiente paso", otro en la barra de acciones).
- FAIL: cuatro cajas de alerta apiladas con el mismo peso visual: no hay protagonista.
- FAIL: texto legal del pie cortado por la barra inferior.

### Gestionar equipo
- FAIL: vuelve la **barra de progreso** 0/1 que OX-9 eliminó en la lista.
- FAIL grave de color: las tarjetas **"No-show"** y **"Solicitudes"** muestran un chip **verde "Confirmado"**. El color está decorando, no comunicando; comunica lo contrario del dato.
- FAIL: tira de 5 pestañas que se corta en el borde; "Recomendados" queda invisible.
- FAIL: repetición otra vez de "Faltan 1 de 1" en chip, título y subtítulo.

### Equipo / Workers (`/app/workforce`)
- FAIL: 5 KPIs de colores distintos (verde, azul, ámbar, rojo) compitiendo con la lista real de personas: datos antes que personas, justo lo contrario de OX-9.
- FAIL: banner de migración "Centro de personas" ocupa el primer scroll completo.
- FAIL: filas con iconos de 16 y 32 px (por debajo de 44).
- FAIL: la lista aparece por debajo de tres selects y un buscador.

### Time Clock (`/app/timeclock`)
- FAIL: título "Centro de Mando de Tiempo" desborda visualmente el ancho útil en 375 px.
- FAIL: 5 KPIs en rejilla 3+2 desequilibrada; ninguno es decisión.
- FAIL: dos tarjetas vacías de 250 px con el mismo check verde: mucho espacio para decir "no pasa nada".
- PASS: los ceros están explicados con frase humana (criterio de confianza cumplido).

## PQS (Perceived Quality Score) medido

| Dimensión | Home | Turnos | Detalle | Equipo turno | Workers | Time Clock |
| --- | --- | --- | --- | --- | --- | --- |
| Claridad | 4 | 4 | 2 | 2 | 2 | 3 |
| Silencio | 4 | 4 | 1 | 2 | 1 | 2 |
| Ritmo | 4 | 4 | 3 | 2 | 2 | 3 |
| Tacto | 3 | 3 | 4 | 3 | 2 | 4 |
| Confianza | 5 | 5 | 4 | 3 | 4 | 5 |
| **PQS** | **4.0** | **4.0** | **2.8** | **2.4** | **2.2** | **3.4** |

PQS global del recorrido: **3.13**. Umbral de publicación OX-9: ≥ 4.2. **No se alcanza.**

## Confirmación honesta

**No.** La experiencia móvil todavía no se siente como un solo producto.

OX-9 es real y se nota, pero **sólo llega a las dos primeras pantallas**. Home y Turnos
tienen el ritmo, el silencio y el protagonista único que buscábamos. En cuanto el gerente
toca un turno, entra a otra aplicación: vuelven las barras de progreso, las rejillas de
KPIs, los chips verdes sobre datos negativos, los CTAs duplicados y la misma carencia
repetida cuatro veces. Workers y el detalle de turno son hoy las dos pantallas que rompen
la promesa.

## Orden de corrección propuesto (OX-9.2, no ejecutado)

1. Detalle de turno: una sola declaración de carencia y un solo CTA.
2. Gestionar equipo: quitar el chip verde de No-show/Solicitudes y la barra de progreso.
3. Workers: personas primero; KPIs a una sola línea de contexto.
4. Badge STAGING/DEMO por encima de la barra inferior, no encima.
5. Barra superior en español y sin duplicar el título de la cabecera.
6. Time Clock móvil con los tokens OX9.
