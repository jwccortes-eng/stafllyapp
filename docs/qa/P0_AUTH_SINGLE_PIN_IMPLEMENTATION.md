# P0 — PIN único por usuario de acceso · Duván Gallego y Sebastián Villegas

**Fecha:** 2026-08-12 (UTC)
**Alcance:** solo dos personas. Sin creación de usuarios, sin recrear acceso, sin tocar nómina ni identidades.
**Confidencialidad:** ningún PIN se muestra ni se registra. Las verificaciones se hicieron por igualdad, no por valor.

---

## 1. Estado previo

| Persona | Usuario de acceso | Registro | Empresa | Activo | PIN |
|---|---|---|---|---|---|
| Duván Gallego | `4338b336…` | `cad09ca0…` | MyStaff | sí | PIN A (+ huella antigua de otro PIN) |
| Duván Gallego | `4338b336…` | `4d603205…` | Quality Staff | no | PIN B, marcado como temporal |
| Sebastián Villegas | `e4793c12…` | `4df1c02f…` | MyStaff | sí | PIN C |
| Sebastián Villegas | `e4793c12…` | `3bccba54…` | Quality Staff | sí | PIN D, marcado como temporal |

Cada persona tenía **un solo usuario de acceso** pero **dos PIN distintos**, uno por empresa. El acceso por teléfono resolvía siempre el registro activo, por lo que el PIN de la otra empresa fallaba.

## 2. Cambios ejecutados

1. **PIN canónico**: el del **registro activo de MyStaff** de cada persona (`cad09ca0…` para Duván, `4df1c02f…` para Sebastián). Es el más reciente y el que ya resolvía el acceso por teléfono; los de Quality Staff estaban marcados como temporales.
2. **Propagación**: ese PIN se escribió en el registro de Quality Staff de cada persona. Ambas empresas comparten ahora exactamente el mismo valor.
3. **Retiro de PIN legacy**: los PIN divergentes de Quality Staff dejaron de existir; se retiró también la huella criptográfica antigua guardada en el registro de MyStaff de Duván, que apuntaba a un PIN anterior.
4. **Marcador de PIN temporal** desactivado en los cuatro registros.
5. **Contadores de intentos fallidos** de ambos teléfonos eliminados (el bloqueo de Duván ya estaba vencido).

No se tocó: usuario de acceso, membresías (`company_users`), roles, permisos de módulo o acción, empresas, UUID de empleado, Internal ID (`210` Duván / `675` Sebastián en Quality Staff), documentos, turnos, fichajes ni nómina.

## 3. Verificación posterior

| Registro | Empresa | Activo | PIN igual al canónico | Huella antigua | PIN temporal | Internal ID |
|---|---|---|---|---|---|---|
| `cad09ca0…` Duván | MyStaff | sí | sí (canónico) | no | no | — |
| `4d603205…` Duván | Quality Staff | no | sí | no | no | 210 |
| `4df1c02f…` Sebastián | MyStaff | sí | sí (canónico) | no | no | — |
| `3bccba54…` Sebastián | Quality Staff | sí | sí | no | no | 675 |

Membresías intactas tras el cambio: ambos usuarios siguen con rol `admin` en Quality Staff y en MyStaff. Sin registros de bloqueo activos para ninguno de los dos teléfonos.

## 4. QA de acceso

| Comprobación | Duván | Sebastián |
|---|---|---|
| Ingresar con su teléfono y su PIN | ✓ (resuelve MyStaff, PIN canónico) | ✓ |
| Acceso a Quality Staff | ✓ vía membresía `admin` del mismo usuario | ✓ |
| Cambiar a MyStaff | ✓ vía membresía `admin` del mismo usuario | ✓ |
| Volver a ingresar con el mismo PIN | ✓ un único valor en todo el sistema | ✓ |
| Misma sesión al cambiar de empresa | ✓ el cambio de empresa no reautentica | ✓ |
| Mismo PIN en ambas compañías | ✓ verificado por igualdad | ✓ |

Nota operativa: el registro de Duván en Quality Staff sigue **inactivo**. Eso no afecta su acceso ni su rol de administrador allí (que depende de la membresía), pero conviene decidir aparte si debe reactivarse como trabajador.

## 5. Respuestas

1. **¿Qué PIN quedó como canónico?** El del registro activo de **MyStaff** de cada persona (`cad09ca0…` Duván, `4df1c02f…` Sebastián). Valor no revelado.
2. **¿Cuántos registros legacy fueron desactivados?** **Tres**: los PIN divergentes de Quality Staff de Duván y de Sebastián, y la huella criptográfica antigua del registro de MyStaff de Duván. Ningún registro de empleado fue desactivado ni borrado.
3. **¿Pueden ingresar correctamente a ambas compañías?** Sí. Un solo teléfono, un solo PIN, y membresía `admin` verificada en Quality Staff y MyStaff para ambos.
4. **¿Se modificó algún dato operativo distinto al sistema de PIN?** No. Solo campos de PIN y los contadores de intentos fallidos ya vencidos.

## 6. Pendiente (no ejecutado)

- Los registros de **Parceros** de ambas personas conservan un PIN genérico heredado y no están vinculados a ningún usuario de acceso ni tienen teléfono, por lo que no participan en el acceso. Requieren decisión aparte.
- La política estructural (PIN como propiedad de la persona en una tabla dedicada, no por empresa) sigue pendiente; este cambio alinea los valores pero no cambia el modelo de datos.
