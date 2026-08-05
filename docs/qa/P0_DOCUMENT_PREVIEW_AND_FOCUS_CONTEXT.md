# P0 — Document Preview + Context Loss on Tab Focus

## Estado

Implementado en frontend, sin cambios de RLS, auth, tenants, storage policies, VWC, estados de revisión ni datos.

## Causa raíz demostrada

### Vista previa

`DocumentsCenter` leía `file_type` desde `employee_documents`, pero la normalización lo descartaba y el modal recibía siempre `file_type: undefined`. Además, `DocumentPreview` clasificaba PDF pero renderizaba incondicionalmente `PdfFallbackCard`: nunca intentaba un `iframe`. Por eso el mismo signed URL abría en otra pestaña mientras Stafly afirmaba que la vista previa no estaba disponible. No era evidencia de formato inválido, permisos insuficientes ni URL expirada.

El visor ahora conserva el MIME guardado, combina MIME y extensión real para detectar JPEG/PNG/PDF, renderiza imágenes con `img` y PDF con `iframe`, y conserva un fallback explícito para formatos sin visor integrado. La acción externa sigue usando una URL firmada temporal de una hora. “Renovar vista previa” regenera la URL sin cerrar el modal.

### Pérdida de contexto

La selección vivía únicamente en `useState(previewRow)`. Durante una rehidratación de sesión/compañía, `AdminLayout` reemplazaba todo el `Outlet` por `AdminLayoutFullScreenLoader`, desmontando `DocumentsCenter`, el modal y sus inputs. Al volver, no había identidad navegable para recuperar la revisión.

Ahora `?document=ed-<id>&employee=<id>` es la identidad de navegación. El documento se vuelve a resolver exclusivamente dentro de las filas autorizadas y company-scoped; si no aparece, falla cerrado. Las revalidaciones con un usuario ya hidratado son background refresh y no desmontan el `Outlet`. El borrador no guardado de extracción permanece en memoria por `document_id`; nunca se persiste en storage.

## Instrumentación

`DocumentsCenter`, `DocumentPreviewDialog`, `AuthProvider` y `CompanyProvider` emiten mount/unmount forense. La instrumentación existente registra `focus`, `blur`, `visibilitychange`, `pageshow`, `pagehide` y eventos de sesión sin tokens.

## Contrato del archivo

- Bucket: privado `employee-documents`.
- URL: firmada, regenerable, TTL 3600 segundos.
- Viewer: `img` para JPEG/PNG/GIF/WebP/BMP; `iframe` para PDF; fallback para otros.
- La URL firmada no se registra ni se expone en logs.
- CSP/X-Frame-Options: no hay política frontend que bloquee `frame-src`; los headers del objeto y el visor nativo del navegador siguen siendo autoridad. Un fallo de embed no se presenta como archivo inexistente.
- `Content-Type` guardado: `employee_documents.file_type`, ahora propagado al visor.
- `Content-Type`/`Content-Disposition` devueltos: dependen de metadata del objeto privado; no se alteraron headers ni archivos.

## QA

- Unitario: detección JPEG, PNG, PDF por MIME/extensión y formato no soportado.
- Refresh con `document_id`: reabre solo si la consulta tenant-scoped lo devuelve.
- Usuario sin permiso/cross-tenant: el id no resuelve y el modal permanece cerrado.
- URL expirada: la acción de renovación solicita otra URL firmada sin perder selección ni borrador.
- Cambio de pestaña: el shell y el modal permanecen montados durante background refresh.
- Borrador local: se conserva por documento durante remount accidental de la superficie.

## Evidencia pendiente

El archivo `REC-20260805010754.mp4` no estaba montado entre los uploads disponibles y la sesión del navegador de QA estaba `signed_out`. Por tanto, no se declara reproducción autenticada exacta del video ni validación física en Safari iPhone/Chrome Android en este entorno. Estas comprobaciones deben ejecutarse con una sesión real y el archivo del caso, registrando `document_id`, nombre, headers de respuesta y capturas antes/después sin publicar la URL firmada.