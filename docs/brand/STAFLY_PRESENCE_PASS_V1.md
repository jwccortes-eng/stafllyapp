# STAFLY — PRESENCE PASS V1

> "Construir una experiencia que haga sentir orgullosa a la empresa que la utiliza."

Documento de dirección creativa y de producto. Sin código, sin componentes nuevos,
sin cambios de backend. Todo se resuelve con **composición** sobre lo que ya existe:
OCS, StatusBadge, ValidationCard, TeamCard, WorkerCard, ShiftCard, ContextSwitcher,
KPI Cards, Terminal Cards y el sistema de feedback.

---

## 0. El diagnóstico en una frase

Stafly ya sabe **qué** decir. Todavía no ha decidido **quién habla**.

Hoy, en la mayoría de pantallas, el que recibe al usuario es el software: un menú,
una fila de KPIs, un título de módulo. La empresa aparece como un dato en la esquina
y las personas aparecen como filas debajo de un estado. Eso no se corrige con más
diseño; se corrige cambiando el orden de aparición de los tres protagonistas:

```text
Hoy:      Software  →  Métrica   →  Registro  →  Persona
Debe ser: Empresa   →  Persona   →  Operación →  Stafly (al fondo, sosteniendo)
```

Ese giro de orden es el 80% de la percepción. No requiere una sola card nueva.

---

## 1. Los 15 cambios de mayor impacto en percepción

Ordenados por impacto sobre "esta empresa se ve organizada", no por esfuerzo técnico.

### 1. La primera línea de cada pantalla es la empresa, no el módulo
Hoy el usuario lee "Command Center", "Payroll Review Queue", "Shift Ops". Son nombres
del fabricante, no del anfitrión. La cabecera debe leerse en dos alturas: arriba y en
tono discreto la empresa ("Quality Staff · Operación de hoy"), y debajo, con peso, la
frase humana de lo que está pasando. El módulo deja de ser el título y pasa a ser el
contexto.

### 2. Un solo héroe por pantalla, elegido a mano
Cada superficie debe declarar explícitamente cuál es su héroe: una persona, un turno,
una decisión o una confirmación. Todo lo demás baja un escalón de contraste. Hoy
Today Hub, Team Hub y Validation Center tienen tres o cuatro elementos compitiendo con
el mismo peso visual; el ojo no descansa y la sensación es de "tablero", no de mando.

### 3. Las personas suben por encima del estado
En Team Hub, Assign Workers y Validation Center la unidad de lectura debe ser
*persona con contexto*, no *estado con nombre adjunto*. WorkerCard ya lo permite:
avatar y nombre primero, estado como acompañamiento. El cambio es de composición —
dejar de agrupar visualmente por columna de estado y empezar a agrupar por gente.

### 4. Rostros reales en toda superficie que decida sobre alguien
Ninguna pantalla donde se aprueba, rechaza, asigna o remueve a una persona debería
mostrar solo iniciales. Donde hay foto, se usa; donde no, la inicial se trata con
dignidad (mismo tamaño, mismo anillo, nunca un cuadro gris genérico). Decidir sobre
alguien sin verle la cara es exactamente lo que hace que un ERP se sienta frío.

