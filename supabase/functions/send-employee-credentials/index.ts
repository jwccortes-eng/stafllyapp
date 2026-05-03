// Phase B — send-employee-credentials
//
// Reads minimal worker info, optionally resets the PIN via the SECURITY DEFINER
// RPC, and returns a wa.me URL plus the freshly generated PIN (only when
// generated in this request). Never returns an existing/stored PIN.
//
// Auth: caller must be authenticated. The RPC enforces admin/owner/global rights
// and audits the action.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

type Channel = "whatsapp" | "sms" | "copy";

interface Body {
  employee_id: string;
  channel?: Channel;
  reset?: boolean;
}

function normalizePhone(raw: string | null | undefined): string {
  if (!raw) return "";
  let d = raw.replace(/[^\d+]/g, "");
  if (d.startsWith("+")) d = d.slice(1);
  if (d.length === 10) return "1" + d;
  if (d.length === 11 && d.startsWith("1")) return d;
  return d;
}

function isUuid(v: unknown): v is string {
  return typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) {
      return new Response(JSON.stringify({ error: "unauthenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });

    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) {
      return new Response(JSON.stringify({ error: "unauthenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let body: Body;
    try {
      body = (await req.json()) as Body;
    } catch {
      return new Response(JSON.stringify({ error: "invalid_json" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!isUuid(body.employee_id)) {
      return new Response(JSON.stringify({ error: "invalid_employee_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const channel: Channel = body.channel ?? "whatsapp";

    // Look up worker basics. RLS will block if caller has no access.
    const { data: emp, error: empErr } = await supabase
      .from("employees")
      .select("id, first_name, last_name, phone_number, company_id, companies(name)")
      .eq("id", body.employee_id)
      .maybeSingle();

    if (empErr) {
      return new Response(JSON.stringify({ error: empErr.message }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!emp) {
      return new Response(JSON.stringify({ error: "employee_not_found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Decide if we need to (re)generate a PIN.
    const { data: hasPin } = await supabase.rpc("employee_has_access_pin", {
      _employee_id: emp.id,
    });

    let pinJustGenerated: string | null = null;
    if (body.reset === true || !hasPin) {
      const { data: newPin, error: rpcErr } = await supabase.rpc(
        "reset_employee_access_pin",
        { _employee_id: emp.id },
      );
      if (rpcErr) {
        return new Response(JSON.stringify({ error: rpcErr.message }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      pinJustGenerated = (newPin as string) ?? null;
    }

    const phone10 = normalizePhone(emp.phone_number);
    const companyName = (emp as any).companies?.name ?? "the company";

    const lines: string[] = [];
    lines.push(`¡Hola ${emp.first_name ?? ""}! 👋`);
    lines.push("");
    lines.push(`Te invitamos a acceder al portal de empleados de *${companyName}*.`);
    lines.push("");
    lines.push(`📱 Portal: https://staflyapps.com/auth`);
    if (emp.phone_number) lines.push(`📞 Tu teléfono: ${emp.phone_number}`);
    if (pinJustGenerated) {
      lines.push(`🔑 Tu PIN: ${pinJustGenerated}`);
    } else {
      lines.push(`🔑 Tu PIN ya está configurado. Si no lo recuerdas, pide a tu admin que lo restablezca.`);
    }
    lines.push("");
    lines.push(`— Equipo ${companyName}`);
    const message = lines.join("\n");

    const whatsappUrl = phone10
      ? `https://wa.me/${phone10}?text=${encodeURIComponent(message)}`
      : null;

    return new Response(
      JSON.stringify({
        message,
        phone: emp.phone_number ?? null,
        whatsapp_url: whatsappUrl,
        pin_just_generated: pinJustGenerated,
        channel,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message ?? "unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
