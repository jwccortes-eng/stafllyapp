/**
 * audio-service-intake — Fase 4 del carril canónico de Smart Service Intake.
 *
 * Entrada:  { company_id, batch_id, files: [{ storage_path, mime_type, file_name }], reference_date }
 * Salida:   { results: [{ file_name, transcript, language, extraction }], model, latency_ms }
 *
 * Pipeline (idéntico al del resto de fuentes, sólo cambia la puerta de entrada):
 *   audio → transcripción → extracción (contrato único) → normalización cliente
 *     → bandeja compartida → draft
 *
 * Garantías duras:
 *  - El llamador debe ser admin/owner de la compañía indicada (tenant guard).
 *  - `company_id` nunca se infiere del audio: viene validado contra roles reales.
 *  - El audio se BORRA del bucket tras transcribirlo: sólo queda la transcripción
 *    y la referencia de trazabilidad.
 *  - SUGGESTION-ONLY: no escribe en scheduled_shifts, shift_assignments,
 *    time_entries, payroll ni documents.
 */

import { createClient } from "npm:@supabase/supabase-js@2.50.0";
import { SERVICE_EXTRACTION_SCHEMA } from "../_shared/service-extraction-schema.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BUCKET = "service-intake-files";
const TRANSCRIBE_MODEL = "openai/gpt-4o-transcribe";
const FALLBACK_AUDIO_MODEL = "google/gemini-3.6-flash";
const EXTRACTION_MODEL = "openai/gpt-5.6-sol";
const MAX_FILES = 5;
const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const SYSTEM_PROMPT = `You read the transcript of a voice note sent by an operations manager of a staffing company. The speaker dictates services (jobs) that need to be scheduled. Spanish, English or a mix of both.

Hard rules:
- Never invent a date, time, venue, client, worker count or role. If the speaker did not say it, return null and set that field confidence to null.
- One voice note can contain several services: return every one you can hear, in the order spoken.
- Keep relative dates VERBATIM as spoken ("mañana", "pasado mañana", "el martes", "la próxima semana", "next Thursday"). Do NOT convert them to a calendar date: the application resolves them.
- Dates spoken as words must be written in numbers, same language: "el catorce de marzo" -> "14 marzo", "March fourteenth" -> "March 14". Never leave a stated date empty because it was spoken in words.
- Times spoken as words MUST be converted to 24h HH:mm: "seis de la tarde" -> "18:00", "ocho de la mañana" -> "08:00", "once de la noche" -> "23:00", "half past four" -> "16:30". Only null when the speaker gave no time at all.
- Venue and client names may be mispronounced or truncated. Copy what you heard and lower that field's confidence; never correct it to a name you assume.
- Anything you hear that looks operational but cannot be turned into a service (a fragment, an unclear name, a service with no date) goes into "unresolved" with a plain reason. Never drop it silently.
- Noise, crosstalk or an interrupted sentence is a reason to lower confidence, not to guess.
- Set page_number to null and color_group to null. Use region_label for the spoken segment, e.g. "segmento 2".
- Report per-field confidence between 0 and 1 (1 = stated clearly, 0.6 = audible but inferred from context, 0.3 = unclear audio or ambiguous).
- Answer only with the structured object.`;

function bytesToBase64(buf: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000) {
    bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

function audioFormat(mime: string, fileName: string): string {
  const m = mime.toLowerCase();
  if (m.includes("wav")) return "wav";
  if (m.includes("mpeg") || m.includes("mp3")) return "mp3";
  if (m.includes("m4a") || m.includes("mp4") || m.includes("aac")) return "m4a";
  if (m.includes("ogg") || m.includes("opus")) return "ogg";
  if (m.includes("webm")) return "webm";
  const ext = (fileName.split(".").pop() ?? "").toLowerCase();
  return ["wav", "mp3", "m4a", "ogg", "webm", "aac", "flac"].includes(ext) ? ext : "webm";
}

/** Transcripción principal (endpoint dedicado). */
async function transcribe(
  apiKey: string,
  bytes: Uint8Array,
  mime: string,
  fileName: string,
): Promise<{ text: string; error?: string; status?: number }> {
  const fmt = audioFormat(mime, fileName);
  const form = new FormData();
  form.append("model", TRANSCRIBE_MODEL);
  form.append("file", new Blob([bytes], { type: mime || "audio/wav" }), `nota.${fmt}`);

  const resp = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    return { text: "", error: body.slice(0, 300), status: resp.status };
  }
  const data = await resp.json().catch(() => null);
  return { text: typeof data?.text === "string" ? data.text : "" };
}

