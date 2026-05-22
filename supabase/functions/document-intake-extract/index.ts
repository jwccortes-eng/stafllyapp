/**
 * document-intake-extract — admin-only assisted extraction for document_intake_items.
 *
 * Input:  { intake_item_id: string }
 * Output: { extraction, suggestion } and writes suggestion onto the row.
 *
 * Hard guarantees:
 *  - Caller must be authenticated and admin/owner of the item's company.
 *  - Suggestion-only — NEVER inserts into employee_documents.
 *  - Document numbers returned to the client are always masked (last 4 only).
 *  - PDF input is not supported in v1 (item flagged needs_review).
 *  - Sensitive intents (w9, tax_form, filename matching /w-?9|tax/i) skip AI entirely.
 */

import { createClient } from "npm:@supabase/supabase-js@2.50.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SENSITIVE_CATEGORIES = new Set(["w9", "tax_form"]);
const SENSITIVE_NAME_RE = /\bw-?9\b|tax[-_ ]?form|w9/i;

function mask(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const alnum = String(raw).replace(/[^A-Za-z0-9]/g, "");
  if (!alnum) return null;
  const last4 = alnum.slice(-4);
  const dots = Math.max(1, Math.min(8, alnum.length - last4.length));
  return `${"•".repeat(dots)} ${last4}`;
}

