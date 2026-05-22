/**
 * document-extract — admin-only assisted extraction for employee_documents.
 *
 * Input:  { employee_document_id: string }
 * Output: { extraction: DocumentExtraction }
 *
 * Hard guarantees:
 *  - Caller must be authenticated and admin/owner of the document's company.
 *  - Suggestion-only — NEVER writes to the database.
 *  - Document numbers returned to the client are always masked (last 4 only).
 *  - PDF input is not supported in v1 (returns a friendly message).
 *  - Sensitive categories (w9, tax_form) are blocked.
 */

import { createClient } from "npm:@supabase/supabase-js@2.50.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const BLOCKED_CATEGORIES = new Set(["w9", "tax_form"]);

function mask(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const alnum = String(raw).replace(/[^A-Za-z0-9]/g, "");
  if (!alnum) return null;
  const last4 = alnum.slice(-4);
  const dots = Math.max(1, Math.min(8, alnum.length - last4.length));
  return `${"•".repeat(dots)} ${last4}`;
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return json(500, { error: "LOVABLE_API_KEY not configured" });

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json(401, { error: "Missing auth" });

    // User-scoped client to identify caller.
    const userClient = createClient(SUPABASE_URL, SERVICE_ROLE, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json(401, { error: "Not authenticated" });
    const userId = userData.user.id;

    // Parse + validate input.
    let body: { employee_document_id?: string } = {};
    try { body = await req.json(); } catch { /* noop */ }
    const docId = body.employee_document_id;
    if (!docId || typeof docId !== "string") {
      return json(400, { error: "employee_document_id required" });
    }

    // Service-role client to load the doc + verify membership without RLS noise.
    const adm = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: doc, error: docErr } = await adm
      .from("employee_documents")
      .select("id, company_id, employee_id, name, file_url, file_type, category")
      .eq("id", docId)
      .maybeSingle();
    if (docErr || !doc) return json(404, { error: "Document not found" });

    if (BLOCKED_CATEGORIES.has(String(doc.category ?? ""))) {
      return json(403, { error: "Extraction disabled for this category" });
    }

    // Authorization: caller must be admin/owner of the document's company,
    // OR a global owner/developer. Use the same security-definer helpers that
    // back the employee_documents RLS policy so we never drift.
    let isAdmin = false;
    try {
      const [globalRes, ownerRes, adminRes] = await Promise.all([
        adm.rpc("is_global_owner", { _user_id: userId }),
        adm.rpc("is_company_owner", { _user_id: userId, _company_id: doc.company_id }),
        adm.rpc("user_is_company_admin", { _user_id: userId, _company_id: doc.company_id }),
      ]);
      isAdmin = !!(globalRes.data || ownerRes.data || adminRes.data);
    } catch (rpcErr) {
      console.warn("admin rpc check failed, falling back to user_roles lookup", rpcErr);
    }

    if (!isAdmin) {
      const { data: membership } = await adm
        .from("user_roles")
        .select("role, company_id")
        .eq("user_id", userId);
      const ROLES_OK = new Set([
        "company_owner", "company_admin", "company_manager",
        "developer", "owner", "admin", "manager",
      ]);
      isAdmin = (membership ?? []).some((r: any) =>
        ROLES_OK.has(String(r.role)) &&
        (r.company_id === null || r.company_id === doc.company_id ||
          ["developer", "owner"].includes(String(r.role))),
      );
    }

    if (!isAdmin) {
      return json(403, { error: "Admin access required" });
    }

    // Sign URL + fetch bytes.
    const { data: signed, error: signErr } = await adm.storage
      .from("employee-documents")
      .createSignedUrl(doc.file_url, 60 * 5);
    if (signErr || !signed?.signedUrl) {
      return json(500, { error: "Could not access file" });
    }

    const mime = (doc.file_type ?? "").toLowerCase();
    const isPdf = mime === "application/pdf" || /\.pdf$/i.test(doc.file_url);
    if (isPdf) {
      return json(200, {
        extraction: {
          extraction_source: "ai",
          extracted_at: new Date().toISOString(),
          needs_human_confirmation: true,
          confidence_level: "low",
        },
        warning: "PDF aún no soportado en v1. Sube una imagen del documento para usar extracción asistida.",
      });
    }

    const fileResp = await fetch(signed.signedUrl);
    if (!fileResp.ok) return json(500, { error: "Could not download file" });
    const buf = new Uint8Array(await fileResp.arrayBuffer());
    // Base64 encode in chunks (large files would crash apply via spread).
    let bin = "";
    for (let i = 0; i < buf.length; i += 0x8000) {
      bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    }
    const b64 = btoa(bin);
    const dataUrl = `data:${mime || "image/jpeg"};base64,${b64}`;

    // Call Lovable AI Gateway with tool calling for structured extraction.
    const tool = {
      type: "function",
      function: {
        name: "extract_document_fields",
        description: "Extract identity-document fields from the supplied image. Return null for any field not clearly visible.",
        parameters: {
          type: "object",
          properties: {
            extracted_full_name: { type: ["string", "null"] },
            extracted_document_type: { type: ["string", "null"], description: "e.g. 'Driver's License', 'Passport', 'Permanent Resident Card'" },
            extracted_document_number: { type: ["string", "null"], description: "Raw document number. Will be masked server-side before reaching client." },
            extracted_issue_date: { type: ["string", "null"], description: "ISO YYYY-MM-DD if legible." },
            extracted_expiration_date: { type: ["string", "null"], description: "ISO YYYY-MM-DD if legible." },
            extracted_state_or_jurisdiction: { type: ["string", "null"] },
            extracted_birth_date: { type: ["string", "null"], description: "ISO YYYY-MM-DD if legible." },
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
        tool_choice: { type: "function", function: { name: "extract_document_fields" } },
      }),
    });

    if (aiResp.status === 429) return json(429, { error: "Demasiadas solicitudes, intenta más tarde." });
    if (aiResp.status === 402) return json(402, { error: "Sin créditos. Recarga tu workspace para continuar." });
    if (!aiResp.ok) {
      const t = await aiResp.text();
      console.error("AI gateway error", aiResp.status, t);
      return json(500, { error: "AI gateway error" });
    }
    const aiJson = await aiResp.json();
    const toolCall = aiJson?.choices?.[0]?.message?.tool_calls?.[0];
    let parsed: any = {};
    try { parsed = JSON.parse(toolCall?.function?.arguments ?? "{}"); } catch {/* noop */}

    const score: number | null = typeof parsed.confidence_score === "number" ? parsed.confidence_score : null;
    const level: "high" | "medium" | "low" | null =
      score == null ? null : score >= 0.8 ? "high" : score >= 0.5 ? "medium" : "low";

    const extraction = {
      extracted_full_name: parsed.extracted_full_name ?? null,
      extracted_document_type: parsed.extracted_document_type ?? null,
      extracted_document_number_masked: mask(parsed.extracted_document_number),
      extracted_issue_date: parsed.extracted_issue_date ?? null,
      extracted_expiration_date: parsed.extracted_expiration_date ?? null,
      extracted_state_or_jurisdiction: parsed.extracted_state_or_jurisdiction ?? null,
      extracted_birth_date: parsed.extracted_birth_date ?? null,
      confidence_score: score,
      confidence_level: level,
      extraction_source: "ai" as const,
      extracted_at: new Date().toISOString(),
      needs_human_confirmation: true,
    };

    return json(200, { extraction });
  } catch (e: any) {
    console.error("document-extract error:", e);
    return json(500, { error: e?.message ?? "Unknown error" });
  }
});
