/**
 * COMUNICADOS OFICIALES — adjuntos de una versión.
 *
 * Un adjunto NO es un documento del expediente de la persona: pertenece a una
 * VERSIÓN de un comunicado y hereda exactamente su autorización
 * (empresa + audiencia congelada). Se guarda la RUTA del objeto en el almacén
 * privado `announcement-media`; nunca una URL pública.
 *
 * Una versión publicada es inmutable, también en sus adjuntos: cualquier
 * cambio material exige una versión nueva (regla en la base de datos).
 */
import { supabase } from "@/integrations/supabase/client";

const BUCKET = "announcement-media";
const SIGNED_TTL_SECONDS = 60 * 30;

export type AttachmentKind = "image" | "pdf" | "doc" | "sheet" | "file";

export interface CommunicationAttachment {
  /** Ruta dentro del almacén privado. */
  path: string;
  /** Nombre original visible para la persona. */
  name: string;
  mime: string;
  size: number;
  kind: AttachmentKind;
}

/** Límites reales de la infraestructura actual (bucket privado, 25 MB). */
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_VERSION = 10;

export const ALLOWED_MIME_TYPES: Record<string, AttachmentKind> = {
  "image/jpeg": "image",
  "image/png": "image",
  "image/webp": "image",
  "image/gif": "image",
  "image/heic": "image",
  "image/heif": "image",
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "doc",
  "application/vnd.ms-excel": "sheet",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "sheet",
};

const EXT_FALLBACK: Record<string, AttachmentKind> = {
  jpg: "image",
  jpeg: "image",
  png: "image",
  webp: "image",
  gif: "image",
  heic: "image",
  pdf: "pdf",
  doc: "doc",
  docx: "doc",
  xls: "sheet",
  xlsx: "sheet",
};

export const ATTACHMENT_ACCEPT =
  ".jpg,.jpeg,.png,.webp,.gif,.heic,.pdf,.doc,.docx,.xls,.xlsx," +
  Object.keys(ALLOWED_MIME_TYPES).join(",");

export function attachmentKind(mime: string, name: string): AttachmentKind {
  const byMime = ALLOWED_MIME_TYPES[mime?.toLowerCase?.() ?? ""];
  if (byMime) return byMime;
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return EXT_FALLBACK[ext] ?? "file";
}

/** Validación de tipo y tamaño antes de subir. Mensaje listo para mostrar. */
export function validateAttachment(file: File): string | null {
  const mime = (file.type || "").toLowerCase();
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const allowed = !!ALLOWED_MIME_TYPES[mime] || !!EXT_FALLBACK[ext];
  if (!allowed) {
    return "Tipo de archivo no permitido. Se aceptan imágenes, PDF, Word y Excel.";
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return `El archivo pesa ${formatBytes(file.size)}. El máximo por archivo es ${formatBytes(
      MAX_ATTACHMENT_BYTES,
    )}.`;
  }
  if (file.size === 0) return "El archivo está vacío.";
  return null;
}

export function formatBytes(bytes: number): string {
  if (!bytes || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function attachmentKindLabel(kind: AttachmentKind): string {
  if (kind === "image") return "Imagen";
  if (kind === "pdf") return "PDF";
  if (kind === "doc") return "Documento";
  if (kind === "sheet") return "Hoja de cálculo";
  return "Archivo";
}

/** Normaliza la columna `attachments` (jsonb) a una lista tipada. */
export function attachmentList(value: unknown): CommunicationAttachment[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is Record<string, unknown> => !!v && typeof v === "object")
    .map((v) => ({
      path: String(v.path ?? ""),
      name: String(v.name ?? "Archivo"),
      mime: String(v.mime ?? ""),
      size: Number(v.size ?? 0),
      kind: (v.kind as AttachmentKind) ?? attachmentKind(String(v.mime ?? ""), String(v.name ?? "")),
    }))
    .filter((a) => a.path.length > 0);
}

/** Sube un archivo al almacén privado y devuelve el adjunto. */
export async function uploadAttachment(
  companyId: string,
  file: File,
): Promise<{ attachment: CommunicationAttachment } | { error: string }> {
  const invalid = validateAttachment(file);
  if (invalid) return { error: invalid };

  const ext = file.name.split(".").pop()?.toLowerCase() || "bin";
  const path = `${companyId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type || undefined });
  if (error) return { error: error.message };

  return {
    attachment: {
      path,
      name: file.name,
      mime: file.type || "",
      size: file.size,
      kind: attachmentKind(file.type || "", file.name),
    },
  };
}

/**
 * URL temporal para abrir el adjunto. `null` cuando la persona no está
 * autorizada: la regla vive en la base de datos, no en la pantalla.
 */
export async function resolveAttachmentUrl(path: string): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_TTL_SECONDS);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}
