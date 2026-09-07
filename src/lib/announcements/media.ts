/**
 * COMUNICADOS — acceso a media.
 *
 * El almacén `announcement-media` es privado: la imagen de un comunicado hereda
 * exactamente la misma autorización que el comunicado (política en la base de
 * datos). Aquí solo se firma el acceso temporal para quien ya está autorizado;
 * si no lo está, la firma falla y no se muestra nada.
 */
import { supabase } from "@/integrations/supabase/client";

const BUCKET = "announcement-media";
const MARKER = `/${BUCKET}/`;

/** Ruta del objeto dentro del almacén a partir de la URL guardada. */
export function announcementMediaPath(url: string): string | null {
  if (!url) return null;
  const idx = url.indexOf(MARKER);
  if (idx === -1) return null;
  const raw = url.slice(idx + MARKER.length).split("?")[0];
  return raw ? decodeURIComponent(raw) : null;
}

export function isVideoMedia(url: string): boolean {
  return /\.(mp4|webm|mov|ogg)(\?|$)/i.test(url);
}

/**
 * Devuelve una URL utilizable: firmada si el archivo vive en el almacén de
 * comunicados, o la original si es un enlace externo. `null` cuando la persona
 * no está autorizada.
 */
export async function resolveAnnouncementMediaUrl(url: string): Promise<string | null> {
  const path = announcementMediaPath(url);
  if (!path) return url;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 30);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}
