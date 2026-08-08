/**
 * visual-service-intake — Fase 3 del carril canónico de Smart Service Intake.
 *
 * Entrada:  { company_id, batch_id, files: [{ storage_path, mime_type, file_name }], reference_date }
 * Salida:   { extractions: [{ file_name, storage_path, extraction }], model, latency_ms }
 *
 * Garantías duras:
 *  - El llamador debe ser admin/owner de la compañía indicada (tenant guard).
 *  - `company_id` viene del cliente pero SIEMPRE se valida contra los roles
 *    reales del usuario. Nunca se infiere del contenido visual.
 *  - Sólo LEE el archivo mediante URL firmada de un bucket privado.
 *  - SUGGESTION-ONLY: no escribe en scheduled_shifts, shift_assignments,
 *    time_entries, payroll ni documents.
 */

import { createClient } from "npm:@supabase/supabase-js@2.50.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BUCKET = "service-intake-files";
const MODEL = "openai/gpt-5.6-sol";
const MAX_FILES = 8;
const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const SERVICE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    page_count: { type: ["integer", "null"] },
    notes: { type: ["string", "null"] },
    services: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          service_date: {
            type: ["string", "null"],
            description: "Date exactly as shown (e.g. '2026-10-13', 'Oct 13'). Null if absent.",
          },
          start_time: { type: ["string", "null"] },
          end_time: { type: ["string", "null"] },
          service_type: { type: ["string", "null"] },
          client_name: { type: ["string", "null"] },
          venue_name: { type: ["string", "null"] },
          location_text: { type: ["string", "null"] },
          requested_workers: { type: ["integer", "null"] },
          roles: { type: ["array", "null"], items: { type: "string" } },
          notes: { type: ["string", "null"] },
          source_excerpt: { type: ["string", "null"] },
          page_number: { type: ["integer", "null"] },
          region_label: {
            type: ["string", "null"],
            description: "Where in the layout it was found, e.g. 'week 2, Tuesday cell'.",
          },
          color_group: {
            type: ["string", "null"],
            description: "Colour of the block, if any. Never a source of identity.",
          },
          extraction_notes: { type: ["string", "null"] },
          confidence: {
            type: "object",
            additionalProperties: false,
            properties: {
              date: { type: ["number", "null"] },
              venue: { type: ["number", "null"] },
              service_type: { type: ["number", "null"] },
              start_time: { type: ["number", "null"] },
              end_time: { type: ["number", "null"] },
              client: { type: ["number", "null"] },
              workers: { type: ["number", "null"] },
              location: { type: ["number", "null"] },
            },
            required: [
              "date",
              "venue",
              "service_type",
              "start_time",
              "end_time",
              "client",
              "workers",
              "location",
            ],
          },
        },
        required: [
          "service_date",
          "start_time",
          "end_time",
          "service_type",
          "client_name",
          "venue_name",
          "location_text",
          "requested_workers",
          "roles",
          "notes",
          "source_excerpt",
          "page_number",
          "region_label",
          "color_group",
          "extraction_notes",
          "confidence",
        ],
      },
    },
    unresolved: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          detected_text: { type: ["string", "null"] },
          reason: { type: ["string", "null"] },
          suggestion: { type: ["string", "null"] },
          page_number: { type: ["integer", "null"] },
          region_label: { type: ["string", "null"] },
        },
        required: ["detected_text", "reason", "suggestion", "page_number", "region_label"],
      },
    },
  },
  required: ["page_count", "notes", "services", "unresolved"],
};

const SYSTEM_PROMPT = `You read operational scheduling material for a staffing company: calendars, screenshots, agendas, flyers, photos and scanned PDFs.

Read the VISUAL STRUCTURE, not just loose text. Calendar grids, columns, rows, day cells, headers, coloured blocks and spatial grouping tell you which fragments belong to the SAME service. A month header, a day number, a venue name and an event name stacked in one cell are ONE service, not four fragments.

Hard rules:
- Never invent a time, worker count, client, address or role. If the source does not show it, return null and set that field confidence to null.
- One image can contain many services: return every one you can read.
- Colour may help you group blocks, but colour alone never establishes venue or client identity. Use the visible text as the evidence and report the colour in color_group.
- Anything you detect but cannot convert confidently goes into "unresolved" with a plain reason. Never drop it silently.
- Copy dates exactly as shown; do not guess a year that is not printed.
- Report per-field confidence between 0 and 1 (1 = printed clearly, 0.6 = readable but inferred from layout, 0.3 = blurry or ambiguous).
- Answer only with the structured object.`;

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
    if (files.length > MAX_FILES) return json(400, { error: `Máximo ${MAX_FILES} archivos` });

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

    const extractions: unknown[] = [];

    for (const raw of files) {
      const storagePath = String(raw?.storage_path ?? "");
      const mime = String(raw?.mime_type ?? "").toLowerCase();
      const fileName = String(raw?.file_name ?? storagePath.split("/").pop() ?? "archivo");

      // Aislamiento de tenant en el propio path del objeto.
      if (!storagePath.startsWith(`${companyId}/`)) {
        extractions.push({ file_name: fileName, storage_path: storagePath, error: "tenant_path_mismatch" });
        continue;
      }

      const { data: signed, error: signErr } = await adm.storage
        .from(BUCKET)
        .createSignedUrl(storagePath, 60 * 5);
      if (signErr || !signed?.signedUrl) {
        extractions.push({ file_name: fileName, storage_path: storagePath, error: "file_unreadable" });
        continue;
      }

      const fileResp = await fetch(signed.signedUrl);
      if (!fileResp.ok) {
        extractions.push({ file_name: fileName, storage_path: storagePath, error: "file_download_failed" });
        continue;
      }
      const buf = new Uint8Array(await fileResp.arrayBuffer());
      let bin = "";
      for (let i = 0; i < buf.length; i += 0x8000) {
        bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      }
      const dataUrl = `data:${mime || "image/jpeg"};base64,${btoa(bin)}`;
      const isPdf = mime === "application/pdf" || /\.pdf$/i.test(fileName);

      const content: unknown[] = [
        {
          type: "input_text",
          text: isPdf
            ? "Extract every service from this PDF. Process it page by page, keep page_number on each result, and do not repeat the same service twice across pages."
            : "Extract every service visible in this image.",
        },
        isPdf
          ? { type: "input_file", filename: fileName, file_data: dataUrl }
          : { type: "input_image", image_url: dataUrl },
      ];

      const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
        method: "POST",
        headers: {
          "Lovable-API-Key": LOVABLE_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: MODEL,
          input: [
            { role: "system", content: [{ type: "input_text", text: SYSTEM_PROMPT }] },
            { role: "user", content },
          ],
          text: {
            format: {
              type: "json_schema",
              name: "visual_service_extraction",
              strict: false,
              schema: SERVICE_SCHEMA,
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
        extractions.push({ file_name: fileName, storage_path: storagePath, error: "ai_error" });
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
        console.error("visual extraction parse failed", text.slice(0, 300));
      }
      if (!extraction || typeof extraction !== "object") {
        extractions.push({ file_name: fileName, storage_path: storagePath, error: "unparseable_extraction" });
        continue;
      }

      extractions.push({
        file_name: fileName,
        storage_path: storagePath,
        is_pdf: isPdf,
        extraction,
      });
    }

    return json(200, {
      extractions,
      model: MODEL,
      latency_ms: Date.now() - startedAt,
    });
  } catch (e: any) {
    console.error("visual-service-intake error:", e);
    return json(500, { error: e?.message ?? "Unknown error" });
  }
});
