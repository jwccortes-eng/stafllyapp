import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify caller
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "No autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { company_id, shift_id, mode } = await req.json();
    if (!company_id) {
      return new Response(JSON.stringify({ error: "company_id requerido" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch company employees (active)
    const { data: employees } = await supabase
      .from("employees")
      .select("id, first_name, last_name, skills, certifications, service_category_ids, is_active, address, qualify, years_experience, english_level")
      .eq("company_id", company_id)
      .eq("is_active", true);

    // Fetch open/unassigned shifts
    let shiftsQuery = supabase
      .from("scheduled_shifts")
      .select("id, title, date, start_time, end_time, client_id, location_id, required_employees, pay_type, shift_code, notes")
      .eq("company_id", company_id)
      .is("deleted_at", null)
      .gte("date", new Date().toISOString().split("T")[0]);

    if (shift_id) {
      shiftsQuery = shiftsQuery.eq("id", shift_id);
    } else {
      shiftsQuery = shiftsQuery.order("date", { ascending: true }).limit(10);
    }
    const { data: shifts } = await shiftsQuery;

    // Fetch existing assignments for these shifts
    const shiftIds = (shifts ?? []).map((s: any) => s.id);
    const { data: assignments } = await supabase
      .from("shift_assignments")
      .select("shift_id, employee_id, status")
      .in("shift_id", shiftIds.length > 0 ? shiftIds : ["__none__"]);

    // Fetch clients for context
    const clientIds = [...new Set((shifts ?? []).map((s: any) => s.client_id).filter(Boolean))];
    const { data: clients } = await supabase
      .from("clients")
      .select("id, name")
      .in("id", clientIds.length > 0 ? clientIds : ["__none__"]);

    // Fetch locations for context
    const locationIds = [...new Set((shifts ?? []).map((s: any) => s.location_id).filter(Boolean))];
    const { data: locations } = await supabase
      .from("locations")
      .select("id, name, city, state")
      .in("id", locationIds.length > 0 ? locationIds : ["__none__"]);

    // Fetch recent performance (shifts completed in last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const { data: recentAssignments } = await supabase
      .from("shift_assignments")
      .select("employee_id, status, shift_id")
      .eq("company_id", company_id)
      .gte("created_at", thirtyDaysAgo.toISOString());

    // Build employee performance summary
    const perfMap: Record<string, { completed: number; total: number }> = {};
    for (const a of recentAssignments ?? []) {
      if (!perfMap[a.employee_id]) perfMap[a.employee_id] = { completed: 0, total: 0 };
      perfMap[a.employee_id].total++;
      if (a.status === "confirmed" || a.status === "completed") perfMap[a.employee_id].completed++;
    }

    // Fetch review averages per employee
    const { data: reviews } = await supabase
      .from("shift_reviews")
      .select("reviewed_employee_id, overall_rating")
      .eq("company_id", company_id)
      .eq("reviewer_type", "manager");

    const reviewMap: Record<string, { sum: number; count: number }> = {};
    for (const r of reviews ?? []) {
      if (!r.reviewed_employee_id) continue;
      if (!reviewMap[r.reviewed_employee_id]) reviewMap[r.reviewed_employee_id] = { sum: 0, count: 0 };
      reviewMap[r.reviewed_employee_id].sum += Number(r.overall_rating);
      reviewMap[r.reviewed_employee_id].count++;
    }

    // Fetch badges per employee
    const { data: badges } = await supabase
      .from("employee_badges")
      .select("employee_id, badge_label")
      .eq("company_id", company_id);

    const badgeMap: Record<string, string[]> = {};
    for (const b of badges ?? []) {
      if (!badgeMap[b.employee_id]) badgeMap[b.employee_id] = [];
      badgeMap[b.employee_id].push(b.badge_label);
    }

    // Build context for AI
    const contextData = {
      employees: (employees ?? []).map((e: any) => {
        const perf = perfMap[e.id];
        const rev = reviewMap[e.id];
        return {
          id: e.id,
          name: `${e.first_name} ${e.last_name}`,
          skills: e.skills ?? [],
          certifications: e.certifications ?? [],
          service_categories: e.service_category_ids ?? [],
          address: e.address,
          qualify: e.qualify,
          years_experience: e.years_experience,
          english_level: e.english_level,
          performance: perf ? {
            completion_rate: Math.round((perf.completed / perf.total) * 100),
            shifts_last_30d: perf.total,
          } : { completion_rate: 0, shifts_last_30d: 0 },
          rating: rev ? Math.round((rev.sum / rev.count) * 10) / 10 : null,
          review_count: rev?.count ?? 0,
          badges: badgeMap[e.id] ?? [],
        };
      }),
      shifts: (shifts ?? []).map((s: any) => ({
        id: s.id,
        title: s.title,
        date: s.date,
        start_time: s.start_time,
        end_time: s.end_time,
        required_employees: s.required_employees,
        pay_type: s.pay_type,
        notes: s.notes,
        client: clients?.find((c: any) => c.id === s.client_id)?.name ?? null,
        location: locations?.find((l: any) => l.id === s.location_id) ?? null,
        current_assignments: (assignments ?? [])
          .filter((a: any) => a.shift_id === s.id && a.status !== "rejected" && a.status !== "removed")
          .map((a: any) => a.employee_id),
      })),
    };

    const systemPrompt = `Eres un asistente de optimización de workforce para una empresa de staffing. Tu trabajo es analizar turnos abiertos y sugerir los mejores empleados para cada turno.

REGLAS:
- Analiza las habilidades, experiencia, ubicación y rendimiento de cada empleado
- Prioriza empleados con mejor tasa de completación de turnos
- No sugiereas empleados que ya están asignados al turno
- Da un score de 0-100 para cada sugerencia
- Explica brevemente por qué cada empleado es buena opción
- Si un turno requiere N empleados y ya tiene algunos, sugiere solo los faltantes
- Responde SIEMPRE en español

IMPORTANTE: Usa la herramienta suggest_assignments para devolver las sugerencias estructuradas.`;

    const userPrompt = mode === "optimize"
      ? `Analiza todos los turnos abiertos y optimiza la asignación de personal para maximizar eficiencia:\n\n${JSON.stringify(contextData, null, 2)}`
      : `Sugiere los mejores empleados para los siguientes turnos:\n\n${JSON.stringify(contextData, null, 2)}`;

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
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "suggest_assignments",
              description: "Return employee suggestions for each shift",
              parameters: {
                type: "object",
                properties: {
                  suggestions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        shift_id: { type: "string" },
                        shift_title: { type: "string" },
                        employees: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              employee_id: { type: "string" },
                              employee_name: { type: "string" },
                              score: { type: "number", description: "Match score 0-100" },
                              reason: { type: "string", description: "Brief reason for suggestion" },
                            },
                            required: ["employee_id", "employee_name", "score", "reason"],
                            additionalProperties: false,
                          },
                        },
                      },
                      required: ["shift_id", "shift_title", "employees"],
                      additionalProperties: false,
                    },
                  },
                  summary: { type: "string", description: "Overall optimization summary" },
                },
                required: ["suggestions", "summary"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "suggest_assignments" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Límite de solicitudes excedido. Intenta de nuevo en un momento." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Se requiere agregar créditos para usar esta función." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      return new Response(JSON.stringify({ error: "Error del servicio de AI" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiResult = await response.json();
    const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];
    
    let result;
    if (toolCall?.function?.arguments) {
      try {
        result = JSON.parse(toolCall.function.arguments);
      } catch {
        result = { suggestions: [], summary: "No se pudieron procesar las sugerencias." };
      }
    } else {
      result = { suggestions: [], summary: aiResult.choices?.[0]?.message?.content ?? "Sin resultados." };
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("ai-workforce error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Error interno" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