function normName(s: string | null | undefined): string {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normPhone(s: string | null | undefined): string {
  const d = String(s ?? "").replace(/\D/g, "");
  return d.length === 11 && d.startsWith("1") ? d.slice(1) : d.slice(-10);
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

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

    let body: { intake_item_id?: string } = {};
    try { body = await req.json(); } catch { /* noop */ }
    const itemId = body.intake_item_id;
    if (!itemId || typeof itemId !== "string") {
      return json(400, { error: "intake_item_id required" });
    }

    const adm = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: item, error: itemErr } = await adm
      .from("document_intake_items")
      .select("id, company_id, storage_path, original_filename, mime_type, status, suggested_document_category")
      .eq("id", itemId)
      .maybeSingle();
    if (itemErr || !item) return json(404, { error: "Intake item not found" });

    if (item.status === "indexed") {
      return json(409, { error: "Item already indexed" });
    }

    // Tenant admin guard — same helpers as document-extract.
    let isAdmin = false;
    try {
      const [globalRes, ownerRes, adminRes] = await Promise.all([
        adm.rpc("is_global_owner", { _user_id: userId }),
        adm.rpc("is_company_owner", { _user_id: userId, _company_id: item.company_id }),
        adm.rpc("user_is_company_admin", { _user_id: userId, _company_id: item.company_id }),
      ]);
      isAdmin = !!(globalRes.data || ownerRes.data || adminRes.data);
    } catch (e) {
      console.warn("admin rpc check failed", e);
    }
    if (!isAdmin) return json(403, { error: "Admin access required" });

    const filename = String(item.original_filename ?? "");
    const sensitive =
      SENSITIVE_CATEGORIES.has(String(item.suggested_document_category ?? "")) ||
      SENSITIVE_NAME_RE.test(filename);

    if (sensitive) {
      await adm.from("document_intake_items").update({
        status: "needs_review",
        confidence_reason: "sensitive_manual_only",
        extracted_json: {
          blocked: true,
          reason: "sensitive_manual_only",
          extracted_at: new Date().toISOString(),
        },
      }).eq("id", itemId);
      return json(200, {
        blocked: true,
        reason: "sensitive_manual_only",
        message: "Documento sensible: revisar manualmente. La extracción automática está desactivada.",
      });
    }

    const mime = String(item.mime_type ?? "").toLowerCase();
    const isPdf = mime === "application/pdf" || /\.pdf$/i.test(filename);
    if (isPdf) {
      await adm.from("document_intake_items").update({
        status: "needs_review",
        confidence_reason: "pdf_not_supported_v1",
        extracted_json: {
          blocked: true,
          reason: "pdf_not_supported_v1",
          extracted_at: new Date().toISOString(),
        },
      }).eq("id", itemId);
      return json(200, {
        blocked: true,
        reason: "pdf_not_supported_v1",
        message: "PDF aún no soportado en v1. Sube una imagen del documento para usar extracción asistida.",
      });
    }

    const { data: signed, error: signErr } = await adm.storage
      .from("employee-documents")
      .createSignedUrl(item.storage_path, 60 * 5);
    if (signErr || !signed?.signedUrl) {
      await adm.from("document_intake_items").update({
        status: "failed",
        confidence_reason: "file_unreadable",
      }).eq("id", itemId);
      return json(500, { error: "Could not access file" });
    }

    const fileResp = await fetch(signed.signedUrl);
    if (!fileResp.ok) return json(500, { error: "Could not download file" });
    const buf = new Uint8Array(await fileResp.arrayBuffer());
    let bin = "";
    for (let i = 0; i < buf.length; i += 0x8000) {
      bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    }
    const b64 = btoa(bin);
    const dataUrl = `data:${mime || "image/jpeg"};base64,${b64}`;

    const tool = {
      type: "function",
      function: {
        name: "extract_intake_document_fields",
        description: "Extract identity-document fields from the supplied image. Return null for any field not clearly visible.",
        parameters: {
          type: "object",
          properties: {
            extracted_full_name: { type: ["string", "null"] },
            extracted_document_type: { type: ["string", "null"], description: "e.g. 'Drivers License', 'Passport', 'Permanent Resident Card', 'Social Security Card', 'ID Card'" },
            extracted_document_number: { type: ["string", "null"], description: "Raw number; masked server-side before reaching client." },
            extracted_issue_date: { type: ["string", "null"], description: "ISO YYYY-MM-DD if legible." },
            extracted_expiration_date: { type: ["string", "null"], description: "ISO YYYY-MM-DD if legible." },
            extracted_state_or_jurisdiction: { type: ["string", "null"] },
            extracted_phone: { type: ["string", "null"] },
            extracted_email: { type: ["string", "null"] },
            extracted_stafly_id: { type: ["string", "null"], description: "Internal company employer_identification if present" },
            possible_side: { type: ["string", "null"], enum: ["front", "back", "full", "unknown", null] },
            confidence_score: { type: "number", description: "0..1 overall confidence." },
          },
          required: ["confidence_score"],
          additionalProperties: false,
        },
      },
    };

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: "You read identity documents and extract structured fields. Be conservative — return null when a field is not clearly visible. Never invent values.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Extract the fields from this document image." },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
        tools: [tool],
        tool_choice: { type: "function", function: { name: "extract_intake_document_fields" } },
      }),
    });

    if (aiResp.status === 429) return json(429, { error: "Demasiadas solicitudes, intenta más tarde." });
    if (aiResp.status === 402) return json(402, { error: "Sin créditos. Recarga tu workspace para continuar." });
    if (!aiResp.ok) {
      const t = await aiResp.text();
      console.error("AI gateway error", aiResp.status, t);
      await adm.from("document_intake_items").update({
        status: "failed",
        confidence_reason: "ai_error",
      }).eq("id", itemId);
      return json(500, { error: "AI gateway error" });
    }
    const aiJson = await aiResp.json();
    const toolCall = aiJson?.choices?.[0]?.message?.tool_calls?.[0];
    let parsed: any = {};
    try { parsed = JSON.parse(toolCall?.function?.arguments ?? "{}"); } catch { /* noop */ }

    const score: number | null = typeof parsed.confidence_score === "number" ? parsed.confidence_score : null;
    const masked_number = mask(parsed.extracted_document_number);
    const side: string | null = ["front","back","full","unknown"].includes(parsed.possible_side) ? parsed.possible_side : null;

    const extracted_json = {
      extracted_full_name: parsed.extracted_full_name ?? null,
      extracted_document_type: parsed.extracted_document_type ?? null,
      extracted_document_number_masked: masked_number,
      extracted_issue_date: parsed.extracted_issue_date ?? null,
      extracted_expiration_date: parsed.extracted_expiration_date ?? null,
      extracted_state_or_jurisdiction: parsed.extracted_state_or_jurisdiction ?? null,
      extracted_phone: parsed.extracted_phone ?? null,
      extracted_email: parsed.extracted_email ?? null,
      extracted_stafly_id: parsed.extracted_stafly_id ?? null,
      possible_side: side ?? "unknown",
      confidence_score: score,
      extraction_source: "ai" as const,
      extracted_at: new Date().toISOString(),
      needs_human_confirmation: true,
    };

    // ---- Suggestion: match worker against employees in this company ----
    let suggested_employee_id: string | null = null;
    let confidence_reason: string | null = null;
    let match_confidence: "high" | "medium" | "low" | "none" = "none";

    const phoneNorm = normPhone(parsed.extracted_phone);
    const email = String(parsed.extracted_email ?? "").trim().toLowerCase() || null;
    const staflyId = String(parsed.extracted_stafly_id ?? "").trim() || null;
    const nameNorm = normName(parsed.extracted_full_name);

    // Pull a bounded candidate set from the company.
    const { data: empPool } = await adm
      .from("employees")
      .select("id, company_id, first_name, last_name, phone_number, email, employer_identification")
      .eq("company_id", item.company_id)
      .limit(2000);

    const pool = (empPool ?? []).filter((e: any) => e.company_id === item.company_id);

    if (staflyId) {
      const hit = pool.find((e: any) => String(e.employer_identification ?? "").trim() === staflyId);
      if (hit) { suggested_employee_id = hit.id; match_confidence = "high"; confidence_reason = "stafly_id_match"; }
    }
    if (!suggested_employee_id && phoneNorm && phoneNorm.length === 10) {
      const hit = pool.find((e: any) => normPhone(e.phone_number) === phoneNorm);
      if (hit) { suggested_employee_id = hit.id; match_confidence = "high"; confidence_reason = "phone_match"; }
    }
    if (!suggested_employee_id && email) {
      const hit = pool.find((e: any) => String(e.email ?? "").trim().toLowerCase() === email);
      if (hit) { suggested_employee_id = hit.id; match_confidence = "high"; confidence_reason = "email_match"; }
    }
    if (!suggested_employee_id && nameNorm) {
      const exact = pool.filter((e: any) => normName(`${e.first_name ?? ""} ${e.last_name ?? ""}`) === nameNorm);
      if (exact.length === 1) {
        suggested_employee_id = exact[0].id; match_confidence = "medium"; confidence_reason = "name_exact_unique";
      } else if (exact.length === 0) {
        // Loose fuzzy: same last token (last name)
        const lastTok = nameNorm.split(" ").pop() ?? "";
        if (lastTok.length >= 3) {
          const loose = pool.filter((e: any) => normName(e.last_name).includes(lastTok));
          if (loose.length === 1) {
            suggested_employee_id = loose[0].id; match_confidence = "low"; confidence_reason = "name_fuzzy_last";
          }
        }
      }
    }

    const confidence_score_final =
      match_confidence === "high" ? 0.9 :
      match_confidence === "medium" ? 0.65 :
      match_confidence === "low" ? 0.35 : (score ?? 0);

    // Loose category guess from extracted_document_type
    const dt = String(parsed.extracted_document_type ?? "").toLowerCase();
    let cat: string | null = null;
    if (/passport/.test(dt)) cat = "passport";
    else if (/driver|license|licencia/.test(dt)) cat = "drivers_license";
    else if (/resident|green card|permanent/.test(dt)) cat = "permanent_resident_card";
    else if (/social|ssn/.test(dt)) cat = "social_security_card";
    else if (/id\b|identification|cedula|c.dula/.test(dt)) cat = "id_card";

    await adm.from("document_intake_items").update({
      status: "extracted",
      extracted_json,
      suggested_employee_id,
      suggested_document_category: cat,
      suggested_document_side: side,
      suggested_expires_at: parsed.extracted_expiration_date ?? null,
      suggested_document_number_masked: masked_number,
      confidence_score: Number(confidence_score_final.toFixed(2)),
      confidence_reason,
    }).eq("id", itemId);

    return json(200, {
      extraction: extracted_json,
      suggestion: {
        suggested_employee_id,
        suggested_document_category: cat,
        suggested_document_side: side,
        suggested_expires_at: parsed.extracted_expiration_date ?? null,
        suggested_document_number_masked: masked_number,
        match_confidence,
        confidence_reason,
      },
    });
  } catch (e: any) {
    console.error("document-intake-extract error:", e);
    return json(500, { error: e?.message ?? "Unknown error" });
  }
});
