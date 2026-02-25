import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create authenticated Supabase client
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "No autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { message } = await req.json();
    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return new Response(JSON.stringify({ error: "Mensaje vacío" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (message.length > 1000) {
      return new Response(JSON.stringify({ error: "Mensaje demasiado largo (máx. 1000 caracteres)" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch employee data
    const { data: employee } = await supabase
      .from("employees")
      .select("id, first_name, last_name")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!employee) {
      return new Response(JSON.stringify({ error: "No se encontró registro de empleado" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch recent pay periods with base pay
    const { data: basePay } = await supabase
      .from("period_base_pay")
      .select(`
        base_total_pay,
        total_work_hours,
        total_regular,
        total_overtime,
        total_paid_hours,
        pay_periods!inner(start_date, end_date, status)
      `)
      .eq("employee_id", employee.id)
      .order("created_at", { ascending: false })
      .limit(5);

    // Fetch recent movements (extras/deductions)
    const { data: movements } = await supabase
      .from("movements")
      .select(`
        total_value,
        quantity,
        rate,
        note,
        concepts!inner(name, category)
      `)
      .eq("employee_id", employee.id)
      .order("created_at", { ascending: false })
      .limit(20);

    // Build context summary
    const payContext = (basePay || []).map((p: any) => ({
      periodo: `${p.pay_periods.start_date} → ${p.pay_periods.end_date}`,
      estado: p.pay_periods.status,
      pago_base: p.base_total_pay,
      horas_trabajadas: p.total_work_hours,
      horas_regulares: p.total_regular,
      horas_extra: p.total_overtime,
    }));

    const movContext = (movements || []).map((m: any) => ({
      concepto: m.concepts.name,
      tipo: m.concepts.category === "extra" ? "Extra" : "Deducción",
      valor: m.total_value,
      nota: m.note,
    }));

    const systemPrompt = `Eres un asistente de nómina para empleados de Quality Staff. 
Responde en español de forma clara y concisa. Solo responde preguntas relacionadas con pagos, horas trabajadas, deducciones y extras.
Si la pregunta no es sobre pagos o nómina, indica amablemente que solo puedes ayudar con temas de pago.
No inventes datos. Solo usa la información proporcionada.

Empleado: ${employee.first_name} ${employee.last_name}

Últimos periodos de pago:
${JSON.stringify(payContext, null, 2)}

Últimos movimientos (extras/deducciones):
${JSON.stringify(movContext, null, 2)}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: message },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Demasiadas solicitudes, intenta de nuevo en unos minutos." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Servicio de AI no disponible temporalmente." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      return new Response(JSON.stringify({ error: "Error al consultar el asistente" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await response.json();
    const reply = aiData.choices?.[0]?.message?.content || "No pude generar una respuesta.";

    return new Response(JSON.stringify({ reply }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("employee-chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Error desconocido" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
