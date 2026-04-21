import { supabase } from "@/integrations/supabase/client";

const BUCKET = "employee-documents";
const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour

/**
 * Resolve a stored employee-document value to a viewable URL.
 *
 * The `employee-documents` bucket is private. Older rows may still contain a
 * full public URL (which 404s with "Bucket not found"). This helper:
 *  - extracts the storage path when a public URL is detected
 *  - assumes the stored value is already a path otherwise
 *  - returns a time-limited signed URL the browser can open
 *
 * Returns null when a signed URL cannot be generated.
 */
export async function resolveEmployeeDocumentUrl(
  stored: string | null | undefined,
): Promise<string | null> {
  if (!stored) return null;

  let path = stored;

  const publicMarker = `/storage/v1/object/public/${BUCKET}/`;
  const signedMarker = `/storage/v1/object/sign/${BUCKET}/`;
  const idxPublic = stored.indexOf(publicMarker);
  const idxSigned = stored.indexOf(signedMarker);

  if (idxPublic !== -1) {
    path = stored.slice(idxPublic + publicMarker.length);
  } else if (idxSigned !== -1) {
    // strip query string (token) from any previously signed URL
    path = stored.slice(idxSigned + signedMarker.length).split("?")[0];
  } else if (/^https?:\/\//i.test(stored)) {
    // Unknown URL we cannot recover into a path — return as-is so a click at
    // least surfaces the original error rather than silently doing nothing.
    return stored;
  }

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

/**
 * Open a stored employee-document in a new tab using a signed URL.
 * Use as the click handler for "view"/"download" affordances.
 */
export async function openEmployeeDocument(
  stored: string | null | undefined,
): Promise<void> {
  const url = await resolveEmployeeDocumentUrl(stored);
  if (url) window.open(url, "_blank", "noopener,noreferrer");
}
