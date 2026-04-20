import { supabase } from "@/integrations/supabase/client";

const BUCKET = "shift-attachments";
const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour

/**
 * Resolve a stored attachment value to a viewable URL.
 *
 * Storage strategy after privatization:
 * - New uploads store the storage `path` (e.g. "<companyId>/<shiftId>/abc.jpg")
 * - Legacy rows may already contain a full public URL — we detect those and
 *   try to recover the path so we can still serve them through a signed URL.
 *
 * Returns null if a signed URL cannot be generated.
 */
export async function resolveShiftAttachmentUrl(
  stored: string | null | undefined,
): Promise<string | null> {
  if (!stored) return null;

  let path = stored;

  // Legacy: previously persisted as a full public URL.
  // Public URLs follow the shape `.../storage/v1/object/public/<bucket>/<path>`.
  const publicMarker = `/storage/v1/object/public/${BUCKET}/`;
  const idx = stored.indexOf(publicMarker);
  if (idx !== -1) {
    path = stored.slice(idx + publicMarker.length);
  } else if (/^https?:\/\//i.test(stored)) {
    // Some other URL format we cannot turn into a signed URL — return as-is
    // so the link still degrades gracefully (will 404 if bucket is private).
    return stored;
  }

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) {
    return null;
  }
  return data.signedUrl;
}

/**
 * Resolve a list of stored attachments in parallel.
 */
export async function resolveShiftAttachmentUrls(
  values: Array<string | null | undefined>,
): Promise<Array<string | null>> {
  return Promise.all(values.map((v) => resolveShiftAttachmentUrl(v)));
}
