## Operation-First Experience Pass

Rediseño de experiencia basado en frecuencia real de uso. Solo capa visual y de navegación: sin tocar backend, payroll, RLS, auth, Operational Signals, OCS ni lógica de negocio.

### Fase 1 — Home operativo (móvil + escritorio)
- El Home deja de listar módulos. Cuatro anclas permanentes: Workers, Shifts, Time Clock, Payroll.
- Todo lo demás baja a un acceso secundario ("Más herramientas"), sin eliminarse.
- Se conserva el titular de estado y el bloque "Hoy" ya existentes; se recorta el resto.

### Fase 2 — Empresa como experiencia premium
- El cambio de empresa deja de ser un icono: pasa a ser un bloque de identidad con nombre y logo visibles.
- Móvil: hoja inferior a pantalla completa, filas de 56px, empresa activa marcada.
- Un solo toque para cambiar; estado de carga explícito y confirmación al terminar.

### Fase 3 — Shifts: hoy y próximos primero
- Vista inicial en dos bloques: "Hoy" y "Próximos".
- Historial y turnos pasados pasan a una pestaña/sección secundaria, sin peso visual.
- Filtros colapsados por defecto en móvil.

### Fase 4 — Crear turno: secuencia mental
- Reconstrucción en pasos cortos siguiendo el orden del usuario: cuándo → dónde → qué → quién.
- Un objetivo por pantalla, sin scroll largo, texto de ayuda reducido al mínimo.
- Mismos campos y mismo guardado que hoy: solo cambia la secuencia y la presentación.

### Fase 5 — Team building inmediato
- Al entrar al equipo de un turno, la primera pantalla ya permite añadir gente.
- Los resúmenes de cobertura pasan a una franja compacta arriba, no a una pantalla previa.

### Fase 6 — Formularios nativos en móvil
- Eliminar desplazamiento horizontal, alturas excesivas y jerarquías dispares.
- Campos a ancho completo, teclado adecuado por tipo de dato, acción principal fija abajo.

### Fase 7 — Continuidad
- Pasar las pantallas tocadas al mismo ritmo, densidad, tipografía y profundidad del Centro de Validación.
- Voz única en español y mismos componentes de estado y aviso.

### Detalles técnicos
- Archivos previstos: `MobileAdminHome.tsx`, `admin/Home.tsx`, `ContextSwitcher.tsx`, `admin/Shifts.tsx` y vistas asociadas, `ShiftFormShell.tsx` / `ShiftFormFields.tsx` (composición, no contrato de datos), `MobileShiftTeamHub.tsx`, `Auth.tsx`.
- Reutilización obligatoria de OCS, `notify()`, `StatusBadge`, escala móvil OX-3 y tokens OX-2.
- Sin migraciones, sin cambios en consultas ni permisos.

### Sobre LOGIN
El punto de "teléfono como método principal" implica habilitar autenticación por teléfono, que es backend/auth y queda fuera de las restricciones indicadas. Propongo, dentro del alcance: una sola puerta de entrada visual, jerarquía móvil pensada para workers y captains, y el campo de teléfono como principal **solo si ya existe soporte**; si no, lo dejo señalado y lo tratamos aparte.

### Entrega
Fases 1 a 3 en la primera tanda, luego 4 a 7. Cada fase se verifica en móvil y escritorio antes de continuar.