/** Fallback multimodal para contenedores que el STT dedicado rechaza (p. ej. OGG/Opus). */
async function transcribeFallback(
  apiKey: string,
  bytes: Uint8Array,
  mime: string,
  fileName: string,
): Promise<{ text: string; error?: string }> {
  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Lovable-API-Key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: FALLBACK_AUDIO_MODEL,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Transcribe this voice note verbatim in its original language(s). Return only the transcript, no commentary.",
            },
            {
              type: "input_audio",
              input_audio: { data: bytesToBase64(bytes), format: audioFormat(mime, fileName) },
            },
          ],
        },
      ],
    }),
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    return { text: "", error: body.slice(0, 300) };
  }
  const data = await resp.json().catch(() => null);
  const text = data?.choices?.[0]?.message?.content;
  return { text: typeof text === "string" ? text : "" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const startedAt = Date.now();
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return json(500, { error: "LOVABLE_API_KEY not configured" });

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json(401, { error: "Missing auth" });

    const userClient = createClient(SUPABASE_URL, SERVICE_ROLE, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json(401, { error: "Not authenticated" });
    const userId = userData.user.id;

    let body: any = {};
    try {
      body = await req.json();
    } catch {
      /* noop */
    }

    const companyId = String(body?.company_id ?? "");
    if (!UUID_RE.test(companyId)) return json(400, { error: "company_id required" });

    const files = Array.isArray(body?.files) ? body.files : [];
    if (files.length === 0) return json(400, { error: "files required" });
    if (files.length > MAX_FILES) return json(400, { error: `Máximo ${MAX_FILES} audios` });

    const adm = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Tenant guard: el usuario debe administrar ESTA compañía.
    let isAdmin = false;
    try {
      const [globalRes, ownerRes, adminRes] = await Promise.all([
        adm.rpc("is_global_owner", { _user_id: userId }),
        adm.rpc("is_company_owner", { _user_id: userId, _company_id: companyId }),
        adm.rpc("user_is_company_admin", { _user_id: userId, _company_id: companyId }),
      ]);
      isAdmin = !!(globalRes.data || ownerRes.data || adminRes.data);
    } catch (e) {
      console.warn("admin rpc check failed", e);
    }
    if (!isAdmin) return json(403, { error: "Admin access required" });

    const results: unknown[] = [];

    for (const raw of files) {
      const storagePath = String(raw?.storage_path ?? "");
      const mime = String(raw?.mime_type ?? "").toLowerCase();
      const fileName = String(raw?.file_name ?? storagePath.split("/").pop() ?? "nota-de-voz");

      // Aislamiento de tenant en el propio path del objeto.
      if (!storagePath.startsWith(`${companyId}/`)) {
        results.push({ file_name: fileName, storage_path: storagePath, error: "tenant_path_mismatch" });
        continue;
      }

      const { data: signed, error: signErr } = await adm.storage
        .from(BUCKET)
        .createSignedUrl(storagePath, 60 * 5);
      if (signErr || !signed?.signedUrl) {
        results.push({ file_name: fileName, storage_path: storagePath, error: "file_unreadable" });
        continue;
      }
      const fileResp = await fetch(signed.signedUrl);
      if (!fileResp.ok) {
        results.push({ file_name: fileName, storage_path: storagePath, error: "file_download_failed" });
        continue;
      }
      const bytes = new Uint8Array(await fileResp.arrayBuffer());

      // El audio no se conserva: se borra apenas está en memoria.
      const { error: rmErr } = await adm.storage.from(BUCKET).remove([storagePath]);
      if (rmErr) console.warn("audio cleanup failed", storagePath, rmErr.message);

      if (bytes.byteLength < 2048) {
        results.push({ file_name: fileName, storage_path: storagePath, error: "audio_empty" });
        continue;
      }

      // 1) Transcripción.
      let { text: transcript, error: sttError, status } = await transcribe(
        LOVABLE_API_KEY,
        bytes,
        mime,
        fileName,
      );
      if (status === 429) return json(429, { error: "Demasiadas solicitudes, intenta más tarde." });
      if (status === 402) {
        return json(402, { error: "Sin créditos de IA. Recarga tu workspace para continuar." });
      }
      if (!transcript) {
        console.warn("stt primary failed", fileName, sttError);
        const fb = await transcribeFallback(LOVABLE_API_KEY, bytes, mime, fileName);
        transcript = fb.text;
        if (!transcript) {
          console.error("stt fallback failed", fileName, fb.error);
          results.push({ file_name: fileName, storage_path: storagePath, error: "transcription_failed" });
          continue;
        }
      }
      if (transcript.trim().length < 3) {
        results.push({
          file_name: fileName,
          storage_path: storagePath,
          transcript,
          error: "transcription_empty",
        });
        continue;
      }

      // 2) Extracción con el contrato ÚNICO compartido con imagen y PDF.
      const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
        method: "POST",
        headers: { "Lovable-API-Key": LOVABLE_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: EXTRACTION_MODEL,
          input: [
            { role: "system", content: [{ type: "input_text", text: SYSTEM_PROMPT }] },
            {
              role: "user",
              content: [
                {
                  type: "input_text",
                  text: `Transcript of the voice note:\n\n"""${transcript}"""`,
                },
              ],
            },
          ],
          text: {
            format: {
              type: "json_schema",
              name: "audio_service_extraction",
              strict: false,
              schema: SERVICE_EXTRACTION_SCHEMA,
            },
          },
        }),
      });

      if (aiResp.status === 429) return json(429, { error: "Demasiadas solicitudes, intenta más tarde." });
      if (aiResp.status === 402) {
        return json(402, { error: "Sin créditos de IA. Recarga tu workspace para continuar." });
      }
      if (!aiResp.ok) {
        const t = await aiResp.text();
        console.error("AI gateway error", aiResp.status, t.slice(0, 500));
        results.push({ file_name: fileName, storage_path: storagePath, transcript, error: "ai_error" });
        continue;
      }

      const aiJson = await aiResp.json();
      let text = typeof aiJson?.output_text === "string" ? aiJson.output_text : "";
      if (!text && Array.isArray(aiJson?.output)) {
        for (const item of aiJson.output) {
          for (const part of item?.content ?? []) {
            if (typeof part?.text === "string") text += part.text;
          }
        }
      }
      let extraction: any = null;
      try {
        extraction = JSON.parse(text);
      } catch {
        console.error("audio extraction parse failed", text.slice(0, 300));
      }
      if (!extraction || typeof extraction !== "object") {
        results.push({
          file_name: fileName,
          storage_path: storagePath,
          transcript,
          error: "unparseable_extraction",
        });
        continue;
      }

      results.push({ file_name: fileName, storage_path: storagePath, transcript, extraction });
    }

    return json(200, {
      results,
      model: EXTRACTION_MODEL,
      transcription_model: TRANSCRIBE_MODEL,
      latency_ms: Date.now() - startedAt,
    });
  } catch (e: any) {
    console.error("audio-service-intake error:", e);
    return json(500, { error: e?.message ?? "Unknown error" });
  }
});
