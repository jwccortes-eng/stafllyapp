import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface SamplingConfig {
  base_sample_rate: number;
  new_entity_boost: number;
  incident_boost: number;
  low_score_boost: number;
  min_interval_days: number;
  review_window_hours: number;
}

const DEFAULT_CONFIG: SamplingConfig = {
  base_sample_rate: 0.3,
  new_entity_boost: 0.5,
  incident_boost: 0.7,
  low_score_boost: 0.6,
  min_interval_days: 3,
  review_window_hours: 72,
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { company_id, shift_id, event_type = "shift_completed" } =
      await req.json();

    if (!company_id || !shift_id) {
      return new Response(
        JSON.stringify({ error: "company_id and shift_id required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get sampling config
    const { data: configRow } = await supabase
      .from("review_sampling_config")
      .select("*")
      .eq("company_id", company_id)
      .eq("source_product", "stafly")
      .maybeSingle();

    const config: SamplingConfig = configRow
      ? {
          base_sample_rate: configRow.base_sample_rate,
          new_entity_boost: configRow.new_entity_boost,
          incident_boost: configRow.incident_boost,
          low_score_boost: configRow.low_score_boost,
          min_interval_days: configRow.min_interval_days,
          review_window_hours: configRow.review_window_hours,
        }
      : DEFAULT_CONFIG;

    if (configRow && !configRow.enabled) {
      return new Response(
        JSON.stringify({ message: "Sampling disabled", generated: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get shift details with assignments
    const { data: shift } = await supabase
      .from("scheduled_shifts")
      .select("id, title, date, company_id, created_by")
      .eq("id", shift_id)
      .single();

    if (!shift) {
      return new Response(
        JSON.stringify({ error: "Shift not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: assignments } = await supabase
      .from("shift_assignments")
      .select("employee_id, role, employees(id, user_id, first_name, last_name, created_at)")
      .eq("shift_id", shift_id)
      .not("status", "in", '("rejected","removed")');

    if (!assignments || assignments.length === 0) {
      return new Response(
        JSON.stringify({ message: "No assignments", generated: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const deadline = new Date(
      Date.now() + config.review_window_hours * 3600 * 1000
    ).toISOString();

    const reviewRequests: any[] = [];

    // Identify captains/leaders vs regular workers
    const captains = assignments.filter(
      (a: any) =>
        a.role === "captain" || a.role === "leader" || a.role === "supervisor"
    );
    const workers = assignments.filter(
      (a: any) =>
        a.role !== "captain" && a.role !== "leader" && a.role !== "supervisor"
    );

    // Helper: should we sample this entity?
    const shouldSample = async (
      employeeId: string,
      entityCreatedAt: string | null
    ): Promise<{ sample: boolean; reason: string }> => {
      let probability = config.base_sample_rate;
      let reason = "random";

      // Boost for new entities (< 30 days)
      if (entityCreatedAt) {
        const daysSinceCreation =
          (Date.now() - new Date(entityCreatedAt).getTime()) /
          (1000 * 60 * 60 * 24);
        if (daysSinceCreation < 30) {
          probability += config.new_entity_boost;
          reason = "new_entity";
        }
      }

      // Check last review date
      const { data: lastReview } = await supabase
        .from("review_requests")
        .select("created_at")
        .eq("evaluated_entity_id", employeeId)
        .eq("company_id", company_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (lastReview) {
        const daysSinceLast =
          (Date.now() - new Date(lastReview.created_at).getTime()) /
          (1000 * 60 * 60 * 24);
        if (daysSinceLast < config.min_interval_days) {
          return { sample: false, reason: "too_recent" };
        }
        if (daysSinceLast > 14) {
          probability += 0.2;
          reason = "long_gap";
        }
      } else {
        // Never reviewed - always include
        return { sample: true, reason: "first_review" };
      }

      // Check for low existing score
      const { data: score } = await supabase
        .from("review_scores")
        .select("weighted_score")
        .eq("entity_id", employeeId)
        .eq("entity_type", "employee")
        .eq("company_id", company_id)
        .eq("score_type", "overall")
        .maybeSingle();

      if (score && score.weighted_score !== null && score.weighted_score < 3.0) {
        probability += config.low_score_boost;
        reason = "low_score";
      }

      // Cap probability
      probability = Math.min(probability, 0.95);

      return {
        sample: Math.random() < probability,
        reason,
      };
    };

    // Generate: Captain → sampled workers
    for (const captain of captains) {
      const emp = (captain as any).employees;
      if (!emp?.user_id) continue;

      for (const worker of workers) {
        const wEmp = (worker as any).employees;
        if (!wEmp) continue;

        const { sample, reason } = await shouldSample(
          wEmp.id,
          wEmp.created_at
        );
        if (!sample) continue;

        reviewRequests.push({
          company_id,
          source_product: "stafly",
          source_event_type: event_type,
          source_event_id: shift_id,
          evaluator_user_id: emp.user_id,
          evaluator_employee_id: emp.id,
          evaluated_entity_type: "employee",
          evaluated_entity_id: wEmp.id,
          evaluated_role: worker.role || "worker",
          review_form_type: "captain_to_employee",
          status: "pending",
          priority: reason === "first_review" ? 0.9 : 0.5,
          sampling_reason: reason,
          deadline_at: deadline,
        });
      }
    }

    // Generate: Sampled workers → Captain
    for (const captain of captains) {
      const cEmp = (captain as any).employees;
      if (!cEmp) continue;

      // Sample a subset of workers to review the captain
      const workerSubset = workers.filter(() => Math.random() < 0.4);
      for (const worker of workerSubset) {
        const wEmp = (worker as any).employees;
        if (!wEmp?.user_id) continue;

        reviewRequests.push({
          company_id,
          source_product: "stafly",
          source_event_type: event_type,
          source_event_id: shift_id,
          evaluator_user_id: wEmp.user_id,
          evaluator_employee_id: wEmp.id,
          evaluated_entity_type: "captain",
          evaluated_entity_id: cEmp.id,
          evaluated_role: captain.role || "captain",
          review_form_type: "employee_to_captain",
          status: "pending",
          priority: 0.5,
          sampling_reason: "random",
          deadline_at: deadline,
        });
      }
    }

    // Generate: Sampled workers → Shift experience
    const shiftReviewers = workers.filter(() => Math.random() < 0.25);
    for (const worker of shiftReviewers) {
      const wEmp = (worker as any).employees;
      if (!wEmp?.user_id) continue;

      reviewRequests.push({
        company_id,
        source_product: "stafly",
        source_event_type: event_type,
        source_event_id: shift_id,
        evaluator_user_id: wEmp.user_id,
        evaluator_employee_id: wEmp.id,
        evaluated_entity_type: "shift",
        evaluated_entity_id: shift_id,
        evaluated_role: null,
        review_form_type: "employee_to_shift",
        status: "pending",
        priority: 0.3,
        sampling_reason: "random",
        deadline_at: deadline,
      });
    }

    // Insert all review requests
    if (reviewRequests.length > 0) {
      const { error } = await supabase
        .from("review_requests")
        .insert(reviewRequests);

      if (error) {
        console.error("Insert error:", error);
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        generated: reviewRequests.length,
        breakdown: {
          captain_to_employee: reviewRequests.filter(
            (r) => r.review_form_type === "captain_to_employee"
          ).length,
          employee_to_captain: reviewRequests.filter(
            (r) => r.review_form_type === "employee_to_captain"
          ).length,
          employee_to_shift: reviewRequests.filter(
            (r) => r.review_form_type === "employee_to_shift"
          ).length,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