### 5. Los KPIs dejan de ser el recibimiento
Un usuario que abre la app y recibe cuatro números no siente control: siente examen.
Los KPI Cards deben aparecer **después** de la primera respuesta humana ("Hoy trabajan
34 personas en 6 turnos. Todo cubierto."). El número explica; no encabeza.

### 6. La calma se compone, no se anuncia
Cuando no hay nada que resolver, la pantalla debe verse notablemente **más vacía** que
cuando hay incidencias: menos bloques, más aire, un único mensaje sereno. Hoy el
estado de calma ocupa el mismo espacio que el estado de crisis, así que la operación
tranquila se siente igual de tensa que la operación rota.

### 7. La urgencia se gana el color; nada más lo usa
Un solo elemento por pantalla puede llevar el rojo/ámbar. Si tres bloques gritan,
ninguno se escucha y la aplicación parece nerviosa. StatusBadge ya distingue familias:
lo que falta es la disciplina de composición de permitir un único acento cálido por
vista y bajar el resto a neutro.

### 8. Cada pantalla termina con un cierre, no con un scroll que se acaba
Después de la última card debe haber un remate: una línea de cierre ("No hay nada más
pendiente en esta operación"), una firma discreta de Stafly, un respiro. Terminar en
el vacío es la marca inconfundible del software genérico.

### 9. El Terminal Card se convierte en momento, no en aviso
Cerrar un turno o aprobar horas es el instante de mayor orgullo del producto. Ese
momento merece la pantalla entera por dos segundos: qué ocurrió, con qué evidencia,
qué sigue. Hoy compite con la lista que lo rodea y el logro se diluye.

### 10. El ContextSwitcher se lee como cabecera de casa, no como selector
Debe percibirse como la placa de la empresa en la puerta: logo, nombre, modo, un
punto de estado tranquilo. La flecha de "cambiar" es secundaria. El gesto de cambiar
de empresa es raro; el de reconocer dónde estoy es constante.

### 11. Stafly firma abajo, nunca arriba
La marca del fabricante pertenece al pie de la casa, al login y a los correos. En la
operación diaria, el nombre que debe estar arriba es el del cliente. Stafly gana
prestigio precisamente por saber ceder ese lugar.

### 12. Una sola voz en español operativo, en toda superficie
Mientras convivan "No-show", "Pending", "Draft" y "Sin check-in", la app parece
ensamblada por equipos distintos. La unificación de vocabulario es el cambio más
barato con mayor efecto en la percepción de una sola mente detrás del producto.

### 13. Los números siempre acompañados de significado
"12" no dice nada. "12 personas esperan aprobación de horas — 3 desde ayer" dice
todo. El contrato ya existe en KpiCard (`meaning`); falta aplicarlo sin excepción,
incluyendo los ceros, que deben decir por qué son cero.

### 14. La densidad debe bajar donde se decide y subir donde se consulta
Validation Center y Team Hub: aire, foco, una decisión a la vez. Listados y reportes:
densidad alta, tabla honesta. Hoy ambos tipos usan la misma densidad media y el
resultado es que ni se decide con calma ni se consulta con eficiencia.

### 15. El portal del worker debe recibir igual de bien que el panel del admin
Si la persona que trabaja abre una versión visiblemente más pobre de la casa, la
empresa se ve peor ante su propia gente. Mismo tratamiento de identidad, mismo
lenguaje, misma calidad de cierre. Es el cambio con mayor retorno reputacional.

---

## 2. Qué momentos hoy generan orgullo

- **El Centro de Validación.** Es el canon del producto. Muestra a la persona, la
  evidencia, la consecuencia de cada decisión y se niega a acusar sin pruebas. Un
  gerente puede mostrar esta pantalla sin explicarla.
- **La confirmación tras cerrar un turno.** Cuando aparece el Terminal Card, hay una
  sensación real de "esto quedó hecho y quedó registrado".
- **El bloqueo honesto al asignar a alguien que no puede trabajar.** Decir la razón
  exacta en lugar de deshabilitar en silencio comunica seriedad y protege a la empresa.
- **Los estados de asistencia sin acusación implícita.** "Pendiente de llegada" en vez
  de "no-show" es una decisión moral, y se nota.
- **El Team Hub cuando la cobertura está completa.** La lectura "el equipo está listo"
  es el tipo de frase que un cliente quiere oír de su proveedor.

Patrón común: **todos estos momentos ponen a la persona antes que al dato y explican
la consecuencia.** Ese es, literalmente, el ADN a replicar.

---

## 3. Qué momentos todavía parecen un SaaS genérico

- **La apertura de la aplicación.** Se entra a un panel, no a una empresa. Nada indica
  que alguien cuidó la operación antes de que yo llegara.
- **Cualquier pantalla que empieza con una fila de tarjetas numéricas.** Es la postal
  exacta de cualquier producto B2B de los últimos diez años.
- **Los módulos administrativos y de configuración.** Nombres de sistema, listas
  grises, cero presencia de personas. Aquí la marca desaparece por completo.
- **Reportes y colas de payroll.** Se leen como exportaciones, no como trabajo humano
  esperando revisión.
- **Los estados vacíos.** "No hay datos" es la frase que rompe todo el trabajo previo.
- **Las pantallas donde una persona es una fila.** En cuanto alguien deja de tener
  cara, el producto pierde su alma.
- **El final de casi cualquier scroll.** La experiencia no cierra: se agota.

---

## 4. Cambios de composición que transforman la experiencia sin tocar backend

1. **Invertir el orden de bloques**: identidad → frase humana del día → decisiones →
   operación → métricas → cierre. Es reordenar, no construir.
2. **Aplicar la regla de un solo acento**: un único elemento en color de urgencia por
   pantalla; el resto en neutro.
3. **Reagrupar por persona, no por estado**, en todas las superficies de equipo.
4. **Reducir bloques visibles en estado tranquilo**: la calma se demuestra con vacío
   intencional.
5. **Dar tamaño de héroe a un único elemento por vista** y bajar dos niveles el resto.
6. **Reservar el ancho completo para el momento terminal**, aislándolo de su lista.
7. **Añadir un remate de cierre** al final de cada superficie principal.
8. **Homogeneizar cabeceras**: la misma estructura de dos alturas en todo el ecosistema.
9. **Escribir significado junto a todo número**, ceros incluidos.
10. **Elevar el portal del worker** a la misma composición del panel admin.

Ninguno requiere una card nueva, una consulta nueva ni una migración.

---

## 5. Superficies que deben ser la referencia del ecosistema

| Superficie | Rol como referencia |
| --- | --- |
| **Centro de Validación** | Canon absoluto: identidad → evidencia → consecuencia → decisión. Todo lo demás se mide contra él. |
| **Team Hub** | Referencia de cómo se muestra un grupo de personas y una cobertura sin volverse un tablero. |
| **Terminal Card tras cierre de turno** | Referencia de cómo se celebra el trabajo terminado. |
| **Today Hub (con la reordenación propuesta)** | Referencia de recibimiento: empresa primero, frase humana después, métricas al final. |
| **ContextSwitcher** | Referencia de presencia de marca del anfitrión sin ruido. |

Regla de gobierno: **ninguna superficie nueva se aprueba si no puede colocarse al lado
del Centro de Validación sin parecer de otro producto.**

---

## 6. Recorrido completo: apertura → operación → cierre

**Apertura — se pierde fuerza.**
El usuario entra y el software se presenta antes que la empresa. No hay saludo con
contexto ni señal de que alguien vigiló la noche. Gana quien reciba con: la empresa,
la hora, el estado general en una frase, y una sola cosa que atender.

**Orientación — se gana fuerza si se reordena.**
El Today Hub ya sabe priorizar por atención. Pierde fuerza porque presenta todo a la
vez. Con un héroe único y las métricas desplazadas al final, este momento pasa de
"panel" a "parte de novedades".

**Equipo — momento más fuerte del recorrido.**
Team Hub y las WorkerCards son donde el producto se siente humano. Se pierde fuerza
solo cuando el agrupamiento por estado convierte a las personas en categorías.

**Decisión — el punto más alto.**
El Centro de Validación es donde Stafly demuestra carácter. Aquí no hay que cambiar
nada salvo darle más aire y una decisión a la vez.

**Ejecución en campo — punto más débil.**
El portal del worker se siente una versión reducida de la casa. Aquí la empresa queda
mal frente a su propia gente. Es la brecha más costosa en términos de reputación.

**Cierre — se gana y se desperdicia en el mismo segundo.**
El Terminal Card entrega la satisfacción correcta, pero encogido dentro de una lista.
Aislarlo convierte un aviso en un momento de orgullo.

**Salida — no existe.**
Nadie despide al usuario. Una línea final de calma cerraría el círculo emocional:
*"Todo lo de hoy quedó registrado."*

---

## 7. La pregunta final

> Si mañana un CEO mostrara Stafly frente a su cliente más importante,
> ¿sentiría orgullo o sentiría que todavía falta identidad?

**Sentiría orgullo durante unos noventa segundos, y luego dudaría.**

Orgullo cuando abra el Centro de Validación, el Team Hub con la cobertura completa o
la confirmación de un turno cerrado: ahí Stafly demuestra que su empresa registra,
verifica y decide con pruebas. Eso no lo puede fingir un competidor, y hace ver
organizada a la empresa, no bonita a la aplicación. Es exactamente el efecto buscado.

La duda llegaría al salir de esas tres habitaciones. En la apertura, en los reportes,
en la configuración y en el portal del worker, el producto vuelve a hablar como
cualquier software: recibe con métricas, nombra los módulos con su nombre de fábrica,
convierte a las personas en filas y termina sin cerrar. Ese contraste es el problema:
no es que falte calidad, es que la calidad **no es continua**. Y el cliente que mira
por encima del hombro no juzga la mejor pantalla; juzga la transición entre ellas.

Falta identidad, sí — pero no falta inventarla. Ya existe, escrita completa, en el
Centro de Validación. Lo único que falta es tener el coraje de aplicar esa misma
gramática —empresa primero, persona después, evidencia siempre, consecuencia explícita,
cierre real— en todas las habitaciones restantes de la casa.

Cuando eso ocurra, el CEO no dirá "qué software tan bonito".
Dirá, señalando la pantalla: **"así trabajamos nosotros".**
