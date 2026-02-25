

# Plan: Mostrar saludo con nombre, empresa, periodo y estado en todos los tableros

## Resumen
Agregar un encabezado consistente en los 4 tableros principales (Admin Dashboard, Owner Dashboard, MyPayments, Accumulated) que muestre:
- Saludo con nombre y apellido del usuario
- Nombre de la empresa
- Periodo en curso (fechas)
- Estado del periodo (Abierto / Cerrado / Publicado)

## Cambios necesarios

### 1. Hook useAuth - Exponer nombre del usuario
Agregar `fullName` al contexto de autenticacion, cargandolo desde la tabla `profiles` al iniciar sesion.

**Archivo:** `src/hooks/useAuth.tsx`
- Agregar estado `fullName: string | null`
- En `fetchUserData`, hacer query a `profiles` para obtener `full_name`
- Exponerlo en el contexto

### 2. Admin Dashboard (`src/pages/admin/Dashboard.tsx`)
El hero greeting ya muestra empresa y periodo. Se actualizara para:
- Reemplazar "Dashboard" generico por `"{saludo}, {nombre completo}"`
- Asegurar que se muestre el estado con etiqueta clara: "Abierto", "Cerrado" o "Publicado" (basado en `published_at`)
- Agregar la fecha formateada del periodo

### 3. Owner Dashboard (`src/pages/admin/OwnerDashboard.tsx`)
Actualmente solo dice "Vista global". Se agregara:
- Saludo con nombre completo del usuario
- Como es multi-empresa, mostrar "Todas las empresas" o la empresa filtrada
- Periodo mas reciente y su estado

### 4. Portal - Mis Pagos (`src/pages/portal/MyPayments.tsx`)
Actualmente muestra saludo generico sin nombre. Se actualizara:
- Saludo con nombre del empleado (desde `employees` ya vinculado via `employeeId`)
- Empresa del empleado
- Periodo en curso y estado

### 5. Portal - Acumulado (`src/pages/portal/Accumulated.tsx`)
Agregar encabezado similar al de MyPayments con nombre, empresa y periodo actual.

## Detalles tecnicos

### Datos del periodo en curso
Para las vistas de empleado, se necesita cargar el periodo mas reciente de la empresa del empleado (no solo los publicados) para mostrar su estado real.

### Estado del periodo
Se mostrara con badge de color:
- **Abierto** (verde): `status === 'open'` y `published_at === null`
- **Cerrado** (amarillo): `status === 'closed'` y `published_at === null`  
- **Publicado** (azul): `published_at !== null`

### Nombre del usuario
- Admin/Owner: se obtiene de `profiles.full_name`
- Empleado: se obtiene de `employees.first_name + last_name` (ya disponible via `employeeId`)

### Archivos a modificar
1. `src/hooks/useAuth.tsx` - Agregar `fullName` al contexto
2. `src/pages/admin/Dashboard.tsx` - Actualizar hero con nombre
3. `src/pages/admin/OwnerDashboard.tsx` - Agregar header con saludo
4. `src/pages/portal/MyPayments.tsx` - Agregar nombre, empresa y periodo
5. `src/pages/portal/Accumulated.tsx` - Agregar nombre, empresa y periodo

